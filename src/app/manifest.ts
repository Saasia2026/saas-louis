import type { MetadataRoute } from "next";
import { getDictionary } from "@/i18n/server";

// Installation sur l'écran d'accueil : le site s'ouvre alors en plein écran,
// avec son icône, comme une application. Rien à publier sur un magasin.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getDictionary();
  return {
    name: "TwinPost",
    short_name: "TwinPost",
    description: t.meta.description,
    // L'application s'ouvre sur le studio ; la page d'accueil reste le site.
    start_url: "/dashboard/generate",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05060f",
    theme_color: "#05060f",
    categories: ["photo", "video", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
