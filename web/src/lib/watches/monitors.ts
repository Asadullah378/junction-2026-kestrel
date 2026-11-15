import "server-only";
import { randomBytes } from "node:crypto";
import { siteUrl } from "@/lib/site";
import { createMonitor, deleteMonitor, runMonitor } from "@/lib/sources/contextdev";
import { WATCH_MIN_MINUTES, type WatchSpec } from "./types";

/*
 * The monitors behind a watch. A watch looks again on its schedule whatever happens; a monitor
 * makes it look sooner. Each pinned page becomes a Context.dev "page" monitor and each search a
 * "search" monitor, and when one of them sees a change it calls /api/hooks/context, which starts
 * a look at once. A monitor needs an address the outside world can reach, so on a developer's
 * computer none is armed and the watch says so.
 */

/** The most monitors one watch arms: three pages and three searches. */
const MAX_EACH = 3;

/** This server's public address, or null when it has none the outside world can call. */
export function publicBase(): string | null {
  const set = process.env.KESTREL_SITE_URL?.trim();
  if (!set && process.env.NODE_ENV !== "production") return null;
  const base = siteUrl();
  try {
    const host = new URL(base).hostname;
    if (/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host) || host.endsWith(".local")) return null;
  } catch {
    return null;
  }
  return base;
}

export const hookPath = "/api/hooks/context";

/** What a monitor is told to count as a change, in words. With it the service judges by meaning, not by any difference in the text. */
function instructionsFor(spec: WatchSpec, kind: "page" | "search"): string | undefined {
  const wishes = spec.wishes.map((w) => w.test).filter(Boolean);
  if (kind === "page") {
    const fields = spec.fields?.map((f) => f.label || f.key) ?? [];
    if (fields.length > 0) return `Report a change in: ${fields.join(", ")}. Ignore layout, navigation, dates and wording that do not affect these.`;
    if (wishes.length > 0) return `Report a change that bears on any of these: ${wishes.join("; ")}. Ignore layout, navigation and dates.`;
    return undefined;
  }
  const what = spec.what ? `each ${spec.what}` : "relevant";
  return `Report new results that are ${what}${wishes.length ? ` and meet: ${wishes.join("; ")}` : ""}. Ignore results that only moved in the ranking.`;
}

/**
 * Arm the monitors of a watch. What comes back is the spec to store: with the monitors that were
 * made, the key their calls must carry, and a note when none could be armed. Never throws: a
 * watch without monitors still looks on its schedule.
 */
export async function armMonitors(spec: WatchSpec, title: string, everyMinutes: number): Promise<WatchSpec> {
  const next: WatchSpec = { ...spec, monitors: [], hookKey: spec.hookKey ?? randomBytes(18).toString("base64url"), monitorNote: undefined };
  const base = publicBase();
  if (!base) return { ...next, monitorNote: "Live monitors are off on this computer: they need an address the web can reach. It still looks on its schedule." };
  const targets = [
    ...(spec.urls ?? []).slice(0, MAX_EACH).map((target) => ({ kind: "page" as const, target })),
    ...spec.queries.slice(0, MAX_EACH).map((target) => ({ kind: "search" as const, target })),
  ];
  if (targets.length === 0) return next;
  const webhookUrl = `${base}${hookPath}?k=${encodeURIComponent(next.hookKey!)}`;
  const failed: string[] = [];
  const made = await Promise.all(
    targets.map(async ({ kind, target }) => {
      try {
        const monitor = await createMonitor({
          name: `${title} · ${kind === "page" ? "page" : "search"}`.slice(0, 120),
          kind,
          target,
          instructions: instructionsFor(spec, kind),
          webhookUrl,
          everyMinutes: Math.max(WATCH_MIN_MINUTES, everyMinutes),
        });
        return { id: monitor.id, kind, target, secret: monitor.secret };
      } catch (err) {
        console.warn("[watches] a monitor could not be made", kind, err instanceof Error ? err.message : err);
        failed.push(target);
        return null;
      }
    }),
  );
  next.monitors = made.filter((m): m is NonNullable<typeof m> => m !== null);
  if (failed.length > 0) next.monitorNote = next.monitors.length > 0 ? "Some live monitors could not be set up. It still looks on its schedule." : "Live monitors could not be set up. It still looks on its schedule.";
  return next;
}

/** Take a watch's monitors down (it was paused or deleted). What comes back is the spec without them. */
export async function disarmMonitors(spec: WatchSpec): Promise<WatchSpec> {
  await Promise.all(
    (spec.monitors ?? []).map((m) =>
      deleteMonitor(m.id).catch((err) => console.warn("[watches] a monitor could not be removed", m.id, err instanceof Error ? err.message : err)),
    ),
  );
  return { ...spec, monitors: [] };
}

/** "Check now": have each monitor look right away too. Their answers come through the webhook. Nothing waits for them. */
export function nudgeMonitors(spec: WatchSpec): void {
  for (const m of spec.monitors ?? []) void runMonitor(m.id).catch((err) => console.warn("[watches] a monitor could not be asked to look", m.id, err instanceof Error ? err.message : err));
}

/** How many minutes apart a schedule looks, as near as it can be said, for the monitors' own interval. */
export function minutesOf(schedule: { kind: string; every?: number; unit?: string }): number {
  if (schedule.kind !== "every" || !schedule.every) return 60;
  const per = schedule.unit === "minutes" ? 1 : schedule.unit === "hours" ? 60 : schedule.unit === "days" ? 1440 : 10_080;
  return Math.max(WATCH_MIN_MINUTES, schedule.every * per);
}
