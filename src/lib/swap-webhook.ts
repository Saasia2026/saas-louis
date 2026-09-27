import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "@/lib/site";

// Adresse que Higgsfield et fal appellent à la fin d'un rendu, pour qu'un
// remplacement avance sans page ouverte (voir /api/swap/webhook). Higgsfield
// ne signe pas ses webhooks : l'adresse porte une empreinte de la génération,
// calculée avec la clé de service, que personne d'autre ne peut fabriquer.
// L'appel ne fait que relancer advanceSwap, qui relit l'état chez le
// fournisseur : un faux appel ne peut rien changer.
function sign(generationId: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant");
  return createHmac("sha256", key).update(`swap-webhook:${generationId}`).digest("hex").slice(0, 32);
}

// Pas de webhook en local : les fournisseurs ne joignent pas localhost.
export function swapWebhookUrl(generationId: string) {
  const base = siteUrl();
  if (!base.startsWith("https://")) return undefined;
  return `${base}/api/swap/webhook?g=${generationId}&s=${sign(generationId)}`;
}

export function verifySwapWebhook(generationId: string | null, signature: string | null) {
  if (!generationId || !signature || !/^[0-9a-f-]{36}$/.test(generationId)) return false;
  const expected = Buffer.from(sign(generationId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
