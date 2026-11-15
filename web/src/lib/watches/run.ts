import "server-only";
import { generateText } from "ai";
import { and, eq, gte } from "drizzle-orm";
import { RunMeter, round } from "@/lib/agent/meter";
import { cleanEffort, pickMode, type ModeId } from "@/lib/agent/modes";
import { modelForMode } from "@/lib/agent/models";
import { workerModelFor, workerProviderOptions } from "@/lib/agent/providers";
import { EMPTY_USAGE, type RunStats } from "@/lib/agent/stats";
import { database } from "@/lib/db/client";
import { previousSnapshot, watchSpecOf, type JobToRun } from "@/lib/db/jobs";
import { notifications } from "@/lib/db/schema";
import { recordUsage } from "@/lib/db/usage";
import { escapeHtml, EMAIL_STYLE } from "@/lib/email/layout";
import { diffSnapshots } from "./diff";
import { gatherSnapshot } from "./gather";
import { sandboxGather, usesSandbox } from "./sandbox";
import { sayChange, sayValue, type Change, type MonitorSignal, type RunChanges, type Snapshot, type SnapshotItem, type WatchSpec } from "./types";

/*
 * One look of a watch. Plain code, not the chat agent: gather what the watch watches, compare
 * it with what the last look found, and say what is different. The facts come from the
 * comparison (diff.ts); a small model only puts them into a sentence or two, and when it cannot,
 * the facts are said as they are.
 *
 * What the run produces is kept with it: the snapshot (so the next look has something to compare
 * with), the changes, and a short text. Whether the user is told is decided by the caller
 * (lib/jobs/run.ts): a first look says what it found, a look with changes says what changed, and
 * a look with nothing new says nothing.
 */

export type Gather = (spec: WatchSpec, ctx: { meter: RunMeter; signal?: AbortSignal; country?: string }) => Promise<Snapshot>;

export type WatchDeps = {
  /** Where the snapshot comes from. Tests give a fake. */
  gather?: Gather;
  /** Puts the changes into words. Tests give a fake; the default asks the fast model. */
  word?: (input: WordInput) => Promise<string>;
};

export type WordInput = { title: string; description: string; spec: WatchSpec; changes: Change[]; signal?: MonitorSignal; meter: RunMeter; mode: ModeId; abort?: AbortSignal };

export type WatchWorked = {
  /** What the look found, in Markdown: kept with the run and shown on its page. */
  output: string;
  /** One or two sentences: what changed and why it matters. Empty on a quiet look. */
  summary: string;
  snapshot: Snapshot;
  record: RunChanges;
  costUsd: number;
};

/** The most changes spelled out in a result or an email. The rest are counted. */
const SHOWN = 12;

export async function runWatch(
  job: JobToRun,
  run: { runId: string; signal: AbortSignal; incoming?: MonitorSignal; track?: (spent: () => number) => void },
  account: { id: string; modes: ModeId[] },
  deps: WatchDeps = {},
): Promise<WatchWorked> {
  const spec = watchSpecOf(job);
  if (!spec) throw new Error("This watch has nothing to look for.");
  const mode = pickMode(job.mode, account.modes);
  const meter = new RunMeter();
  let recorded = false;
  run.track?.(() => (recorded ? 0 : meter.webCostUsd + meter.workerCostUsd + meter.decisionCostUsd));

  const gather = deps.gather ?? (usesSandbox(spec) ? sandboxGather : gatherSnapshot);
  try {
    const snapshot = await gather(spec, { meter, signal: run.signal, country: job.country ?? undefined });
    const previous = await previousSnapshot(job.id, run.runId);
    const baseline = previous === null;
    const changes = diffSnapshots(previous, snapshot);
    const fitting = snapshot.items.filter((item) => item.fits !== false);
    const record: RunChanges = { baseline, changes, signal: run.incoming, found: snapshot.items.length, fit: fitting.length };

    let summary = "";
    let output: string;
    if (baseline) {
      summary = baselineLine(snapshot, spec);
      output = `${summary}\n\n${itemsMarkdown(fitting.length > 0 ? fitting : snapshot.items, spec)}`.trim();
    } else if (changes.length > 0 || run.incoming?.summary) {
      const word = deps.word ?? wordChanges;
      summary = await word({ title: job.title, description: job.description, spec, changes, signal: run.incoming, meter, mode, abort: run.signal }).catch((err) => {
        console.warn("[watches] could not word the changes", err instanceof Error ? err.message : err);
        return "";
      });
      if (!summary) summary = plainSummary(changes, run.incoming, spec);
      output = [summary, changesMarkdown(changes, spec), signalMarkdown(run.incoming)].filter(Boolean).join("\n\n");
    } else {
      output = "Checked, nothing new.";
    }
    return { output, summary, snapshot, record, costUsd: round(meter.webCostUsd + meter.workerCostUsd + meter.decisionCostUsd) };
  } finally {
    // What the look used goes on the account's record whether it finished or not.
    const info = workerModelFor(modelForMode(mode)).info;
    const stats: RunStats = { mode, effort: cleanEffort(job.effort), startedAt: meter.startedAt, durationMs: Date.now() - meter.startedAt, steps: 0, usage: { ...EMPTY_USAGE }, llmCostUsd: 0, finishReason: "stop", ...meter.snapshot() };
    recorded = true;
    await recordUsage({ userId: account.id, conversationId: job.id, client: "web", model: { id: info.id, label: info.label }, kind: "job", stats });
  }
}

