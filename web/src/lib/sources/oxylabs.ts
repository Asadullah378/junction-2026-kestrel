import "server-only";

import { cacheGet, cacheSet, gate, send, type WebMeter } from "./http";

/**
 * The Oxylabs Web API (https://developers.oxylabs.io/get-started/quick-start-web-api): how Kestrel
 * sees the web from a particular country, prices things, and reads pages that need a browser.
 *
 * - `POST /v1/search` finds pages as someone in `location` would be shown them.
 * - `POST /v1/scrape` reads one page: as Markdown (with JavaScript run when asked), or as fields
 *   from a schema (AI Parsing).
 * - `POST /v1/scrape/google/shopping/search` is a dedicated scraper: shop offers with parsed prices.
 *
 * The API rejects unknown fields, so every body below is exact. It publishes no price per call,
 * so calls are counted and their cost is recorded as 0 rather than guessed.
 */

const BASE_URL = "https://webapi.oxylabs.io";
const turn = gate(10, 10);

type Opts = { meter?: WebMeter; signal?: AbortSignal; cache?: boolean };

export type OxySearchResult = { url: string; title: string; outline: string[]; position: number };

/** Search as seen from one country (ISO alpha-2, upper case). At most 20 results; no page text. */
export async function oxySearch(body: { query: string; maxResults?: number; location?: string }, opts: Opts = {}): Promise<{ results: OxySearchResult[]; ms: number }> {
  const key = "oxy-search:" + JSON.stringify(body);
  if (opts.cache !== false) {
    const hit = cacheGet<{ results: OxySearchResult[]; ms: number }>(key);
    if (hit) return hit;
  }
  const started = Date.now();
  const res = await send<{ results?: Array<{ url: string; title?: string; outline?: string[]; metadata?: { position?: number } }> }>({
    provider: "oxylabs",
    url: BASE_URL + "/v1/search",
    body: { query: body.query.slice(0, 2000), max_results: Math.min(20, Math.max(1, body.maxResults ?? 10)), ...(body.location ? { location: body.location.toUpperCase() } : {}) },
    signal: opts.signal,
    timeoutMs: 40_000,
    turn,
  });
  const out = {
    results: (res.results ?? []).map((r, i) => ({ url: r.url, title: r.title ?? "", outline: r.outline ?? [], position: r.metadata?.position ?? i + 1 })),
    ms: Date.now() - started,
  };
  opts.meter?.addWeb(0, "search");
  if (opts.cache !== false) cacheSet(key, out);
  return out;
}

type ScrapeRaw<J> = { results?: Array<{ markdown?: string | null; json?: J | null; metadata?: { url?: string; statuses?: { http_request?: { code?: number; tag?: string } } } }> };

/** Read one page as Markdown. `runJs` renders the page in a browser first: slower, for pages that are empty without it. */
export async function oxyMarkdown(body: { url: string; runJs?: boolean; location?: string }, opts: Opts = {}): Promise<{ url: string; markdown: string | null; status?: number }> {
  const key = "oxy-md:" + JSON.stringify(body);
  if (opts.cache !== false) {
    const hit = cacheGet<{ url: string; markdown: string | null; status?: number }>(key);
    if (hit) return hit;
  }
  const res = await send<ScrapeRaw<unknown>>({
    provider: "oxylabs",
    url: BASE_URL + "/v1/scrape",
    body: { url: body.url, output: ["markdown"], ...(body.runJs ? { run_js: true } : {}), ...(body.location ? { location: body.location.toUpperCase() } : {}) },
    signal: opts.signal,
    timeoutMs: 120_000,
    turn,
  });
  const first = res.results?.[0];
  const out = { url: first?.metadata?.url ?? body.url, markdown: first?.markdown?.trim() ? first.markdown : null, status: first?.metadata?.statuses?.http_request?.code };
  opts.meter?.addWeb(0, "read");
  if (opts.cache !== false && out.markdown) cacheSet(key, out);
  return out;
}

/**
 * AI Parsing: read a page and return the fields a schema names. The schema is an OpenAPI object
 * schema; the service returns JSON that matches it. Never cached: this is for values that move.
 */
