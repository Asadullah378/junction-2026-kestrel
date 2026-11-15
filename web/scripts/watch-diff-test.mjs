// Table test of what a watch counts as a change (src/lib/watches/diff.ts). No server needed. Run: pnpm test:diff
import { asNumber, diffSnapshots, sameValue } from "../src/lib/watches/diff.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  ${detail}`}`);
};
const snap = (items, extra = {}) => ({ takenAt: "2026-11-15T03:00:00Z", items, ...extra });
const page = (key, more = {}) => ({ key, url: key, title: `Page ${key}`, source: "context", ...more });
const kinds = (changes) => changes.map((c) => `${c.kind}:${c.key}${c.field ? `:${c.field}` : ""}${c.wish ? `:${c.wish}` : ""}`).sort().join(" ");

// Values
check("329 and '329.00' are the same price", sameValue(329, "329.00"));
check("'€ 1 299,50' reads as 1299.5", asNumber("€ 1 299,50") === 1299.5, String(asNumber("€ 1 299,50")));
check("'1,299.50' reads as 1299.5", asNumber("1,299.50") === 1299.5, String(asNumber("1,299.50")));
check("'1,299' reads as 1299", asNumber("1,299") === 1299, String(asNumber("1,299")));
check("'329,50' reads as 329.5", asNumber("329,50") === 329.5, String(asNumber("329,50")));
check("329 and 279 differ", !sameValue(329, 279));
check("true and 'true' are the same", sameValue(true, "true"));
check("'In stock' and 'in  stock' are the same", sameValue("In stock", "in  stock"));
check("null and '' are the same", sameValue(null, ""));
check("'Model 3' and 'Model 5' differ (text, not a number)", !sameValue("Model 3", "Model 5"));

// A first look reports nothing
check("a first look has no changes", diffSnapshots(null, snap([page("a"), page("b")])).length === 0);

// Order does not matter
{
  const a = snap([page("a", { fields: { price: 329 } }), page("b", { fields: { price: 10 } })]);
  const b = snap([page("b", { fields: { price: "10.00" } }), page("a", { fields: { price: "329" } })]);
  check("the same items in another order are no change", diffSnapshots(a, b).length === 0, kinds(diffSnapshots(a, b)));
}

// A field that moved carries from and to
{
  const changes = diffSnapshots(snap([page("a", { pinned: true, fields: { price: 329, inStock: true } })]), snap([page("a", { pinned: true, fields: { price: 279, inStock: true } })]));
  check("a price drop is one field change", changes.length === 1 && changes[0].kind === "field" && changes[0].field === "price", kinds(changes));
  check("it says from 329 to 279", changes[0]?.from === 329 && changes[0]?.to === 279, JSON.stringify(changes[0]));
}
{
  const changes = diffSnapshots(snap([page("a", { fields: { price: 329, inStock: true } })]), snap([page("a", { fields: { price: 329, inStock: false } })]));
  check("going out of stock is one field change", changes.length === 1 && changes[0].field === "inStock" && changes[0].from === true && changes[0].to === false, kinds(changes));
}
{
  const changes = diffSnapshots(snap([page("a", { fields: { price: 329 } })]), snap([page("a", { fields: {} })]));
  check("a field that could not be read this time is not a change", changes.length === 0, kinds(changes));
}

// New and gone
{
  const changes = diffSnapshots(snap([page("a", { fits: true })]), snap([page("a", { fits: true }), page("b", { fits: true }), page("c", { fits: false })]));
  check("a new page that fits is reported, one that does not is not", kinds(changes) === "added:b", kinds(changes));
}
{
  const changes = diffSnapshots(snap([page("a"), page("b")]), snap([page("a")]));
  check("a search result that dropped out is not reported as gone", changes.length === 0, kinds(changes));
}
{
  const changes = diffSnapshots(snap([page("a", { pinned: true }), page("b", { pinned: true })]), snap([page("a", { pinned: true })]));
  check("a pinned page that is gone is reported", kinds(changes) === "removed:b", kinds(changes));
}
{
  const changes = diffSnapshots(snap([page("a", { pinned: true }), page("b", { pinned: true })]), snap([page("a", { pinned: true })], { unread: ["b"] }));
  check("a pinned page that could not be read is not reported as gone", changes.length === 0, kinds(changes));
}

// Verdicts
{
  const was = snap([page("a", { fits: false, verdicts: { w1: "yes", w2: "no" } })]);
  const now = snap([page("a", { fits: true, verdicts: { w1: "yes", w2: "yes" } })]);
  const changes = diffSnapshots(was, now);
  check("a verdict that flipped is reported once, by wish", kinds(changes) === "verdict:a:w2" && changes[0].from === "no" && changes[0].to === "yes", kinds(changes));
}
{
  const changes = diffSnapshots(snap([page("a", { fits: true })]), snap([page("a", { fits: false })]));
  check("a fit that flipped without verdicts is reported", changes.length === 1 && changes[0].kind === "verdict" && changes[0].from === true && changes[0].to === false, kinds(changes));
}
{
  const changes = diffSnapshots(snap([page("a", { verdicts: { w1: "unknown" } })]), snap([page("a", { verdicts: { w1: "unknown" } })]));
  check("nothing changed, nothing reported", changes.length === 0, kinds(changes));
}

console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);
