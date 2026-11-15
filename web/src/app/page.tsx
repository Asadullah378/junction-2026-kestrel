import type { Metadata } from "next";
import { Butler } from "@/components/butler/butler";
import { Landing } from "@/components/landing/landing";
import { LANDING_METADATA } from "@/components/landing/metadata";
import { SessionProvider } from "@/lib/auth/client";
import { currentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = LANDING_METADATA;

/**
 * The front door. A signed-in account gets the app, which every part of the interface can then
 * read the account from. Anyone else gets the website's landing page.
 */
export default async function Home() {
  const user = await currentUser();
  if (user) {
    return (
      <SessionProvider user={user}>
        <Butler />
      </SessionProvider>
    );
  }
  return <Landing demoVideo={process.env.KESTREL_DEMO_VIDEO ?? ""} />;
}
