import type { Change, Snapshot, SnapshotItem } from "./types";

/*
 * What is different between two looks at the same thing. A pure function: no clock, no network,
 * no model. The facts a watch reports come from here; a model only words them afterwards.
 *
 * - A first look has nothing to compare with, so it reports nothing as changed.
 * - Order does not matter: items are matched by their key.
 * - Numbers compare as numbers ("329.00" and 329 are the same price).
 * - A page that could not be read this time is left out, not reported as gone.
 * - Search results come and go by themselves, so only a pinned page is reported as gone, and a
 *   new page is reported only when it fits (or when the watch has no wishes).
 */

type Value = string | number | boolean | null | undefined;

const blank = (v: Value) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** A value as a number when it is one: 329, "329.00", "€ 1 299,50", "1,299.50". */
export function asNumber(v: Value): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let text = v.replace(/[^\d.,\-]/g, "");
  if (!/\d/.test(text)) return null;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    // The later one is the decimal mark; the other groups thousands.
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (comma >= 0) {
    // "1,299" groups thousands; "329,50" is a decimal comma.
    text = /,\d{3}$/.test(text) && text.length > 4 ? text.replace(/,/g, "") : text.replace(",", ".");
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Whether two values of a watched field are the same thing. */
export function sameValue(a: Value, b: Value): boolean {
  if (blank(a) && blank(b)) return true;
  if (blank(a) || blank(b)) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return String(a).toLowerCase() === String(b).toLowerCase();
  // A string of letters is text even when it holds a digit: only a value that is mostly a number compares as one.
  const numeric = (v: Value) => typeof v === "number" || (typeof v === "string" && /^[^A-Za-z]*$/.test(v));
  if (numeric(a) && numeric(b)) {
    const x = asNumber(a);
    const y = asNumber(b);
    if (x !== null && y !== null) return Math.abs(x - y) < 1e-9;
  }
  return String(a).trim().replace(/\s+/g, " ").toLowerCase() === String(b).trim().replace(/\s+/g, " ").toLowerCase();
}

const counts = (item: SnapshotItem) => item.fits !== false;

export function diffSnapshots(prev: Snapshot | null | undefined, next: Snapshot): Change[] {
  if (!prev) return [];
  const unread = new Set(next.unread ?? []);
  const before = new Map(prev.items.map((item) => [item.key, item]));
  const after = new Map(next.items.map((item) => [item.key, item]));
  const changes: Change[] = [];

  for (const [key, item] of after) {
    const was = before.get(key);
    if (!was) {
      if (counts(item)) changes.push({ kind: "added", key, url: item.url, title: item.title });
      continue;
    }
    const at = { key, url: item.url, title: item.title || was.title };

    // The watched fields, each one once.
    for (const field of new Set([...Object.keys(was.fields ?? {}), ...Object.keys(item.fields ?? {})])) {
      const from = was.fields?.[field];
      const to = item.fields?.[field];
      // A field that was read before and is missing now could not be read: that is not a change.
      if (to === undefined) continue;
      if (!sameValue(from, to)) changes.push({ kind: "field", ...at, field, from: from ?? null, to: to ?? null });
    }

    // The verdicts, wish by wish; and when none of them moved, the fit as a whole.
    let flipped = false;
    for (const wish of new Set([...Object.keys(was.verdicts ?? {}), ...Object.keys(item.verdicts ?? {})])) {
      const from = was.verdicts?.[wish];
      const to = item.verdicts?.[wish];
      if (from === undefined || to === undefined || from === to) continue;
      flipped = true;
      changes.push({ kind: "verdict", ...at, wish, from, to });
    }
    if (!flipped && was.fits !== undefined && item.fits !== undefined && was.fits !== item.fits) changes.push({ kind: "verdict", ...at, from: was.fits, to: item.fits });
  }

  for (const [key, was] of before) {
    if (after.has(key) || !was.pinned || !counts(was)) continue;
    if (unread.has(was.url) || unread.has(key)) continue;
    changes.push({ kind: "removed", key, url: was.url, title: was.title });
  }
  return changes;
}
