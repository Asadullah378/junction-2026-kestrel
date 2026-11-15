import "server-only";

import { ctxNews, ctxScrape, ctxSearch } from "./contextdev";
import { PROVIDER_NAME, SourceError, type Provider, type WebMeter } from "./http";
import { oxyMarkdown } from "./oxylabs";

/**
 * What the agent's tools call. One shape for a page whichever service it came from, and one place
 * that decides which service does what:
 *
 * - Context.dev finds pages and reads them.
 * - A page Context.dev cannot read (blocked, or empty without JavaScript) is read through Oxylabs,
 *   in a browser. A page neither can read is reported as unread, never guessed at.
 */

export { SourceError, type WebMeter, type Provider };

export type LiveResult = {
  url: string;
  title?: string | null;
  /** ISO date, when the page or the search result states one. */
  publishedDate?: string | null;
  image?: string | null;
  /** A one-line description from the search result. */
  description?: string;
  /** The page's main text, when it was asked for and could be read. */
  text?: string;
  /** Passages from the page that bear on the query. */
  highlights?: string[];
  /** Which service read the page. */
  via: Provider;
};

type Opts = { meter?: WebMeter; signal?: AbortSignal; cache?: boolean };

const FRESHNESS = { day: "last_24_hours", week: "last_week", month: "last_month", year: "last_year" } as const;
export type Recency = keyof typeof FRESHNESS;

/** Search results often open with their date: "May 19, 2026 - This one-pan…". */
const DATED = /^([A-Z][a-z]{2,8} \d{1,2}, \d{4})\s+[-–—]\s+/;

function datedDescription(description: string | undefined): { date?: string; rest?: string } {
  const text = description?.trim();
  if (!text) return {};
  const m = DATED.exec(text);
  if (!m) return { rest: text };
  const at = Date.parse(m[1] + " UTC");
  return { date: Number.isNaN(at) ? undefined : new Date(at).toISOString(), rest: text.slice(m[0].length) };
}

/** The service joins a page's passages with a line of its own; split them back into passages. */
function passages(list: string[] | null | undefined): string[] {
  return (list ?? [])
    .flatMap((h) => h.split(/\n\s*…\s*\n/))
    .map((h) => h.trim())
    .filter((h) => h.length > 20);
}

export type LiveSearchRequest = {
  query: string;
  numResults?: number;
  /** Two-letter country code: results as someone there would see them. */
  country?: string;
  recency?: Recency;
  includeDomains?: string[];
  /** Return each page's main text with its result. */
  text?: boolean;
  /** Return the passages that bear on the query, up to this many characters a page. 0 for none. */
  highlights?: number;
  /** How long the pages get to load when their text is asked for. */
  readBudgetMs?: number;
};

export type LiveSearchResponse = { results: LiveResult[]; costUsd: number; ms: number; partial?: boolean };

/** Find pages on the live web. With `text` or `highlights`, each result carries what its page says, in the same call. */
export async function liveSearch(req: LiveSearchRequest, opts: Opts = {}): Promise<LiveSearchResponse> {
  const res = await ctxSearch(
    {
      query: req.query,
      numResults: req.numResults,
      country: req.country,
      freshness: req.recency ? FRESHNESS[req.recency] : undefined,
      includeDomains: req.includeDomains,
      markdown: req.text,
      highlights: req.highlights === 0 ? undefined : (req.highlights ?? 1400),
      readBudgetMs: req.readBudgetMs,
    },
    opts,
  );
  const results = res.results.map((r): LiveResult => {
    const { date, rest } = datedDescription(r.description);
    return {
      url: r.url,
      title: r.title,
      publishedDate: date,
      description: rest,
      text: r.markdown?.code === "SUCCESS" ? (r.markdown.markdown ?? undefined) : undefined,
      highlights: r.highlights?.code === "SUCCESS" ? passages(r.highlights.highlights) : rest ? [rest] : [],
      via: "context",
    };
  });
  return { results, costUsd: res.costUsd, ms: res.ms, partial: res.partial };
}

export type LivePagesResponse = { pages: LiveResult[]; unread: Array<{ url: string; reason: string }>; costUsd: number };

/** A page with less than this is taken as not read: an empty shell, a consent wall, a block page. */
const TOO_SHORT = 200;

/**
 * Read known pages in full. Each is asked of Context.dev first; one it cannot read is tried once
 * through Oxylabs with JavaScript run. `fresh` skips cached copies.
 */
export async function livePages(urls: string[], want: { maxCharacters?: number; fresh?: boolean; country?: string } = {}, opts: Opts = {}): Promise<LivePagesResponse> {
  const clipTo = want.maxCharacters ?? 7000;
  let costUsd = 0;
  const read = async (url: string): Promise<LiveResult | { url: string; reason: string }> => {
    let reason = "it could not be read";
    try {
      const page = await ctxScrape({ url, markdown: true, fresh: want.fresh, country: want.country }, opts);
      costUsd += page.costUsd;
      const text = page.markdown?.trim() ?? "";
      if (text.length >= TOO_SHORT) {
        return { url: page.url || url, title: page.meta.title, publishedDate: page.meta.publishedTime ?? page.meta.modifiedTime, image: page.meta.image, text: text.slice(0, clipTo), via: "context" };
      }
      reason = page.failed ? `${PROVIDER_NAME.context} said ${page.failed.toLowerCase().replace(/_/g, " ")}` : "the page had nothing to read";
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      reason = err instanceof Error ? err.message : reason;
    }
    // Second try, in a browser, from the same country.
    try {
      const page = await oxyMarkdown({ url, runJs: true, location: want.country }, opts);
      const text = page.markdown?.trim() ?? "";
      if (text.length >= TOO_SHORT) return { url, title: titleOf(text), text: text.slice(0, clipTo), via: "oxylabs" };
      return { url, reason: page.status && page.status >= 400 ? `the site answered ${page.status}` : reason };
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      return { url, reason };
    }
  };
  const all = await Promise.all(urls.map(read));
  const pages = all.filter((p): p is LiveResult => "via" in p);
  const unread = all.filter((p): p is { url: string; reason: string } => "reason" in p);
  return { pages, unread, costUsd };
}

function titleOf(markdown: string): string | undefined {
  const heading = /^#{1,2}\s+(.+)$/m.exec(markdown);
  return heading?.[1]?.trim().slice(0, 160);
}

/** News stories about a subject. */
export async function liveNews(req: { query: string; limit?: number }, opts: Opts = {}): Promise<{ results: LiveResult[]; costUsd: number }> {
  const res = await ctxNews(req, opts);
  return {
    results: res.items.map((n) => ({
      url: n.url,
      title: n.title,
      publishedDate: n.published_at,
      image: n.image_url,
      description: n.description ?? undefined,
      highlights: n.description ? [n.description] : [],
      via: "context" as const,
    })),
    costUsd: res.costUsd,
  };
}