/** True when this watch already told the user about a change a little while ago: a monitor's late call about the same change is then not told twice. */
export async function toldLately(jobId: string, withinMs = 20 * 60_000): Promise<boolean> {
  const [row] = await database()
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.jobId, jobId), eq(notifications.kind, "watch_changed"), gte(notifications.createdAt, new Date(Date.now() - withinMs))))
    .limit(1);
  return Boolean(row);
}

/* ───────── Words ───────── */

const WORDING = `You put into words what a watch found. A watch looks at the same pages again and again and reports what is different.
You are given the facts: what the user is watching for, and the exact changes with their old and new values. Use only those facts. Do not add, guess or round anything, and keep every number as it is given.
Write one to three short, plain sentences: what changed, then why it matters for what the user is watching for. No greeting, no headings, no lists, no markdown, no dashes used as punctuation. Do not mention models, tools or how the check was made.`;

/** Ask the fast model for a sentence or two about the changes. Throws when it cannot; the caller then says the facts as they are. */
async function wordChanges(input: WordInput): Promise<string> {
  const worker = workerModelFor(modelForMode(input.mode));
  const timeout = AbortSignal.timeout(20_000);
  const lines = input.changes.slice(0, SHOWN).map((c) => `- ${c.title} (${c.url}): ${sayChange(c, input.spec)}`);
  const more = input.changes.length > SHOWN ? `\n(and ${input.changes.length - SHOWN} more changes)` : "";
  const monitor = input.signal?.summary ? `\n\nThe page monitor's own note: ${input.signal.summary}` : "";
  const wishes = input.spec.wishes.length ? `\nConditions: ${input.spec.wishes.map((w) => w.test).join("; ")}` : "";
  const result = await generateText({
    model: worker.model,
    providerOptions: workerProviderOptions(worker.info),
    abortSignal: input.abort ? AbortSignal.any([input.abort, timeout]) : timeout,
    instructions: WORDING,
    prompt: `The watch: ${input.title}\nWhat the user wants: ${input.description}\nIt looks for: ${input.spec.what || "the pages named"}${wishes}\n\nWhat changed since the last look:\n${lines.join("\n") || "- (nothing in the watched values)"}${more}${monitor}`,
  });
  input.meter.addWorker(worker.info.id, result.totalUsage);
  return result.text.trim().replace(/\s+/g, " ").slice(0, 600);
}

/** The changes said as they are, when no model words them. */
function plainSummary(changes: Change[], signal: MonitorSignal | undefined, spec: WatchSpec): string {
  if (changes.length === 0) return signal?.summary?.trim() || "The page changed.";
  const first = changes[0];
  const lead = first.kind === "added" || first.kind === "removed" ? sayChange(first, spec) : `${first.title}: ${sayChange(first, spec)}`;
  return changes.length === 1 ? `${lead}.` : `${lead}, and ${changes.length - 1} more ${changes.length === 2 ? "change" : "changes"}.`;
}

function baselineLine(snapshot: Snapshot, spec: WatchSpec): string {
  const n = snapshot.items.length;
  const fit = snapshot.items.filter((item) => item.fits === true).length;
  if (n === 0) return "Watching from now. Nothing was found on this first look.";
  if (spec.wishes.length > 0) return `Watching from now. This first look found ${n} ${n === 1 ? "result" : "results"}, ${fit} of which ${fit === 1 ? "meets" : "meet"} every condition.`;
  return `Watching from now. This first look read ${n} ${n === 1 ? "page" : "pages"}.`;
}

const fieldsLine = (item: SnapshotItem, spec: WatchSpec): string =>
  Object.entries(item.fields ?? {})
    .map(([key, value]) => `${spec.fields?.find((f) => f.key === key)?.label ?? key}: ${sayValue(value)}`)
    .join(", ");

