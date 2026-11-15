// Draw the app's icons and the link preview from the logo's shapes (src/lib/brand.ts), so they cannot drift:
//   public/icon-192.png       the installed web app's icons
//   public/icon-512.png
//   public/icon-maskable.png  the same on a full square, for phones that cut their own shape
//   public/landing/og.jpg     the picture a link to the site is previewed with (1200 by 630)
// Run after changing the logo, the name or the tagline: pnpm icons   (it uses Electron to draw them)
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const web = path.join(__dirname, "..");

const brand = fs.readFileSync(path.join(web, "src/lib/brand.ts"), "utf8");
const facets = [...brand.matchAll(/\{ d: "([^"]+)", opacity: ([\d.]+) \}/g)].map((m) => ({ d: m[1], opacity: Number(m[2]) }));
const table = brand.match(/table: "([^"]+)"/)[1];
const tile = brand.match(/tile: "([^"]+)"/)[1];
const ink = brand.match(/ink: "([^"]+)"/)[1];
const name = brand.match(/APP_NAME = "([^"]+)"/)[1];
const tagline = brand.match(/APP_TAGLINE = "([^"]+)"/)[1];
if (facets.length < 1) throw new Error("Could not read the logo's shapes from src/lib/brand.ts");

const mark = facets.map((f) => `<path d="${f.d}" fill="${ink}" opacity="${f.opacity}"/>`).join("") + `<path d="${table}" fill="${ink}"/>`;
/** `inset`: the margin round the tile, as a share of the picture. `radius`: the tile's corners, in the logo's 32-unit box. `scale`: the mark's size inside the tile. */
const svg = ({ inset, radius, scale }) => {
  const side = 32 / (1 - 2 * inset);
  const offset = (side - 32) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"><g transform="translate(${offset} ${offset})"><rect width="32" height="32" rx="${radius}" fill="${tile}"/><g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${mark}</g></g></svg>`;
};

const ICONS = [
  { file: "public/icon-192.png", size: 192, art: { inset: 0, radius: 7.2, scale: 1 } },
  { file: "public/icon-512.png", size: 512, art: { inset: 0, radius: 7.2, scale: 1 } },
  { file: "public/icon-maskable.png", size: 512, art: { inset: 0, radius: 0, scale: 0.78 } },
];

/** The link preview: the mark, the name and the tagline on the dark theme's navy, with the amber glow the pages have. */
const preview = () => `<!doctype html><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{background:
    radial-gradient(720px 420px at 22% 8%, rgba(250,181,73,.20), transparent 70%),
    radial-gradient(560px 360px at 92% 100%, rgba(110,150,230,.16), transparent 70%),
    #070f1f;
    color:#f2f0ec;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;display:flex;align-items:center}
  .in{display:flex;align-items:center;gap:56px;padding:0 96px}
  svg{width:220px;height:220px;flex:none;filter:drop-shadow(0 24px 60px rgba(250,181,73,.28))}
  h1{margin:0;font-size:124px;line-height:1;font-weight:700;letter-spacing:-0.04em}
  p{margin:22px 0 0;font-size:44px;line-height:1.15;font-weight:500;letter-spacing:-0.01em;color:#fab549}
</style><div class="in"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7.2" fill="${ink}"/>${facets.map((f) => `<path d="${f.d}" fill="#0a1326" opacity="${f.opacity}"/>`).join("")}<path d="${table}" fill="#0a1326"/></svg><div><h1>${name}</h1><p>${tagline}</p></div></div>`;

app.whenReady().then(async () => {
  // Every icon is drawn large in one hidden window and scaled down to its size.
  const os = require("node:os");
  const sheet = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kestrel-icons-")), "icon.html");
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  for (const icon of ICONS) {
    fs.writeFileSync(sheet, `<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style>${svg(icon.art)}`);
    await win.loadFile(sheet);
    await new Promise((r) => setTimeout(r, 350));
    const image = (await win.webContents.capturePage()).resize({ width: icon.size, height: icon.size, quality: "best" });
    fs.writeFileSync(path.join(web, icon.file), image.toPNG());
    console.log("drew", icon.file, `${icon.size} px`);
  }

  // The first window stays open until the end: closing the last window would quit Electron.
  const wide = new BrowserWindow({ width: 1200, height: 630, show: false, frame: false, webPreferences: { offscreen: true } });
  fs.writeFileSync(sheet, preview());
  await wide.loadFile(sheet);
  await new Promise((r) => setTimeout(r, 500));
  const picture = (await wide.webContents.capturePage()).resize({ width: 1200, height: 630, quality: "best" });
  fs.mkdirSync(path.join(web, "public/landing"), { recursive: true });
  fs.writeFileSync(path.join(web, "public/landing/og.jpg"), picture.toJPEG(90));
  console.log("drew", "public/landing/og.jpg", "1200 by 630");

  fs.rmSync(path.dirname(sheet), { recursive: true, force: true });
  app.exit(0);
});
