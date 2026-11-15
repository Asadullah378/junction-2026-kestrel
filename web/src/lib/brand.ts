/**
 * The name. A kestrel is a small falcon that hovers in one spot, head perfectly still, watching the
 * ground until something moves. That is the product: you tell it once what to watch, it keeps
 * looking, and it tells you when something changed.
 * Change it here and it changes everywhere in the interface and in the agent's instructions.
 */
export const APP_NAME = "Kestrel";
export const APP_TAGLINE = "Watches the web for you";
export const APP_DESCRIPTION =
  "Tell Kestrel once what to watch. It searches the live web, checks every page against what you asked for, keeps watching, and tells you when something changes, with the before, the after and the source.";

/**
 * The logo: a kestrel hovering, seen from the front. Wings up, tail fanned, body still. It is cut
 * from flat shapes with a thin gap between them, lit from the upper left, so the left wing is the
 * brightest.
 *
 * Drawn in a 32 by 32 box. The same shapes are used by the logo in the interface
 * (components/brand/logo.tsx), the call's mark (components/voice/orb.tsx), the Apple touch icon
 * (app/apple-icon.tsx), the installed app's icons and the link preview (scripts/make-icons.cjs)
 * and, copied by hand because it is a static file, the favicon (app/icon.svg). Change them together.
 *
 * The two names below are kept from the first mark so nothing that draws the logo had to change:
 * `facets` are the feathers and `table` is the body.
 */
export const LOGO = {
  /** The feathers, clockwise from the upper right: wing tip, wing, tail, then the same on the left. Each with how much light it catches. */
  facets: [
    { d: "M23.00 7.00 27.60 5.60 26.10 11.20 23.75 15.20Z", opacity: 0.68 },
    { d: "M18.80 12.60 22.30 7.90 23.00 15.70 18.70 19.60Z", opacity: 0.86 },
    { d: "M18.15 20.40 22.40 24.40 17.95 26.50Z", opacity: 0.62 },
    { d: "M13.85 20.40 9.60 24.40 14.05 26.50Z", opacity: 0.72 },
    { d: "M13.20 12.60 9.70 7.90 9.00 15.70 13.30 19.60Z", opacity: 0.96 },
    { d: "M9.00 7.00 4.40 5.60 5.90 11.20 8.25 15.20Z", opacity: 0.82 },
  ],
  /** The body: head at the top, the middle tail feather at the bottom. */
  table: "M16.00 8.90 18.00 10.70 18.20 13.20 17.50 19.80 17.10 26.40 14.90 26.40 14.50 19.80 13.80 13.20 14.00 10.70Z",
  /** Corner radius of the tile behind the mark. */
  radius: 9,
  /** Fixed colours for files that cannot read the theme (favicon, touch icon, app icons, link preview): amber on deep navy. */
  tile: "#172a4e",
  ink: "#fab549",
} as const;
