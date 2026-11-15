import "server-only";

import { cacheGet, cacheSet, gate, send, type WebMeter } from "./http";

/**
 * Context.dev (https://docs.context.dev): how Kestrel finds pages, reads them and keeps watch.
 *
 * - `POST /web/search` finds pages and, when asked, returns each page's text and the passages
 *   that bear on the query in the same call. That is what lets a Sift be one request.
 * - `POST /web/scrape` reads one page: as Markdown, as fields from a schema, or through a
 *   prebuilt parser (Google Maps).
 * - `POST /news/search` finds news stories.
 * - `/monitors` watches a page or a search and calls our webhook when something changes.
 *
 * Every answer carries `key_metadata.credits_consumed`. A credit is priced at the published
 * overage rate, so what an answer shows as its cost is what it would cost a paying account.
 */

const BASE_URL = "https://api.context.dev/v1";
/** $2.00 per 1,000 credits: the overage rate on context.dev/pricing (15 Nov 2026). */
export const USD_PER_CREDIT = 0.002;

/** The team's key allows 50 requests at once. Kept a little under, so a retry still has room. */
const searchTurn = gate(12, 12);
const scrapeTurn = gate(40, 40);
const otherTurn = gate(8, 8);

type KeyMetadata = { credits_consumed?: number; credits_remaining?: number };
type Opts = { meter?: WebMeter; signal?: AbortSignal; cache?: boolean };

const costOf = (meta: KeyMetadata | undefined) => (meta?.credits_consumed ?? 0) * USD_PER_CREDIT;

/** Why a page's text did not come back with a search result, in the service's own words. */
export type ContentCode = "SUCCESS" | "NOT_REQUESTED" | "TIMEOUT" | "CONTENT_TOO_LARGE" | "WEBSITE_ACCESS_ERROR" | "WEBSITE_BLOCKED" | "ERROR";

export type CtxSearchResult = {
  url: string;
  title: string;
  description: string;
  relevance: "high" | "medium" | "low";
  markdown: { markdown: string | null; code: ContentCode };
  highlights: { highlights: string[] | null; code: ContentCode };
};

export type CtxSearchRequest = {
  query: string;
  /** 1 to 100. One credit per ten results, plus one per page whose text is returned. */
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  freshness?: "last_24_hours" | "last_week" | "last_month" | "last_year";
  /** Two-letter country code, lower case. */
  country?: string;
  /** Return each page's Markdown with the result. */
  markdown?: boolean;
  /** Return the passages of each page that bear on the query, up to this many characters. */
  highlights?: number;
  /** How long the pages get to load when their text is asked for. A page that is not in by then comes back without text. */
  readBudgetMs?: number;
};

export type CtxSearchResponse = { results: CtxSearchResult[]; partial?: boolean; costUsd: number; credits: number; ms: number };

/** Web search. With `markdown` or `highlights` each result carries what its page says. */
export async function ctxSearch(body: CtxSearchRequest, opts: Opts = {}): Promise<CtxSearchResponse> {
  const key = "ctx-search:" + JSON.stringify(body);
  if (opts.cache !== false) {
    const hit = cacheGet<CtxSearchResponse>(key);
    if (hit) return hit;
  }
  const started = Date.now();
  const reading = Boolean(body.markdown || body.highlights);
  const res = await send<{ results: CtxSearchResult[]; partial?: boolean; key_metadata?: KeyMetadata }>({
    provider: "context",
    url: BASE_URL + "/web/search",
    body: {
      query: body.query.slice(0, 500),
      numResults: body.numResults ?? 10,
      includeDomains: body.includeDomains?.length ? body.includeDomains : undefined,
      excludeDomains: body.excludeDomains?.length ? body.excludeDomains : undefined,
      freshness: body.freshness,
      country: body.country?.toLowerCase(),
      markdownOptions: body.markdown ? { enabled: true, useMainContentOnly: true, includeLinks: false, includeImages: false } : undefined,
      highlightsOptions: body.highlights ? { enabled: true, maxCharacters: Math.max(100, body.highlights) } : undefined,
      // A slow page must not hold the others back: take what has arrived.
      timeoutOpts: reading ? { milliseconds: body.readBudgetMs ?? 8_000, behavior: "return-partial" } : undefined,
    },
    signal: opts.signal,
    timeoutMs: reading ? 40_000 : 20_000,
    turn: searchTurn,
  });
  const out: CtxSearchResponse = { results: res.results ?? [], partial: res.partial, costUsd: costOf(res.key_metadata), credits: res.key_metadata?.credits_consumed ?? 0, ms: Date.now() - started };
  opts.meter?.addWeb(out.costUsd, "search");
  if (opts.cache !== false) cacheSet(key, out);
  return out;
}

