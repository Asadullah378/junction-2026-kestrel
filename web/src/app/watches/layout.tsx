import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { JobsShell } from "@/components/jobs/jobs-shell";
import { SessionProvider } from "@/lib/auth/client";
import { currentUser } from "@/lib/auth/server";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: `Watches · ${APP_NAME}` };
export const dynamic = "force-dynamic";

/**
 * The Watches page: what the account has asked Kestrel to keep an eye on, and to do on a
 * schedule. For anyone signed in. Signed out, it leads to the sign-in page and back.
 */
export default async function WatchesLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const asked = await headers();
  // Back to the very watch or run that was asked for, once signed in.
  if (!user) redirect(`/login?next=${encodeURIComponent(asked.get("x-kestrel-path") ?? "/watches")}`);
  const inApp = /KestrelDesktop\//.test(asked.get("user-agent") ?? "");
  return (
    <SessionProvider user={user}>
      <JobsShell inApp={inApp}>{children}</JobsShell>
    </SessionProvider>
  );
}
