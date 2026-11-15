import "server-only";
import { pickMode, type ModeId } from "@/lib/agent/modes";
import { createJob, jobRow, saveWatchSpec, watchSpecOf, type Made } from "@/lib/db/jobs";
import { runNow } from "@/lib/jobs/run";
import { checkSchedule, validTimeZone } from "@/lib/jobs/schedule";
import type { JobSchedule } from "@/lib/jobs/types";
import { armMonitors, disarmMonitors, minutesOf } from "./monitors";
import { WATCH_DEFAULT_MINUTES, WATCH_MIN_MINUTES, type WatchSpec } from "./types";

/*
 * Making a watch, and what happens to its monitors when it is paused, resumed or deleted. Used
 * by the page's route (POST /api/watches, the "Watch this" button) and by the agent's tool, so
 * both make the same thing.
 */

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "");
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * A spec as it may be stored, from whatever came in (a browser, the model). Monitors and the
 * webhook key are never taken from outside. A string says what is wrong.
 */
export function cleanSpec(input: unknown): WatchSpec | string {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const wishes = list(raw.wishes)
    .slice(0, 6)
    .map((w, i) => {
      const wish = w && typeof w === "object" ? (w as Record<string, unknown>) : {};
      const id = typeof wish.id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(wish.id) ? wish.id : `w${i}`;
      return { id, label: text(wish.label, 40), test: text(wish.test, 240) };
    })
    .filter((w) => w.test);
  for (const w of wishes) if (!w.label) w.label = w.test.slice(0, 40);
  const queries = [...new Set(list(raw.queries).map((q) => text(q, 300)).filter(Boolean))].slice(0, 3);
  const urls = [
    ...new Set(
      list(raw.urls)
        .map((u) => text(u, 600))
        .filter((u) => {
          try {
            return /^https?:$/.test(new URL(u).protocol);
          } catch {
            return false;
          }
        }),
    ),
  ].slice(0, 3);
  const product = text(raw.product, 160) || undefined;
  const countries = [...new Set(list(raw.countries).map((c) => text(c, 2).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 8);
  const fields = list(raw.fields)
    .slice(0, 6)
    .map((f) => {
      const field = f && typeof f === "object" ? (f as Record<string, unknown>) : {};
      const key = typeof field.key === "string" && /^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(field.key) ? field.key : "";
      const type: "number" | "string" | "boolean" = field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : "string";
      return { key, label: text(field.label, 40) || key, type };
    })
    .filter((f) => f.key);
  if (queries.length === 0 && urls.length === 0 && !product) return "A watch needs something to look at: a search, a page, or a product.";
  return {
    what: text(raw.what, 200),
    wishes,
    queries,
    ...(product ? { product } : {}),
    ...(countries.length ? { countries } : {}),
    ...(urls.length ? { urls } : {}),
    ...(fields.length ? { fields } : {}),
  };
}

/** What the watch does, in plain words: kept as the job's instructions so the page has something to show. */
export function describeSpec(spec: WatchSpec): string {
  const lines: string[] = [];
  if (spec.what) lines.push(`Looks for: ${spec.what}.`);
  if (spec.wishes.length) lines.push(`Each must meet: ${spec.wishes.map((w) => w.test).join("; ")}.`);
  if (spec.queries.length) lines.push(`Searches: ${spec.queries.map((q) => `"${q}"`).join(", ")}.`);
  if (spec.urls?.length) lines.push(`Pages: ${spec.urls.join(", ")}.`);
  if (spec.product) lines.push(`Prices for: ${spec.product}${spec.countries?.length ? ` in ${spec.countries.join(", ")}` : ""}.`);
  if (spec.fields?.length) lines.push(`Watched values: ${spec.fields.map((f) => f.label).join(", ")}.`);
  lines.push("Each look is compared with the one before. You are told only when something is different.");
  return lines.join("\n");
}

export type NewWatch = {
  title: string;
  description?: string;
  spec: unknown;
  /** How far apart the looks are. At least 10 minutes; an hour when not given. */
  everyMinutes?: number;
  timeZone?: string;
  mode?: unknown;
  effort?: number;
  place?: string;
  country?: string;
  coords?: { lat: number; lng: number; label?: string };
  conversationId?: string;
};

/**
 * Make a watch for this account: store it, arm its monitors where the server has a public
 * address, and take the first look right away so there is something to compare the next one with.
 */
export async function makeWatch(user: { id: string; modes: ModeId[] }, input: NewWatch): Promise<Made> {
  const spec = cleanSpec(input.spec);
  if (typeof spec === "string") return { ok: false, problem: spec };
  const title = text(input.title, 120);
  if (!title) return { ok: false, problem: "A watch needs a name." };
  const timeZone = validTimeZone(input.timeZone) ? input.timeZone : "Europe/Helsinki";
  const every = Math.max(WATCH_MIN_MINUTES, Math.min(7 * 24 * 60, Math.round(Number(input.everyMinutes) || WATCH_DEFAULT_MINUTES)));
  const asked: JobSchedule = every % 1440 === 0 ? { kind: "every", every: every / 1440, unit: "days" } : every % 60 === 0 ? { kind: "every", every: every / 60, unit: "hours" } : { kind: "every", every, unit: "minutes" };
  const checked = checkSchedule(asked, timeZone);
  if (!checked.ok) return { ok: false, problem: checked.problem };

  const made = await createJob(user.id, {
    kind: "watch",
    watch: spec,
    title,
    description: text(input.description, 600) || describeSpec(spec).split("\n")[0],
    prompt: describeSpec(spec),
    schedule: checked.schedule,
    timeZone,
    mode: pickMode(input.mode, user.modes),
    effort: input.effort ?? 1,
    place: input.place,
    country: input.country,
    coords: input.coords,
    conversationId: input.conversationId,
  });
  if (!made.ok) return made;

  const armed = await armMonitors(spec, title, minutesOf(checked.schedule));
  await saveWatchSpec(made.job.id, armed);
  // The first look: what it finds is the baseline. Nothing waits for it.
  const started = await runNow(user.id, made.job.id).catch(() => null);
  const job = { ...made.job, watch: { ...made.job.watch!, monitors: (armed.monitors ?? []).map((m) => ({ kind: m.kind, target: m.target })), monitorNote: armed.monitorNote }, running: Boolean(started?.ok) };
  return { ok: true, job };
}

/** A watch was paused or deleted: take its monitors down. Nothing happens for a job. */
export async function standDown(jobId: string, keep: boolean): Promise<void> {
  const row = await jobRow(jobId).catch(() => null);
  const spec = row ? watchSpecOf(row) : null;
  if (!row || !spec || !spec.monitors?.length) return;
  const without = await disarmMonitors(spec);
  if (keep) await saveWatchSpec(row.id, { ...without, monitorNote: "Paused: its live monitors are off until it is resumed." });
}

/** A paused watch was resumed: arm its monitors again. */
export async function standUp(jobId: string): Promise<void> {
  const row = await jobRow(jobId).catch(() => null);
  const spec = row ? watchSpecOf(row) : null;
  if (!row || !spec || spec.monitors?.length) return;
  await saveWatchSpec(row.id, await armMonitors(spec, row.title, minutesOf(row.schedule as JobSchedule)));
}
