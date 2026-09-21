"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fmt } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import {
  AUTO_RECHARGE_THRESHOLDS,
  CREDIT_CURRENCY,
  findCreditPack,
  findSubscriptionPlan,
  planCredits,
  type BillingInterval,
} from "@/lib/credit-packs";
import {
  activeSubscription,
  chargeSavedCard,
  createStripe,
  getOrCreateCustomer,
  savedCard,
  stripeEnabled,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/dashboard/credits";

async function currentUser() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect(`/login?next=${PAGE}`);
  return {
    id: auth.claims.sub,
    email: typeof auth.claims.email === "string" ? auth.claims.email : undefined,
  };
}

async function origin() {
  return (
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  );
}

// Ouvre la page de paiement Stripe pour un pack de crédits. La carte est
// enregistrée pour les achats suivants et la recharge automatique. Les
// crédits sont ajoutés au retour (voir page.tsx) et par le webhook.
export async function buyCredits(formData: FormData) {
  const pack = findCreditPack(formData.get("pack"));
  if (!pack || !stripeEnabled()) redirect(`${PAGE}?error=unavailable`);
  const user = await currentUser();

  const [t, locale, base] = await Promise.all([
    getDictionary().then((d) => d.creditsPage),
    getLocale(),
    origin(),
  ]);
  let url: string | null;
  try {
    const customer = await getOrCreateCustomer(user.id, user.email);
    const session = await createStripe().checkout.sessions.create({
      mode: "payment",
      // Page de paiement Stripe dans la langue du site.
      locale,
      customer,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CREDIT_CURRENCY,
            unit_amount: pack.amount,
            product_data: {
              name: fmt(t.productName, { credits: pack.credits, label: t.packs[pack.id] }),
            },
          },
        },
      ],
      // Carte gardée pour payer ensuite sans la ressaisir.
      payment_intent_data: { setup_future_usage: "off_session" },
      client_reference_id: user.id,
      metadata: { user_id: user.id, pack_id: pack.id },
      success_url: `${base}${PAGE}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${PAGE}`,
    });
    url = session.url;
  } catch (e) {
    console.error("buyCredits", e instanceof Error ? e.message : e);
    url = null;
  }

  redirect(url ?? `${PAGE}?error=checkout`);
}

// Achat en un clic avec la carte enregistrée. Si la banque demande une
// vérification, le client y est envoyé puis revient sur la page des crédits.
// `nonce` : posé à l'affichage de la page, il empêche un double clic de payer
// deux fois.
export async function buyWithSavedCard(formData: FormData) {
  const pack = findCreditPack(formData.get("pack"));
  const nonce = String(formData.get("nonce") ?? "").slice(0, 64);
  if (!pack || !nonce || !stripeEnabled()) redirect(`${PAGE}?error=unavailable`);
  const user = await currentUser();

  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  const customerId = profile?.stripe_customer_id;
  const card = customerId ? await savedCard(customerId).catch(() => null) : null;
  // Plus de carte : on repasse par la page de paiement.
  if (!customerId || !card) return buyCredits(formData);

  const t = await getDictionary();
  const result = await chargeSavedCard({
    userId: user.id,
    customerId,
    card,
    pack,
    kind: "oneclick",
    description: fmt(t.creditsPage.productName, {
      credits: pack.credits,
      label: t.creditsPage.packs[pack.id],
    }),
    returnUrl: `${await origin()}${PAGE}`,
    idempotencyKey: `oneclick-${user.id}-${nonce}`,
  });
  if (result.status === "action") redirect(result.url);
  redirect(result.status === "paid" ? `${PAGE}?paid=1` : `${PAGE}?error=card`);
}

