import { requireUser } from "@/lib/auth/server";
import { capFor, capRefusal } from "@/lib/db/cap";
import { makeWatch } from "@/lib/watches/make";

export const dynamic = "force-dynamic";

/**
 * Make a watch: something Kestrel keeps looking at and tells the account about only when it
 * changes. Sent by the "Watch this" button on a card, with what that card was looking for. The
 * first look starts at once.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const cap = await capFor(user);
  if (cap.reached) return capRefusal();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Nothing to watch." }, { status: 400 });
  const made = await makeWatch(user, {
    title: typeof body.title === "string" ? body.title : "",
    description: typeof body.description === "string" ? body.description : undefined,
    spec: body.spec,
    everyMinutes: typeof body.everyMinutes === "number" ? body.everyMinutes : undefined,
    timeZone: typeof body.timeZone === "string" ? body.timeZone : undefined,
    mode: body.mode,
    country: typeof body.country === "string" ? body.country : undefined,
    conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
  });
  if (!made.ok) return Response.json({ error: made.problem }, { status: 400 });
  return Response.json({ job: made.job });
}
