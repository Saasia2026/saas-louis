import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// L'espace connecté et les webhooks n'ont rien à faire dans un moteur de
// recherche : leurs pages exigent une session et changent à chaque visite.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard/", "/api/", "/auth/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
