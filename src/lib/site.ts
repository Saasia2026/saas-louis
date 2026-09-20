// Adresse publique du site, pour les liens absolus (métadonnées, sitemap,
// emails). NEXT_PUBLIC_APP_URL est réglée dans Vercel ; sinon l'adresse du
// déploiement, sinon le serveur local.
export function siteUrl() {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return url.replace(/\/$/, "");
}
