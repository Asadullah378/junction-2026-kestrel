import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { decide, decisionsConfigured, type ChoiceAnswer, type DecisionMeter, type DecisionQuestion, type YesNoAnswer } from "@/lib/decisions/client";
import { liveSearch, type LiveResult, type Recency, type WebMeter } from "@/lib/sources/client";
import { SIFT_SURE, toSource, type SiftData, type SiftItem, type SiftVerdict } from "@/lib/widgets/types";
import { clip, errorMessage, type ToolContext } from "./context";

/*
 * Sift: find the ones that fit. Context.dev returns dozens of pages in one search, each with its
 * text; Gemini's decision model then checks every page against every wish in a single request,
 * where an agent reading pages one by one would manage four or five. The result is a grid: one
 * row per page, one column per wish, each cell a yes, a no or "does not say", with how sure the
 * judge is.
 *
 * The judge only ever sees what the search returned for a page, and it answers with
 * probabilities, not words: it cannot invent a fact, only say whether the page states one.
 *
 * The two halves, finding and judging, are plain functions so that a watch can run the same
 * sift again later and compare the result with the last one (lib/watches).
 */

/** Pages checked in one sift: enough to be worth sifting, few enough to stay quick and cheap. */
const USUAL_PAGES = 40;
const THOROUGH_PAGES = 100;
/** What each page contributes: its opening, plus the passages further down that bear on the search. */
const OPENING_CHARS = 2200;
const PASSAGE_CHARS = 1400;
/**
 * How long the pages get to load. Measured on 15 Nov 2026: with five seconds, 38 of 40 pages came
 * back with their text in 4.5 s; waiting for the last two took the search to 7.5 s.
 */
const READ_BUDGET_MS = 5_000;
const THOROUGH_READ_BUDGET_MS = 9_000;
/** A page with less than this to read cannot be judged. */
const MIN_CHARS = 200;

const ANSWERS = {
  yes: "The page says so, or clearly implies it",
  no: "The page says otherwise",
  unknown: "The page does not give enough information to tell",
} as const;

export type Wish = { label: string; test: string };

export type SiftSpec = {
  /** What one result should be, singular: "a recipe". */
  what: string;
  wishes: Wish[];
  /** One to three searches, each worded differently. */
  queries: string[];
  includeDomains?: string[];
  recency?: Recency;
  thorough?: boolean;
  country?: string;
};

type Meters = { meter?: WebMeter & DecisionMeter; signal?: AbortSignal };

