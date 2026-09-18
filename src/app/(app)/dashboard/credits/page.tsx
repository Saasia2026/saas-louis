import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CREDIT_PACKS, formatPrice } from "@/lib/credit-packs";
import { createStripe, fulfillCheckoutSession, stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { buyCredits } from "./actions";

export const metadata: Metadata = {
  title: "Crédits — TwinPost",
};

const ERRORS: Record<string, string> = {
  unavailable: "Le paiement n'est pas encore disponible.",
  checkout: "La page de paiement n'a pas pu s'ouvrir. Réessaie dans un instant.",
};

export default async function CreditsPage(props: PageProps<"/dashboard/credits">) {
  const { session_id: sessionId, error } = await props.searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/credits");

  // Retour de Stripe : les crédits sont ajoutés tout de suite, sans attendre
  // le webhook (qui ne joint pas localhost en développement).
  let notice: { ok: boolean; text: string } | null = null;
  if (typeof sessionId === "string" && stripeEnabled()) {
    try {
      const session = await createStripe().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.user_id !== auth.claims.sub) {
        notice = { ok: false, text: "Ce paiement ne correspond pas à ton compte." };
      } else if (session.payment_status === "paid") {
        await fulfillCheckoutSession(session);
        notice = { ok: true, text: "Paiement reçu, tes crédits ont été ajoutés. Merci !" };
      } else {
        notice = {
          ok: true,
          text: "Paiement en cours de validation : tes crédits arriveront dès qu'il sera confirmé.",
        };
      }
    } catch (e) {
      console.error("CreditsPage", e instanceof Error ? e.message : e);
      notice = {
        ok: false,
        text: "Impossible de vérifier le paiement pour l'instant. S'il a abouti, tes crédits arriveront automatiquement.",
      };
    }
  } else if (typeof error === "string" && ERRORS[error]) {
    notice = { ok: false, text: ERRORS[error] };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", auth.claims.sub)
    .single();
  const enabled = stripeEnabled();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl">Crédits</h1>
      <p className="mt-2 text-sm text-muted">
        Tu as <span className="text-neon-cyan">{profile?.credits_remaining ?? 0} crédits</span>. Un
        crédit = une photo, ou une seconde de vidéo (Sora 2 : 5 crédits la seconde).
      </p>

      {notice && (
        <p
          role="status"
          className={`mt-6 rounded-xl border p-4 text-sm ${
            notice.ok
              ? "border-neon-cyan/40 text-neon-cyan"
              : "border-neon-pink/40 text-neon-pink"
          }`}
        >
          {notice.text}
        </p>
      )}

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <li
            key={pack.id}
            className={`flex flex-col rounded-2xl border bg-card p-6 ${
              "highlight" in pack && pack.highlight ? "border-neon-purple" : "border-white/10"
            }`}
          >
            <h2 className="font-semibold">{pack.label}</h2>
            <p className="mt-3 font-display text-3xl">{pack.credits} crédits</p>
            <p className="mt-1 text-sm text-muted">
              {formatPrice(pack.amount)} · {formatPrice(Math.round(pack.amount / pack.credits))}{" "}
              le crédit
            </p>
            <form action={buyCredits} className="mt-6">
              <input type="hidden" name="pack" value={pack.id} />
              <button
                type="submit"
                disabled={!enabled}
                className="w-full rounded-lg bg-gradient-to-r from-neon-purple to-neon-pink px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Acheter
              </button>
            </form>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-muted">
        Paiement sécurisé par Stripe. Les crédits n&apos;expirent pas.
      </p>
    </div>
  );
}
