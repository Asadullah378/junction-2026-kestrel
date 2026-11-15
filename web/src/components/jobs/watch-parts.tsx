"use client";

import * as React from "react";
import { ArrowRight, ArrowUpRight, Check, Eye, Minus, Plus, Radar, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ago, sayWhen } from "@/lib/jobs/client";
import type { JobItem, JobRunItem } from "@/lib/jobs/types";
import { sayValue, type Change, type RunChanges, type Snapshot, type SnapshotItem, type WatchView } from "@/lib/watches/types";

/*
 * What the Watches page shows that a plain job does not have: what a watch looks at, whether its
 * live monitors are armed, and, for each look, what was different from the look before, with the
 * old value, the new value and a link to the page it came from.
 */

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

type Spec = Pick<WatchView, "wishes" | "fields">;

const fieldLabel = (key: string | undefined, spec?: Spec) => spec?.fields?.find((f) => f.key === key)?.label ?? key ?? "Value";
const wishLabel = (id: string | undefined, spec?: Spec) => (id ? (spec?.wishes?.find((w) => w.id === id)?.label ?? id) : "Fits");
const VERDICT: Record<string, string> = { yes: "Yes", no: "No", unknown: "Does not say", true: "Fits", false: "Does not fit" };
const verdictWord = (value: Change["from"]) => VERDICT[String(value)] ?? sayValue(value);

/** How a look of a watch went, in a few words: for the timeline and for the list. */
export function lookWord(run: Pick<JobRunItem, "status" | "watch">): string {
  if (run.status === "running") return "Looking";
  if (run.status === "failed") return "Could not look";
  if (run.status === "skipped") return "Skipped";
  const w = run.watch;
  if (!w) return "Done";
  if (w.baseline) return "First look";
  if (w.changes.length > 0) return w.changes.length === 1 ? "1 change" : `${w.changes.length} changes`;
  if (w.signal?.summary) return "Change reported";
  return "Checked, nothing new";
}

/** True when the look found something to tell. */
export const lookChanged = (run: Pick<JobRunItem, "watch">): boolean => Boolean(run.watch && !run.watch.baseline && (run.watch.changes.length > 0 || run.watch.signal?.summary));

/** How a look was started, in a few words. */
export const triggerWord = (trigger: JobRunItem["trigger"], watch: boolean): string =>
  trigger === "webhook" ? "Live monitor" : trigger === "manual" ? (watch ? "Check now" : "Run now") : watch ? "On schedule" : "Scheduled";

/** One change: the page, and what it was and what it is now. */
function ChangeRow({ change, spec }: { change: Change; spec?: Spec }) {
  const icon =
    change.kind === "added" ? <Plus className="size-3.5" /> : change.kind === "removed" ? <Minus className="size-3.5" /> : <ArrowRight className="size-3.5" />;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", change.kind === "removed" ? "bg-muted text-muted-foreground" : "bg-brand-soft text-brand")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <a href={change.url} target="_blank" rel="noreferrer" className="group/src inline-flex max-w-full items-baseline gap-1 text-[0.88rem] leading-snug font-medium underline-offset-2 hover:underline">
          <span className="[overflow-wrap:anywhere]">{change.title || hostOf(change.url)}</span>
          <ArrowUpRight className="size-3.5 shrink-0 translate-y-0.5 text-subtle" />
        </a>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.84rem] leading-snug">
          {change.kind === "added" ? (
            <span className="font-medium text-brand">New</span>
          ) : change.kind === "removed" ? (
            <span className="font-medium text-muted-foreground">Gone</span>
          ) : (
            <>
              <span className="text-muted-foreground">{change.kind === "field" ? fieldLabel(change.field, spec) : wishLabel(change.wish, spec)}</span>
              <span className="nums text-muted-foreground line-through decoration-subtle">{change.kind === "field" ? sayValue(change.from) : verdictWord(change.from)}</span>
              <ArrowRight className="size-3.5 shrink-0 translate-y-0.5 text-subtle" aria-label="became" />
              <span className="nums font-semibold">{change.kind === "field" ? sayValue(change.to) : verdictWord(change.to)}</span>
            </>
          )}
          <span className="text-[0.76rem] text-subtle">{hostOf(change.url)}</span>
        </span>
      </span>
    </li>
  );
}