/** The same page under two addresses counts once. */
export const pageKey = (url: string) => url.replace(/#.*$/, "").replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/, "");

const readable = (r: LiveResult) => `${r.text ?? ""} ${(r.highlights ?? []).join(" ")}`.replace(/\s+/g, " ").trim();

/** One page as the judge reads it. */
function pageText(r: LiveResult, n: number): string {
  const opening = clip((r.text ?? "").replace(/\s+/g, " "), OPENING_CHARS);
  const passages = (r.highlights ?? []).map((h) => `- ${clip(h.replace(/\s+/g, " "), PASSAGE_CHARS)}`).join("\n");
  return `[Page ${n}] ${r.title ?? ""}\n${r.url}\n${opening}${passages ? `\nPassages from further down the page:\n${passages}` : ""}`;
}

function verdictOf(answer: ChoiceAnswer | undefined): SiftVerdict {
  if (!answer || answer.type !== "choice") return { answer: "unknown", confidence: 0 };
  const choice = answer.choice === "yes" || answer.choice === "no" ? answer.choice : "unknown";
  return { answer: choice, confidence: Math.round(answer.confidence * 100) / 100 };
}

const metCount = (item: SiftItem) => (item.verdicts ?? []).filter((v) => v.answer === "yes").length;

/** "yes", "probably yes (61%)", "no", "not stated": how a verdict reads to the model. */
function verdictWords(v: SiftVerdict): string {
  if (v.answer === "unknown") return "not stated";
  return v.confidence >= SIFT_SURE ? v.answer : `probably ${v.answer} (${Math.round(v.confidence * 100)}%)`;
}

export const cleanWishes = (wishes: Wish[]): Wish[] => wishes.map((w) => ({ label: w.label.trim(), test: w.test.trim().replace(/[.?!]+$/, "") }));

export type SiftFound = {
  /** The pages to judge, one per address, each with something to read. */
  pages: LiveResult[];
  /** The same pages as the grid lists them. */
  listed: SiftItem[];
  /** Pages that came back with nothing to read. */
  unreadable: number;
  webCostUsd: number;
  searchMs: number;
  /** Set when nothing came back at all. */
  error?: string;
};

/** Find the pages and read them: one to three searches at once, each returning its pages' text. */
export async function siftFind(spec: SiftSpec, opts: Meters = {}): Promise<SiftFound> {
  // Differently worded searches find many of the same pages, so each asks for more than its share
  // and the surplus is cut after the doubles are gone.
  const limit = spec.thorough ? THOROUGH_PAGES : USUAL_PAGES;
  const perQuery = Math.min(100, Math.ceil((limit / spec.queries.length) * (spec.queries.length > 1 ? 1.5 : 1)));
  const started = Date.now();
  const searches = await Promise.allSettled(
    spec.queries.map((query) =>
      liveSearch(
        { query, numResults: perQuery, includeDomains: spec.includeDomains, recency: spec.recency, country: spec.country, text: true, highlights: PASSAGE_CHARS, readBudgetMs: spec.thorough ? THOROUGH_READ_BUDGET_MS : READ_BUDGET_MS },
        { meter: opts.meter, signal: opts.signal },
      ),
    ),
  );
  const searchMs = Date.now() - started;
  // Taken in turn from each search, so every wording contributes its best pages before any is cut.
  const lists = searches.map((s) => (s.status === "fulfilled" ? s.value.results : []));
  const found: LiveResult[] = [];
  for (let rank = 0; rank < perQuery; rank++) for (const list of lists) if (list[rank]) found.push(list[rank]);
  const webCostUsd = Math.round(searches.reduce((sum, s) => sum + (s.status === "fulfilled" ? s.value.costUsd : 0), 0) * 1e5) / 1e5;
  if (found.length === 0) {
    const failed = searches.find((s) => s.status === "rejected");
    return { pages: [], listed: [], unreadable: 0, webCostUsd, searchMs, error: failed ? errorMessage((failed as PromiseRejectedResult).reason) : "Nothing was found. Try describing it differently." };
  }

  // One entry per page, and only pages with something to read.
  const seen = new Set<string>();
  let unreadable = 0;
  const pages = found
    .filter((r) => {
      const key = pageKey(r.url);
      if (seen.has(key)) return false;
      seen.add(key);
      if (readable(r).length >= MIN_CHARS) return true;
      unreadable += 1;
      return false;
    })
    .slice(0, limit);
  const listed = pages.map((r): SiftItem => ({ ...toSource({ url: r.url, title: r.title, publishedDate: r.publishedDate, snippet: clip(r.highlights?.[0] ?? r.description, 240) || undefined }), image: r.image ?? undefined }));
  return { pages, listed, unreadable, webCostUsd, searchMs, error: pages.length === 0 ? "The pages that were found had nothing to read. Try describing it differently." : undefined };
}

export type SiftJudged = {
  /** The pages that are one such thing, best fit first, each with a verdict per wish. */
  items: SiftItem[];
  skipped?: number;
  judgements: number;
  judgedMs: number;
};

/** Check every page against every wish, in one request to the decision model. Throws if the judge cannot be reached. */
export async function siftJudge(spec: Pick<SiftSpec, "what" | "wishes">, found: SiftFound, opts: Meters = {}): Promise<SiftJudged> {
  const { pages, listed } = found;
  const { wishes } = spec;
  // One request: every page in the shared input, and one question per page and wish.
  const questions: Record<string, DecisionQuestion> = {};
  pages.forEach((_, i) => {
    const n = i + 1;
    questions[`p${n}_is`] = {
      type: "noul",
      instructions: `Look only at Page ${n}. Is that page itself ${spec.what}, with real content about it?`,
      criteria: { true_description: `The page is about one specific ${bare(spec.what)} and says something about it`, false_description: "The page is a list or round-up of several, a category, search or home page, an error page, or has no real content" },
    };
    wishes.forEach((wish, w) => {
      questions[`p${n}_w${w}`] = { type: "choice", instructions: `Look only at Page ${n}. According to that page, is it true that ${wish.test}?`, criteria: ANSWERS };
    });
  });
  const judged = await decide(pages.map((r, i) => pageText(r, i + 1)).join("\n\n"), questions, { meter: opts.meter, signal: opts.signal });

  // Best fit first: most wishes met, then the surest. Pages that are not one such thing are left out.
  const rows = pages
    .map((r, i) => {
      const n = i + 1;
      const is = judged.answers[`p${n}_is`] as YesNoAnswer | undefined;
      const answers = wishes.map((_, w) => judged.answers[`p${n}_w${w}`] as ChoiceAnswer | undefined);
      const item: SiftItem = { ...listed[i], verdicts: answers.map(verdictOf) };
      const fit = answers.reduce((sum, a) => sum + (a?.probabilities?.yes ?? 0), 0);
      return { item, fit, isOne: (is?.noul ?? 1) >= 0.5, rank: i };
    })
    .sort((a, b) => metCount(b.item) - metCount(a.item) || b.fit - a.fit || a.rank - b.rank);
  const kept = rows.filter((row) => row.isOne);
  // If nearly nothing passes as "one such thing", the description of the thing was off, not the pages: show them all.
  const items = (kept.length >= 3 ? kept : rows).map((row) => row.item);
  return { items, skipped: pages.length - items.length + found.unreadable || undefined, judgements: pages.length * wishes.length + pages.length, judgedMs: judged.ms };
}

export function siftTool(ctx: ToolContext) {
  return tool({
    description:
      "Find the ones that fit: reads dozens of web pages at once and checks every one against every wish the user has, then shows a grid of which pages meet which wishes. " +
      "Use it when the user wants things that must meet several conditions and each candidate has a page of its own that states the facts: recipes, job ads, flats and other listings, product reviews, courses, events, studies and papers, grants, tools. " +
      "It checks about 40 pages in the time you could read one, so prefer it to searching and reading page by page whenever the request is 'find me … that …'. " +
      "Not for places to go (findPlaces knows opening hours), the price of one product across shops (comparePrices) or a single fact. " +
      "The user can turn any sift into a watch with one press, so the same check runs again later and reports what changed.",
    inputSchema: z.object({
      title: z.string().describe('A short title for the grid, in the user\'s language: "Chickpea dinners that fit".'),
      what: z
        .string()
        .describe('What one result should be, singular, in a few words: "a recipe", "a job ad", "a hands-on review of one robot vacuum", "a listing for one flat to rent", "a study". Pages that are something else (lists, shop fronts, home pages) are left out.'),
      queries: z
        .array(z.string())
        .min(1)
        .max(3)
        .describe("One to three searches for the pages to find, each worded differently to cast a wider net. Word each as you would type it into a search engine (subject, kind of page, time period). Do not put the wishes in as must-haves: the sift checks those."),
      wishes: z
        .array(
          z.object({
            label: z.string().describe('The column heading, two or three words, in the user\'s language: "Under 30 min", "No nuts", "Remote".'),
            test: z
              .string()
              .describe(
                'One statement, in English, that is true or false of a single page, starting with the thing itself and giving numbers: "the recipe takes 30 minutes or less from start to finish", "the job can be done fully remotely". One condition per wish.',
              ),
          }),
        )
        .min(1)
        .max(6)
        .describe("What the user wants, one condition each. Include only what they asked for or clearly need."),
      includeDomains: z.array(z.string()).max(20).optional().describe("Only search these sites."),
      recency: z.enum(["day", "week", "month", "year"]).optional().describe("Only pages from within this window, for things that go out of date: job ads, events, listings."),
      thorough: z.boolean().optional().describe("Check about 100 pages instead of about 40. Use it when the user asks for all of them, or when a first sift found too few that fit."),
    }),
    // Each `yield` replaces what the widget shows; the last value yielded is the tool's result.
    async *execute(input, { abortSignal }): AsyncGenerator<SiftData> {
      const wishes = cleanWishes(input.wishes);
      const spec: SiftSpec = { what: input.what, wishes, queries: input.queries, includeDomains: input.includeDomains, recency: input.recency, thorough: input.thorough, country: ctx.country };
      const base = { kind: "sift" as const, title: input.title, what: input.what, wishes };
      // What a watch needs to run this same sift again.
      const watchSpec = { what: input.what, wishes: wishes.map((w, i) => ({ id: `w${i}`, ...w })), queries: input.queries };
      try {
        yield { ...base, items: [], checked: 0, sources: [], stage: "Searching the live web and reading the pages" };
        const found = await siftFind(spec, { meter: ctx.meter, signal: abortSignal });
        const { pages, listed, webCostUsd, searchMs } = found;
        if (found.error) {
          yield { ...base, items: [], checked: 0, sources: [], webCostUsd, error: found.error };
          return;
        }
        yield { ...base, items: listed, checked: pages.length, sources: listed.slice(0, 12), webCostUsd, searchMs, stage: `Checking ${pages.length} pages against ${wishes.length === 1 ? "your wish" : `${wishes.length} wishes`}` };

        if (!decisionsConfigured()) {
          yield { ...base, items: listed, checked: pages.length, sources: listed, webCostUsd, searchMs, unjudged: "These pages were found but could not be checked against your wishes: the decision model is not set up on this server." };
          return;
        }
        let judged: SiftJudged;
        try {
          judged = await siftJudge(spec, found, { meter: ctx.meter, signal: abortSignal });
        } catch (err) {
          if (abortSignal?.aborted) throw err;
          yield { ...base, items: listed, checked: pages.length, sources: listed, webCostUsd, searchMs, unjudged: `These pages were found but could not be checked against your wishes. ${errorMessage(err)}` };
          return;
        }
        yield { ...base, items: judged.items, checked: pages.length, skipped: judged.skipped, judgements: judged.judgements, judgedMs: judged.judgedMs, searchMs, sources: judged.items, webCostUsd, watchSpec };
      } catch (err) {
        yield { ...base, items: [], checked: 0, sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => {
      if (output.stage) return { type: "text", value: "Sifting." };
      if (output.error) return { type: "text", value: `The sift found nothing to show: ${output.error}` };
      if (output.unjudged) {
        const lines = output.items.slice(0, 10).map((item, i) => `${i + 1}. ${item.title ?? item.domain} (${item.url})`);
        return { type: "text", value: `${output.unjudged} They are shown to the user as a plain list. Read the most promising ones with readPages if the wishes matter.\n\n${lines.join("\n")}` };
      }
      const all = output.wishes.length;
      const fits = output.items.filter((item) => metCount(item) === all);
      const near = output.items.filter((item) => metCount(item) === all - 1);
      const lines = output.items.slice(0, 10).map((item, i) => {
        const cells = output.wishes.map((wish, w) => `${wish.label}: ${verdictWords(item.verdicts?.[w] ?? { answer: "unknown", confidence: 0 })}`);
        return `${i + 1}. ${item.title ?? item.domain} (${item.url})\n   ${cells.join("; ")}`;
      });
      return {
        type: "text",
        value:
          `Checked ${output.checked} pages against ${all} ${all === 1 ? "wish" : "wishes"}${output.judgedMs ? ` in ${(output.judgedMs / 1000).toFixed(1)} seconds` : ""}. ` +
          `${fits.length} meet every wish${all > 1 ? `; ${near.length} miss exactly one` : ""}. ` +
          "The grid is now on the user's screen, best fit first, with every page linked: do not list it again. " +
          "Say in two or three sentences how many pages were checked and how many fit, which one you would pick and why, and what the near misses lack. " +
          '"Not stated" means the page does not say, not that the answer is no: say so rather than guess, and read that page with readPages if it decides the matter. ' +
          "A verdict marked probably is not certain; do not present it as a fact. " +
          'The grid has a "Watch this" button: if the user wants to hear when new ones appear or one changes, tell them to press it, or make the watch with createWatch.\n\n' +
          `Best fits:\n${lines.join("\n")}`,
      };
    },
  });
}

/** "a recipe" to "recipe": the thing without its article. */
function bare(what: string): string {
  return what.trim().replace(/^(an?|the|one)\s+/i, "");
}
