import "server-only";
import Stripe from "stripe";
import { findCreditPack } from "@/lib/credit-packs";
import { createAdminClient } from "@/lib/supabase/admin";

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function createStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant");
  return new Stripe(key);
}

// Crédite le compte d'une session Checkout payée. Idempotent : le webhook et
// le retour sur la page de succès peuvent l'appeler pour la même session.
// Le pack et l'utilisateur viennent des métadonnées posées à la création de
// la session (côté serveur), jamais de l'URL.
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return false;
  const userId = session.metadata?.user_id;
  const pack = findCreditPack(session.metadata?.pack_id);
  if (!userId || !pack) {
    console.error("fulfillCheckoutSession: métadonnées manquantes", session.id);
    return false;
  }

  const { data, error } = await createAdminClient().rpc("apply_credit_purchase", {
    p_session_id: session.id,
    p_user_id: userId,
    p_pack_id: pack.id,
    p_credits: pack.credits,
    p_amount_total: session.amount_total ?? 0,
    p_currency: session.currency ?? "",
  });
  if (error) throw error;
  return data;
}
