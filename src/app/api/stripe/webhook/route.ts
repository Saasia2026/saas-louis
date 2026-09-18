import { createStripe, fulfillCheckoutSession } from "@/lib/stripe";

// Appelé par Stripe quand un paiement Checkout aboutit. La signature est
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

  // Un paiement différé (virement…) aboutit plus tard, par le second événement.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    try {
      await fulfillCheckoutSession(event.data.object);
    } catch (e) {
      console.error("Webhook Stripe", e instanceof Error ? e.message : e);
      // 500 : Stripe renverra l'événement plus tard.
      return new Response("Fulfillment failed", { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
}
