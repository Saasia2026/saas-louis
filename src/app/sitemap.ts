import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Pages publiques, pour Google. Le studio et les vidéos sont derrière la
// connexion : ils n'ont rien à faire dans un moteur de recherche.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/conditions`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
