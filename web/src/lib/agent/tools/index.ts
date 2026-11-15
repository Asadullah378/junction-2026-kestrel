import "server-only";

import type { InferUITools, LanguageModel, UIMessage } from "ai";
import type { RunStats } from "../stats";
import { browserActTool, browserCloseTool, browserLookTool, browserOpenTool, browserReadTool, requestUserActionTool } from "./browser";
import { askUserTool, requestLocationTool, showActionsTool, showComparisonTool, showKeyFactsTool, showWidgetTool, updatePlanTool } from "./compose";
import type { ToolContext } from "./context";
import { createJobTool, createWatchTool, deleteJobTool, listJobsTool, updateJobTool } from "./jobs";
import { getPredictionMarketTool } from "./markets";
import { findPlacesTool, getWeatherTool } from "./places";
import { deepResearchTool } from "./research";
import { readPagesTool, searchNewsTool, webSearchTool } from "./search";
import { comparePricesTool } from "./shopping";
import { siftTool } from "./sift";

/**
 * The agent's tools for one request. Each tool's output is the payload its widget renders.
 *
 * The live browser belongs to the desktop app. Asked from the web (a browser tab, the installed
 * web app, a phone) the agent can search, read and show, and its browser tools are left out: it
 * cannot act on websites there, and says so. The type is the same either way, because both kinds
 * of client show conversations that used the browser.
 */
export function createTools(ctx: ToolContext, mainModel: LanguageModel) {
  const all = allTools(ctx, mainModel);
  const given: Partial<typeof all> = { ...all };
  if (ctx.client !== "desktop") for (const name of DESKTOP_ONLY) delete given[name];
  // Jobs belong to an account: where the request names none, the agent cannot manage them.
  if (!ctx.userId) for (const name of JOB_TOOLS) delete given[name];
  return given as typeof all;
}

/** The tools that act in the live browser. Only the desktop app has one. */
export const DESKTOP_ONLY = ["browserOpen", "browserAct", "browserRead", "browserLook", "browserClose", "requestUserAction"] as const;

/** The tools that make and manage the user's scheduled jobs. */
export const JOB_TOOLS = ["createJob", "createWatch", "listJobs", "updateJob", "deleteJob"] as const;

function allTools(ctx: ToolContext, mainModel: LanguageModel) {
  return {
    webSearch: webSearchTool(ctx),
    readPages: readPagesTool(ctx),
    findPlaces: findPlacesTool(ctx),
    searchNews: searchNewsTool(ctx),
    comparePrices: comparePricesTool(ctx),
    sift: siftTool(ctx),
    getPredictionMarket: getPredictionMarketTool(ctx),
    getWeather: getWeatherTool(ctx),
    deepResearch: deepResearchTool(ctx, mainModel),
    showComparison: showComparisonTool(),
    showKeyFacts: showKeyFactsTool(),
    showWidget: showWidgetTool(),
    showActions: showActionsTool(),
    updatePlan: updatePlanTool(),
    askUser: askUserTool(),
    requestLocation: requestLocationTool(),
    browserOpen: browserOpenTool(),
    browserAct: browserActTool(),
    browserRead: browserReadTool(),
    browserLook: browserLookTool(),
    browserClose: browserCloseTool(),
    requestUserAction: requestUserActionTool(),
    createJob: createJobTool(ctx),
    createWatch: createWatchTool(ctx),
    listJobs: listJobsTool(ctx),
    updateJob: updateJobTool(ctx),
    deleteJob: deleteJobTool(ctx),
  };
}

export type ButlerTools = ReturnType<typeof createTools>;

/** The chat message type shared by the route and the browser: typed tool parts plus run stats as metadata. */
export type ButlerMessage = UIMessage<RunStats, never, InferUITools<ButlerTools>>;
