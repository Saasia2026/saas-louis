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

// Abonnements : des crédits chaque mois, un peu moins chers qu'en packs.
// L'annuel vaut 10 mois (2 offerts) et livre les 12 mois de crédits d'un
// coup. Crédit le moins cher : 999,90 € / 6 000 ≈ 0,167 € TTC, soit ~0,15 $
// hors TVA et frais, pour ~0,097 $ de coût Genjutsu : marge ~35 %.
export const SUBSCRIPTION_PLANS = [
  { id: "creator", credits: 150, month: 3499, year: 34990 },
  { id: "studio", credits: 500, month: 9999, year: 99990, highlight: true },
] as const;

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type BillingInterval = "month" | "year";

export function findSubscriptionPlan(id: unknown): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id);
}

// Crédits livrés à chaque paiement de l'abonnement.
export function planCredits(plan: SubscriptionPlan, interval: BillingInterval) {
  return interval === "year" ? plan.credits * 12 : plan.credits;
}

// Seuils proposés pour la recharge automatique.
export const AUTO_RECHARGE_THRESHOLDS = [10, 20, 50, 100] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];
export type CreditPackId = CreditPack["id"];

export function findCreditPack(id: unknown): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

// `intlLocale` : voir INTL_LOCALES (i18n/config.ts).
export function formatPrice(amount: number, intlLocale = "fr-FR") {
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: CREDIT_CURRENCY,
  }).format(amount / 100);
}
