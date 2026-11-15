# Submission text

Paste-ready text for the Junction form and for YouTube. Fill in the two links where it says `[film link]` and `[tour link]` once the films are on YouTube.

## Punchline

```
Tell it once. Kestrel keeps watching the web and tells you only what changed.
```

## Description

```markdown
## What it is

Kestrel watches the web for you. Tell it once what you care about, in plain words. It searches the live web, reads the pages, checks each one against what you asked for, and shows the result with its sources. Then it keeps watching, and tells you only when something changed: the before, the after and the page it happened on.

- Live: https://kestrel.zeroanomaly.tech
- Film, 2 minutes: [film link]
- Full tour, 7 minutes: [tour link]
- Code: https://github.com/Asadullah378/junction-2026-kestrel

**Context.dev finds, reads and watches. Oxylabs localises and prices. Gemini judges.**

## Who it is for

Anyone who re-checks the same pages by hand: a shopper waiting for a price, a job seeker waiting for the right ad, a small team keeping an eye on a supplier's price list or a competitor's page.

## What it does

- **Watches.** A standing request. It looks again by the clock, when you press "Check now", or when a Context.dev monitor reports a change. It compares what it finds with what it found last time and tells you, in the app and by email, only when something is different.
- **Sift.** For "find me the ones that…" questions. One search returns about 40 pages with their text, and one request checks every page against every wish. You get a grid of yes, no, or "the page does not say". One press turns the grid into a watch.
- **Prices by country.** One product, priced as a shopper in each of seven countries sees it, with the shop and a link. One press makes it a price watch.
- **Places, news, weather, research, voice.** A map with hours and ratings, news with dates, a forecast, research reports and a live call.

## How it reacts to change

1. **Gather.** The watch's searches run again, prices are read country by country, and pinned pages have their watched fields (a price, in stock or not) read off them.
2. **Judge.** Every page against every wish, in one request.
3. **Compare.** Plain code works out what is new, what is gone, and which value moved from what to what.
4. **Tell.** Only if something changed. A small model words it; the facts come from the comparison.

The first look is a baseline. A page that could not be read is listed as unread, never reported as gone.

## How it uses Context.dev

- `POST /web/search` with page text and highlights: the pages and what they say in one call. So a Sift, and every look of a watch, is one request per wording, not a search plus forty page reads.
- `POST /web/scrape`: full page reads, the pages a slow search missed, and the Google Maps parser for places with hours and ratings.
- `POST /news/search`: stories with dates and publishers.
- `POST /monitors`: a page monitor per pinned page and a search monitor per search. A change calls Kestrel's signed webhook; the signature is verified on the raw body first, and a look starts.

## How it uses Oxylabs (Web API endpoints, and why)

- `POST /v1/scrape/google/shopping/search` with `location`: the dedicated Shopping scraper, one call per country at once, with prices already parsed. It is what "one product, seven countries" and a price watch are made of.
- `POST /v1/scrape` with `output: ["json"]` and a schema (AI Parsing): the watched fields of a pinned page as typed values that a watch compares between looks.
- `POST /v1/scrape` with Markdown and `run_js`: the second reader, for pages Context.dev cannot read. A page neither can read is said to be unread.
- `POST /v1/search` with `location`: a search as someone in another country sees it.

The cheapest offer per country is picked by plain code, not a model: the product's name in one piece, no used goods, no second-hand sellers, a plausible price.

## Measured on the running app, 15 November 2026

- A Sift: 40 pages read and 200 checks in 3.4 s (the question in the film) to 5.7 s (the middle of three first-time questions).
- When pages loaded slowly an hour later, it read the ones the search missed one by one: about 9 s for 17 to 36 pages.
- In the full tour, a Sift of three searches: 100 pages read in 8.7 s, 500 checks in 2.3 s.
- Prices: one product in seven countries in 3.3 s (the middle of three products) to 4.7 s (the product in the film).

## Trust

- "The page does not say" is an answer. It is never folded into no.
- Every card and every change links to its source.
- It does not promise an instant alert: a monitor looks every ten minutes at the most.

## How it is built

Next.js 16, React 19, Vercel AI SDK 7 and Postgres on Google Cloud Run. Gemini's decision model judges, Gemini 3.8 Live runs voice, and Gemini 4 and Claude 5.5 models run the agent's four modes. Built at the event on the code of Beryl, our entry to another challenge here: the chat, the cards, Sift and voice come from it. New for Kestrel: both web-data clients, watches with their comparison and webhook, and prices by country.

Built by Zero Anomaly at Junction 2026.
```

## YouTube: the film (2 minutes)

File: `video/drafts/kestrel-draft-2.mp4`

Title:

```
Kestrel: it watches the web for you (Junction 2026, Context.dev + Oxylabs)
```

Description:

```
Tell Kestrel once what you care about. It searches the live web, reads the pages, checks each against what you asked for, and then keeps watching. It tells you only when something changed: the before, the after and the source.

Context.dev finds, reads and watches. Oxylabs localises and prices. Gemini judges.

Live: https://kestrel.zeroanomaly.tech
Full tour, 7 minutes: [tour link]
Code: https://github.com/Asadullah378/junction-2026-kestrel

Built by Zero Anomaly at Junction 2026 for Context.dev's challenge "The Web Is Your Real-Time Database", with Oxylabs as tech partner.

The interface in this film is redrawn. Every number in it was measured on the running app on 15 November 2026.
```

## YouTube: the full tour (7 minutes)

File: `video/drafts/kestrel-tour-1.mp4`

Title:

```
Kestrel: the full tour (Junction 2026, Context.dev + Oxylabs)
```

Description:

```
Every feature of Kestrel, one after another, in real recordings of the web app.

Kestrel watches the web for you. Tell it once what you care about. It searches the live web, reads the pages, checks each against what you asked for, and keeps watching. It tells you only when something changed: the before, the after and the source.

0:00 What is in this film
0:12 Sift: every page checked against every wish
1:12 Prices by country
1:52 Watches: a price change, caught
3:12 Places, news and weather
4:33 Research
5:26 Modes and what an answer cost
6:11 Chats that keep working

How it was recorded: on 15 November 2026, in the web app running on one computer, with real runs at their own speed. Where a clip has a long wait, that stretch runs faster and says so on screen. In the Watches clip the demo shop is on the same computer, so its page is read directly and live monitors are off. On the live site Oxylabs reads the page and Context.dev's monitors call in.

Context.dev finds, reads and watches. Oxylabs localises and prices. Gemini judges.

Live: https://kestrel.zeroanomaly.tech
The 2-minute film: [film link]
Code: https://github.com/Asadullah378/junction-2026-kestrel

Built by Zero Anomaly at Junction 2026 for Context.dev's challenge "The Web Is Your Real-Time Database", with Oxylabs as tech partner.
```
