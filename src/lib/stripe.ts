import "server-only";
import Stripe from "stripe";
import {
  CREDIT_CURRENCY,
  findCreditPack,
  findSubscriptionPlan,
  planCredits,
  usageCharge,
  USAGE_DAILY_MAX_CENTS,
  USAGE_DAILY_MAX_CHARGES,
  type BillingInterval,
  type CreditPack,
} from "@/lib/credit-packs";
import { createAdminClient } from "@/lib/supabase/admin";

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function createStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant");
  return new Stripe(key);
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// Client Stripe de l'utilisateur, créé au premier paiement. Ses cartes et son
// abonnement sont rattachés à ce client.
export async function getOrCreateCustomer(userId: string, email?: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  // Clé d'idempotence : deux clics simultanés ne créent qu'un client.
  const customer = await createStripe().customers.create(
    { email, metadata: { user_id: userId } },
    { idempotencyKey: `customer-${userId}` },
  );
  // Gardé seulement s'il n'y en a pas déjà un (course entre deux onglets).
  await admin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId)
    .is("stripe_customer_id", null);
  const { data: saved } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  return saved?.stripe_customer_id ?? customer.id;
}

export type SavedCard = { id: string; brand: string; last4: string; expMonth: number; expYear: number };

// Dernière carte enregistrée du client (la plus récente d'abord).
export async function savedCard(customerId: string | null | undefined): Promise<SavedCard | null> {
  if (!customerId) return null;
  const { data } = await createStripe().paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  });
  const pm = data[0];
  if (!pm?.card) return null;
  return {
    id: pm.id,
    brand: pm.card.brand,
    last4: pm.card.last4,
    expMonth: pm.card.exp_month,
    expYear: pm.card.exp_year,
  };
}

export type ActiveSubscription = {
  planId: string;
  interval: BillingInterval;
  status: Stripe.Subscription.Status;
  renewsAt: number | null;
  cancelAtPeriodEnd: boolean;
};

// Abonnement en cours du client, s'il en a un.
export async function activeSubscription(
  customerId: string | null | undefined,
): Promise<ActiveSubscription | null> {
  if (!customerId) return null;
  const { data } = await createStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 5,
  });
  const sub = data.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));
  if (!sub) return null;
  const item = sub.items.data[0];
  return {
    planId: sub.metadata.plan_id ?? "",
    interval: sub.metadata.interval === "year" ? "year" : "month",
    status: sub.status,
    renewsAt: item?.current_period_end ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

async function applyPurchase(input: {
  id: string;
  userId: string;
  packId: string;
  credits: number;
  amount: number;
  currency: string;
}) {
  const { data, error } = await createAdminClient().rpc("apply_credit_purchase", {
    p_session_id: input.id,
    p_user_id: input.userId,
    p_pack_id: input.packId,
    p_credits: input.credits,
    p_amount_total: input.amount,
    p_currency: input.currency,
  });
  if (error) throw error;
  return data;
}

// Crédite le compte d'une session Checkout payée (achat d'un pack).
// Idempotent : le webhook et le retour sur la page de succès peuvent
// l'appeler pour la même session. Le pack et l'utilisateur viennent des
// métadonnées posées à la création de la session (côté serveur), jamais de
// l'URL. Les abonnements sont crédités par leurs factures (fulfillInvoice).
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment" || session.payment_status !== "paid") return false;
  const userId = session.metadata?.user_id;
  const pack = findCreditPack(session.metadata?.pack_id);
  if (!userId || !pack) {
    console.error("fulfillCheckoutSession: métadonnées manquantes", session.id);
    return false;
  }
  return applyPurchase({
    id: session.id,
    userId,
    packId: pack.id,
    credits: pack.credits,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? "",
  });
}

// Débit direct de la carte enregistrée (achat en un clic, recharge
// automatique). Les métadonnées disent quoi créditer ; `kind` les distingue
// des paiements Checkout, crédités par leur session.
export async function fulfillPaymentIntent(intent: Stripe.PaymentIntent) {
  const kind = intent.metadata?.kind;
  // Paiement à l'usage : le nombre de crédits est posé dans les métadonnées.
  if (kind === "usage") {
    const credits = Number(intent.metadata.credits);
    const userId = intent.metadata.user_id;
    if (intent.status !== "succeeded" || !userId || !Number.isInteger(credits) || credits <= 0) return false;
    return applyPurchase({
      id: intent.id,
      userId,
      packId: "usage",
      credits,
      amount: intent.amount_received,
      currency: intent.currency,
    });
  }
  if ((kind !== "auto" && kind !== "oneclick") || intent.status !== "succeeded") return false;
  const userId = intent.metadata.user_id;
  const pack = findCreditPack(intent.metadata.pack_id);
  if (!userId || !pack) return false;
  return applyPurchase({
    id: intent.id,
    userId,
    packId: `${kind}-${pack.id}`,
    credits: pack.credits,
    amount: intent.amount_received,
    currency: intent.currency,
  });
}

