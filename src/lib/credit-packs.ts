// Packs de crédits vendus par Stripe Checkout, partagés client/serveur.
// Prix en centimes, sans TVA (micro-entreprise en franchise, art. 293 B du
// CGI). Grille de lancement (2026-10-12), en crédits 4 fois plus petits
// qu'au départ, comme sur le marché : un crédit coûte ~0,022 € à produire
// (Genjutsu 0,681 $/s à 28 cr/s, plus fiches et rendus remboursés) ; Stripe
// prend ~2 % + 0,25 € par paiement. Marge ~20 % avant l'URSSAF (~21,2 % du
// prix) : une offre dont tous les crédits sont utilisés est à l'équilibre ou
// un peu en perte, la marge vient des crédits non utilisés (ceux d'un
// abonnement expirent à la fin de la période payée). Grille à ~20 % net, à
// reprendre avec du volume ou une remise Higgsfield : packs 244 / 760 / 2568,
// abonnements 660 / 2140. Le prix par crédit baisse du plus petit au plus
// grand pack.
export const CREDIT_CURRENCY = "eur";

export const CREDIT_PACKS = [
  { id: "starter", label: "Basic", credits: 340, amount: 999 },
  { id: "creator", label: "Pro", credits: 1060, amount: 2999, highlight: true },
  { id: "studio", label: "Creator", credits: 3600, amount: 9999 },
] as const;

// Abonnements (Pro et Creator ; pas de Basic) : ~4 % moins chers au crédit
// que le pack de la même offre.
// L'annuel livre les 12 mois de crédits d'un coup, ~10 % sous le prix des
// mêmes crédits en packs. Les crédits d'une période (le mois, ou l'année)
// expirent à sa fin ; ceux des packs jamais.
export const SUBSCRIPTION_PLANS = [
  { id: "creator", credits: 920, month: 2499, year: 27990, highlight: true },
  { id: "studio", credits: 3000, month: 7999, year: 89990 },
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

// Prix d'une question au chat Viralité. Mesuré le 2026-10-12 : ~0,17 $ de
// Claude et de recherche web pour une question type, davantage quand la
// conversation s'allonge.
export const VIRAL_QUESTION_CREDITS = 12;

// Paiement à l'usage (carte enregistrée) : les crédits qui manquent pour
// lancer une vidéo ou poser une question sont débités sur la carte au
// lancement, au prix du crédit du pack Basic. USAGE_MIN_CENTS au moins par
// débit, pour que les frais fixes de Stripe (~0,25 €) ne mangent pas tout :
// le surplus reste au solde. Garde-fous par 24 h.
export const USAGE_MIN_CENTS = 200;
export const USAGE_DAILY_MAX_CHARGES = 20;
export const USAGE_DAILY_MAX_CENTS = 20000;

export function usageCharge(missingCredits: number) {
  const basic = CREDIT_PACKS[0];
  const minCredits = Math.ceil((USAGE_MIN_CENTS * basic.credits) / basic.amount);
  const credits = Math.max(Math.ceil(missingCredits), minCredits);
  return { credits, amount: Math.ceil((credits * basic.amount) / basic.credits) };
}

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
