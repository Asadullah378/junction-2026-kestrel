// End-to-end test of watches, against the running server. Run: pnpm test:watch [port]
//
// With a throwaway account and the pretend shop on this computer (/dev/shop), it checks that:
// - a watch on a page can be made, and its first look is a baseline that reports nothing as changed;
// - looking again when nothing changed sends nothing;
// - a webhook with a wrong or stale signature is refused, and a correctly signed one starts a look;
// - that look sees the price change and tells the user, with the old and the new price;
// - the same delivery sent twice is handled once, and a monitor's "run completed" is ignored;
// - a paused watch does not look when a monitor calls.
//
// In development a watch whose only page is the pretend shop on localhost reads the shop's state
// directly (src/lib/watches/sandbox.ts): no outside service can fetch a page on this computer.
// So this test spends no web credits. Live monitors are not armed locally either, so the test
// writes a monitor and its secret onto the watch itself and signs its own calls with it.
//
// The account is made straight in the database (an ordinary account, never an admin) with an
// address at Resend's test inbox, which reaches no one, and is deleted at the end with everything
// it made. It needs DATABASE_URL from .env.local. It takes under a minute.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const port = process.argv.slice(2).find((a) => /^\d{2,5}$/.test(a)) ?? "3000";
const base = `http://localhost:${port}`;
const EMAIL = "delivered+kestrel-watch-test@resend.dev";
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