// Facture d'abonnement payée (premier paiement et renouvellements) : les
// crédits du mois, ou des 12 mois pour l'annuel, valables jusqu'à la fin de
// la période facturée ; ceux de la période précédente expirent. Un
// changement de formule en cours de période (facture au prorata) ne livre
// rien de plus : les crédits de la nouvelle formule arrivent au
// renouvellement.
export async function fulfillInvoice(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid") return false;
  if (invoice.billing_reason !== "subscription_create" && invoice.billing_reason !== "subscription_cycle") {
    return false;
  }
  const details = invoice.parent?.subscription_details;
  if (!details) return false;
  let metadata = details.metadata;
  if (!metadata?.user_id) {
    const subscriptionId =
      typeof details.subscription === "string" ? details.subscription : details.subscription.id;
    metadata = (await createStripe().subscriptions.retrieve(subscriptionId)).metadata;
  }
  const userId = metadata?.user_id;
  const plan = findSubscriptionPlan(metadata?.plan_id);
  const interval: BillingInterval = metadata?.interval === "year" ? "year" : "month";
  if (!userId || !plan || !invoice.id) {
    console.error("fulfillInvoice: métadonnées manquantes", invoice.id);
    return false;
  }
  // Fin de la période payée, lue sur les lignes de la facture.
  const periodEnd = Math.max(0, ...invoice.lines.data.map((line) => line.period?.end ?? 0));
  if (!periodEnd) {
    console.error("fulfillInvoice: période introuvable", invoice.id);
    return false;
  }
  const { data, error } = await createAdminClient().rpc("apply_subscription_credits", {
    p_invoice_id: invoice.id,
    p_user_id: userId,
    p_plan_id: `sub-${plan.id}-${interval}`,
    p_credits: planCredits(plan, interval),
    p_amount_total: invoice.amount_paid,
    p_currency: invoice.currency,
    p_expires_at: new Date(periodEnd * 1000).toISOString(),
  });
  if (error) throw error;
  return data;
}

// Débite la carte enregistrée pour un pack. `returnUrl` : le client est là
// (achat en un clic) ; si sa banque demande une vérification (3-D Secure),
// on renvoie l'adresse où il la fait. Sans `returnUrl` : recharge
// automatique, le client n'est pas là, une vérification demandée vaut refus.
export async function chargeSavedCard(input: {
  userId: string;
  customerId: string;
  card: SavedCard;
  pack: CreditPack;
  kind: "auto" | "oneclick";
  description: string;
  returnUrl?: string;
  idempotencyKey: string;
}): Promise<{ status: "paid" } | { status: "action"; url: string } | { status: "failed"; reason: string }> {
  const stripe = createStripe();
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.pack.amount,
        currency: CREDIT_CURRENCY,
        customer: input.customerId,
        payment_method: input.card.id,
        confirm: true,
        description: input.description,
        metadata: { user_id: input.userId, pack_id: input.pack.id, kind: input.kind },
        ...(input.returnUrl
          ? { off_session: false, use_stripe_sdk: false, return_url: input.returnUrl }
          : { off_session: true }),
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (intent.status === "succeeded") {
      await fulfillPaymentIntent(intent);
      return { status: "paid" };
    }
    const url = intent.next_action?.redirect_to_url?.url;
    if (intent.status === "requires_action" && url) return { status: "action", url };
    return { status: "failed", reason: intent.status };
  } catch (e) {
    // Carte refusée, expirée, ou vérification exigée hors session.
    console.error("chargeSavedCard", input.kind, errorText(e));
    const code = e instanceof Stripe.errors.StripeError ? (e.code ?? e.type) : "error";
    return { status: "failed", reason: code };
  }
}

// Paiement à l'usage : il faut `needed` crédits pour lancer quelque chose et
// le solde ne suffit pas. Si l'utilisateur l'a accepté (pay_as_you_go, posé
// en enregistrant sa carte) et que sa carte est là, elle est débitée de ce
// qui manque (voir usageCharge) et les crédits arrivent aussitôt au solde.
// Hors session : une vérification demandée par la banque vaut refus, et un
// refus suspend le paiement à l'usage (auto_recharge_failed). Garde-fous :
// USAGE_DAILY_MAX_CHARGES débits et USAGE_DAILY_MAX_CENTS par 24 h. Renvoie
// true si des crédits ont été ajoutés.
export async function payShortfall(userId: string, needed: number) {
  if (!stripeEnabled() || needed <= 0) return false;
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("credits_remaining, stripe_customer_id, pay_as_you_go, auto_recharge_failed")
    .eq("id", userId)
    .single();
  const customerId = profile?.stripe_customer_id;
  if (!profile?.pay_as_you_go || profile.auto_recharge_failed || !customerId) return false;
  const missing = needed - profile.credits_remaining;
  if (missing <= 0) return false;

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await admin
    .from("credit_purchases")
    .select("amount_total")
    .eq("user_id", userId)
    .eq("pack_id", "usage")
    .gte("created_at", since);
  const { credits, amount } = usageCharge(missing);
  const spent = (recent ?? []).reduce((sum, r) => sum + (r.amount_total ?? 0), 0);
  if ((recent?.length ?? 0) >= USAGE_DAILY_MAX_CHARGES || spent + amount > USAGE_DAILY_MAX_CENTS) {
    console.error("payShortfall: plafond du jour atteint", userId);
    return false;
  }

  const card = await savedCard(customerId).catch(() => null);
  if (!card) return false;
  const stripe = createStripe();
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: CREDIT_CURRENCY,
        customer: customerId,
        payment_method: card.id,
        confirm: true,
        off_session: true,
        description: `TwinPost — ${credits} crédits à l'usage`,
        metadata: { user_id: userId, kind: "usage", credits: String(credits) },
      },
      { idempotencyKey: `usage-${userId}-${crypto.randomUUID()}` },
    );
    if (intent.status === "succeeded") {
      await fulfillPaymentIntent(intent);
      return true;
    }
    console.error("payShortfall", userId, intent.status);
  } catch (e) {
    console.error("payShortfall", userId, errorText(e));
  }
  await admin.from("profiles").update({ auto_recharge_failed: true }).eq("id", userId);
  return false;
}
