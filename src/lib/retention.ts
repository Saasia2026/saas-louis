// Parcours de résiliation, partagé client/serveur : avant la confirmation,
// un écran rappelle les crédits déjà payés qui seraient perdus et propose
// une fois une remise pour rester. « Continuer la résiliation » reste aussi
// visible que l'offre : en France, la résiliation doit rester simple
// (lien « Résilier », « Continuer », « Confirmer »), sans obstacle caché.

export const RETENTION_OFF_PERCENT = 20;
export const RETENTION_COUPON_ID = `retention-${RETENTION_OFF_PERCENT}-once`;

export const PAUSE_MONTHS = [1, 2] as const;
export type PauseMonths = (typeof PAUSE_MONTHS)[number];
export function isPauseMonths(v: unknown): v is PauseMonths {
  return v === 1 || v === 2;
}

export const CANCEL_REASONS = ["too_expensive", "unused", "low_quality", "missing_features", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export function isCancelReason(value: unknown): value is CancelReason {
  return CANCEL_REASONS.includes(value as CancelReason);
}
