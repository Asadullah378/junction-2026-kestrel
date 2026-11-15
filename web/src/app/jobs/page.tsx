import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The page moved to /watches. Older links (emails, notices) still carry /jobs?job=<id>&run=<id>: they are sent on with what they asked for. */
export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["job", "run"]) {
    const value = params[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  const text = query.toString();
  redirect(text ? `/watches?${text}` : "/watches");
}