type Slot<T> = { requested: boolean; success: boolean | null; data: T | null; error_code?: string };

export type CtxPageMeta = { title?: string; description?: string; image?: string; publishedTime?: string; modifiedTime?: string; siteName?: string };

type CtxScrapeRaw = {
  url: string;
  markdown?: Slot<string>;
  json?: Slot<Record<string, unknown>>;
  parsed?: Slot<{ results?: unknown[] }>;
  metadata?: CtxPageMeta;
  isPartial?: boolean;
  key_metadata?: KeyMetadata;
};

export type CtxPage = { url: string; markdown: string | null; json: Record<string, unknown> | null; parsed: unknown[] | null; meta: CtxPageMeta; failed?: string; costUsd: number };

/** Read one page. `fresh` skips the service's cache: use it when a stale page would be wrong. */
export async function ctxScrape(
  body: { url: string; markdown?: boolean; json?: { schema: Record<string, unknown>; instructions?: string }; parser?: "google-maps"; fresh?: boolean; country?: string },
  opts: Opts = {},
): Promise<CtxPage> {
  const key = "ctx-scrape:" + JSON.stringify(body);
  const useCache = opts.cache !== false && !body.fresh;
  if (useCache) {
    const hit = cacheGet<CtxPage>(key);
    if (hit) return hit;
  }
  const res = await send<CtxScrapeRaw>({
    provider: "context",
    url: BASE_URL + "/web/scrape",
    body: {
      url: body.url,
      formats: { ...(body.markdown ? { markdown: true } : {}), ...(body.json ? { json: true } : {}), ...(body.parser ? { parse: true } : {}) },
      jsonParams: body.json ? { schema: body.json.schema, instructions: body.json.instructions } : undefined,
      parseParams: body.parser ? { type: "prebuilt", parser: body.parser } : undefined,
      sharedParams: body.markdown ? { mainContentOnly: true, ...(body.country ? { country: body.country.toLowerCase() } : {}) } : undefined,
      maxAgeMs: body.fresh ? 0 : undefined,
    },
    signal: opts.signal,
    timeoutMs: 60_000,
    turn: scrapeTurn,
  });
  const wanted = [body.markdown ? res.markdown : null, body.json ? res.json : null, body.parser ? res.parsed : null].filter(Boolean) as Slot<unknown>[];
  const bad = wanted.find((slot) => slot.success === false);
  const page: CtxPage = {
    url: res.url ?? body.url,
    markdown: res.markdown?.success ? (res.markdown.data ?? null) : null,
    json: res.json?.success ? (res.json.data ?? null) : null,
    parsed: res.parsed?.success ? (res.parsed.data?.results ?? null) : null,
    meta: res.metadata ?? {},
    failed: bad ? (bad.error_code ?? "ERROR") : undefined,
    costUsd: costOf(res.key_metadata),
  };
  opts.meter?.addWeb(page.costUsd, body.json || body.parser ? "extract" : "read");
  if (useCache && !page.failed) cacheSet(key, page);
  return page;
}

export type CtxNewsItem = {
  id: string;
  url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  published_at: string | null;
  type: "editorial" | "press_release" | "regulatory_filing" | "advisory";
  source: { name: string; domain: string };
};

