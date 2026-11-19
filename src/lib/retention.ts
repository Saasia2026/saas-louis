// Parcours de résiliation, partagé client/serveur : avant la confirmation,
// un écran rappelle les crédits déjà payés qui seraient perdus et propose
// une fois une remise pour rester. « Continuer la résiliation » reste aussi
// visible que l'offre : en France, la résiliation doit rester simple
// (lien « Résilier », « Continuer », « Confirmer »), sans obstacle caché.

// Remise sur la prochaine facture d'un abonnement mensuel, une seule fois
// par abonnement. Les crédits du mois restent entiers (fulfillInvoice ne
// regarde pas le montant) : à 20 %, un mois entièrement consommé se vend
// à peu près à prix coûtant ; la marge revient au mois suivant, au plein
// tarif.
export const RETENTION_OFF_PERCENT = 20;
export const RETENTION_COUPON_ID = `retention-${RETENTION_OFF_PERCENT}-once`;

// Raisons proposées à la confirmation, transmises à Stripe
// (cancellation_details.feedback) : visibles dans le tableau de bord Stripe.
export const CANCEL_REASONS = ["too_expensive", "unused", "low_quality", "missing_features", "other"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export function isCancelReason(value: unknown): value is CancelReason {
  return CANCEL_REASONS.includes(value as CancelReason);
}
