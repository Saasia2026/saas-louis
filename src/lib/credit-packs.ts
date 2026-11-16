// Packs de crédits vendus par Stripe Checkout, partagés client/serveur.
// Prix en cents de dollar depuis le 2026-11-16 (avant : euros ; mêmes
// revenus à ~1,17 $ l'euro, change et frais de conversion de Stripe
// compris), sans TVA (micro-entreprise en franchise, art. 293 B du
// CGI). Un crédit coûte ~0,022 € à produire (Genjutsu 0,681 $/s à 28 cr/s,
// plus les rendus remboursés) ; Stripe prend ~2 % + 0,25 € par paiement et
// l'URSSAF ~21,2 % du prix : l'équilibre est vers 2,86 € les 100 crédits si
// tout est consommé. La marge vient des crédits non utilisés (ceux d'un
// abonnement expirent à la fin de la période payée). Grille à ~20 % net, à
// reprendre avec du volume ou une remise Higgsfield : ~3,60 € les 100
// crédits.
export const CREDIT_CURRENCY = "usd";

// Teinte d'une offre sur les pages (voir TIERS dans app/tier-style.ts).
export type Tier = "basic" | "pro" | "creator";

export type CreditPack = { id: string; credits: number; amount: number; tier: Tier };

const pack = (credits: number, amount: number, tier: Tier): CreditPack => ({
  id: `c${credits}`,
  credits,
  amount,
  tier,
});

// Grille du 2026-11-16, sur le modèle de la page de prix de Higgsfield : des
// recharges de 500 à 4 000 crédits en cartes, et un curseur de 5 000 à
// 100 000. Le prix des 100 crédits baisse avec la taille, de 3,40 $ à
// 3,20 $ (2,90 € à 2,75 € avant le passage au dollar). CREDIT_PACKS[0] fixe aussi le prix du paiement à l'usage.
export const TOPUP_PACKS: readonly CreditPack[] = [
  pack(500, 1699, "basic"),
  pack(1000, 3299, "basic"),
  pack(2000, 6499, "pro"),
  pack(4000, 12899, "pro"),
];
export const SLIDER_PACKS: readonly CreditPack[] = [
  pack(5000, 15999, "creator"),
  ...[7000, 9000, 11000, 13000, 15000, 17000, 19000, 21000, 23000, 25000].map((credits) =>
    pack(credits, Math.round(credits * 3.2) - 1, "creator"),
  ),
  pack(100000, 319999, "creator"),
];
export const CREDIT_PACKS: readonly CreditPack[] = [...TOPUP_PACKS, ...SLIDER_PACKS];

// Packs de l'ancienne grille : plus en vente, encore reconnus pour créditer
// un paiement lancé avant le changement.
const LEGACY_PACKS: readonly CreditPack[] = [
  { id: "starter", credits: 340, amount: 999, tier: "basic" },
  { id: "creator", credits: 1060, amount: 2999, tier: "pro" },
  { id: "studio", credits: 3600, amount: 9999, tier: "creator" },
];

export function findCreditPack(id: unknown): CreditPack | undefined {
  return [...CREDIT_PACKS, ...LEGACY_PACKS].find((p) => p.id === id);
}

export type SubscriptionPlan = {
  id: string;
  tier: Exclude<Tier, "basic">;
  credits: number;
  month: number;
  year: number;
};

// Abonnements : Pro (1 000 crédits par mois) et Creator en trois tailles.
// ~5 % sous les recharges des mêmes crédits au mois ; l'annuel livre les 12
// mois de crédits d'un coup, ~11 % dessous. Les crédits d'une période (le
// mois, ou l'année) expirent à sa fin ; ceux des packs jamais.
export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  { id: "pro-1k", tier: "pro", credits: 1000, month: 3199, year: 34990 },
  { id: "creator-3k", tier: "creator", credits: 3000, month: 9399, year: 104990 },
  { id: "creator-6k", tier: "creator", credits: 6000, month: 18499, year: 207990 },
  { id: "creator-9k", tier: "creator", credits: 9000, month: 27499, year: 308990 },
];

// Anciens abonnements : plus proposés, encore crédités à chaque facture.
const LEGACY_PLANS: readonly SubscriptionPlan[] = [
  { id: "creator", tier: "pro", credits: 920, month: 2499, year: 27990 },
  { id: "studio", tier: "creator", credits: 3000, month: 7999, year: 89990 },
];

