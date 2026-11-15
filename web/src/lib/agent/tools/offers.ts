import type { OxyOffer } from "@/lib/sources/oxylabs";

/*
 * Which of a shop listing's offers is the product itself, and which of those is the cheapest.
 * Plain code, no clock, no network, no model: a price on the card is a price a shop showed.
 *
 * Real listings are full of things that carry the product's name without being it: cases, ear
 * pads and skins, used and graded goods, pawn shops, the odd price with three digits too many.
 * Each rule below is here because one of those came out as "the cheapest" on 15 Nov 2026.
 * The table test is scripts/offers-test.mjs (pnpm test:offers).
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * An offer is the product when its title names the brand and carries the rest of the name in one
 * piece: "Sony … WH-1000XM6", "Nintendo Switch 2". Words scattered through a title do not count,
 * or "Nintendo Switch … Luigi's Mansion 2" would pass for a Switch 2.
 *
 * The piece has to begin where a word begins and end where one ends, or "Nintendo Switch 2019"
 * would pass for a Switch 2 as well. A letter or two after it is allowed: shops write
 * "WH-1000XM6B" for the black one and "AirPods Pro 3rd generation".
 */
export function isProduct(title: string, product: string): boolean {
  const [brand, ...rest] = product.split(/\s+/).map(norm).filter(Boolean);
  if (!brand || !norm(title).includes(brand)) return false;
  const name = rest.join("");
  if (!name) return true;
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let run = "";
    for (let j = i; j < words.length && run.length < name.length; j++) {
      run += words[j];
      if (run.length < name.length) continue;
      if (run.startsWith(name) && /^[a-z]{0,2}$/.test(run.slice(name.length))) return true;
    }
  }
  return false;
}

/** Second-hand and "compatible with" offers are not the product at its price. Words for them in the languages of the countries looked in. */
const NOT_NEW =
  /\busat[oa]\b|\busad[oa]\b|gebruikt|\bbrugt\b|\bbrukt\b|\bgrade [a-d]\b|open(ed)?[ -]?box|geopende doos|b-?ware|outlet|demo ?(model|kappale)|skins?\b|wraps?\b|refurbish|renewed|restored|pre-?owned|reacondicionad|ricondizionat|reconditionn|gebraucht|wie neu|käytetty|begagnad|occasion|\bused\b|second ?hand|tweedehands|używan|uzywan|powystawow|použit|kompatib|compatib|yhteensopiva|ersatz|replacement|remplacement|vervang|ricambio|reservdel|varaosa|factice|\bdummy\b|\bavattu\b|\baperto\b|geöffnet|\b(un)?boxed\b|user guide/i;

/** Shops and marketplaces that sell used goods or private listings: their prices are not a shop's price for a new one. */
const SECOND_HAND =
  /segunda mano|second ?hand|\bused\b|usato|occasion|gebraucht|käytetty|begagnad|refurb|leboncoin|\bcex\b|wallapop|back ?market|rebuy|swappie|\bebay\b|vinted|marktplaats|kleinanzeigen|\btori\b|blocket|subito|tradera|huuto|ricardo|cash|lo+mbard|\bkomis\b|\bolx\b|allegro lokalnie|bazos|\bcgx\b|stockx|\bfinn\.no\b|\bdba\b|tutti\.ch|anibis/i;

export const isNewFromAShop = (offer: Pick<OxyOffer, "title" | "merchant">, product: string) => isProduct(offer.title, product) && !NOT_NEW.test(offer.title) && !SECOND_HAND.test(offer.merchant ?? "");

type Priced = Pick<OxyOffer, "price" | "merchant">;
type Band = { low: number; high: number };
/** A stretch holding this share of the fullest one's money is as good as it. */
const NEARLY = 0.7;

/**
 * Where the product's own price lies among offers in one currency.
 *
 * Cases and spare parts carry the product's name too, and for some products there are more of
 * them than of the product itself. So the band is not where the most offers are but where the
 * money is: of every stretch of prices (lowest to 1.6 times lowest) the one whose shops add up to
 * the most, each shop counted once at its lowest price.
 *
 * A stretch counts only if two shops or more are in it with a fair share of the offers, or if
 * half of all the offers are. One shop listing a wild price twice does not make a market:
 * in Switzerland that put a pair of headphones at CHF 18,185.
 *
 * Adding up money leans towards the dearer stretch, so of the stretches that hold nearly as much
 * as the fullest one, the cheapest is taken: with shops at 319, 418, 503 and 646 the band starts
 * at 319, not at 418.
 */
