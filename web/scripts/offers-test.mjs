// Table test of which shop offer counts as the product and which is the cheapest
// (src/lib/agent/tools/offers.ts). No server needed. Run: pnpm test:offers
//
// Every case is a shape that came out of real Shopping listings on 15 Nov 2026.
import { isNewFromAShop, isProduct, pickOffers, priceBand } from "../src/lib/agent/tools/offers.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  ${detail}`}`);
};
const P = "Sony WH-1000XM6";
let n = 0;
const offer = (price, merchant, title = P, currency = "EUR") => ({ title, price, currency, priceText: `${price}`, merchant, url: `https://shop.example/${(n += 1)}`, rating: null, reviews: null, image: null, position: n });
const best = (rows, country) => rows.find((r) => r.country === country)?.best ?? null;
const says = (o) => (o ? `${o.price} ${o.currency} at ${o.merchant}` : "no offer");

// The product, new, from a shop
check("the name in one piece is the product", isProduct("Kopfhörer Sony WH-1000XM6 Schwarz", P));
check("another model is not", !isProduct("Sony WF-1000XM6", P));
check("glued or spaced, it is the same name", isProduct("SONY WH1000XM6 Silver", P) && isProduct("Sony WH 1000XM6", P));
check("a colour letter after the name is allowed", isProduct("Sony WH-1000XM6B Black", P));
check("a Switch 2019 is not a Switch 2", !isProduct("Nintendo Switch 2019", "Nintendo Switch 2"));
check("a Switch 2 with 256GB is", isProduct("Nintendo Switch 2 256GB Boxed", "Nintendo Switch 2"));
check("AirPods Pro 3rd generation are AirPods Pro 3", isProduct("Apple AirPods Pro 3rd Gen", "Apple AirPods Pro 3"));
check("AirPods Pro 2 are not", !isProduct("Apple AirPods Pro 2", "Apple AirPods Pro 3"));
check("the brand has to be named", !isProduct("WH-1000XM6 headphones", P));
check("words scattered through a title are not", !isProduct("Nintendo Switch Luigi's Mansion 2", "Nintendo Switch 2"));
check("a skin is not the product at its price", !isNewFromAShop({ title: "XtremeSkins Sony WH-1000XM6 Skins & Wraps", merchant: "XtremeSkins" }, P));
check("a used one is not", !isNewFromAShop({ title: "Sony WH-1000XM6 gebraucht, wie neu", merchant: "Shop" }, P));
check("a Polish used one is not", !isNewFromAShop({ title: "Słuchawki Sony WH-1000XM6 używane", merchant: "Sklep" }, P));
check("a pawn shop is not a shop for new goods", !isNewFromAShop({ title: "Słuchawki Sony Wh-1000XM6 Komplet", merchant: "Loombard.pl" }, P));
check("eBay is not", !isNewFromAShop({ title: P, merchant: "eBay - rarewaves" }, P));
check("a resale marketplace is not", !isNewFromAShop({ title: P, merchant: "StockX" }, P));
check("a cash-for-goods shop is not", !isNewFromAShop({ title: "Sony Wh-1000xm6 Midnight Blue", merchant: "HopCash Suisse" }, P));
check("a single replacement earbud is not the product", !isNewFromAShop({ title: "Apple AirPods Pro 3e generatie rechter single (vervanging rechts)", merchant: "OneEarPod" }, "Apple AirPods Pro 3"));
check("an opened one is not new", !isNewFromAShop({ title: "Apple AirPods Pro 3 Avattu", merchant: "OnBuy.com" }, "Apple AirPods Pro 3"));
check("a restored one is not new", !isNewFromAShop({ title: "Restored Sony WH-1000XM6 Wireless Headphones", merchant: "u-buy.co.uk" }, P));
check("an ordinary shop is", isNewFromAShop({ title: "Sony WH-1000XM6 Noise Cancelling", merchant: "Verkkokauppa.com" }, P));

// The band
const band = (list) => priceBand(list.map(([price, merchant]) => ({ price, merchant })));
check("no offers, no band", band([]) === null);
const cases = band([[12, "A"], [14, "B"], [15, "C"], [16, "D"], [18, "E"], [19, "F"], [299, "G"], [319, "H"], [329, "I"], [349, "J"]]);
check("more cases than headphones: the band is still the headphones'", cases && cases.low < 299 && cases.low > 100, JSON.stringify(cases));
const wild = band([[219.9, "A"], [319, "B"], [418, "C"], [429, "D"], [449, "E"], [18185, "OnBuy.com"], [18185, "OnBuy.com"]]);
check("one shop listing a wild price twice does not set the band", wild && wild.high < 1000, JSON.stringify(wild));
const lone = band([[299, "A"], [319, "B"], [329, "C"], [339, "D"], [4999, "E"]]);
check("a lone wild price does not set the band", lone && lone.high < 1000, JSON.stringify(lone));
const spread = band([[319, "galaxus.ch"], [418, "wafuu.com"], [503.14, "McGrocer"], [646.21, "StockX"]]);
check("a wide spread starts at its cheapest shop, not in the middle", spread && spread.low < 319, JSON.stringify(spread));
const oneShop = band([[15, "A"], [16, "B"], [329, "Amazon"], [339, "Amazon"], [349, "Amazon"], [359, "Amazon"]]);
check("one shop with most of the offers still counts", oneShop && oneShop.low > 100, JSON.stringify(oneShop));