let failures = 0;
const ok = (label, pass, note = "") => {
  if (!pass) failures += 1;
  console.log(`${pass ? "ok  " : "FAIL"} ${label}${note !== "" ? `  (${String(note).slice(0, 260)})` : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The app's own password format (src/lib/auth/password.ts). */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password.normalize("NFKC"), salt, 64, { N: 32768, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return ["scrypt", 32768, 8, 1, salt.toString("base64url"), key.toString("base64url")].join("$");
}

const password = crypto.randomBytes(18).toString("base64url");
await sql`delete from users where email = ${EMAIL} and role = 'user'`;
const [{ id: userId }] = await sql`
  insert into users (email, name, password_hash, role, status, modes, show_usage)
  values (${EMAIL}, 'Watch Test', ${hashPassword(password)}, 'user', 'active', ${["ultrafast"]}, true) returning id`;

const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password }) });
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const call = async (pathname, init = {}) => {
  const res = await fetch(base + pathname, { ...init, headers: { cookie, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};
const cleanUp = async () => {
  await call("/api/admin/sandbox", { method: "POST", body: JSON.stringify({ reset: true }) }).catch(() => {});
  await sql`delete from users where id = ${userId}`;
  await sql.end({ timeout: 5 });
};
const stop = async (code) => {
  await cleanUp();
  console.log(failures || code ? `\n${failures || 1} failed` : "\nAll passed");
  process.exit(failures || code ? 1 : 0);
};

ok("a throwaway account signs in", login.ok && Boolean(cookie), login.status);
if (!login.ok) await stop(1);

/** Wait until the watch's newest run is finished, and answer with the job and that run. */
async function settled(jobId, after = 0, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const { body } = await call(`/api/jobs/${jobId}`);
    const run = body?.runs?.[0];
    if (run && run.status !== "running" && body.runs.length > after) return { job: body.job, runs: body.runs, run };
    if (Date.now() > until) return { job: body?.job, runs: body?.runs ?? [], run };
    await wait(700);
  }
}
const notices = async (kind) => {
  const { body } = await call("/api/notifications");
  return (body?.items ?? []).filter((item) => item.kind === kind);
};

// ── The pretend shop, at its starting price
const reset = await call("/api/admin/sandbox", { method: "POST", body: JSON.stringify({ reset: true }) });
ok("the pretend shop starts at 329", reset.status === 200 && reset.body?.price === 329, JSON.stringify(reset.body));
const page = await fetch(`${base}/dev/shop`);
const html = await page.text();
ok("its page is public and states the price", page.status === 200 && html.includes('data-price="329.00"') && html.includes("€329.00"), page.status);

// ── Making a watch
const shopUrl = `${base}/dev/shop`;
const spec = { what: "the product page of these headphones", wishes: [], queries: [], urls: [shopUrl], fields: [{ key: "price", label: "Price", type: "number" }, { key: "inStock", label: "In stock", type: "boolean" }], monitors: [{ id: "smuggled", kind: "page", target: "x", secret: "x" }], hookKey: "smuggled" };
const made = await call("/api/watches", { method: "POST", body: JSON.stringify({ title: "Headphones price (test)", spec, everyMinutes: 10, timeZone: "Europe/Helsinki" }) });
const jobId = made.body?.job?.id;
ok("a watch is made", made.status === 200 && made.body?.job?.kind === "watch", JSON.stringify(made.body).slice(0, 200));
if (!jobId) await stop(1);
ok("it looks every 10 minutes", /10 minutes/i.test(made.body.job.scheduleText), made.body.job.scheduleText);
ok("monitors and keys sent from outside are not taken", (made.body.job.watch?.monitors ?? []).length === 0 && !("hookKey" in (made.body.job.watch ?? {})), JSON.stringify(made.body.job.watch));
ok("no live monitor is armed on this computer, and it says why", /this computer/i.test(made.body.job.watch?.monitorNote ?? ""), made.body.job.watch?.monitorNote);
const [stored] = await sql`select watch from jobs where id = ${jobId}`;
ok("the stored watch has its own key, not the smuggled one", typeof stored.watch.hookKey === "string" && stored.watch.hookKey !== "smuggled" && stored.watch.hookKey.length >= 20);

const noRefusal = await call("/api/watches", { method: "POST", body: JSON.stringify({ title: "Nothing", spec: { what: "x", wishes: [], queries: [] } }) });
ok("a watch with nothing to look at is refused", noRefusal.status === 400, noRefusal.status);

// ── The first look is a baseline
const first = await settled(jobId);
ok("the first look finishes", first.run?.status === "done", first.run?.error ?? first.run?.status);
ok("it is a baseline with no changes", first.run?.watch?.baseline === true && first.run?.watch?.changes?.length === 0, JSON.stringify(first.run?.watch));
const firstDetail = await call(`/api/jobs/runs/${first.run.id}`);
const item = firstDetail.body?.snapshot?.items?.[0];
ok("its snapshot holds the price and the stock", item?.fields?.price === 329 && item?.fields?.inStock === true && item?.pinned === true, JSON.stringify(item));
ok("the user is told it is now watching, not that something changed", (await notices("job_done")).some((n) => /now watching/i.test(n.title)) && (await notices("watch_changed")).length === 0);
ok("the list says it was the first look", first.job?.lastRun?.baseline === true, JSON.stringify(first.job?.lastRun));

// ── Looking again when nothing changed says nothing
const again = await call(`/api/jobs/${jobId}/run`, { method: "POST" });
ok("Check now starts a look", again.status === 200 && Boolean(again.body?.runId), again.status);
const second = await settled(jobId, 1);
ok("the second look finds nothing new", second.run?.status === "done" && second.run?.watch?.baseline === false && second.run?.watch?.changes?.length === 0, JSON.stringify(second.run?.watch));
ok("nothing is told and nothing is emailed", (await notices("watch_changed")).length === 0 && second.run?.emailed === false);
ok("the look says so in plain words", /nothing new/i.test(second.run?.summary ?? ""), second.run?.summary);

// ── A monitor, written straight onto the watch (none is armed on this computer)
const SECRET = `whsec_${crypto.randomBytes(24).toString("base64url")}`;
const MONITOR = `mon_test_${crypto.randomBytes(6).toString("hex")}`;
const KEY = stored.watch.hookKey;
await sql`update jobs set watch = jsonb_set(watch, '{monitors}', ${sql.json([{ id: MONITOR, kind: "page", target: shopUrl, secret: SECRET }])}) where id = ${jobId}`;

const hook = async (payload, { secret = SECRET, at = Math.floor(Date.now() / 1000), key = KEY, id = crypto.randomUUID(), sign = true } = {}) => {
  const raw = JSON.stringify(payload);
  const v1 = crypto.createHmac("sha256", secret).update(`${at}.${raw}`).digest("hex");
  const res = await fetch(`${base}/api/hooks/context?k=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-context-id": id, ...(sign ? { "x-context-signature": `t=${at},v1=${v1}` } : {}) },
    body: raw,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const changeEvent = () => ({
  event: "change.detected",
  id: `evt_${crypto.randomBytes(6).toString("hex")}`,
  created_at: new Date().toISOString(),
  data: { change: { id: `chg_${crypto.randomBytes(6).toString("hex")}`, monitor_id: MONITOR, run_id: "run_1", target_type: "page", title: "Aurora ANC wireless headphones", summary: "The price dropped from €329.00 to €279.00.", detected_at: new Date().toISOString(), url: shopUrl, importance: "high", confidence: 0.97, before_text_excerpt: "Price: €329.00", after_text_excerpt: "Price: €279.00" } },
});

// ── The price drops
const dropped = await call("/api/admin/sandbox", { method: "POST", body: JSON.stringify({ price: 279 }) });
ok("the price is changed to 279", dropped.status === 200 && dropped.body?.price === 279, JSON.stringify(dropped.body));

// ── Calls that do not prove themselves are refused
const before = (await call(`/api/jobs/${jobId}`)).body.runs.length;
ok("no signature is refused", (await hook(changeEvent(), { sign: false })).status === 401);
ok("a wrong secret is refused", (await hook(changeEvent(), { secret: "whsec_wrong" })).status === 401);
ok("a stale signature is refused", (await hook(changeEvent(), { at: Math.floor(Date.now() / 1000) - 3600 })).status === 401);
ok("a wrong key in the address is refused", (await hook(changeEvent(), { key: "not-the-key" })).status === 401);
ok("an unknown monitor is refused", (await hook({ ...changeEvent(), data: { change: { monitor_id: "mon_nobody" } } })).status === 401);
const unsignedNoSession = await fetch(`${base}/api/hooks/context`, { method: "POST", body: "{}" });
ok("the route answers without a session (it is not sent to sign in)", unsignedNoSession.status === 400, unsignedNoSession.status);
await wait(800);
ok("none of them started a look", (await call(`/api/jobs/${jobId}`)).body.runs.length === before);

// ── A genuine call starts a look, which sees the change
const delivery = crypto.randomUUID();
const event = changeEvent();
const genuine = await hook(event, { id: delivery });
ok("a correctly signed call is accepted and starts a look", genuine.status === 202 && genuine.body?.started === true, JSON.stringify(genuine.body));
const repeat = await hook(event, { id: delivery });
ok("the same delivery again is acknowledged and dropped", repeat.status === 200 && repeat.body?.repeated === true, JSON.stringify(repeat.body));
const third = await settled(jobId, 2);
const change = third.run?.watch?.changes?.[0];
ok("the look was started by the webhook", third.run?.trigger === "webhook" && third.run?.status === "done", `${third.run?.trigger} ${third.run?.status} ${third.run?.error ?? ""}`);
ok("it found one change: the price, from 329 to 279", third.run?.watch?.changes?.length === 1 && change?.kind === "field" && change?.field === "price" && change?.from === 329 && change?.to === 279, JSON.stringify(third.run?.watch?.changes));
ok("the change names its source", change?.url === shopUrl, change?.url);
ok("what the monitor said is kept with the run", third.run?.watch?.signal?.before === "Price: €329.00" && third.run?.watch?.signal?.after === "Price: €279.00" && /dropped/i.test(third.run?.watch?.signal?.summary ?? ""), JSON.stringify(third.run?.watch?.signal));
const told = await notices("watch_changed");
ok("the user is told once", told.length === 1, told.length);
ok("the notice carries the old and the new price", /329/.test(`${told[0]?.title} ${told[0]?.body}`) && /279/.test(`${told[0]?.title} ${told[0]?.body}`), `${told[0]?.title} | ${told[0]?.body}`);
ok("the notice opens that look", told[0]?.jobId === jobId && told[0]?.runId === third.run?.id);
ok("a sentence says what changed", Boolean(third.run?.summary) && third.run.summary.length > 10, third.run?.summary);
ok("the list says it changed", third.job?.lastRun?.changed === 1 && third.job?.lastRun?.baseline === false, JSON.stringify(third.job?.lastRun));
const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => ({}));
// The email goes out just after the look is marked done: give it a moment, and the look that long to wind up.
let emailed = false;
for (let i = 0; i < 25 && !emailed; i += 1) {
  emailed = (await call(`/api/jobs/runs/${third.run.id}`)).body?.emailed === true;
  if (!emailed) await wait(600);
}
if (health.email) ok("the change is emailed", emailed);
else console.log("skip the change is emailed  (the server has no RESEND_API_KEY)");
await wait(1500);
const [usage] = await sql`select count(*)::int as n from usage_events where user_id = ${userId} and kind = 'job'`;
ok("each look is on the account's usage record", usage.n >= 3, usage.n);

// ── Afterwards: quiet again
ok("a monitor's 'run completed' is acknowledged and ignored", (await hook({ event: "run.completed", id: "evt_done", data: { change: { monitor_id: MONITOR } } })).body?.ignored === "run.completed");
const once = await call(`/api/jobs/${jobId}/run`, { method: "POST" });
ok("Check now starts another look", once.status === 200, `${once.status} ${once.body?.error ?? ""}`);
const fourth = await settled(jobId, 3);
ok("the next look finds nothing new and tells nothing", fourth.run?.watch?.changes?.length === 0 && (await notices("watch_changed")).length === 1, JSON.stringify(fourth.run?.watch?.changes));

// ── Paused: a monitor's call does not make it look
const paused = await call(`/api/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ status: "paused" }) });
ok("the watch is paused", paused.body?.job?.status === "paused", paused.status);
await sql`update jobs set watch = jsonb_set(watch, '{monitors}', ${sql.json([{ id: MONITOR, kind: "page", target: shopUrl, secret: SECRET }])}) where id = ${jobId}`;
const whilePaused = await hook(changeEvent());
ok("a call for a paused watch is acknowledged but starts nothing", whilePaused.status === 202 && whilePaused.body?.started === false, JSON.stringify(whilePaused.body));

// ── Gone with its looks
const removed = await call(`/api/jobs/${jobId}`, { method: "DELETE" });
ok("the watch is deleted", removed.status === 200 && removed.body?.deleted === true, removed.status);
ok("the old address still leads to the page", (await fetch(`${base}/jobs?job=${jobId}`, { headers: { cookie }, redirect: "manual" })).headers.get("location")?.includes(`/watches?job=${jobId}`) === true);

await stop(0);
