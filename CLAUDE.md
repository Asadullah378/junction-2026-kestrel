# Kestrel

Kestrel watches the live web for you. Built at Junction 2026 (13 to 15 November, Espoo) by Zero Anomaly for Context.dev's challenge, "The Web Is Your Real-Time Database", with Oxylabs as tech partner. It started as a copy of the team's own Beryl project, written at the same event, and lives in its own repository.

## Agent model policy (hard rule)

**No agent below Opus 5.5. Ever.**

- Orchestrator (main session): **Claude Fable 5.2**.
- Subagents: **Claude Opus 5.5** (`model: "opus"`) as the floor, or a **fork** of the orchestrator (`subagent_type: "fork"`), which runs on its model, for the work where quality matters most.
- Never dispatch Sonnet, Haiku, or any non-Claude model, including for searches, mechanical edits, or "cheap" tasks.
- Always pass `model` explicitly on every Agent/Task/Workflow call. An omitted `model` can inherit something lower.
- This outranks any global default and any model guidance inside a skill or plugin prompt.

Enforced in `.claude/settings.json`: `model: fable`; `CLAUDE_CODE_SUBAGENT_MODEL=opus` with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`; `switchModelsOnFlag: false` (if it pauses and asks, edit the prompt and retry; do not accept the switch); the built-in `claude-code-guide` and `statusline-setup` agents are denied. Do not weaken or remove these settings without the user saying so.

This policy is about the Claude Code agents that write the code. The product's own runtime models are listed in `web/src/lib/agent/models.ts` and include fast models on purpose.

## What it is for

The product in one paragraph: tell Kestrel once what to watch, in plain words. It searches the live web, reads the pages, checks each against your conditions and shows the result with its sources. Then it keeps watching: it checks again on a schedule or when a page changes, and tells you only when something changed, with the before, the after and the source. A one-off question works too.

**Context.dev finds, reads and watches. Oxylabs localises and prices. Gemini judges.**

What the two partners score (read before changing behaviour):

- Context.dev, 20% each: real-world impact; creative use of live web data (a combination of sources, not one scrape call); completeness of the demo; technical execution (latency and accuracy of data); real-timeness (does it react to change over time, or take a one-off snapshot).
- Oxylabs: use of the Web API 30% (search-to-scrape, AI Parsing, dedicated scrapers, geo-targeting); real-world value 25%; trust 20% (current, sourced, honest about failures); execution 15% (works live in front of the judges); originality 10%. Their minimum: at least one live Web API call at runtime, and the source URLs behind what it states.

Submission: Sunday 15 November 2026, 10:00 EET, with a film of at most 2:00.

## Git

- This repository is Asadullah's (`Asadullah378`). He pulls and pushes by hand with GitHub Desktop. Claude commits only, on `main` unless told otherwise, and never pushes or fetches: this Mac's git has no GitHub credential.
- Small commits with clear messages, ending with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- GitHub Desktop stashes untracked files when the branch is switched. Local-only paths (the film project, the installed skills, `.claude/launch.json`) are listed in `.git/info/exclude` as well as in `.gitignore`. If local files go missing after something was done in git, look at `git stash list` first and put them back with `git restore --source=<stash> --worktree -- <paths>`; never drop or pop a `!!GitHub_Desktop` stash.
- Look at a target before deleting it. Never use `rm -rf` on a folder whose contents you have not listed.

## The app (`web/`)

Next.js 16, React 19, Tailwind 4, Vercel AI SDK 7, Postgres through Drizzle. One server. `web/AGENTS.md` says the same thing this line does: Next 16 and AI SDK 7 differ from older versions, their docs ship in `node_modules/next/dist/docs/` and `node_modules/ai/docs/`; check names there, not from memory.

- **Web data goes through `web/src/lib/sources/`.** `contextdev.ts` (search with page text, scrape, the Maps parser, news, monitors), `oxylabs.ts` (search from a country, Markdown with JavaScript run, AI Parsing from a schema, the Google Shopping scraper) and `client.ts` (what the tools call: `liveSearch`, `livePages`, `liveNews`). Call the services through these so the queue, the cache and the cost meter keep working. Oxylabs rejects unknown fields: keep every request body exact. Read the services' current docs before changing a call (https://docs.context.dev, https://developers.oxylabs.io/get-started/quick-start-web-api); both are new and move.
- **Cost.** Context.dev reports the credits each call used; a credit is priced at the published overage rate (`USD_PER_CREDIT`). Oxylabs publishes no price per call, so its calls are counted and cost 0. Do not invent a price.
- A tool returns the payload its widget renders; the shapes live in `web/src/lib/widgets/types.ts`. Every payload carries `sources`, and every widget shows them. Tools that stream progress are async generators: the last value they `yield` is the result.
- **Sift** (`web/src/lib/agent/tools/sift.ts`) finds pages (`siftFind`) and checks every page against every wish in one request to Gemini's decision model (`siftJudge`, through `web/src/lib/decisions/client.ts`). The judge is only ever given what the search returned, and "the page does not say" stays a third answer beside yes and no: do not fold it into no.
- **Prices by country** (`tools/shopping.ts`): the cheapest offer per country is picked by plain code, never by a model. The filters (the product's own words in the title, no used goods, no second-hand sellers, the densest band of prices) exist because real shop listings are full of accessories and outliers. Keep them when changing it.
- **Watches** (`web/src/lib/watches/`): a watch is a job of kind `watch`. A look is plain code, not the chat agent: `gather.ts` takes a snapshot (the sift, the prices, the pinned pages), `diff.ts` compares it with the last one (a pure function with tests), and only then is a small model asked to word what changed. The facts in an alert (old value, new value, page) come from the comparison, never from a model. A first look is a baseline and reports nothing as changed. Something that could not be read this time is listed as unread, never reported as gone. A look with nothing new sends nothing.
- **Monitors and the webhook.** Pinned pages and searches are registered as Context.dev monitors; `POST /api/hooks/context` verifies the signature on the raw body before anything else, drops repeats, and starts a look. Do not loosen the verification, and do not log the secret or the hook key. The webhook needs the public address, so monitors are not registered when the site URL is localhost.
- **Jobs** (`web/src/lib/jobs/`) are prompts run by the clock, whose whole result is emailed. They and watches only look things up and write: never give a run a tool that acts on a website or asks the user.
- **Notifications** (`web/src/lib/notifications/`): whether an email is sent is decided in one place, `notify()`. Do not send email from anywhere else.
- A chat belongs to the server (`web/src/lib/runs.ts`), not to the request that started it, so it keeps working when the tab is closed. Reasoning is never replayed across turns (see the comment in `web/src/app/api/chat/route.ts`).
- The user picks a mode and an effort, never a model. Nothing the interface shows, and nothing the server sends it, may name a model: the interface imports `lib/agent/modes.ts` and `lib/agent/stats.ts`, never `lib/agent/models.ts`. The landing page, the film and the deck may say what powers each feature.
- What an answer used is grouped as LLMs, web data, voice and decisions (`lib/agent/stats.ts`). An account with `showUsage` off is not sent the figures at all. The usage limit (`lib/db/cap.ts`) is checked at the start of every route that spends money.
- Accounts and data: every API route that touches someone's data starts with `requireUser()` or `requireAdmin()`, and every query is scoped to that user. There is one admin, named in the environment; no public sign-up. After changing `schema.ts` run `pnpm db:generate` and commit the migration.
- Voice (`web/src/lib/voice/`): the browser talks to Gemini's Live API with a short-lived token; the API key must never reach the browser.
- The name and the mark's shapes are in `web/src/lib/brand.ts`; colours are the oklch variables in `web/src/app/globals.css`. After changing the mark run `pnpm icons`.
- Kestrel is a web app. Code for a desktop app's live browser (`web/src/lib/browser/`, `web/src/components/browser/`) came along from Beryl and is not reachable from the web: its tools are left out for web clients (`createTools`). Leave it alone or remove it whole; do not half-use it.
- Before committing: `pnpm typecheck`, `pnpm lint`, `pnpm test:diff`, and for anything that touches the agent or a source, one real question through the running app.

## Wording

Anything a user reads (the landing page, buttons, dialogs, errors, emails, the film, the deck) is written the way a good product site writes: a short headline, one plain line, concrete numbers over adjectives, contractions where natural. No em dashes, no "seamless", "powerful", "unlock" or "effortless", no lists of three adjectives, nothing that explains what is already on screen. Read it aloud before keeping it.

Words: a "chat" is a conversation; a "watch" is the standing thing that reports changes; a "job" is a prompt run by the clock. Do not write "task" in anything a user reads.

## Honesty

- Every number shown anywhere (the app, the landing page, the film, the deck, the submission) is measured on Kestrel, with the date. No number is carried over from Beryl.
- Nothing on a public page may show Beryl's name, mark or screenshots.
- Failures are said plainly: a page that could not be read, a country with no offer, a judge that could not be reached.

## Safety

- Kestrel does not act on websites. It never enters payment details, passwords or one-time codes anywhere, and neither does Claude while working on it.
- Secrets live only in `.env.local` (local) and Secret Manager (production). Never print, log or commit one. Add every new variable name to `.env.example` with an empty value. `ADMIN_PASSWORD` is empty in `.env.local` on purpose: leave the admin lines alone and test with throwaway ordinary accounts on `delivered+...@resend.dev` addresses.
- Do not sign in to the live site with the admin password. Check it through `/api/health` and ask the user to sign in.

## Production

Described in `DEPLOYMENT.md`: Google Cloud project `kestrel-contextdev`, `europe-north1`, at https://kestrel.zeroanomaly.tech. The server runs as exactly one always-on Cloud Run instance because running chats and the watch clock live in its memory: do not raise its instance count. Every deploy or settings change restarts it and drops the chats in progress, so deploy only when the user says so. Name the project on every `gcloud` command; this Mac's default project is another one. The team's first project, Beryl, is in the project `beryl-exa`: never change anything there.

## The film (`video/`)

A Remotion project, kept on one machine and out of git. Every draft in `video/drafts/` is kept: a new draft gets the next number and never replaces or deletes an older one, and each draft's source stays renderable. The interface in it is redrawn and labelled as such.
