"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CREDIT_CURRENCY, findCreditPack } from "@/lib/credit-packs";
import { createStripe, stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

// Ouvre la page de paiement Stripe pour un pack de crédits. Les crédits sont
// ajoutés au retour (voir page.tsx) et par le webhook.
export async function buyCredits(formData: FormData) {
  const pack = findCreditPack(formData.get("pack"));
  if (!pack || !stripeEnabled()) redirect("/dashboard/credits?error=unavailable");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/credits");

  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let url: string | null;
  try {
    const session = await createStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CREDIT_CURRENCY,
            unit_amount: pack.amount,
            product_data: { name: `TwinPost · ${pack.credits} crédits (${pack.label})` },
          },
        },
      ],
      client_reference_id: auth.claims.sub,
      customer_email: typeof auth.claims.email === "string" ? auth.claims.email : undefined,
      metadata: { user_id: auth.claims.sub, pack_id: pack.id },
      success_url: `${origin}/dashboard/credits?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/credits`,
    });
    url = session.url;
  } catch (e) {
    console.error("buyCredits", e instanceof Error ? e.message : e);
    url = null;
  }

  redirect(url ?? "/dashboard/credits?error=checkout");
}
