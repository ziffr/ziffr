// The web app manifest (#143): what a browser needs to install Ziffr, so it opens from the home screen or dock in a
// window of its own. It names no Workspace and no person: it is the same file for everyone, signed in or not.
import type { MetadataRoute } from "next";
import { APP_COLOURS } from "@/lib/app-colours";

/** The manifest Next serves at /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ziffr",
    short_name: "Ziffr",
    description: "Define the numbers you care about, collect their values, and see, share and discuss them over time.",
    // A signed-out start goes on to sign-in, as any page does.
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_COLOURS.background,
    theme_color: APP_COLOURS.background,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
