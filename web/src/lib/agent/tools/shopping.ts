import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { oxyShopping, type OxyOffer } from "@/lib/sources/oxylabs";
import type { WebMeter } from "@/lib/sources/http";
import { toSource, type Product, type ProductsData, type Source } from "@/lib/widgets/types";
import { errorMessage, type ToolContext } from "./context";

/*
 * One product, priced country by country. Oxylabs runs Google Shopping as someone in each
 * country would see it (its dedicated Shopping scraper, with the country as `location`) and
 * returns the offers with their prices already parsed. Nothing here is read by a model: the
 * cheapest matching offer in each country is picked by plain code, so a price on the card is a
 * price a shop showed, and the link goes to that offer.
 *
 * The same function feeds a price watch (lib/watches), which runs it again later and reports
 * what moved.
 */

export const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgium", CH: "Switzerland", CZ: "Czechia", DE: "Germany", DK: "Denmark", EE: "Estonia", ES: "Spain",
  FI: "Finland", FR: "France", GB: "United Kingdom", IE: "Ireland", IT: "Italy", NL: "Netherlands", NO: "Norway", PL: "Poland",
  PT: "Portugal", SE: "Sweden", US: "United States",
};
const DEFAULT_COUNTRIES = ["FI", "SE", "DE", "NL", "FR", "ES", "IT"];
const MAX_COUNTRIES = 8;

export type CountryPrices = {
  country: string;
  /** The cheapest offer that is the product itself, or null when none was found there. */
  best: OxyOffer | null;
  /** How many offers matched the product, and the dearest of them. */
  matched: number;
  highest: number | null;
  /** The Shopping page these came from, as seen from that country. */
  pageUrl: string | null;
  error?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** An offer is the product when its title carries every word of the product's name, model numbers included. */
function isProduct(title: string, product: string): boolean {
  const have = norm(title);
  return product
    .split(/\s+/)
    .map(norm)
    .filter((t) => t.length >= 2)
    .every((t) => have.includes(t));
}

/** Second-hand and "compatible with" offers are not the product at its price. Words for them in the languages of the countries looked in. */
const NOT_NEW = /refurbish|renewed|reacondicionad|ricondizionat|reconditionn|gebraucht|wie neu|käytetty|begagnad|occasion|\bused\b|second ?hand|tweedehands|kompatib|compatib|yhteensopiva|ersatz|replacement|reservdel|varaosa/i;

/** Shops and marketplaces that sell used goods or private listings: their prices are not a shop's price for a new one. */
const SECOND_HAND = /segunda mano|second ?hand|\bused\b|usato|occasion|gebraucht|käytetty|begagnad|refurb|leboncoin|\bcex\b|wallapop|back ?market|rebuy|swappie|\bebay\b|vinted|marktplaats|kleinanzeigen|\btori\b|blocket|subito|tradera|huuto|ricardo|cash ?converters|realcash/i;

/**
 * Cases, ear pads and spare parts carry the product's name too, and so does the odd listing with
 * a wild price. The product's own price is where most offers sit: take the densest stretch of
 * prices (lowest to 1.6 times lowest) and keep what lies in or just around it.
 */
function priceBand(prices: number[]): { low: number; high: number } | null {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  let best = { start: 0, count: 0 };
  for (let i = 0; i < sorted.length; i++) {
    let count = 0;
    for (let j = i; j < sorted.length && sorted[j] <= sorted[i] * 1.6; j++) count += 1;
    // Of two stretches with as many offers, the dearer one is the product and the cheaper its accessories.
    if (count >= best.count) best = { start: i, count };
  }
  const low = sorted[best.start];
  return { low: low * 0.92, high: low * 1.75 };
}

/** The cheapest offer for one product in each country, all countries asked at once. */
export async function pricesByCountry(product: string, countries: string[], opts: { meter?: WebMeter; signal?: AbortSignal; maxPrice?: number; cache?: boolean } = {}): Promise<{ rows: CountryPrices[]; ms: number }> {
  const started = Date.now();
  const seen = await Promise.all(
    countries.map(async (country) => {
      try {
        const res = await oxyShopping({ query: product, location: country, maxPrice: opts.maxPrice }, { meter: opts.meter, signal: opts.signal, cache: opts.cache });
        return { country, offers: res.offers.filter((o) => isProduct(o.title, product) && !NOT_NEW.test(o.title) && !SECOND_HAND.test(o.merchant ?? "")), pageUrl: res.pageUrl, error: undefined as string | undefined };
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        return { country, offers: [] as OxyOffer[], pageUrl: null, error: errorMessage(err) };
      }
    }),
  );
  // One band per currency, from every country's offers together: a country with two offers still gets a sound band.
  const bands = new Map<string, { low: number; high: number } | null>();
  for (const currency of new Set(seen.flatMap((c) => c.offers.map((o) => o.currency)))) {
    bands.set(currency, priceBand(seen.flatMap((c) => c.offers.filter((o) => o.currency === currency).map((o) => o.price))));
  }
  const rows = seen.map((c): CountryPrices => {
    const matching = c.offers.filter((o) => {
      const band = bands.get(o.currency);
      return !band || (o.price >= band.low && o.price <= band.high);
    });
    const best = matching.length ? matching.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    return { country: c.country, best, matched: matching.length, highest: matching.length ? Math.max(...matching.map((o) => o.price)) : null, pageUrl: c.pageUrl, error: c.error };
  });
  return { rows, ms: Date.now() - started };
}

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `${amount} ${currency}`.trim();
  }
};

export const countryName = (code: string) => COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();

