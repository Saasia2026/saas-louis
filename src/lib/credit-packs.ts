// Packs de crédits vendus par Stripe Checkout, partagés client/serveur.
// Prix en centimes. Un crédit = 1 s de vidéo (Seedance, Wan, Kling 2.5) ou une
// photo ; Wan 2.7 en 1080p coûte déjà 0,15 $ la seconde chez fal, donc un
// crédit ne doit jamais se vendre sous ~0,20 € une fois TVA et frais Stripe
// déduits.

export const CREDIT_CURRENCY = "eur";

export const CREDIT_PACKS = [
  { id: "starter", label: "Découverte", credits: 50, amount: 1499 },
  { id: "creator", label: "Créateur", credits: 150, amount: 3999, highlight: true },
  { id: "studio", label: "Studio", credits: 500, amount: 11999 },
] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];
export type CreditPackId = CreditPack["id"];

export function findCreditPack(id: unknown): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export function formatPrice(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: CREDIT_CURRENCY,
  }).format(amount / 100);
}
