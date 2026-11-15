import { requireAdmin, requireUser } from "@/lib/auth/server";
import { setShop, shopState } from "@/lib/watches/sandbox";

export const dynamic = "force-dynamic";

/*
 * The pretend shop's price and stock (the public page /dev/shop), so a watch has something that
 * changes on demand. Only the admin may change it on the live site; in development any signed-in
 * account may, so the tests need no admin.
 */

const allowed = () => (process.env.NODE_ENV === "production" ? requireAdmin() : requireUser());

export async function GET() {
  const user = await allowed();
  if (user instanceof Response) return user;
  return Response.json(shopState(), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await allowed();
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => null)) as { price?: unknown; inStock?: unknown; reset?: unknown } | null;
  if (!body) return Response.json({ error: "Nothing to change." }, { status: 400 });
  const price = typeof body.price === "number" ? body.price : typeof body.price === "string" && body.price.trim() ? Number(body.price.replace(",", ".")) : undefined;
  if (price !== undefined && !(Number.isFinite(price) && price > 0 && price < 100_000)) return Response.json({ error: "The price must be a number above zero." }, { status: 400 });
  return Response.json(setShop({ price, inStock: typeof body.inStock === "boolean" ? body.inStock : undefined, reset: body.reset === true }));
}
