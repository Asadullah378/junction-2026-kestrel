import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { ctxScrape } from "@/lib/sources/contextdev";
import { toSource, type Place, type PlacesData, type WeatherData, type WeatherDay } from "@/lib/widgets/types";
import { errorMessage, type ToolContext } from "./context";
import { liveStatus } from "./opening-hours";

/*
 * Places come from Google Maps, read through Context.dev's prebuilt Maps parser: one call returns
 * up to twenty places with coordinates, opening hours, phone and rating as fields, with no prompt
 * and no guessing. The weather comes straight from Open-Meteo, which needs no key.
 */

type MapsPlace = {
  place_id?: string;
  name?: string;
  rating?: number | null;
  number_of_reviews?: number | null;
  website?: string | null;
  google_maps_url?: string | null;
  google_category?: string[] | null;
  google_description?: string | null;
  google_hours?: Array<{ day?: string; times?: string[] }> | null;
  google_image?: string | null;
  google_phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  street_addr?: string | null;
  city?: string | null;
  postal_code?: string | null;
  borough?: string | null;
};

/** Google wraps a place's own site in a redirect: "/url?q=https://example.com/&opi=…". */
function ownSite(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  const wrapped = /[?&]q=([^&]+)/.exec(href)?.[1];
  const url = wrapped ? decodeURIComponent(wrapped) : href;
  return /^https?:\/\//.test(url) ? url : undefined;
}

function placeFromMaps(p: MapsPlace): Place | null {
  if (!p.name || typeof p.latitude !== "number" || typeof p.longitude !== "number") return null;
  const hours = (p.google_hours ?? []).filter((h) => h.day && h.times?.length).map((h) => ({ day: h.day!, hours: h.times!.join(", ") }));
  const address = [p.street_addr, [p.postal_code, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    id: p.place_id ?? `${p.latitude},${p.longitude}`,
    name: p.name,
    category: p.google_category?.[0] ?? undefined,
    description: p.google_description ?? undefined,
    address: address || undefined,
    area: p.borough ?? p.city ?? undefined,
    lat: p.latitude,
    lng: p.longitude,
    rating: p.rating ?? undefined,
    reviewCount: p.number_of_reviews ?? undefined,
    hours: hours.length ? hours : undefined,
    phone: p.google_phone ?? undefined,
    website: ownSite(p.website),
    image: p.google_image ?? undefined,
    url: p.google_maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`,
  };
}

const NEAR_ME = /^(near|around|close to)?\s*(me|here|my (current )?location|current location|nearby)\.?$/i;

/** Straight-line distance in metres between two points. */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

export function findPlacesTool(ctx: ToolContext) {
  return tool({
    description:
      "Find real places (restaurants, cafes, bars, shops, hotels, attractions, services, parks) and show them on an interactive map with ratings, opening hours, phone and directions. " +
      "Use it for anything location-based. Describe the place like you would ask a local, and say where: a named area, or \"near me\" when the user's exact location is known.",
    inputSchema: z.object({
      query: z.string().describe('What kind of place and its qualities, for example "cosy vegan-friendly restaurant for an anniversary dinner".'),
      near: z
        .string()
        .describe('Neighbourhood, city and country, for example "Kamppi, Helsinki, Finland". Use exactly "near me" to search around the user\'s exact location, only when the context says it has been shared.'),
    }),
    execute: async ({ query, near }, { abortSignal }): Promise<PlacesData> => {
      // "near me" searches around the coordinates the user shared; without them it falls back to a named area.
      const aroundUser = NEAR_ME.test(near.trim()) && !!ctx.coords;
      const origin = ctx.coords ? { lat: ctx.coords.lat, lng: ctx.coords.lng, label: ctx.coords.label } : undefined;
      const area = aroundUser ? (ctx.coords?.label ? `Near you, ${ctx.coords.label}` : "Near you") : near;
      const base = { kind: "places" as const, query, area };
      try {
        // "Near me" centres the map on the user's own position; otherwise the area is part of the search.
        const url = aroundUser
          ? `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${ctx.coords!.lat},${ctx.coords!.lng},14z`
          : `https://www.google.com/maps/search/${encodeURIComponent(`${query} in ${near}`)}`;
        // A position changes as the user moves: do not reuse a cached "near me" answer.
        const page = await ctxScrape({ url, parser: "google-maps", fresh: aroundUser }, { meter: ctx.meter, signal: abortSignal });
        const seen = new Set<string>();
        const ordered: Place[] = [];
        for (const raw of (page.parsed ?? []) as MapsPlace[]) {
          const place = placeFromMaps(raw);
          if (place && !seen.has(place.id)) {
            seen.add(place.id);
            ordered.push(place);
          }
        }
        if (ordered.length === 0 && page.failed) throw new Error("The map could not be read just now. Try again in a moment.");

        let places = ordered;
        if (origin) {
          places = places.map((p) => ({ ...p, distanceM: distanceM(origin, p) }));
          // Around the user, nearest first; drop anything implausibly far for a "near me" search.
          if (aroundUser) places = places.filter((p) => p.distanceM! < 40_000).sort((a, b) => a.distanceM! - b.distanceM!);
        }
        // Work out whether each place is open at this moment, in its own time zone, from its opening hours.
        places = places.slice(0, 8).map((p) => ({ ...p, status: liveStatus(p) }));
        // Show the user's own position on the map only when the results are around it.
        const showOrigin = origin && places.some((p) => (p.distanceM ?? Infinity) < 30_000);
        return {
          ...base,
          places,
          origin: showOrigin ? origin : undefined,
          sources: places.map((p) => toSource({ url: p.url, title: `${p.name} (Google Maps)` })),
          webCostUsd: page.costUsd,
          error: places.length === 0 ? `No places found for "${query}" ${aroundUser ? "near you" : `near ${near}`}. Try a broader description or a larger area.` : undefined,
        };
      } catch (err) {
        return { ...base, places: [], sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => {
      if (output.error) return { type: "text", value: output.error };
      const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
      const lines = output.places.map((p, i) => {
        const bits = [
          p.distanceM !== undefined ? (p.distanceM < 1000 ? `${p.distanceM} m away` : `${(p.distanceM / 1000).toFixed(1)} km away`) : undefined,
          p.category,
          p.rating ? `${p.rating}/5 (${p.reviewCount ?? "?"} reviews)` : undefined,
          p.status,
          p.address,
          p.hours?.find((h) => h.day === today) ? `${today}: ${p.hours.find((h) => h.day === today)!.hours}` : undefined,
          p.phone,
          p.website,
        ].filter(Boolean);
        return `${i + 1}. ${p.name}: ${bits.join("; ")}${p.description ? `. ${p.description}` : ""}`;
      });
      return {
        type: "text",
        value:
          `These ${output.places.length} places are now shown to the user on a map with hours, phone, website and directions buttons. ` +
          `Do not repeat the list. Say which one or two you would pick and why, in two or three sentences.\n\n${lines.join("\n")}`,
      };
    },
  });
}

/** WMO weather codes, as Open-Meteo reports them, in a few words. */
const CONDITIONS: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Heavy showers", 85: "Slight snow showers", 86: "Snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
};
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

