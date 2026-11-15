"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * The app's own cards, running on the landing page. Each one is the real widget a chat shows,
 * given sample data (the fixtures the widget gallery uses), so a visitor can pan the map or tick
 * a wish before they have an account.
 *
 * Two things keep that honest and light:
 * - A card's code is fetched only when it comes near the screen, and its place is held at a
 *   fixed height meanwhile, so nothing loads up front and nothing jumps.
 * - The page is public and signed out: nothing here may call our API. A request a card makes to
 *   it never leaves the browser (see `keepToThePage`). The page says the data is sample data.
 */

export type DemoName = "places" | "weather" | "sift" | "research";

type Demo = React.ComponentType;

const LOADERS: Record<DemoName, () => Promise<Demo>> = {
  places: async () => {
    const [{ PlacesMap }, { placesFixture }] = await Promise.all([import("@/components/widgets/places-map"), import("@/lib/widgets/fixtures/places-map")]);
    return function PlacesDemo() {
      return <PlacesMap data={placesFixture} />;
    };
  },
  weather: async () => {
    const [{ Weather }, { weatherFixture }] = await Promise.all([import("@/components/widgets/weather"), import("@/lib/widgets/fixtures/weather")]);
    return function WeatherDemo() {
      return <Weather data={weatherFixture} />;
    };
  },
  sift: async () => {
    const [{ Sift }, { siftFixture }] = await Promise.all([import("@/components/widgets/sift"), import("@/lib/widgets/fixtures/sift")]);
    // The sample was timed on another search service: the page states no speeds, so the card shows none.
    const data = { ...siftFixture, judgedMs: undefined };
    return function SiftDemo() {
      return <Sift data={data} />;
    };
  },
  research: async () => {
    const [{ Research }, { researchFixture }] = await Promise.all([import("@/components/widgets/research"), import("@/lib/widgets/fixtures/research")]);
    return function ResearchDemo() {
      return <Research data={researchFixture} />;
    };
  },
};

/** Cards whose controls would act for an account: shown, not usable. None at the moment. */
const INERT = new Set<DemoName>();

const loaded = new Map<DemoName, Demo>();

/* ───────── Nothing here calls the server ───────── */

let kept = false;

/** Requests to our own API never leave this page: a card that asks for something gets an empty answer. */
function keepToThePage() {
  if (kept || typeof window === "undefined") return;
  kept = true;
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    let url: URL | null = null;
    try {
      url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    } catch {
      url = null;
    }
    // Only while the landing page is what is on screen: a visitor who goes on to sign in from
    // here stays in the same page session, and from then on every request must go out as usual.
    if (!url || url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || !document.querySelector(".landing")) return real(input, init);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
}

/* ───────── One card ───────── */

/** A real card with sample data. It loads when it comes near the screen; until then its place is kept. */
export function Live({ name, className }: { name: DemoName; className?: string }) {
  const holder = React.useRef<HTMLDivElement>(null);
  const [Card, setCard] = React.useState<Demo | null>(() => loaded.get(name) ?? null);

  React.useEffect(() => {
    if (Card) return;
    const el = holder.current;
    if (!el) return;
    let cancelled = false;
    const load = () => {
      keepToThePage();
      void LOADERS[name]().then((demo) => {
        loaded.set(name, demo);
        if (!cancelled) setCard(() => demo);
      });
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        load();
      },
      { rootMargin: "600px 0px" },
    );
    watcher.observe(el);
    return () => {
      cancelled = true;
      watcher.disconnect();
    };
  }, [name, Card]);

  return (
    <div ref={holder} className={cn("text-left", className)} inert={INERT.has(name) ? true : undefined}>
      {Card ? <Card /> : <Waiting />}
    </div>
  );
}

/** The shape of a card that has not arrived yet. */
function Waiting() {
  return (
    <div aria-hidden className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3 sm:px-5">
        <span className="size-7 shrink-0 rounded-lg bg-muted" />
        <span className="flex-1 space-y-1.5">
          <span className="block h-3.5 w-2/5 rounded-full bg-muted" />
          <span className="block h-3 w-1/4 rounded-full bg-muted/70" />
        </span>
      </div>
      <div className="space-y-2.5 px-4 pb-5 sm:px-5">
        <span className="block h-36 rounded-xl bg-muted/60" />
        <span className="block h-3 w-4/5 rounded-full bg-muted/70" />
        <span className="block h-3 w-3/5 rounded-full bg-muted/70" />
      </div>
    </div>
  );
}
