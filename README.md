# Kestrel

**Watches the web for you.** Tell it once what you care about. Kestrel searches the live web, reads the pages, checks each one against what you asked for, and shows the result with its sources. Then it keeps watching, and tells you only when something changed: the before, the after and the page it happened on.

Built at Junction 2026 (13 to 15 November, Espoo) by Zero Anomaly for Context.dev's challenge, "The Web Is Your Real-Time Database", with Oxylabs as tech partner.

- Live at [kestrel.zeroanomaly.tech](https://kestrel.zeroanomaly.tech). Accounts are by invitation for now.
- A web app: a browser tab or a phone.

**Context.dev finds, reads and watches. Oxylabs localises and prices. Gemini judges.**

## Who it is for

Anyone who re-checks the same pages by hand: a shopper waiting for a price, a job seeker waiting for the right ad, a small team keeping an eye on a supplier's price list or a competitor's page. Software can read a page once. The hard part is noticing that it changed, and saying exactly what changed.

## What it does

- **Watches.** A standing request. It looks again on a schedule, or when Context.dev reports that a page or a search changed, compares what it finds with what it found last time, and tells you only when something is different. Each change comes with the old value, the new value and the source. A look that finds nothing new says nothing.
- **Sift.** For "find me the ones that…" questions. One search returns about 40 pages with their text, and one request checks every page against every wish. You get a grid of yes, no, or "the page does not say". One press turns the grid into a watch.
- **Prices by country.** One product, priced as someone in each of seven countries would see it, with the shop and a link. One press turns it into a price watch.
- **Places, news, weather, research.** Places on a map with opening hours and ratings, news stories with their dates, a forecast, and reports written by a team of sub-agents that search in parallel. Every card shows its sources.
- **Voice.** A live call that listens, searches and answers out loud while the cards arrive on screen.
- **Background work, notices and cost.** A chat keeps working when you close the tab. You are told when it is done or when a watch found something, by email only when you are away. Every answer shows what it used and what it cost.

## How a watch works

1. **Gather.** The watch's searches run again and the pages come back with their text. Prices are read country by country. Pages you pinned have their watched fields (a price, whether it is in stock) read off them.
2. **Judge.** Every page is checked against every wish, in one request.
3. **Compare.** The new snapshot is compared with the last one by plain code (`web/src/lib/watches/diff.ts`): what is new, what is gone, which value moved from what to what, which verdict flipped.
4. **Tell.** Only if something changed. A small model words the change; the facts in it come from the comparison, not from the model.

A watch starts a look in three ways: by the clock, when you press "Check now", and when a Context.dev monitor calls Kestrel's webhook because a pinned page or a search changed.

Three rules keep it honest. The first look is a baseline and reports nothing as changed. A page that could not be read this time is listed as unread, never reported as gone. Search results come and go by themselves, so only a pinned page is ever reported as gone.

## How it uses Context.dev

Everything goes through `web/src/lib/sources/contextdev.ts`.

| Endpoint | What Kestrel does with it |
|---|---|
| `POST /web/search` with `markdownOptions` and `highlightsOptions` | Finds pages and returns each page's text and the passages that bear on the search, in the same call. This is what lets a Sift, and every look of a watch, be one request per wording instead of a search and forty page reads. |
| `POST /web/scrape` (Markdown) | Reads a page in full when the passages are not enough. It is also the second read in a Sift: when a search comes back before most of its pages have loaded, the missing ones are read one by one. |
| `POST /web/scrape` with the prebuilt `google-maps` parser | Places with coordinates, opening hours, phone and rating as fields. |
| `POST /news/search` | News stories with their dates and publishers. |
| `POST /monitors`, `POST /monitors/{id}/run`, `DELETE /monitors/{id}` | A `page` monitor for each pinned page and a `search` monitor for each search of a watch. When one detects a change it calls `POST /api/hooks/context`, signed; Kestrel verifies the signature on the raw body, drops repeats, and starts a look. "Check now" also asks the monitors to look at once. |

## How it uses Oxylabs

Everything goes through `web/src/lib/sources/oxylabs.ts`. Which Web API endpoints, and why:

| Endpoint | Why |
|---|---|
| `POST /v1/scrape/google/shopping/search` with `location` | The dedicated Shopping scraper, one call per country at once. It returns offers with prices already parsed, as a shopper in that country sees them. This is what "the same product, priced in seven countries" is made of, and what a price watch runs again later. |
| `POST /v1/scrape` with `output: ["json"]` and `json.schema` (AI Parsing) | Reads the watched fields off a pinned page, for example the price and whether it is in stock, as values that match a schema. A watch compares those values between looks. |
| `POST /v1/scrape` with `output: ["markdown"]` and `run_js` | The second reader. A page Context.dev cannot read (blocked, or empty without JavaScript) is tried once in a browser. A page neither can read is reported as unread. |
| `POST /v1/search` with `location` | A search as someone in another country would see it, when the answer depends on where you look from. |

The cheapest offer per country is picked by plain code, not by a model (`web/src/lib/agent/tools/shopping.ts`). Real shop listings are full of cases, spare parts, used goods and the odd wild price, so an offer counts only if its title names the product, it is not second-hand, and its price lies in the band where most of the money is.

## What Gemini and Claude do

- Gemini's decision model checks every page against every wish in one request and answers with probabilities, not prose, so it cannot invent a fact: only say whether the page states one.
- Gemini 4 Hydrogen and Gemini 4 Carbon run the agent in two of the four modes, and Gemini 3.8 Live runs voice. Claude Sonnet 5.5 and Opus 5.5 run the other two modes.

## Measured

On 15 November 2026, on the running app:

- **Sift, around 03:00:** 40 pages read and 200 checks in 3.4 to 5.7 seconds, depending on the question.
  - 5.7 s is the middle of three different questions, each asked for the first time (5.8, 5.7 and 5.7 s). Finding and reading the pages took 4.5 to 4.7 s, the checks 1.0 to 1.2 s.
  - 3.4 s is the question in the film (quick chickpea dinners), the middle of three runs more than five minutes apart, so none came from Kestrel's own cache. Reading took 2.5 s, the checks 0.8 s.
- **Sift, around 04:10, when pages loaded slowly:** about 9 seconds. A search gives its pages five seconds to load, and that hour it came back with the text of 0 to 7 of 40. When more than a quarter are missing, Kestrel reads the missing pages one by one for up to four more seconds. Four first-time questions then took 9.2 to 9.5 s and read 35, 35, 36 and 17 pages. Without that second read the same hour gave 8 pages.
- **Prices:** one product in seven countries in 3.3 to 4.7 seconds.
  - 3.3 s is the middle of three products (2.5, 3.3 and 3.9 s).
  - 4.7 s is the product in the film, a pair of Sony headphones.
- **Cost:** a 40-page Sift used 46 to 66 Context.dev credits, about 9 to 13 cents at the published overage rate, plus half a cent for the checks. Oxylabs publishes no price per call, so its calls are counted and not priced.

## What it will not do

- It does not act on websites. It never enters payment details, passwords or one-time codes.
- It does not guess. "The page does not say" is an answer, a page that could not be read is said to be unread, and a country with no matching offer is listed as such.
- It does not promise an instant alert. A watch looks as often as every ten minutes, at once when you press "Check now", and when a monitor calls.

## Run it

You need Node 24, pnpm and a Postgres database.

```bash
cp .env.example .env.local   # the keys, DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD
cd web
pnpm install
pnpm dev                     # http://localhost:3000
```

Sign in with the admin email and password from `.env.local`. Tests: `pnpm typecheck`, `pnpm lint`, `pnpm test:diff` (the comparison), `pnpm test:offers` (which shop offer is the product, and the cheapest), and `pnpm test:watch` against a running server (a watch from end to end, with a signed webhook).

## Where things are

| Path | What is in it |
|---|---|
| `web/src/lib/sources/` | The two web-data clients and what the tools call |
| `web/src/lib/agent/tools/` | The agent's tools: `sift.ts`, `shopping.ts`, `search.ts`, `places.ts`, `research.ts`, `jobs.ts` |
| `web/src/lib/watches/` | Watches: gather, compare, tell; monitors; the demo shop page |
| `web/src/app/api/hooks/context/` | The webhook Context.dev's monitors call |
| `web/src/lib/decisions/` | The client for Gemini's decision model |
| `DEPLOYMENT.md` | How the live site is set up on Google Cloud |
| `CLAUDE.md` | The rules the coding agents follow in this repository |

## Where it came from

Kestrel was built during the event. It starts from the code of Beryl, the team's own entry to another challenge at the same hackathon, written between Friday 13 and Sunday 15 November 2026: the chat, the cards, Sift, voice, accounts and scheduled jobs come from there. New for Kestrel are the two web-data clients, watches with their comparison and webhook, prices by country, the places and news tools on Context.dev, and the look. All of it was written with AI coding agents.

By Zero Anomaly.
