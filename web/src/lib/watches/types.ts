/*
 * Watches, as the server and the interface both know them. No imports: used on both sides.
 *
 * A watch is a standing request. It looks the same things up again and again, compares what it
 * finds with what it found last time, and tells the user only when something is different, with
 * the before, the after and the source. It is stored as a job of kind "watch" (lib/jobs), so it
 * shares the schedule, the runs and the notifications a job has.
 */

/** What a watch looks for and where. Stored with the job. */
export type WatchSpec = {
  /** What each result should be: "a recipe", "a job ad", "the product page of these headphones". */
  what: string;
  /** The conditions, as Sift has them. */
  wishes: { id: string; label: string; test: string }[];
  /** One to three searches. */
  queries: string[];
  /** When set, prices are gathered per country. */
  product?: string;
  /** ISO alpha-2 country codes, for price watches. */
  countries?: string[];
  /** Pinned pages to watch directly. */
  urls?: string[];
  /** Watched fields on pinned pages (price, inStock). */
  fields?: { key: string; label: string; type: "number" | "string" | "boolean" }[];
  /** The Context.dev monitors that call the webhook when a pinned page or a search changes. */
  monitors?: { id: string; kind: "page" | "search"; target: string; secret?: string | null }[];
  /** A random key carried in the webhook's address, so a call that names this watch can be told from a guess. Never sent to the browser. */
  hookKey?: string;
  /** Why no monitor is armed, when none is: said on the watch's page. */
  monitorNote?: string;
};

/** A watch as the browser sees it: the spec without the secrets. */
export type WatchView = Omit<WatchSpec, "monitors" | "hookKey"> & { monitors: { kind: "page" | "search"; target: string }[] };

export type SnapshotItem = {
  /** What tells this item from the others between runs: usually its address. */
  key: string;
  url: string;
  title: string;
  source: "context" | "oxylabs";
  country?: string;
  /** True when it meets every wish. Absent when the watch has no wishes. */
  fits?: boolean;
  /** The verdict per wish id. */
  verdicts?: Record<string, "yes" | "no" | "unknown">;
  /** The watched fields: a price, whether it is in stock. */
  fields?: Record<string, string | number | boolean | null>;
  /** A page the user named, as opposed to one a search turned up. Only a pinned item is reported as gone: search results come and go by themselves. */
  pinned?: boolean;
};

export type Snapshot = {
  takenAt: string;
  items: SnapshotItem[];
  /** Addresses that could not be read this time. They are left out of the comparison instead of being reported as gone. */
  unread?: string[];
  timings?: { searchMs?: number; judgeMs?: number };
};

export type Change = {
  kind: "added" | "removed" | "field" | "verdict";
  key: string;
  url: string;
  title: string;
  /** For "field": which one. */
  field?: string;
  /** For "verdict": the wish id. Absent when it is the overall fit that flipped. */
  wish?: string;
  from?: string | number | boolean | null;
  to?: string | number | boolean | null;
};

/** What the monitor itself said when it called: its summary and the text before and after. */
export type MonitorSignal = {
  id?: string;
  monitorId: string;
  url?: string;
  title?: string;
  summary?: string;
  before?: string;
  after?: string;
  detectedAt?: string;
};

/** What a watch run found out, kept with the run (`job_runs.changes`). */
export type RunChanges = {
  /** The first look: there was nothing to compare with, so nothing counts as changed. */
  baseline: boolean;
  changes: Change[];
  /** Set when a monitor's call started the run. */
  signal?: MonitorSignal;
  /** How many items the snapshot held, and how many of them fit. */
  found?: number;
  fit?: number;
};

/** A watch may not look more often than this (Context.dev's monitors check every 10 minutes at the most). */
export const WATCH_MIN_MINUTES = 10;
export const WATCH_DEFAULT_MINUTES = 60;

/** Take the secrets out before a watch goes to the browser. */
export function viewOf(spec: WatchSpec): WatchView {
  const { monitors, hookKey: _hookKey, ...rest } = spec;
  void _hookKey;
  return { ...rest, monitors: (monitors ?? []).map((m) => ({ kind: m.kind, target: m.target })) };
}

/** A field's value as a person reads it. */
export function sayValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "nothing";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

const VERDICT_WORD: Record<string, string> = { yes: "yes", no: "no", unknown: "the page does not say", true: "fits", false: "does not fit" };

/** One change in a plain line: "Price: 329 → 279", "New: <title>". Labels come from the spec when it has them. */
export function sayChange(change: Change, spec?: Pick<WatchSpec, "wishes" | "fields">): string {
  if (change.kind === "added") return `New: ${change.title}`;
  if (change.kind === "removed") return `Gone: ${change.title}`;
  if (change.kind === "field") {
    const label = spec?.fields?.find((f) => f.key === change.field)?.label ?? change.field ?? "Value";
    return `${label}: ${sayValue(change.from)} → ${sayValue(change.to)}`;
  }
  const label = change.wish ? (spec?.wishes?.find((w) => w.id === change.wish)?.label ?? change.wish) : "Fits";
  const word = (v: Change["from"]) => VERDICT_WORD[String(v)] ?? sayValue(v);
  return `${label}: ${word(change.from)} → ${word(change.to)}`;
}