// Country by country
const euro = [
  { country: "DE", offers: [offer(289, "Mediamarkt"), offer(299, "Saturn"), offer(319, "Otto"), offer(14.99, "Hüllenwelt", "Sony WH-1000XM6 Silikonhülle")] },
  { country: "FI", offers: [offer(339, "Verkkokauppa.com"), offer(349, "Gigantti")] },
  { country: "IT", offers: [offer(324.99, "OnBuy.com"), offer(18185, "OnBuy.com"), offer(18185, "OnBuy.com")] },
];
let rows = pickOffers(P, euro);
check("Germany: the cheapest headphones, not the case", best(rows, "DE")?.price === 289, says(best(rows, "DE")));
check("Finland: two offers get the band of all the euro countries", best(rows, "FI")?.price === 339, says(best(rows, "FI")));
check("Italy: the wild price is left out", best(rows, "IT")?.price === 324.99, says(best(rows, "IT")));

rows = pickOffers(P, [
  ...euro,
  { country: "CH", offers: [offer(120, "Privat", P, "CHF"), offer(319, "Digitec", P, "CHF"), offer(418, "Interdiscount", P, "CHF"), offer(503.14, "McGrocer", P, "CHF"), offer(646.21, "StockX", P, "CHF"), offer(18185, "OnBuy.com", P, "CHF"), offer(18185, "OnBuy.com", P, "CHF")] },
  { country: "NO", offers: [offer(209, "Cdon", "Sony WH-1000XM6 hodetelefoner silikonetui", "kr"), offer(209, "Cdon", "Sony WH-1000XM6 hodetelefoner silikonetui", "kr"), offer(219, "Fyndiq", "Sony WH-1000XM6 hodetelefoner silikonetui", "kr")] },
  { country: "SE", offers: [offer(209, "cdon.se", "Sony WH-1000XM6 hörlurar - skyddshölje", "kr"), offer(3690, "Amazon.se", P, "kr"), offer(3990, "Elgiganten", P, "kr")] },
  { country: "DK", offers: [offer(22.92, "Shein", "Siliconebeskyttelse til Sony WH-1000XM6", "kr"), offer(2499, "Elgiganten.dk", P, "kr"), offer(2699, "Power.dk", P, "kr")] },
  { country: "PL", offers: [offer(1000, "Loombard.pl", "Słuchawki Sony Wh-1000XM6 Komplet", "zł"), offer(1799, "Media Expert", P, "zł"), offer(1899, "x-kom", P, "zł")] },
]);
check("Switzerland: CHF 319, not CHF 18,185 and not a CHF 120 one", best(rows, "CH")?.price === 319, says(best(rows, "CH")));
check("Norway: only cases on offer, so no offer", best(rows, "NO") === null, says(best(rows, "NO")));
check("Sweden: the headphones, not the cover", best(rows, "SE")?.price === 3690, says(best(rows, "SE")));
check("Denmark is not held to Sweden's prices though both say kr", best(rows, "DK")?.price === 2499, says(best(rows, "DK")));
check("Poland: a shop's price, not the pawn shop's", best(rows, "PL")?.price === 1799, says(best(rows, "PL")));
check("the euro countries are unchanged by the others", best(rows, "DE")?.price === 289 && best(rows, "FI")?.price === 339);

rows = pickOffers(P, [{ country: "CH", offers: [offer(319, "Digitec", P, "CHF"), offer(418, "Interdiscount", P, "CHF"), offer(429, "Fust", P, "CHF"), offer(18185, "OnBuy.com", P, "CHF"), offer(18185, "OnBuy.com", P, "CHF")] }]);
check("Switzerland by itself, with no euro prices to hold it against", best(rows, "CH")?.price === 319, says(best(rows, "CH")));
rows = pickOffers(P, [{ country: "ES", offers: [] }]);
check("a country with nothing listed has no offer", best(rows, "ES") === null && rows[0].matched === 0);

console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);