// Abonnement mensuel ou annuel, payé par Stripe Checkout. Les crédits
// arrivent avec chaque facture payée (voir fulfillInvoice).
export async function subscribe(formData: FormData) {
  const plan = findSubscriptionPlan(formData.get("plan"));
  const interval: BillingInterval = formData.get("interval") === "year" ? "year" : "month";
  if (!plan || !stripeEnabled()) redirect(`${PAGE}?error=unavailable`);
  const user = await currentUser();

  const [t, locale, base] = await Promise.all([getDictionary(), getLocale(), origin()]);
  const S = t.creditsPage.subscriptions;
  const customer = await getOrCreateCustomer(user.id, user.email).catch((e) => {
    console.error("subscribe", e instanceof Error ? e.message : e);
    return null;
  });
  if (!customer) redirect(`${PAGE}?error=checkout`);
  // Déjà abonné : changement ou résiliation dans l'espace client Stripe
  // (hors du try : redirect() lève une exception).
  if (await activeSubscription(customer).catch(() => null)) return openBillingPortal();

  let url: string | null;
  try {
    const metadata = { user_id: user.id, plan_id: plan.id, interval };
    const session = await createStripe().checkout.sessions.create({
      mode: "subscription",
      locale,
      customer,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CREDIT_CURRENCY,
            unit_amount: plan[interval],
            recurring: { interval },
            product_data: {
              name: fmt(S.productName, {
                label: S.plans[plan.id],
                credits: planCredits(plan, interval),
                period: interval === "year" ? S.perYear : S.perMonth,
              }),
            },
          },
        },
      ],
      subscription_data: { metadata },
      metadata,
      client_reference_id: user.id,
      success_url: `${base}${PAGE}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}${PAGE}?billing=${interval}`,
    });
    url = session.url;
  } catch (e) {
    console.error("subscribe", e instanceof Error ? e.message : e);
    url = null;
  }
  redirect(url ?? `${PAGE}?error=checkout`);
}

// Espace client Stripe : changer de carte, de formule, résilier, factures.
export async function openBillingPortal() {
  if (!stripeEnabled()) redirect(`${PAGE}?error=unavailable`);
  const user = await currentUser();
  let url: string | null = null;
  try {
    const customer = await getOrCreateCustomer(user.id, user.email);
    const session = await createStripe().billingPortal.sessions.create({
      customer,
      locale: await getLocale(),
      return_url: `${await origin()}${PAGE}`,
    });
    url = session.url;
  } catch (e) {
    console.error("openBillingPortal", e instanceof Error ? e.message : e);
  }
  redirect(url ?? `${PAGE}?error=portal`);
}

// Réglages de la recharge automatique. L'activer suppose une carte
// enregistrée ; la réactiver après un refus efface le refus.
export async function saveAutoRecharge(formData: FormData) {
  const user = await currentUser();
  const enabled = formData.get("enabled") === "on";
  const pack = findCreditPack(formData.get("pack"));
  const threshold = Number(formData.get("threshold"));
  if (!AUTO_RECHARGE_THRESHOLDS.includes(threshold as (typeof AUTO_RECHARGE_THRESHOLDS)[number])) {
    redirect(`${PAGE}?error=unavailable`);
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  if (enabled && !(await savedCard(profile?.stripe_customer_id).catch(() => null))) {
    redirect(`${PAGE}?error=nocard`);
  }
  if (enabled && !pack) redirect(`${PAGE}?error=unavailable`);

  const { error } = await admin
    .from("profiles")
    .update({
      auto_recharge_pack: enabled ? pack!.id : null,
      auto_recharge_threshold: threshold,
      auto_recharge_failed: false,
    })
    .eq("id", user.id);
  if (error) {
    console.error("saveAutoRecharge", error.message);
    redirect(`${PAGE}?error=unavailable`);
  }
  redirect(`${PAGE}?saved=1#auto`);
}

// Retire la carte enregistrée (et donc la recharge automatique). Refusé
// pendant un abonnement : il la débite à chaque renouvellement.
export async function removeCard() {
  const user = await currentUser();
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  const customerId = profile?.stripe_customer_id;
  if (!customerId) redirect(PAGE);
  if (await activeSubscription(customerId)) redirect(`${PAGE}?error=subscribed#auto`);

  const stripe = createStripe();
  const { data: cards } = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 });
  await Promise.all(cards.map((c) => stripe.paymentMethods.detach(c.id)));
  await admin
    .from("profiles")
    .update({ auto_recharge_pack: null, auto_recharge_failed: false })
    .eq("id", user.id);
  redirect(`${PAGE}?removed=1#auto`);
}