export type BillingInterval = "month" | "year";

export function findSubscriptionPlan(id: unknown): SubscriptionPlan | undefined {
  return [...SUBSCRIPTION_PLANS, ...LEGACY_PLANS].find((p) => p.id === id);
}

// Prix des mêmes crédits en recharges, au tarif du plus grand pack qui n'en
// donne pas plus : la référence des réductions affichées sur les
// abonnements (jamais un prix barré inventé).
export function topupPrice(credits: number) {
  const ref = [...CREDIT_PACKS].reverse().find((p) => p.credits <= credits) ?? CREDIT_PACKS[0];
  return Math.round((ref.amount * credits) / ref.credits);
}

// Prix par mois des mêmes crédits achetés en recharges.
export function packMonthlyEquivalent(plan: SubscriptionPlan) {
  return topupPrice(plan.credits);
}

export function subscriptionMonthly(plan: SubscriptionPlan, interval: BillingInterval) {
  return interval === "year" ? Math.round(plan.year / 12) : plan.month;
}

// Réduction réelle de l'abonnement face aux recharges, en %.
export function subscriptionOff(plan: SubscriptionPlan, interval: BillingInterval) {
  return Math.round((1 - subscriptionMonthly(plan, interval) / packMonthlyEquivalent(plan)) * 100);
}

// Économie sur un an face aux mêmes crédits en recharges.
export function subscriptionYearlySaving(plan: SubscriptionPlan, interval: BillingInterval) {
  return packMonthlyEquivalent(plan) * 12 - (interval === "year" ? plan.year : plan.month * 12);
}

// Crédits livrés à chaque paiement de l'abonnement.
export function planCredits(plan: SubscriptionPlan, interval: BillingInterval) {
  return interval === "year" ? plan.credits * 12 : plan.credits;
}

// Prix d'un pack au tarif du plus petit : le prix barré des recharges.
export function packReference(p: CreditPack) {
  const base = CREDIT_PACKS[0];
  return Math.round((p.credits * base.amount) / base.credits);
}

// Réduction réelle d'un pack face au plus petit, en %.
export function packOff(p: CreditPack) {
  return Math.round((1 - p.amount / packReference(p)) * 100);
}

// Prix des 100 crédits d'un pack, en centimes.
export function per100(p: CreditPack) {
  return Math.round((p.amount * 100) / p.credits);
}

// Paiement à l'usage (carte enregistrée) : les crédits qui manquent pour
// lancer une vidéo ou poser une question sont débités sur la carte au
// lancement, au prix du crédit du plus petit pack. USAGE_MIN_CENTS au moins
// par débit, pour que les frais fixes de Stripe (~0,25 €) ne mangent pas
// tout : le surplus reste au solde. Garde-fous par 24 h.
export const USAGE_MIN_CENTS = 200;
export const USAGE_DAILY_MAX_CHARGES = 20;
export const USAGE_DAILY_MAX_CENTS = 20000;

export function usageCharge(missingCredits: number) {
  const basic = CREDIT_PACKS[0];
  const minCredits = Math.ceil((USAGE_MIN_CENTS * basic.credits) / basic.amount);
  const credits = Math.max(Math.ceil(missingCredits), minCredits);
  return { credits, amount: Math.ceil((credits * basic.amount) / basic.credits) };
}

export function creditsPerEuro(pack: CreditPack) {
  return Math.round((pack.credits / pack.amount) * 100);
}

export function bonusCredits(pack: CreditPack) {
  const basic = CREDIT_PACKS[0];
  const atBasicRate = Math.round((pack.amount * basic.credits) / basic.amount);
  return Math.max(0, pack.credits - atBasicRate);
}

export function subscriptionCreditsPerEuro(plan: SubscriptionPlan, interval: BillingInterval) {
  const monthly = subscriptionMonthly(plan, interval);
  return Math.round((plan.credits / monthly) * 100);
}

// `intlLocale` : voir INTL_LOCALES (i18n/config.ts).
export function formatPrice(amount: number, intlLocale = "fr-FR") {
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: CREDIT_CURRENCY,
    // « 16,99 $ » plutôt que « 16,99 $US » en français.
    currencyDisplay: "narrowSymbol",
  }).format(amount / 100);
}