const mdText = (text: string) => text.replace(/[\[\]]/g, "").slice(0, 140);

function itemsMarkdown(items: SnapshotItem[], spec: WatchSpec): string {
  const rows = items.slice(0, SHOWN).map((item) => {
    const extra = [item.country, fieldsLine(item, spec)].filter(Boolean).join(" · ");
    return `- [${mdText(item.title || item.url)}](${item.url})${extra ? ` · ${extra}` : ""}`;
  });
  if (items.length > SHOWN) rows.push(`- and ${items.length - SHOWN} more`);
  return rows.join("\n");
}

function changesMarkdown(changes: Change[], spec: WatchSpec): string {
  const rows = changes.slice(0, SHOWN).map((c) => (c.kind === "added" ? `- New: [${mdText(c.title)}](${c.url})` : c.kind === "removed" ? `- Gone: [${mdText(c.title)}](${c.url})` : `- [${mdText(c.title)}](${c.url}) · ${sayChange(c, spec)}`));
  if (changes.length > SHOWN) rows.push(`- and ${changes.length - SHOWN} more`);
  return rows.join("\n");
}

function signalMarkdown(signal: MonitorSignal | undefined): string {
  if (!signal?.before && !signal?.after) return "";
  const quote = (text: string) => text.trim().replace(/\s+/g, " ").slice(0, 280);
  return [signal.before ? `Before: "${quote(signal.before)}"` : "", signal.after ? `After: "${quote(signal.after)}"` : "", signal.url ? `Source: ${signal.url}` : ""].filter(Boolean).join("\n\n");
}

/* ───────── The email ───────── */

/** The changes as an email shows them: for each one what it was, what it is now, and a link to the page. */
export function changesHtml(record: RunChanges, spec: WatchSpec): string {
  const { MUTED, LINE, BRAND, INK, FONT } = EMAIL_STYLE;
  const link = (url: string, text: string) => `<a href="${escapeHtml(url)}" style="color:${BRAND};text-decoration:underline">${escapeHtml(text.slice(0, 110))}</a>`;
  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };
  const rows = record.changes.slice(0, SHOWN).map((c) => {
    const label =
      c.kind === "added"
        ? `<span style="font-weight:600;color:${INK}">New</span>`
        : c.kind === "removed"
          ? `<span style="font-weight:600;color:${INK}">Gone</span>`
          : `<span style="color:${MUTED}">${escapeHtml(sayChange({ ...c, from: undefined, to: undefined }, spec).split(":")[0])}:</span> <span style="color:${MUTED};text-decoration:line-through">${escapeHtml(sayValue(c.from))}</span> <span style="color:${MUTED}">→</span> <span style="font-weight:700;color:${INK}">${escapeHtml(sayValue(c.to))}</span>`;
    return `<tr><td style="padding:10px 0;border-top:1px solid ${LINE};font:400 14px/1.5 ${FONT};color:${INK}">${link(c.url, c.title || c.url)} <span style="color:${MUTED}">· ${escapeHtml(host(c.url))}</span><br>${label}</td></tr>`;
  });
  const more = record.changes.length > SHOWN ? `<p style="margin:8px 0 0;font:400 13px ${FONT};color:${MUTED}">and ${record.changes.length - SHOWN} more, on the watch's page.</p>` : "";
  const table = rows.length > 0 ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px;border-bottom:1px solid ${LINE}">${rows.join("")}</table>${more}` : "";
  const signal = record.signal;
  const excerpt = (title: string, text: string | undefined) =>
    text?.trim() ? `<p style="margin:10px 0 0;font:400 13px/1.5 ${FONT};color:${MUTED}"><span style="font-weight:600">${title}:</span> ${escapeHtml(text.trim().replace(/\s+/g, " ").slice(0, 320))}</p>` : "";
  const monitor = signal && (signal.before || signal.after) ? `<div style="margin-top:16px">${excerpt("Before", signal.before)}${excerpt("After", signal.after)}${signal.url ? `<p style="margin:10px 0 0;font:400 13px ${FONT}">${link(signal.url, host(signal.url))}</p>` : ""}</div>` : "";
  return `${table}${monitor}`;
}

/** The same, as plain text. */
export function changesText(record: RunChanges, spec: WatchSpec): string {
  return record.changes
    .slice(0, SHOWN)
    .map((c) => `- ${c.title}: ${sayChange(c, spec)}\n  ${c.url}`)
    .join("\n");
}
