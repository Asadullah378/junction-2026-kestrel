import "server-only";

/**
 * What the two web-data clients share: one way to send a request, to wait a turn, to keep a
 * recent answer for a few minutes, and to report what a call cost.
 *
 * Both services are called over plain HTTP instead of an SDK, so that every request body is
 * explicit. Oxylabs rejects unknown fields, and Context.dev's options decide what a call costs.
 */

export type Provider = "context" | "oxylabs";

export type WebMeter = {
  /** Add one call to a web-data service. `costUsd` is 0 where the service publishes no price per call. */
  addWeb(costUsd: number, kind: "search" | "read" | "extract" | "watch"): void;
};

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly provider: Provider,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export const PROVIDER_NAME: Record<Provider, string> = { context: "Context.dev", oxylabs: "Oxylabs" };

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 300;
type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

/**
 * Requests take turns. A gate lets at most `concurrent` requests be in flight and starts at most
 * `perSecond` in any second; the rest wait in line, in the order they came. One gate serves the
 * whole server, because the limit is the key's, not the request's.
 */
export function gate(concurrent: number, perSecond: number) {
  let inFlight = 0;
  let nextStart = 0;
  const line: Array<() => void> = [];
  return async function turn<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (inFlight >= concurrent) await new Promise<void>((resolve) => line.push(resolve));
    inFlight += 1;
    try {
      const now = Date.now();
      const at = Math.max(now, nextStart);
      nextStart = at + 1000 / perSecond;
      if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
      // Whoever asked may have given up while waiting: do not spend a request on them.
      signal?.throwIfAborted();
      return await run();
    } finally {
      inFlight -= 1;
      line.shift()?.();
    }
  };
}

export type Turn = ReturnType<typeof gate>;

/** How many requests this server has sent to the web-data services since it started. For the health check and for tests. */
let sent = 0;
export const webRequestsSent = () => sent;

export function keyFor(provider: Provider): string {
  const name = provider === "context" ? "CONTEXT_DEV_API_KEY" : "OXYLABS_WEB_API_KEY";
  const key = process.env[name]?.trim();
  if (!key) throw new SourceError(`${name} is not set. Add it to .env.local.`, 500, provider);
  return key;
}

export const sourceConfigured = (provider: Provider): boolean =>
  Boolean(process.env[provider === "context" ? "CONTEXT_DEV_API_KEY" : "OXYLABS_WEB_API_KEY"]?.trim());

/** Send one request and return the parsed answer. 429 and 503 get one polite retry. */
export async function send<T>(args: {
  provider: Provider;
  url: string;
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  turn: Turn;
}): Promise<T> {
  const { provider } = args;
  const attempt = (): Promise<Response> =>
    args.turn(() => {
      // The clock starts when the request is sent, not while it waits its turn.
      const timeout = AbortSignal.timeout(args.timeoutMs ?? 45_000);
      const signal = args.signal ? AbortSignal.any([args.signal, timeout]) : timeout;
      sent += 1;
      return fetch(args.url, {
        method: args.method ?? "POST",
        headers: { authorization: `Bearer ${keyFor(provider)}`, "content-type": "application/json" },
        body: args.body === undefined ? undefined : JSON.stringify(args.body),
        signal,
      });
    }, args.signal);

  let res = await attempt();
  if (res.status === 429 || res.status === 503) {
    const retryAfter = Number(res.headers.get("retry-after")) || 1;
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 3) * 1000));
    res = await attempt();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown; error_code?: string };
      const said = parsed.message ?? parsed.error;
      message = typeof said === "string" ? said : Array.isArray(said) ? said.map((m) => (m as { message?: string }).message ?? "").join("; ") : (parsed.error_code ?? message);
    } catch {
      /* keep the raw text */
    }
    if (res.status === 402) message = `${PROVIDER_NAME[provider]} credits are used up for this key.`;
    const path = new URL(args.url).pathname;
    throw new SourceError(`${PROVIDER_NAME[provider]} ${path} failed (${res.status}): ${message}`, res.status, provider);
  }
  return (await res.json()) as T;
}
