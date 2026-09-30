// Packs de crédits vendus par Stripe Checkout, partagés client/serveur.
// Prix en centimes. Coût de production Genjutsu (mannequin, 2 passes) :
// ~0,097 $/cr en 720p. Marge cible ≈ 20-35 % au prix plein API ; si
// Higgsfield accorde la remise revendeur, elle monte à 50-60 %.
// Grille alignée sur Glorify (sept. 2026) : Basic 9 $/150 cr, Pro 25 $/600 cr,
// Ultimate 44 $/1 200 cr — nos prix en € reflètent la même logique.

export const CREDIT_CURRENCY = "eur";

export const CREDIT_PACKS = [
  { id: "starter", label: "Basic", credits: 75, amount: 999 },
  { id: "creator", label: "Pro", credits: 225, amount: 2999, highlight: true },
  { id: "studio", label: "Creator", credits: 750, amount: 9999 },
] as const;

// Abonnements : mêmes crédits, un peu moins chers que les packs.
// L'annuel vaut 10 mois (2 offerts) et livre les 12 mois de crédits d'un coup.
export const SUBSCRIPTION_PLANS = [
  { id: "starter", credits: 75, month: 899, year: 8990 },
  { id: "creator", credits: 225, month: 2499, year: 24990, highlight: true },
  { id: "studio", credits: 750, month: 7999, year: 79990 },
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