export function priceBand(offers: Priced[]): Band | null {
  if (offers.length === 0) return null;
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const fairShare = Math.max(2, Math.ceil(sorted.length * 0.1));
  const stretches: Array<{ low: number; sum: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const shops = new Map<string, number>();
    let count = 0;
    for (let j = i; j < sorted.length && sorted[j].price <= sorted[i].price * 1.6; j++) {
      count += 1;
      const shop = (sorted[j].merchant ?? "").trim().toLowerCase();
      if (!shops.has(shop)) shops.set(shop, sorted[j].price);
    }
    const enough = sorted.length < 4 || (shops.size >= 2 && count >= fairShare) || count * 2 >= sorted.length;
    if (!enough) continue;
    let sum = 0;
    for (const price of shops.values()) sum += price;
    stretches.push({ low: sorted[i].price, sum });
  }
  if (stretches.length === 0) return null;
  const fullest = Math.max(...stretches.map((s) => s.sum));
  const low = Math.min(...stretches.filter((s) => s.sum >= fullest * NEARLY).map((s) => s.low));
  return { low: low * 0.8, high: low * 1.8 };
}

const inBand = (price: number, band: Band | null) => !band || (price >= band.low && price <= band.high);

/**
 * Roughly what one unit of a country's money is worth in euros. It is used for one thing only:
 * to tell the product from its case, or from a mistyped price, in a country that does not use
 * the euro, by holding its offers against what the euro countries show. The margin allows for
 * the rate being a little off and for tax: such a country's price for a new one is not far
 * under the euro price, so a much cheaper offer is a used one or a part. No price is ever
 * converted to be shown or compared.
 */
const ROUGH_EUR: Record<string, number> = { SE: 0.09, NO: 0.086, DK: 0.134, PL: 0.235, CH: 1.06, GB: 1.17, CZ: 0.04, HU: 0.0025, RO: 0.2, IS: 0.0068, US: 0.9 };
const MARGIN = { below: 0.85, above: 1.6 };

const isEuro = (currency: string) => currency === "EUR" || currency === "€";

export type Listed = { country: string; offers: OxyOffer[] };
export type Picked = { country: string; best: OxyOffer | null; matched: number; highest: number | null };

/** For each country, the cheapest offer that is the product itself, new, from a shop, at a price that can be right. */
export function pickOffers(product: string, listed: Listed[]): Picked[] {
  const genuine = listed.map((c) => ({ country: c.country.toUpperCase(), offers: c.offers.filter((o) => isNewFromAShop(o, product)) }));
  // The euro countries' offers compare as they stand, so one band serves them all: a country with two offers still gets a sound one.
  const euroBand = priceBand(genuine.flatMap((c) => c.offers.filter((o) => isEuro(o.currency))));

  return genuine.map((c): Picked => {
    // A country's offers in its main currency. (A stray offer in another one cannot be compared with the rest.)
    const counts = new Map<string, number>();
    for (const o of c.offers) counts.set(o.currency, (counts.get(o.currency) ?? 0) + 1);
    const currency = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const offers = c.offers.filter((o) => o.currency === currency);
    const rate = ROUGH_EUR[c.country];
    let band: Band | null;
    if (currency !== undefined && isEuro(currency)) band = euroBand;
    // Held against the euro countries when they were asked too; otherwise against its own offers.
    else if (euroBand && rate) band = { low: (euroBand.low * MARGIN.below) / rate, high: (euroBand.high * MARGIN.above) / rate };
    else band = priceBand(offers);
    const matching = offers.filter((o) => inBand(o.price, band));
    const best = matching.length ? matching.reduce((a, b) => (b.price < a.price ? b : a)) : null;
    return { country: c.country, best, matched: matching.length, highest: matching.length ? Math.max(...matching.map((o) => o.price)) : null };
  });
}