/** What a look found different: each change with its before, its after and its source. */
export function ChangeList({ record, spec, max }: { record: RunChanges; spec?: Spec; max?: number }) {
  const shown = max ? record.changes.slice(0, max) : record.changes;
  const rest = record.changes.length - shown.length;
  const signal = record.signal;
  return (
    <div>
      {shown.length > 0 ? (
        <ul className="divide-y divide-border/70">
          {shown.map((change, i) => (
            <ChangeRow key={`${change.kind}:${change.key}:${change.field ?? change.wish ?? ""}:${i}`} change={change} spec={spec} />
          ))}
        </ul>
      ) : null}
      {rest > 0 ? <p className="mt-1 text-[0.78rem] text-subtle">and {rest} more</p> : null}
      {signal && (signal.summary || signal.before || signal.after) ? (
        <div className="mt-3 rounded-xl bg-surface px-3.5 py-3 text-[0.84rem] leading-snug hairline">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-wider text-subtle uppercase">
            <Radar className="size-3.5" />
            What the live monitor saw
          </p>
          {signal.summary ? <p className="mt-1.5 [overflow-wrap:anywhere]">{signal.summary}</p> : null}
          {signal.before ? (
            <p className="mt-2 text-muted-foreground [overflow-wrap:anywhere]">
              <span className="font-medium text-foreground/80">Before: </span>
              {signal.before}
            </p>
          ) : null}
          {signal.after ? (
            <p className="mt-1.5 [overflow-wrap:anywhere]">
              <span className="font-medium text-foreground/80">After: </span>
              {signal.after}
            </p>
          ) : null}
          {signal.url ? (
            <a href={signal.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[0.8rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              {hostOf(signal.url)}
              <ArrowUpRight className="size-3.5" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-1.5 text-[0.86rem] leading-snug">
      <dt className="text-subtle">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** What a watch looks at: the kind of thing, the conditions, the searches, the pages, the prices. */
export function WatchSpecFacts({ watch }: { watch: WatchView }) {
  return (
    <dl className="mt-2 divide-y divide-border/60">
      {watch.what ? <Fact label="Looks for">{watch.what}</Fact> : null}
      {watch.wishes.length > 0 ? (
        <Fact label="Must meet">
          <span className="flex flex-wrap gap-1.5">
            {watch.wishes.map((w) => (
              <span key={w.id} title={w.test} className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.76rem] font-medium text-brand">
                {w.label}
              </span>
            ))}
          </span>
        </Fact>
      ) : null}
      {watch.queries.length > 0 ? (
        <Fact label={watch.queries.length === 1 ? "Search" : "Searches"}>
          <span className="flex flex-col gap-0.5">
            {watch.queries.map((q) => (
              <span key={q}>&quot;{q}&quot;</span>
            ))}
          </span>
        </Fact>
      ) : null}
      {watch.urls?.length ? (
        <Fact label={watch.urls.length === 1 ? "Page" : "Pages"}>
          <span className="flex flex-col gap-0.5">
            {watch.urls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 underline-offset-2 hover:underline">
                <span className="[overflow-wrap:anywhere]">{url.replace(/^https?:\/\//, "")}</span>
                <ArrowUpRight className="size-3.5 shrink-0 translate-y-0.5 text-subtle" />
              </a>
            ))}
          </span>
        </Fact>
      ) : null}
      {watch.fields?.length ? <Fact label="Watches">{watch.fields.map((f) => f.label).join(", ")}</Fact> : null}
      {watch.product ? (
        <Fact label="Prices for">
          {watch.product}
          {watch.countries?.length ? <span className="text-muted-foreground"> in {watch.countries.join(", ")}</span> : null}
        </Fact>
      ) : null}
    </dl>
  );
}

/** When it last looked, when it looks next, and whether live monitors are armed. */
export function WatchPulse({ job }: { job: JobItem }) {
  const watch = job.watch;
  const armed = watch?.monitors.length ?? 0;
  const pages = watch?.monitors.filter((m) => m.kind === "page").length ?? 0;
  const searches = armed - pages;
  const parts = [pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : "", searches ? `${searches} ${searches === 1 ? "search" : "searches"}` : ""].filter(Boolean).join(" and ");
  return (
    <ul className="mt-2 space-y-1.5 text-[0.86rem] leading-snug text-muted-foreground">
      <li className="flex items-start gap-2">
        <Eye className="mt-0.5 size-4 shrink-0 text-subtle" />
        <span>
          {job.running ? "Looking now." : job.lastRunAt ? `Last looked ${ago(job.lastRunAt)}.` : "Has not looked yet."}{" "}
          {job.status === "paused" ? "Paused." : job.status === "done" || !job.nextRunAt ? "No look ahead." : `Looks next ${sayWhen(job.nextRunAt, job.timeZone)}.`}
        </span>
      </li>
      <li className="flex items-start gap-2">
        <Radar className={cn("mt-0.5 size-4 shrink-0", armed > 0 && job.status === "active" ? "text-brand" : "text-subtle")} />
        <span>
          {armed > 0 && job.status === "active" ? (
            <>
              <span className="font-medium text-foreground/90">Live monitors armed</span> on {parts}. A change there makes it look at once, without waiting for the schedule.
            </>
          ) : (
            (watch?.monitorNote ?? "No live monitor: it looks on its schedule.")
          )}
        </span>
      </li>
    </ul>
  );
}

const cell = (value: "yes" | "no" | "unknown" | undefined) =>
  value === "yes" ? (
    <span role="img" aria-label="Yes" className="inline-flex size-5 items-center justify-center rounded-full bg-brand-soft text-brand">
      <Check className="size-3" strokeWidth={3} />
    </span>
  ) : value === "no" ? (
    <span role="img" aria-label="No" className="inline-flex size-5 items-center justify-center rounded-full bg-destructive/10 text-destructive">
      <X className="size-3" strokeWidth={3} />
    </span>
  ) : (
    <span role="img" aria-label="The page does not say" className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-border text-[0.7rem] text-subtle">
      ?
    </span>
  );

/** What a look found, as it stood: each page or offer with its verdicts and its watched values. */
export function SnapshotList({ snapshot, spec, max = 20 }: { snapshot: Snapshot; spec?: Spec; max?: number }) {
  const order = (item: SnapshotItem) => (item.fits === true ? 0 : item.fits === undefined ? 1 : 2);
  const items = [...snapshot.items].sort((a, b) => order(a) - order(b));
  const shown = items.slice(0, max);
  if (items.length === 0) return <p className="mt-2 text-[0.86rem] text-muted-foreground">Nothing was found on this look.</p>;
  return (
    <div>
      <ul className="mt-1 divide-y divide-border/70">
        {shown.map((item) => (
          <li key={item.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1 basis-[14rem]">
              <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-baseline gap-1 text-[0.86rem] leading-snug font-medium underline-offset-2 hover:underline">
                <span className="[overflow-wrap:anywhere]">{item.title || hostOf(item.url)}</span>
                <ArrowUpRight className="size-3.5 shrink-0 translate-y-0.5 text-subtle" />
              </a>
              <span className="block text-[0.76rem] text-subtle">
                {hostOf(item.url)}
                {item.country ? ` · ${item.country}` : ""}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem]">
              {Object.entries(item.fields ?? {}).map(([key, value]) => (
                <span key={key} className="whitespace-nowrap">
                  <span className="text-subtle">{fieldLabel(key, spec)} </span>
                  <span className="nums font-medium">{sayValue(value)}</span>
                </span>
              ))}
              {spec?.wishes?.length && item.verdicts
                ? spec.wishes.map((w) => (
                    <span key={w.id} title={w.label} className="inline-flex items-center gap-1 whitespace-nowrap">
                      {cell(item.verdicts?.[w.id])}
                      <span className="text-[0.74rem] text-subtle">{w.label}</span>
                    </span>
                  ))
                : null}
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length ? <p className="mt-1 text-[0.78rem] text-subtle">and {items.length - shown.length} more</p> : null}
      {snapshot.unread?.length ? (
        <p className="mt-2 text-[0.78rem] text-subtle">
          {snapshot.unread.length === 1 ? "One page" : `${snapshot.unread.length} pages`} could not be read this time and {snapshot.unread.length === 1 ? "was" : "were"} left out of the comparison.
        </p>
      ) : null}
    </div>
  );
}
