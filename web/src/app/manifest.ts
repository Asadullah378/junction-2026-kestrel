import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/brand";

/*
 * What a phone or a desktop browser needs to install Kestrel as an app of its own: the same
 * web app, opened from the home screen or the dock.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} · ${APP_TAGLINE}`,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#070f1f",
    theme_color: "#172a4e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
