import type { LanguageModelUsage } from "ai";
import type { DecisionMeter } from "@/lib/decisions/client";
import type { WebMeter } from "@/lib/exa/client";
import { costOf } from "./models";
import { EMPTY_USAGE, type RunStats, type TokenUsage } from "./stats";

/** Convert the AI SDK's usage object to our flat shape. */
export function toTokenUsage(usage: LanguageModelUsage | undefined): TokenUsage {
  if (!usage) return { ...EMPTY_USAGE };
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  };
}

/**
 * Tracks what one user request costs: Exa calls, the decision model, plus the tokens spent by
 * helper model calls and sub-agents that run inside tools. The main agent's own usage comes from the
 * AI SDK when the stream finishes and is added in the route.
 */
export class RunMeter implements WebMeter, DecisionMeter {
  readonly startedAt = Date.now();
  webCostUsd = 0;
  webCalls = { search: 0, read: 0, extract: 0, watch: 0 };
  workerUsage: TokenUsage = { ...EMPTY_USAGE };
  workerCostUsd = 0;
  decisionCostUsd = 0;
  decisionCalls = 0;
  contextTrimmed = false;

  addWeb(costUsd: number, kind: "search" | "read" | "extract" | "watch") {
    this.webCostUsd += costUsd;
    this.webCalls[kind] += 1;
  }

  /** Record a helper or sub-agent model call. */
  addWorker(modelId: string, usage: LanguageModelUsage | undefined) {
    const flat = toTokenUsage(usage);
    this.workerUsage = addUsage(this.workerUsage, flat);
    this.workerCostUsd += costOf(modelId, flat);
  }

  /** Record a request to the decision model. It writes nothing, so only its input costs anything. */
  addJudge(_inputTokens: number, costUsd: number) {
    this.decisionCostUsd += costUsd;
    this.decisionCalls += 1;
  }

  snapshot(): Pick<RunStats, "webCostUsd" | "webCalls" | "workerUsage" | "workerCostUsd" | "decisionCostUsd" | "decisionCalls" | "contextTrimmed"> {
    return {
      webCostUsd: round(this.webCostUsd),
      webCalls: { ...this.webCalls },
      workerUsage: { ...this.workerUsage },
      workerCostUsd: round(this.workerCostUsd),
      decisionCostUsd: this.decisionCalls ? round(this.decisionCostUsd) : undefined,
      decisionCalls: this.decisionCalls || undefined,
      contextTrimmed: this.contextTrimmed || undefined,
    };
  }
}

export function round(n: number, digits = 5): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
