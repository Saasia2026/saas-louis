// Packs de crédits vendus par Stripe Checkout, partagés client/serveur.
// Prix en centimes, sans TVA (micro-entreprise en franchise, art. 293 B du
// CGI). Grille du 2026-10-07 : un crédit coûte ~0,088 € à produire (Genjutsu
// 0,681 $/s à 7 cr/s, plus fiches et rendus remboursés) ; Stripe prend ~2 %
// + 0,25 € par paiement. Marge nette visée : ~20 % sur les packs, ~16-18 %
// sur les abonnements mensuels, ~10-12 % sur l'annuel (payé d'avance). Le
// prix par crédit baisse du plus petit au plus grand pack.
export const CREDIT_CURRENCY = "eur";

export const CREDIT_PACKS = [
  { id: "starter", label: "Basic", credits: 85, amount: 999 },
  { id: "creator", label: "Pro", credits: 265, amount: 2999, highlight: true },
  { id: "studio", label: "Creator", credits: 900, amount: 9999 },
] as const;

// Abonnements : un peu moins chers au crédit que le pack de la même offre.
// L'annuel livre les 12 mois de crédits d'un coup, ~10 % sous le prix des
// mêmes crédits en packs (pas plus : au-delà, il se vendrait à perte).
export const SUBSCRIPTION_PLANS = [
  { id: "starter", credits: 80, month: 899, year: 9790 },
  { id: "creator", credits: 230, month: 2499, year: 27990, highlight: true },
  { id: "studio", credits: 750, month: 7999, year: 89990 },
] as const;

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type BillingInterval = "month" | "year";

export function findSubscriptionPlan(id: unknown): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id);
}

// Prix par mois des mêmes crédits achetés en packs de l'offre : la référence
// des réductions affichées (jamais un prix barré inventé).
export function packMonthlyEquivalent(plan: SubscriptionPlan) {
  const pack = CREDIT_PACKS.find((p) => p.id === plan.id)!;
  return Math.round((pack.amount * plan.credits) / pack.credits);
}

export function subscriptionMonthly(plan: SubscriptionPlan, interval: BillingInterval) {
  return interval === "year" ? Math.round(plan.year / 12) : plan.month;
}

// Réduction réelle de l'abonnement face aux packs, en %.
export function subscriptionOff(plan: SubscriptionPlan, interval: BillingInterval) {
  return Math.round((1 - subscriptionMonthly(plan, interval) / packMonthlyEquivalent(plan)) * 100);
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