export async function oxyExtract<T extends Record<string, unknown>>(
  body: { url: string; schema: Record<string, unknown>; location?: string; runJs?: boolean },
  opts: Opts = {},
): Promise<{ url: string; data: T | null; ms: number }> {
  const started = Date.now();
  const res = await send<ScrapeRaw<T>>({
    provider: "oxylabs",
    url: BASE_URL + "/v1/scrape",
    body: { url: body.url, output: ["json"], json: { schema: body.schema }, ...(body.runJs ? { run_js: true } : {}), ...(body.location ? { location: body.location.toUpperCase() } : {}) },
    signal: opts.signal,
    timeoutMs: 150_000,
    turn,
  });
  opts.meter?.addWeb(0, "extract");
  const first = res.results?.[0];
  return { url: first?.metadata?.url ?? body.url, data: first?.json ?? null, ms: Date.now() - started };
}

export type OxyOffer = {
  title: string;
  price: number;
  currency: string;
  priceText: string;
  merchant: string | null;
  url: string | null;
  rating: number | null;
  reviews: number | null;
  image: string | null;
  position: number;
};

type ShoppingRaw = ScrapeRaw<{
  url?: string;
  results?: {
    organic?: Array<{
      title?: string;
      price?: number;
      price_str?: string;
      currency?: string;
      merchant?: { name?: string; url?: string } | string | null;
      url?: string;
      rating?: number;
      reviews_count?: number;
      thumbnail?: string;
      pos?: number;
    }>;
  };
}>;

/** Google Shopping as seen from one country: offers with parsed prices, through the dedicated scraper. */
export async function oxyShopping(
  body: { query: string; location: string; minPrice?: number; maxPrice?: number },
  opts: Opts = {},
): Promise<{ offers: OxyOffer[]; pageUrl: string | null; ms: number }> {
  const key = "oxy-shop:" + JSON.stringify(body);
  if (opts.cache !== false) {
    const hit = cacheGet<{ offers: OxyOffer[]; pageUrl: string | null; ms: number }>(key);
    if (hit) return hit;
  }
  const started = Date.now();
  const res = await send<ShoppingRaw>({
    provider: "oxylabs",
    url: BASE_URL + "/v1/scrape/google/shopping/search",
    body: {
      query: body.query.slice(0, 400),
      location: body.location.toUpperCase(),
      output: ["json"],
      ...(body.minPrice !== undefined ? { min_price: body.minPrice } : {}),
      ...(body.maxPrice !== undefined ? { max_price: body.maxPrice } : {}),
    },
    signal: opts.signal,
    timeoutMs: 90_000,
    turn,
  });
  const json = res.results?.[0]?.json;
  const absolute = (href: string | undefined): string | null => {
    if (!href) return null;
    if (/^https?:\/\//.test(href)) return href;
    return href.startsWith("/") ? "https://www.google.com" + href : null;
  };
  const offers: OxyOffer[] = (json?.results?.organic ?? [])
    .filter((o) => typeof o.price === "number" && o.title)
    .map((o, i) => ({
      title: o.title!,
      price: o.price!,
      currency: o.currency ?? "",
      priceText: o.price_str ?? String(o.price),
      merchant: typeof o.merchant === "string" ? o.merchant : (o.merchant?.name ?? null),
      url: absolute(typeof o.merchant === "object" && o.merchant?.url ? o.merchant.url : o.url),
      rating: typeof o.rating === "number" ? o.rating : null,
      reviews: typeof o.reviews_count === "number" ? o.reviews_count : null,
      // Thumbnails arrive as a link or as small inline image data. A big inline one is left out: it would travel with every offer.
      image: o.thumbnail && (/^https?:\/\//.test(o.thumbnail) || (/^data:image\//.test(o.thumbnail) && o.thumbnail.length < 14_000)) ? o.thumbnail : null,
      position: o.pos ?? i + 1,
    }));
  const out = { offers, pageUrl: json?.url ?? res.results?.[0]?.metadata?.url ?? null, ms: Date.now() - started };
  opts.meter?.addWeb(0, "extract");
  if (opts.cache !== false && offers.length) cacheSet(key, out);
  return out;
}
