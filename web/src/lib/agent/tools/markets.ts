import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { liveNews } from "@/lib/sources/client";
import { toSource, type MarketOutcome, type PredictionMarketData, type PricePoint, type Source } from "@/lib/widgets/types";
import { clip, errorMessage, type ToolContext } from "./context";

/* ───────────────────────── Prediction markets ─────────────────────────
 * Odds and price history come from Polymarket's public API, so the chart is instant and can
 * refresh live. Context.dev's news search (`liveNews`) then finds this week's reporting on the question, so the agent can say
 * why the odds moved and cite it.
 */

type GammaMarket = {
  question?: string;
  groupItemTitle?: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  volumeNum?: number;
  active?: boolean;
  closed?: boolean;
};
type GammaEvent = { title: string; slug: string; image?: string; volume?: number; endDate?: string; closed?: boolean; markets?: GammaMarket[] };

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(10_000);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Polymarket returned ${res.status}.`);
  return (await res.json()) as T;
}

const parseList = (s: string | undefined): string[] => {
  try {
    return s ? (JSON.parse(s) as string[]) : [];
  } catch {
    return [];
  }
};

async function history(tokenId: string, signal?: AbortSignal): Promise<PricePoint[]> {
  try {
    const data = await getJson<{ history?: Array<{ t: number; p: number }> }>(`https://clob.polymarket.com/prices-history?market=${tokenId}&interval=1m&fidelity=360`, signal);
    return (data.history ?? []).map((h) => ({ t: h.t * 1000, v: h.p }));
  } catch {
    return [];
  }
}

async function buildMarket(ev: GammaEvent, signal?: AbortSignal): Promise<PredictionMarketData> {
  const open = (ev.markets ?? []).filter((m) => m.active !== false && !m.closed);
  type Candidate = { name: string; probability: number; token?: string; volume?: number };
  let candidates: Candidate[];
  if (open.length === 1) {
    const m = open[0];
    const names = parseList(m.outcomes);
    const prices = parseList(m.outcomePrices).map(Number);
    const tokens = parseList(m.clobTokenIds);
    candidates = names.map((name, i) => ({ name, probability: prices[i] ?? 0, token: tokens[i], volume: m.volumeNum }));
  } else {
    candidates = open.map((m) => ({
      name: m.groupItemTitle || m.question || "Outcome",
      probability: Number(parseList(m.outcomePrices)[0] ?? 0),
      token: parseList(m.clobTokenIds)[0],
      volume: m.volumeNum,
    }));
  }
  candidates = candidates.filter((c) => Number.isFinite(c.probability)).sort((a, b) => b.probability - a.probability).slice(0, 8);
  const histories = await Promise.all(candidates.map((c, i) => (i < 6 && c.token ? history(c.token, signal) : Promise.resolve([]))));
  const outcomes: MarketOutcome[] = candidates.map((c, i) => {
    const h = histories[i];
    return { name: c.name, probability: c.probability, history: h, change: h.length > 1 ? c.probability - h[0].v : undefined, volume: c.volume };
  });
  const url = `https://polymarket.com/event/${ev.slug}`;
  return {
    kind: "market",
    title: ev.title,
    url,
    image: ev.image,
    volume: typeof ev.volume === "number" ? ev.volume : undefined,
    endDate: ev.endDate,
    outcomes,
    historyLabel: "Last 30 days",
    slug: ev.slug,
    sources: [toSource({ url, title: `${ev.title} (Polymarket)` })],
  };
}

export async function fetchMarketBySlug(slugInput: string, signal?: AbortSignal): Promise<PredictionMarketData> {
  const slug = slugInput.replace(/[^a-z0-9-]/gi, "");
  const events = await getJson<GammaEvent[]>(`https://gamma-api.polymarket.com/events?slug=${slug}`, signal);
  if (!events[0]) throw new Error("That market was not found.");
  return buildMarket(events[0], signal);
}

async function findMarket(query: string, signal?: AbortSignal): Promise<PredictionMarketData> {
  const data = await getJson<{ events?: GammaEvent[] }>(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}&limit_per_type=6`, signal);
  const events = (data.events ?? []).filter((e) => (e.markets ?? []).some((m) => m.active !== false && !m.closed));
  if (events.length === 0) throw new Error(`No open prediction market found for "${query}".`);
  return buildMarket(events[0], signal);
}

export function getPredictionMarketTool(ctx: ToolContext) {
  return tool({
    description:
      "Look up a prediction market on Polymarket: current odds for each outcome, 30-day history as a live chart, and this week's news that explains the moves. " +
      "Use it for 'what are the odds', elections, sports outcomes, economic events and anything people bet on.",
    inputSchema: z.object({
      query: z.string().describe('The event in a few words, for example "2028 US presidential election winner" or "Fed rate cut December".'),
    }),
    execute: async ({ query }, { abortSignal }): Promise<PredictionMarketData & { news?: Array<Source & { quote: string }> }> => {
      try {
        const market = await findMarket(query, abortSignal);
        let news: Array<Source & { quote: string }> = [];
        try {
          const res = await liveNews({ query: market.title, limit: 4 }, { meter: ctx.meter, signal: abortSignal });
          news = res.results.map((r) => ({ ...toSource({ ...r, snippet: clip(r.highlights?.[0], 260) }), quote: clip(r.highlights?.[0], 600) }));
        } catch {
          /* the chart still works without news */
        }
        const newsSources: Source[] = news.map((n) => ({ url: n.url, title: n.title, domain: n.domain, favicon: n.favicon, publishedDate: n.publishedDate, snippet: n.snippet }));
        return { ...market, sources: [...market.sources, ...newsSources], news };
      } catch (err) {
        return { kind: "market", title: query, url: "https://polymarket.com", outcomes: [], historyLabel: "", sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => {
      if (output.error) return { type: "text", value: output.error };
      const odds = output.outcomes
        .slice(0, 6)
        .map((o) => `${o.name}: ${(o.probability * 100).toFixed(1)}%${o.change !== undefined ? ` (${o.change >= 0 ? "+" : ""}${(o.change * 100).toFixed(1)} pts in 30 days)` : ""}`)
        .join("\n");
      const news = (output.news ?? []).map((n) => `- ${n.title} (${n.url}${n.publishedDate ? `, ${n.publishedDate.slice(0, 10)}` : ""})\n  > ${n.quote}`).join("\n");
      return {
        type: "text",
        value:
          `A live odds chart for "${output.title}" is now shown to the user. Do not list all the odds again. ` +
          `In two or three sentences say what the market implies and, citing the news below, why it moved.\n\n${odds}\n\nRecent news:\n${news || "none found"}`,
      };
    },
  });
}
