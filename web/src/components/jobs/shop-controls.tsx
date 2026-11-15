"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { api, errorOf } from "@/lib/auth/fetch";
import { Card, buttonClass } from "./parts";

/* The controls of the pretend shop (/dev/shop): its price and whether it is in stock. A change here is a real change on a public page, which a watch on that page then sees. */

type Shop = { name: string; price: number; currency: string; inStock: boolean };

export function ShopControls() {
  const [shop, setShop] = React.useState<Shop | null>(null);
  const [price, setPrice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const take = React.useCallback(async (response: Response) => {
    if (!response.ok) {
      setProblem(await errorOf(response));
      return;
    }
    const next = (await response.json()) as Shop;
    setShop(next);
    setPrice(String(next.price));
    setProblem(null);
  }, []);

  React.useEffect(() => {
    void api("/api/admin/sandbox", { cache: "no-store" })
      .then(take)
      .catch(() => setProblem("The server could not be reached."));
  }, [take]);

  const send = async (change: { price?: number; inStock?: boolean; reset?: boolean }) => {
    setBusy(true);
    try {
      await take(await api("/api/admin/sandbox", { method: "POST", json: change }));
    } catch {
      setProblem("The server could not be reached.");
    }
    setBusy(false);
  };

  return (
    <Card className="mt-6">
      {shop ? (
        <>
          <p className="text-[0.78rem] font-semibold tracking-wider text-subtle uppercase">On the page now</p>
          <p className="mt-1.5 text-[1.05rem] font-medium">{shop.name}</p>
          <p className="nums mt-0.5 text-[0.95rem] text-muted-foreground">
            €{shop.price.toFixed(2)} · {shop.inStock ? "In stock" : "Out of stock"}
          </p>

          <form
            className="mt-5 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = Number(price.replace(",", "."));
              if (!Number.isFinite(next) || next <= 0) {
                setProblem("The price must be a number above zero.");
                return;
              }
              void send({ price: next });
            }}
          >
            <label className="flex flex-col gap-1 text-[0.8rem] text-muted-foreground">
              New price, in euros
              <input
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="nums h-9 w-36 rounded-xl border border-input bg-background px-3 text-[0.92rem] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </label>
            <button type="submit" disabled={busy} className={buttonClass.primary}>
              {busy ? <LoaderCircle className="animate-spin" /> : null}
              Set price
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {[279, 299, 329].map((p) => (
              <button key={p} type="button" disabled={busy} onClick={() => void send({ price: p })} className={buttonClass.plain}>
                €{p}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => void send({ inStock: !shop.inStock })} className={buttonClass.plain}>
              {shop.inStock ? "Mark out of stock" : "Mark in stock"}
            </button>
            <button type="button" disabled={busy} onClick={() => void send({ reset: true })} className={buttonClass.quiet}>
              Reset
            </button>
          </div>
        </>
      ) : problem ? null : (
        <p className="text-[0.86rem] text-muted-foreground">Loading.</p>
      )}
      {problem ? (
        <p role="alert" className="mt-3 text-[0.84rem] text-destructive">
          {problem}
        </p>
      ) : null}
    </Card>
  );
}
