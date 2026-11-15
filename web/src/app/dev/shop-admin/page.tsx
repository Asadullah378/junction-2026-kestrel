import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { APP_NAME } from "@/lib/brand";
import { ShopControls } from "@/components/jobs/shop-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: `Demo shop · ${APP_NAME}` };

/** Where the admin changes the pretend shop's price and stock (/dev/shop), to show a watch reacting. In development any signed-in account may. */
export default async function ShopAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dev/shop-admin");
  if (process.env.NODE_ENV === "production" && user.role !== "admin") notFound();
  return (
    <main className="mx-auto w-full max-w-[34rem] px-5 py-10">
      <h1 className="font-display text-[1.7rem] leading-tight">Demo shop</h1>
      <p className="mt-1.5 text-[0.9rem] text-muted-foreground">
        The public page at <a className="underline underline-offset-2" href="/dev/shop" target="_blank" rel="noreferrer">/dev/shop</a> shows this price and stock. Change them here and a watch on that page sees it.
      </p>
      <ShopControls />
    </main>
  );
}
