import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { liveNews, livePages, liveSearch, type LiveResult } from "@/lib/sources/client";
import { PROVIDER_NAME } from "@/lib/sources/http";
import { oxySearch } from "@/lib/sources/oxylabs";
import { domainOf, toSource, type ReadPagesData, type SearchResultItem, type WebSearchData } from "@/lib/widgets/types";
import { clip, errorMessage, type ToolContext } from "./context";

export function toSearchItem(r: LiveResult): SearchResultItem {
  const highlights = (r.highlights ?? []).map((h) => clip(h, 900));
  return {
    ...toSource({ url: r.url, title: r.title, publishedDate: r.publishedDate, snippet: clip(highlights[0] ?? r.description, 280) || undefined }),
    image: r.image ?? undefined,
    highlights,
  };
}

const COUNTRY = /^[A-Za-z]{2}$/;

export function webSearchTool(ctx: ToolContext) {
  // How many results a search brings back grows with the depth the user asked for (mode and effort).
  const { searchResults, maxSearchResults } = ctx.depth;
  return tool({
    description:
      "Search the live web and get the most relevant pages with quoted passages. Use it for anything that may have changed, anything local or specific, and to find sources for claims. " +
      "Write the query as you would type it into a search engine, naming the subject, the kind of source and the time period. Run several searches in parallel when the question has several parts. " +
      "Set `country` only when the answer depends on where you look from (prices, availability, local rules, what ranks in another country): the search is then run as someone in that country would see it.",
    inputSchema: z.object({
      query: z.string().describe("What to search for."),
      numResults: z.number().int().min(1).max(maxSearchResults).optional().describe(`How many results. Default ${searchResults}, at most ${maxSearchResults}.`),
      includeDomains: z.array(z.string()).max(20).optional().describe("Only search these sites, for example official ones."),
      recency: z.enum(["day", "week", "month", "year"]).optional().describe("Only pages from within this window."),
      country: z.string().regex(COUNTRY).optional().describe('Two-letter country code, for example "DE". See the search as someone there would.'),
    }),
    execute: async (input, { abortSignal }): Promise<WebSearchData> => {
      try {
        const abroad = input.country && input.country.toUpperCase() !== (ctx.country ?? "").toUpperCase();
        if (abroad) {
          // Seen from another country: Oxylabs runs the search there. It returns up to 20 results with short outlines.
          const res = await oxySearch({ query: input.query, maxResults: Math.min(20, input.numResults ?? searchResults), location: input.country }, { meter: ctx.meter, signal: abortSignal });
          const results = res.results.map((r) => toSearchItem({ url: r.url, title: r.title, highlights: r.outline, via: "oxylabs" }));
          return { kind: "search", query: `${input.query} (seen from ${input.country!.toUpperCase()})`, results, sources: results };
        }
        const res = await liveSearch(
          {
            query: input.query,
            numResults: input.numResults ?? searchResults,
            includeDomains: input.includeDomains,
            recency: input.recency,
            country: ctx.country,
          },
          { meter: ctx.meter, signal: abortSignal },
        );
        const results = res.results.map(toSearchItem);
        return { kind: "search", query: input.query, results, sources: results, webCostUsd: res.costUsd };
      } catch (err) {
        return { kind: "search", query: input.query, results: [], sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => {
      if (output.error) return { type: "text", value: `Search failed: ${output.error}` };
      if (output.results.length === 0) return { type: "text", value: "No results. Try a broader or differently worded query." };
      const lines = output.results.map((r, i) => {
        const date = r.publishedDate ? `, ${r.publishedDate.slice(0, 10)}` : "";
        // A long list keeps the first ten as they always were and gives the rest one shorter quote each.
        const quotes = r.highlights.slice(0, i < 10 ? 2 : 1).map((h) => `> ${clip(h, i < 10 ? 700 : 400)}`).join("\n");
        return `[${i + 1}] ${r.title ?? r.domain}\n${r.url} (${r.domain}${date})\n${quotes}`;
      });
      return { type: "text", value: lines.join("\n\n") };
    },
  });
}

export function searchNewsTool(ctx: ToolContext) {
  return tool({
    description:
      "Search the news: recent stories about a subject, a company or a person, with their dates and publishers. Use it when the user asks what is new, what happened, or for the latest on something.",
    inputSchema: z.object({
      query: z.string().describe("The subject, in plain words."),
      limit: z.number().int().min(1).max(20).optional().describe("How many stories. Default 8."),
    }),
    execute: async ({ query, limit }, { abortSignal }): Promise<WebSearchData> => {
      try {
        const res = await liveNews({ query, limit: limit ?? 8 }, { meter: ctx.meter, signal: abortSignal });
        // Newest first: the news is asked for by what is new.
        const results = res.results.map(toSearchItem).sort((a, b) => (b.publishedDate ?? "").localeCompare(a.publishedDate ?? ""));
        return { kind: "search", query: `News: ${query}`, results, sources: results, webCostUsd: res.costUsd };
      } catch (err) {
        return { kind: "search", query: `News: ${query}`, results: [], sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => {
      if (output.error) return { type: "text", value: `News search failed: ${output.error}` };
      if (output.results.length === 0) return { type: "text", value: "No stories found." };
      const lines = output.results.map((r, i) => `[${i + 1}] ${r.title ?? r.domain}\n${r.url} (${r.domain}${r.publishedDate ? `, ${r.publishedDate.slice(0, 10)}` : ""})\n> ${clip(r.highlights[0], 500)}`);
      return { type: "text", value: lines.join("\n\n") };
    },
  });
}

export function readPagesTool(ctx: ToolContext) {
  const most = ctx.depth.readPages;
  return tool({
    description:
      `Read the full text of up to ${most} web pages you already have URLs for. Use it when the quoted passages from a search are not enough: exact rules, prices, tables, deadlines, the steps of a process. ` +
      "A page that cannot be read is reported as unread: say so, do not fill it in from memory.",
    inputSchema: z.object({
      urls: z.array(z.string().url()).min(1).max(most),
      fresh: z.boolean().optional().describe("Set true to fetch the page live instead of using a recent copy. Use only when a stale page would be wrong (prices, availability)."),
    }),
    execute: async ({ urls, fresh }, { abortSignal }): Promise<ReadPagesData> => {
      try {
        const res = await livePages(urls, { maxCharacters: 7000, fresh, country: ctx.country }, { meter: ctx.meter, signal: abortSignal });
        const pages = res.pages.map((r) => {
          const text = r.text ?? "";
          return {
            ...toSource({ url: r.url, title: r.title, publishedDate: r.publishedDate }),
            characters: text.length,
            excerpt: clip(text.replace(/^#.*\n/, ""), 240),
            text,
          };
        });
        const unread = res.unread.map((u) => `${domainOf(u.url)} (${u.reason})`);
        return {
          kind: "pages",
          pages,
          sources: pages.map(({ url, title, domain, favicon, publishedDate }) => ({ url, title, domain, favicon, publishedDate })),
          webCostUsd: res.costUsd,
          error: pages.length === 0 ? `Could not read ${unread.join(", ") || "those pages"}.` : undefined,
          unread: unread.length && pages.length ? unread : undefined,
          readBy: res.pages.some((p) => p.via === "oxylabs") ? res.pages.map((p) => PROVIDER_NAME[p.via]) : undefined,
        };
      } catch (err) {
        return { kind: "pages", pages: [], sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => {
      if (output.pages.length === 0) return { type: "text", value: output.error ?? "Could not read the pages." };
      const unread = output.unread?.length ? `\n\n---\n\nNot read: ${output.unread.join("; ")}. Tell the user these could not be read.` : "";
      return {
        type: "text",
        value: output.pages.map((p) => `# ${p.title ?? p.domain}\n${p.url}\n\n${p.text}`).join("\n\n---\n\n") + unread,
      };
    },
  });
}
