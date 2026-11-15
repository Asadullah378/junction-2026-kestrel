import { sayPrice, shopState } from "@/lib/watches/sandbox";

export const dynamic = "force-dynamic";

/*
 * The pretend shop: one product page with a price and a stock line, served to anyone, signed in
 * or not. It exists so a watch can be shown reacting to a real change on a real public page:
 * the admin changes the price (/dev/shop-admin) and a monitor on this address sees it.
 *
 * The page is plain and steady on purpose. Nothing on it changes by itself (no clock, no random
 * part), so the only difference between two loads is a change someone made; and the price and
 * the stock are stated three ways (visible text, data attributes, schema.org data) so a page
 * monitor, a reader and a structured extraction all find them.
 */
export function GET() {
  const shop = shopState();
  const price = shop.price.toFixed(2);
  const stock = shop.inStock ? "In stock" : "Out of stock";
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: shop.name,
    sku: shop.sku,
    brand: { "@type": "Brand", name: "Aurora" },
    description: "Over-ear wireless headphones with active noise cancelling and 40 hours of battery.",
    offers: { "@type": "Offer", price, priceCurrency: shop.currency, availability: shop.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${shop.name} | Harbour Audio (demo shop)</title>
<meta name="description" content="${shop.name}. ${sayPrice(shop)}. ${stock}. A demo page with made-up data.">
<meta name="robots" content="noindex">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #17202b; background: #f6f4ef; }
  header, main, footer { max-width: 880px; margin: 0 auto; padding: 0 24px; }
  header { display: flex; align-items: center; justify-content: space-between; padding-top: 22px; padding-bottom: 22px; }
  .shop { font-weight: 700; letter-spacing: 0.01em; }
  .note { font-size: 13px; color: #6a7380; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 36px; padding-top: 12px; padding-bottom: 48px; }
  .picture { aspect-ratio: 1; border-radius: 20px; background: linear-gradient(145deg, #1d2a44, #0f1626); display: flex; align-items: center; justify-content: center; }
  h1 { font-size: 30px; line-height: 1.2; margin: 6px 0 10px; }
  .sku { font-size: 13px; color: #6a7380; }
  .price { font-size: 40px; font-weight: 700; margin: 18px 0 4px; }
  .stock { display: inline-block; font-size: 14px; font-weight: 600; padding: 4px 12px; border-radius: 999px; }
  .stock.in { background: #e2f3e8; color: #17603a; }
  .stock.out { background: #fbe6e3; color: #9a2c1f; }
  ul { padding-left: 20px; color: #3b4654; }
  footer { padding-top: 18px; padding-bottom: 36px; border-top: 1px solid #e2ddd2; font-size: 13px; color: #6a7380; }
  @media (max-width: 640px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <span class="shop">Harbour Audio</span>
  <span class="note">Demo shop. Made-up data.</span>
</header>
<main>
  <div class="picture" aria-hidden="true">
    <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="#f0b24a" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/></svg>
  </div>
  <article id="product" itemscope itemtype="https://schema.org/Product" data-sku="${shop.sku}">
    <p class="sku">Item <span itemprop="sku">${shop.sku}</span></p>
    <h1 itemprop="name">${shop.name}</h1>
    <p itemprop="description">Over-ear wireless headphones with active noise cancelling and 40 hours of battery.</p>
    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <meta itemprop="priceCurrency" content="${shop.currency}">
      <p class="price">Price: <span id="price" itemprop="price" content="${price}" data-price="${price}" data-currency="${shop.currency}">${sayPrice(shop)}</span></p>
      <p><span id="stock" class="stock ${shop.inStock ? "in" : "out"}" data-in-stock="${shop.inStock}">Availability: ${stock}</span></p>
      <link itemprop="availability" href="${shop.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"}">
    </div>
    <ul>
      <li>Active noise cancelling with a transparency mode</li>
      <li>40 hours of battery, 10 minutes of charge for 5 hours</li>
      <li>Bluetooth 5.4 with multipoint</li>
      <li>Two-year warranty</li>
    </ul>
  </article>
</main>
<footer>This page belongs to Kestrel's demo. The shop, the product and the price are made up, so that a watch can be shown reacting to a change.</footer>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0" } });
}
