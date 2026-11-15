// Tunnel d'accueil d'un nouvel inscrit, partagé client/serveur : les
// questions, leurs réponses possibles et l'offre recommandée.
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "./credit-packs";
import { swapMethodRate } from "./generation";

export const GOALS = ["viral", "community", "brand", "clients", "fun"] as const;
export const PLATFORMS = ["tiktok", "instagram", "youtube", "other"] as const;
// Abonnés aujourd'hui, puis objectif : chaque palier vise au-dessus du
// précédent.
export const AUDIENCES = ["0", "1k", "10k", "100k"] as const;
export const TARGETS = ["1k", "10k", "100k", "1m"] as const;
export const PACES = ["weekly", "few", "daily", "multi"] as const;

export type Goal = (typeof GOALS)[number];
export type Platform = (typeof PLATFORMS)[number];
export type Audience = (typeof AUDIENCES)[number];
export type Target = (typeof TARGETS)[number];
export type Pace = (typeof PACES)[number];

export type OnboardingAnswers = {
  goal: Goal;
  platforms: Platform[];
  audience?: Audience;
  target?: Target;
  pace: Pace;
};

// Vidéos publiées par mois pour chaque rythme.
export const PACE_VIDEOS: Record<Pace, number> = { weekly: 4, few: 12, daily: 30, multi: 60 };
// Durée de référence d'une vidéo : la limite d'un rendu Shinka.
export const CLIP_SECONDS = 15;

// Seuls les objectifs d'audience demandent les abonnés.
export function asksAudience(goal: Goal | undefined) {
  return goal === "viral" || goal === "community";
}

// Objectifs proposés au-dessus des abonnés actuels.
export function targetsAbove(audience: Audience | undefined): Target[] {
  const start = audience ? AUDIENCES.indexOf(audience) : 0;
  return TARGETS.slice(Math.min(start, TARGETS.length - 1));
}

// Crédits d'une vidéo de 15 s en 720p, en Shinka et en Shinka Max.
export function clipCredits(max = false) {
  return CLIP_SECONDS * swapMethodRate({ model: max ? "max" : "standard", quality: "720p" });
}

// Crédits par mois au rythme choisi, en Shinka 720p.
export function monthlyCredits(pace: Pace) {
  return PACE_VIDEOS[pace] * clipCredits();
}

// Plus petit abonnement qui couvre le rythme (à 10 % près), sinon le plus
// grand.
export function recommendedPlan(pace: Pace): SubscriptionPlan {
  const need = monthlyCredits(pace);
  return SUBSCRIPTION_PLANS.find((p) => need <= p.credits * 1.1) ?? SUBSCRIPTION_PLANS[SUBSCRIPTION_PLANS.length - 1];
}

// Réponses venues du navigateur, gardées seulement si elles sont connues.
export function parseAnswers(value: unknown): OnboardingAnswers | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], x: unknown) =>
    list.includes(x as T) ? (x as T) : undefined;
  const goal = pick(GOALS, v.goal);
  const pace = pick(PACES, v.pace);
  if (!goal || !pace) return null;
  const platforms = Array.isArray(v.platforms)
    ? PLATFORMS.filter((p) => (v.platforms as unknown[]).includes(p))
    : [];
  return {
    goal,
    platforms,
    audience: asksAudience(goal) ? pick(AUDIENCES, v.audience) : undefined,
    target: asksAudience(goal) ? pick(TARGETS, v.target) : undefined,
    pace,
  };
}