export function comparePricesTool(ctx: ToolContext) {
  return tool({
    description:
      "Price one specific product across countries: looks at shop offers as someone in each country would see them and shows the cheapest in each, side by side, with the shop and a link. " +
      "Use it for 'how much is X', 'where is X cheapest', 'is it cheaper in Germany', and before buying anything with a model name. Give the exact product name and model. " +
      "The user can turn the result into a watch with one press, to hear when a price drops.",
    inputSchema: z.object({
      product: z.string().describe('The exact product, brand and model, as a shop would list it: "Sony WH-1000XM6". No adjectives, no price.'),
      countries: z
        .array(z.string().regex(/^[A-Za-z]{2}$/))
        .min(1)
        .max(MAX_COUNTRIES)
        .optional()
        .describe("Two-letter country codes to look in. Default: the user's country and its European neighbours."),
      maxPrice: z.number().positive().optional().describe("Only offers at or under this price, in each country's own currency."),
    }),
    // Each `yield` replaces what the widget shows; the last value yielded is the tool's result.
    async *execute({ product, countries, maxPrice }, { abortSignal }): AsyncGenerator<ProductsData> {
      const base = { kind: "products" as const, query: product };
      const home = ctx.country?.toUpperCase();
      const wanted = [...new Set([...(countries?.map((c) => c.toUpperCase()) ?? [home, ...DEFAULT_COUNTRIES].filter((c): c is string => Boolean(c)))])].slice(0, MAX_COUNTRIES);
      try {
        yield { ...base, products: [], sources: [], stage: `Looking at shop offers in ${wanted.length} ${wanted.length === 1 ? "country" : "countries"}` };
        const { rows, ms } = await pricesByCountry(product, wanted, { meter: ctx.meter, signal: abortSignal, maxPrice });
        const found = rows.filter((r) => r.best);
        // The cheapest first, among prices in the same currency; other currencies follow in the order asked.
        const mainCurrency = mostCommon(found.map((r) => r.best!.currency));
        found.sort((a, b) => Number(b.best!.currency === mainCurrency) - Number(a.best!.currency === mainCurrency) || a.best!.price - b.best!.price);
        const products = found.map((r, i): Product => {
          const o = r.best!;
          return {
            id: `${r.country.toLowerCase()}-${i}`,
            title: o.title,
            image: o.image ?? undefined,
            price: o.price,
            currency: o.currency || undefined,
            merchant: o.merchant ?? "Shop",
            url: o.url ?? r.pageUrl ?? "https://www.google.com/shopping",
            rating: o.rating ?? undefined,
            reviewCount: o.reviews ?? undefined,
            specs: [
              { label: "Seen from", value: countryName(r.country) },
              { label: "Offers", value: String(r.matched) },
              ...(r.highest !== null && r.highest > o.price ? [{ label: "Dearest", value: money(r.highest, o.currency) }] : []),
            ],
            note: `Cheapest of ${r.matched} ${r.matched === 1 ? "offer" : "offers"} seen from ${countryName(r.country)}`,
            tag: i === 0 && found.length > 1 && o.currency === mainCurrency ? "Lowest price" : undefined,
          };
        });
        const sources: Source[] = rows.filter((r) => r.pageUrl).map((r) => toSource({ url: r.pageUrl!, title: `Google Shopping, seen from ${countryName(r.country)} (through Oxylabs)` }));
        const missing = rows.filter((r) => !r.best).map((r) => countryName(r.country));
        yield {
          ...base,
          products,
          verdict: verdictFor(found, home, mainCurrency, missing, ms),
          sources,
          error: products.length === 0 ? `No shop offers for "${product}" were found in ${missing.join(", ")}. Check the model name, or try other countries.` : undefined,
          watchSpec: products.length ? { what: product, wishes: [], queries: [], product, countries: wanted } : undefined,
        };
      } catch (err) {
        yield { ...base, products: [], sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => {
      if (output.stage) return { type: "text", value: "Looking at prices." };
      if (output.error) return { type: "text", value: output.error };
      const lines = output.products.map((p, i) => `${i + 1}. ${p.specs?.[0]?.value}: ${p.price} ${p.currency ?? ""} at ${p.merchant} (${p.title}); ${p.specs?.[1]?.value} offers seen`);
      return {
        type: "text",
        value:
          "The cheapest offer in each country is now shown to the user as cards with shop links. Do not repeat the list. " +
          "Say in two or three sentences where it is cheapest and by how much against the user's own country, and that shipping and tax across borders are not included. " +
          'These are the prices shops showed just now; they move. The card has a "Watch this" button: offer it if the user is waiting for a better price.\n' +
          `${output.verdict ?? ""}\n\n${lines.join("\n")}`,
      };
    },
  });
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** One or two plain sentences, worked out from the numbers. */
function verdictFor(found: CountryPrices[], home: string | undefined, currency: string | undefined, missing: string[], ms: number): string | undefined {
  if (found.length === 0) return undefined;
  const same = found.filter((r) => r.best!.currency === currency);
  const cheapest = same[0] ?? found[0];
  const parts = [`Cheapest seen: ${money(cheapest.best!.price, cheapest.best!.currency)} at ${cheapest.best!.merchant ?? "a shop"}, from ${countryName(cheapest.country)}.`];
  const own = home ? same.find((r) => r.country === home) : undefined;
  if (own && own !== cheapest && own.best!.price > cheapest.best!.price) {
    parts.push(`From ${countryName(own.country)} the cheapest is ${money(own.best!.price, own.best!.currency)}, ${money(own.best!.price - cheapest.best!.price, own.best!.currency)} more.`);
  }
  if (missing.length) parts.push(`Nothing matching was found from ${missing.join(", ")}.`);
  parts.push(`${found.length} ${found.length === 1 ? "country" : "countries"} checked in ${(ms / 1000).toFixed(1)} s. Shipping and tax across borders are not included.`);
  return parts.join(" ");
}