/** News stories about a subject, most relevant first. */
export async function ctxNews(body: { query: string; limit?: number }, opts: Opts = {}): Promise<{ items: CtxNewsItem[]; costUsd: number }> {
  const key = "ctx-news:" + JSON.stringify(body);
  if (opts.cache !== false) {
    const hit = cacheGet<{ items: CtxNewsItem[]; costUsd: number }>(key);
    if (hit) return hit;
  }
  const res = await send<{ data: CtxNewsItem[]; key_metadata?: KeyMetadata }>({
    provider: "context",
    url: BASE_URL + "/news/search",
    body: { searchBy: { type: "natural_language", query: body.query }, limit: body.limit ?? 10 },
    signal: opts.signal,
    timeoutMs: 20_000,
    turn: otherTurn,
  });
  const out = { items: res.data ?? [], costUsd: costOf(res.key_metadata) };
  opts.meter?.addWeb(out.costUsd, "search");
  if (opts.cache !== false) cacheSet(key, out);
  return out;
}

/* ───────────────────────────────── Monitors ───────────────────────────────── */

export type MonitorInput = {
  name: string;
  /** A page to watch for changes, or a search to watch for new results. */
  kind: "page" | "search";
  /** The page's address, or the search query. */
  target: string;
  /** What counts as a change worth reporting. With it the service judges changes by meaning, not by any difference in the text. */
  instructions?: string;
  webhookUrl: string;
  /** How often the service looks. Its minimum is 10 minutes. */
  everyMinutes?: number;
};

/**
 * Watch a page or a search. When something changes, Context.dev posts to `webhookUrl`, signed
 * with the secret returned here. The first run is a baseline and never reports a change.
 */
export async function createMonitor(input: MonitorInput, opts: { meter?: WebMeter; signal?: AbortSignal } = {}): Promise<{ id: string; secret: string | null }> {
  const every = Math.max(10, Math.round(input.everyMinutes ?? 60));
  const res = await send<{ id: string; webhook?: { secret?: string } | null; webhook_secret?: string; key_metadata?: KeyMetadata }>({
    provider: "context",
    url: BASE_URL + "/monitors",
    body: {
      name: input.name.slice(0, 120),
      target:
        input.kind === "page"
          ? { type: "page", url: input.target, ...(input.instructions ? { instructions: input.instructions.slice(0, 1800) } : {}) }
          : { type: "search", query: input.target.slice(0, 480), ...(input.instructions ? { instructions: input.instructions.slice(0, 1800) } : {}) },
      change_detection: input.instructions ? { type: "semantic" } : { type: "exact" },
      schedule: every % 60 === 0 ? { type: "interval", frequency: every / 60, unit: "hours" } : { type: "interval", frequency: every, unit: "minutes" },
      webhook: { url: input.webhookUrl, events: ["change.detected"], retry: {} },
    },
    signal: opts.signal,
    timeoutMs: 30_000,
    turn: otherTurn,
  });
  opts.meter?.addWeb(costOf(res.key_metadata), "watch");
  return { id: res.id, secret: res.webhook?.secret ?? res.webhook_secret ?? null };
}

/** Have a monitor look now instead of waiting for its next turn. The answer comes through the webhook. */
export async function runMonitor(id: string, opts: { meter?: WebMeter; signal?: AbortSignal } = {}): Promise<void> {
  const res = await send<{ key_metadata?: KeyMetadata }>({ provider: "context", url: `${BASE_URL}/monitors/${encodeURIComponent(id)}/run`, body: {}, signal: opts.signal, timeoutMs: 20_000, turn: otherTurn });
  opts.meter?.addWeb(costOf(res.key_metadata), "watch");
}

/** Stop watching. A monitor that is already gone is not an error. */
export async function deleteMonitor(id: string, opts: { signal?: AbortSignal } = {}): Promise<void> {
  try {
    await send<unknown>({ provider: "context", url: `${BASE_URL}/monitors/${encodeURIComponent(id)}`, method: "DELETE", signal: opts.signal, timeoutMs: 20_000, turn: otherTurn });
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }
}
