import {
  createStripe,
  fulfillCheckoutSession,
  fulfillInvoice,
  fulfillPaymentIntent,
} from "@/lib/stripe";

// Appelé par Stripe quand un paiement aboutit : pack payé par Checkout,
// facture d'abonnement (création et renouvellements), débit de la carte
// enregistrée (achat en un clic après vérification bancaire, recharge
// automatique). La signature est
// vérifiée sur le corps brut de la requête.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Webhook Stripe : STRIPE_WEBHOOK_SECRET manquant");
    return new Response("Webhook not configured", { status: 500 });
  }

  const stripe = createStripe();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    // Un paiement différé (virement…) aboutit plus tard, par le second événement.
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await fulfillCheckoutSession(event.data.object);
    } else if (event.type === "invoice.paid") {
      await fulfillInvoice(event.data.object);
    } else if (event.type === "payment_intent.succeeded") {
      await fulfillPaymentIntent(event.data.object);
    }
  } catch (e) {
    console.error("Webhook Stripe", event.type, e instanceof Error ? e.message : e);
    // 500 : Stripe renverra l'événement plus tard.
    return new Response("Fulfillment failed", { status: 500 });
  }

  return new Response(null, { status: 204 });
}
