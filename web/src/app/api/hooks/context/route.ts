import { createHmac, timingSafeEqual } from "node:crypto";
import { watchByMonitor, watchSpecOf } from "@/lib/db/jobs";
import { runFromHook } from "@/lib/jobs/run";
import type { MonitorSignal } from "@/lib/watches/types";

export const dynamic = "force-dynamic";

/*
 * Where Context.dev calls when one of a watch's monitors sees a change. Nobody is signed in on
 * this route, so the call itself has to prove where it comes from:
 *
 * - the body is read raw, before anything is parsed, and checked against `X-Context-Signature`
 *   (`t=<unix seconds>,v1=<hex>`, an HMAC-SHA256 over `t + "." + body` keyed with the monitor's
 *   own secret), compared in constant time, and refused when it is more than five minutes old;
 * - the address must carry the key that was made for that watch;
 * - a delivery that was already handled (same `X-Context-Id`) is acknowledged and dropped.
 *
 * A genuine "change.detected" starts a look of the watch at once, with what the monitor said
 * (its summary, the text before and after, the page) kept with the run. The answer goes back
 * right away; the look carries on by itself.
 */

const TOLERANCE_S = 5 * 60;
const MAX_BODY = 512 * 1024;

type Seen = Map<string, number>;
const holder = globalThis as typeof globalThis & { __kestrelHookSeen?: Seen };
const seen: Seen = (holder.__kestrelHookSeen ??= new Map());

/** True the first time a delivery id is shown, false after. Ids are remembered for a day. */
function firstTime(id: string): boolean {
  const now = Date.now();
  if (seen.size > 5000) for (const [key, at] of seen) if (now - at > 86_400_000) seen.delete(key);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Whether the signature header vouches for this body, with this secret, now. */
function signed(header: string | null, raw: string, secret: string): boolean {
  if (!header) return false;
  const parts = new Map(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1 || !/^\d{1,12}$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const want = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return same(want, v1.toLowerCase());
}

const text = (value: unknown, max: number): string | undefined => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

export async function POST(req: Request) {
  // The raw body first: the signature is over these exact bytes.
  const raw = Buffer.from(await req.arrayBuffer()).toString("utf8");
  if (!raw || raw.length > MAX_BODY) return Response.json({ error: "Nothing to read." }, { status: 400 });

  let payload: { event?: string; id?: string; data?: { change?: Record<string, unknown>; monitor_id?: string; monitor?: { id?: string }; run?: { monitor_id?: string } } };
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Not JSON." }, { status: 400 });
  }
  const change = payload?.data?.change ?? {};
  const monitorId = text(change.monitor_id, 200) ?? text(payload?.data?.monitor_id, 200) ?? text(payload?.data?.monitor?.id, 200) ?? text(payload?.data?.run?.monitor_id, 200);
  if (!monitorId) return Response.json({ error: "No monitor named." }, { status: 400 });

  // Which watch this is about is only looked up here; nothing is done until the call has proved itself.
  const job = await watchByMonitor(monitorId).catch(() => null);
  const spec = job ? watchSpecOf(job) : null;
  const monitor = spec?.monitors?.find((m) => m.id === monitorId);
  if (!job || !spec || !monitor) return Response.json({ error: "Unknown monitor." }, { status: 401 });

  const key = new URL(req.url).searchParams.get("k") ?? "";
  const keyOk = Boolean(spec.hookKey) && same(key, spec.hookKey!);
  // With a secret the signature is required. A monitor that was given none is vouched for by the key in the address alone.
  const genuine = monitor.secret ? signed(req.headers.get("x-context-signature"), raw, monitor.secret) && (keyOk || !key) : keyOk;
  if (!genuine) return Response.json({ error: "The signature does not match." }, { status: 401 });

  const delivery = text(req.headers.get("x-context-id"), 200) ?? text(payload.id, 200);
  if (delivery && !firstTime(delivery)) return Response.json({ ok: true, repeated: true });

  // A run that found nothing is the monitor reporting in: nothing to do.
  if (payload.event !== "change.detected") return Response.json({ ok: true, ignored: payload.event ?? "unknown" });

  const signal: MonitorSignal = {
    id: text(change.id, 200),
    monitorId,
    url: text(change.url, 600) ?? (monitor.kind === "page" ? monitor.target : undefined),
    title: text(change.title, 200),
    summary: text(change.summary, 800),
    before: text(change.before_text_excerpt, 1200),
    after: text(change.after_text_excerpt, 1200),
    detectedAt: text(change.detected_at, 60),
  };
  const started = await runFromHook(job, signal).catch((err) => {
    console.error("[hooks] could not start a look", job.id, err);
    return null;
  });
  // Already looking, or paused: the call was genuine, so it is acknowledged and not sent again.
  return Response.json({ ok: true, started: Boolean(started?.ok), runId: started?.ok ? started.runId : undefined }, { status: 202 });
}