async function openMeteo<T>(url: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new Error(`The weather service answered ${res.status}.`);
  return (await res.json()) as T;
}

export function getWeatherTool(ctx: ToolContext) {
  return tool({
    description: "Get the weather forecast for a place (up to 14 days ahead) and show it as a forecast widget. Use it when weather affects a plan.",
    inputSchema: z.object({
      location: z.string().describe('City and country, for example "Espoo, Finland".'),
      days: z.number().int().min(1).max(14).optional().describe("How many days ahead. Default 7."),
    }),
    execute: async ({ location, days: ahead }, { abortSignal }): Promise<WeatherData> => {
      const base = { kind: "weather" as const, location };
      try {
        // The geocoder wants the place name alone; the country narrows a name that exists twice.
        const [city, ...rest] = location.split(",").map((part) => part.trim()).filter(Boolean);
        const found = await openMeteo<{ results?: Array<{ name: string; country?: string; admin1?: string; latitude: number; longitude: number }> }>(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city ?? location)}&count=5&language=en`,
          abortSignal,
        );
        const wanted = rest.join(" ").toLowerCase();
        const spot = found.results?.find((r) => wanted && [r.country, r.admin1].some((part) => part && wanted.includes(part.toLowerCase()))) ?? found.results?.[0];
        if (!spot) return { ...base, days: [], sources: [], error: `No forecast found for ${location}.` };
        const forecast = await openMeteo<{
          daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; precipitation_sum: (number | null)[]; wind_speed_10m_max: (number | null)[]; wind_direction_10m_dominant: (number | null)[] };
        }>(
          `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&timezone=auto&forecast_days=${ahead ?? 7}` +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant",
          abortSignal,
        );
        const d = forecast.daily;
        const days: WeatherDay[] = (d?.time ?? []).map((date, i) => ({
          date,
          condition: CONDITIONS[d!.weather_code[i]] ?? "Mixed",
          highC: Math.round(d!.temperature_2m_max[i]),
          lowC: Math.round(d!.temperature_2m_min[i]),
          rainChance: d!.precipitation_probability_max[i] ?? undefined,
          precipMm: d!.precipitation_sum[i] ?? undefined,
          windKph: d!.wind_speed_10m_max[i] != null ? Math.round(d!.wind_speed_10m_max[i]!) : undefined,
          windDirection: d!.wind_direction_10m_dominant[i] != null ? COMPASS[Math.round(d!.wind_direction_10m_dominant[i]! / 22.5) % 16] : undefined,
        }));
        const name = [spot.name, spot.admin1 && spot.admin1 !== spot.name ? spot.admin1 : null, spot.country].filter(Boolean).join(", ");
        return {
          ...base,
          location: name,
          days,
          sources: [toSource({ url: `https://open-meteo.com/en/docs?latitude=${spot.latitude}&longitude=${spot.longitude}`, title: `${name} forecast (Open-Meteo)` })],
          error: days.length === 0 ? `No forecast found for ${location}.` : undefined,
        };
      } catch (err) {
        return { ...base, days: [], sources: [], error: errorMessage(err) };
      }
    },
    toModelOutput: ({ output }) => ({
      type: "text",
      value: output.error
        ? output.error
        : `The forecast for ${output.location} is now shown to the user. Do not repeat it day by day; mention only what matters for their plan.\n` +
          output.days.map((d) => `${d.date}: ${d.condition}, ${d.lowC} to ${d.highC} C, rain ${d.rainChance ?? "?"}%, wind ${d.windKph ?? "?"} km/h`).join("\n"),
    }),
  });
}
