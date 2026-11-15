import "server-only";
import type { Snapshot, WatchSpec } from "./types";

/*
 * The pretend shop at /dev/shop: one product page whose price and stock the admin can change,
 * so a watch has something that changes on demand. It is a public page with nothing of anyone's
 * in it. Its state lives in the server's memory and goes back to the defaults on a restart.
 */

export type ShopState = { name: string; sku: string; price: number; currency: "EUR"; inStock: boolean };

const DEFAULTS: ShopState = { name: "Aurora ANC wireless headphones", sku: "AUR-ANC-200", price: 329, currency: "EUR", inStock: true };

const holder = globalThis as typeof globalThis & { __kestrelShop?: ShopState };

export const SHOP_PATH = "/dev/shop";

export const shopState = (): ShopState => (holder.__kestrelShop ??= { ...DEFAULTS });

/** Change the price or the stock, or put everything back. What comes back is the state now. */
export function setShop(change: { price?: number; inStock?: boolean; reset?: boolean }): ShopState {
  if (change.reset) holder.__kestrelShop = { ...DEFAULTS };
  const state = shopState();
  if (typeof change.price === "number" && Number.isFinite(change.price) && change.price > 0 && change.price < 100_000) state.price = Math.round(change.price * 100) / 100;
  if (typeof change.inStock === "boolean") state.inStock = change.inStock;
  return state;
}

export const sayPrice = (state: ShopState): string => `€${state.price.toFixed(2)}`;

/** True for the pretend shop's page on this very computer: a page no outside service can reach. */
export function isLocalShop(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === SHOP_PATH && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * A stand-in for the real gathering, in development only and only for a watch whose every page is
 * the pretend shop on localhost: Context.dev and Oxylabs cannot fetch a page on this computer, so
 * the shop's state is read directly. It lets the whole path (look, compare, tell) be tested
 * without the network. On the live site the real gathering reads the public page like any other.
 */
export async function sandboxGather(spec: WatchSpec): Promise<Snapshot> {
  const state = shopState();
  const wanted = spec.fields?.length ? spec.fields.map((f) => f.key) : ["price", "inStock"];
  const all: Record<string, string | number | boolean | null> = { price: state.price, inStock: state.inStock, currency: state.currency, name: state.name };
  const fields = Object.fromEntries(wanted.map((key) => [key, all[key] ?? null]));
  return {
    takenAt: new Date().toISOString(),
    items: (spec.urls ?? []).map((url) => ({ key: url, url, title: state.name, source: "context" as const, pinned: true, fields })),
  };
}

/** Whether the stand-in applies to this watch here and now. */
export const usesSandbox = (spec: WatchSpec): boolean => process.env.NODE_ENV !== "production" && Boolean(spec.urls?.length) && spec.urls!.every(isLocalShop) && spec.queries.length === 0 && !spec.product;
