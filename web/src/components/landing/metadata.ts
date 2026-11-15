import type { Metadata } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";

const title = `${APP_NAME} · ${APP_TAGLINE}`;
const description = APP_DESCRIPTION;

/** What search engines and link previews are told about the front page. The picture is drawn by `pnpm icons`. */
export const LANDING_METADATA: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", siteName: APP_NAME, images: [{ url: "/landing/og.jpg", width: 1200, height: 630, alt: `${APP_NAME}: ${APP_TAGLINE.toLowerCase()}` }] },
  twitter: { card: "summary_large_image", title, description, images: ["/landing/og.jpg"] },
};
