import "server-only";
import type { RunMeter } from "@/lib/agent/meter";
import { countryName, pricesByCountry } from "@/lib/agent/tools/shopping";
import { cleanWishes, pageKey, siftFind, siftJudge } from "@/lib/agent/tools/sift";
import { decisionsConfigured } from "@/lib/decisions/client";
import { ctxScrape } from "@/lib/sources/contextdev";
import { oxyExtract } from "@/lib/sources/oxylabs";
import type { Snapshot, SnapshotItem, WatchSpec } from "./types";

/*
 * One look at what a watch watches, as a snapshot the next look can be compared with. Three
 * kinds of thing, any of which a watch may have:
 *
 * - Searches with wishes: the same sift the chat runs. Context.dev finds the pages and returns
 *   their text; the decision model checks each page against each wish. One item per page.
 * - A product: Oxylabs prices it country by country. One item per country, its field the price.
 * - Pinned pages: the watched fields (a price, whether it is in stock) are read off each page by
 *   Oxylabs' AI Parsing, from a schema. A pinned page with no fields is only listed: what
 *   changed on it comes from the Context.dev monitor that watches it.
 *
 * Nothing is taken from a cache: a watch exists to see what is there now. Anything that could
 * not be read this time is named in `unread`, so it is left out of the comparison instead of
 * being reported as gone.
 */

const DEFAULT_COUNTRIES = ["FI", "DE", "NL", "FR", "ES", "IT", "AT"];

type Ctx = { meter: RunMeter; signal?: AbortSignal; country?: string };

export async function gatherSnapshot(spec: WatchSpec, ctx: Ctx): Promise<Snapshot> {
  const [found, priced, pinned] = await Promise.all([searched(spec, ctx), prices(spec, ctx), pinnedPages(spec, ctx)]);
  const items: SnapshotItem[] = [];
  const seen = new Set<string>();
  for (const item of [...pinned.items, ...priced.items, ...found.items]) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    items.push(item);
  }
  const unread = [...pinned.unread, ...priced.unread];
  return { takenAt: new Date().toISOString(), items, unread: unread.length ? unread : undefined, timings: found.timings };
}

type Part = { items: SnapshotItem[]; unread: string[]; timings?: Snapshot["timings"] };

/** The pages the searches find, each checked against every wish. */
async function searched(spec: WatchSpec, ctx: Ctx): Promise<Part> {
  if (!spec.queries?.length) return { items: [], unread: [] };
  const wishes = cleanWishes(spec.wishes ?? []);
  const sift = { what: spec.what, wishes, queries: spec.queries.slice(0, 3), country: ctx.country };
  const found = await siftFind(sift, { meter: ctx.meter, signal: ctx.signal, cache: false });
  // A search that fails outright must fail the look: an empty snapshot would read as "everything is gone".
  if (found.pages.length === 0) throw new Error(found.error ?? "The search found nothing this time.");

  if (wishes.length === 0 || !decisionsConfigured()) {
    return { items: found.listed.map((item) => ({ key: pageKey(item.url), url: item.url, title: item.title ?? item.domain, source: "context" as const })), unread: [], timings: { searchMs: found.searchMs } };
  }
  const judged = await siftJudge(sift, found, { meter: ctx.meter, signal: ctx.signal });
  const items = judged.items.map((item): SnapshotItem => {
    const verdicts: Record<string, "yes" | "no" | "unknown"> = {};
    spec.wishes.forEach((wish, i) => (verdicts[wish.id] = item.verdicts?.[i]?.answer ?? "unknown"));
    return { key: pageKey(item.url), url: item.url, title: item.title ?? item.domain, source: "context", verdicts, fits: Object.values(verdicts).every((v) => v === "yes") };
  });
  return { items, unread: [], timings: { searchMs: found.searchMs, judgeMs: judged.judgedMs } };
}

/** The cheapest offer for the product in each country. */
async function prices(spec: WatchSpec, ctx: Ctx): Promise<Part> {
  if (!spec.product) return { items: [], unread: [] };
  const countries = (spec.countries?.length ? spec.countries : DEFAULT_COUNTRIES).map((c) => c.toUpperCase()).slice(0, 8);
  const { rows } = await pricesByCountry(spec.product, countries, { meter: ctx.meter, signal: ctx.signal, cache: false });
  const items: SnapshotItem[] = [];
  const unread: string[] = [];
  for (const row of rows) {
    const key = `price:${row.country}`;
    if (!row.best) {
      // No offer seen this time is not the same as no shop selling it.
      unread.push(key);
      continue;
    }
    items.push({
      key,
      url: row.best.url ?? row.pageUrl ?? "https://www.google.com/shopping",
      title: `${spec.product} seen from ${countryName(row.country)}${row.best.merchant ? `, at ${row.best.merchant}` : ""}${row.best.currency ? ` (${row.best.currency})` : ""}`,
      source: "oxylabs",
      country: row.country,
      fields: { price: row.best.price },
      pinned: true,
    });
  }
  if (items.length === 0) throw new Error(`No shop offers for ${spec.product} could be read this time.`);
  return { items, unread };
}

const JSON_TYPE = { number: "number", string: "string", boolean: "boolean" } as const;

/** The pages the user named, with the watched fields read off each. */
async function pinnedPages(spec: WatchSpec, ctx: Ctx): Promise<Part> {
  const urls = [...new Set(spec.urls ?? [])].slice(0, 10);
  if (urls.length === 0) return { items: [], unread: [] };
  const fields = spec.fields ?? [];
  const unread: string[] = [];
  const read = async (url: string): Promise<SnapshotItem | null> => {
    try {
      if (fields.length === 0) {
        // Only its title is needed here; the monitor reports what changes on it.
        const page = await ctxScrape({ url, markdown: true, fresh: true }, { meter: ctx.meter, signal: ctx.signal });
        if (!page.markdown) throw new Error("unread");
        return { key: pageKey(url), url, title: page.meta.title ?? url, source: "context", pinned: true };
      }
      const schema = {
        type: "object",
        properties: {
          page_title: { type: "string", description: "The name of the product or the title of the page, as the page states it." },
          ...Object.fromEntries(fields.map((f) => [f.key, { type: JSON_TYPE[f.type], description: `${f.label}, exactly as the page states it now.` }])),
        },
      };
      const res = await oxyExtract<Record<string, unknown>>({ url, schema, location: ctx.country }, { meter: ctx.meter, signal: ctx.signal });
      if (!res.data) throw new Error("unread");
      const values: Record<string, string | number | boolean | null> = {};
      for (const f of fields) {
        const v = res.data[f.key];
        values[f.key] = typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;
      }
      // Nothing at all read off the page is a page that was not read, not a page whose values are all gone.
      if (Object.values(values).every((v) => v === null)) throw new Error("unread");
      return { key: pageKey(url), url, title: typeof res.data.page_title === "string" && res.data.page_title ? res.data.page_title : url, source: "oxylabs", fields: values, pinned: true };
    } catch (err) {
      if (ctx.signal?.aborted) throw err;
      unread.push(url);
      unread.push(pageKey(url));
      return null;
    }
  };
  const items = (await Promise.all(urls.map(read))).filter((item): item is SnapshotItem => item !== null);
  if (items.length === 0 && !spec.queries?.length && !spec.product) throw new Error("None of the pages could be read this time.");
  return { items, unread };
}
