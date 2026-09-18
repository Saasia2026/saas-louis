import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CREDIT_PACKS, formatPrice } from "@/lib/credit-packs";
import { createStripe, fulfillCheckoutSession, stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
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
    <div>
      <PageHeader eyebrow="Facturation" title="Crédits">
        Un crédit = une seconde de vidéo (Sora 2 : 5 crédits la seconde). Paie seulement ce
        que tu utilises, sans abonnement.
      </PageHeader>

      <div className="mt-8 flex animate-fade-up flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Solde actuel</p>
          <p className="mt-1 font-wide text-4xl">
            {profile?.credits_remaining ?? 0}
            <span className="ml-2 font-sans text-base font-normal text-muted">crédits</span>
          </p>
        </div>
        <p className="label">Paiement sécurisé par Stripe</p>
      </div>

      {notice && (
        <p
          role="status"
          className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
            notice.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </p>
      )}

      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        {CREDIT_PACKS.map((pack, i) => {
          const featured = "highlight" in pack && pack.highlight;
          return (
            <li
              key={pack.id}
              className={`panel lift relative flex animate-fade-up flex-col p-6 ${featured ? "glow" : ""}`}
              style={{ animationDelay: `${100 + i * 90}ms` }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">{pack.label}</h2>
                {featured && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white shadow-[0_0_16px_var(--accent)]">
                    Populaire
                  </span>
                )}
              </div>
              <p className="mt-6 font-wide text-4xl">{formatPrice(pack.amount)}</p>
              <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Crédits</dt>
                  <dd className="font-medium tabular-nums">{pack.credits}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Prix du crédit</dt>
                  <dd className="font-medium tabular-nums">{formatPrice(Math.round(pack.amount / pack.credits))}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Plans Sora 2 de 8 s</dt>
                  <dd className="font-medium tabular-nums">{Math.floor(pack.credits / 40)}</dd>
                </div>
              </dl>
              <form action={buyCredits} className="mt-6">
                <input type="hidden" name="pack" value={pack.id} />
                <button
                  type="submit"
                  disabled={!enabled}
                  className={`btn w-full ${featured ? "btn-primary" : "btn-secondary"}`}
                >
                  Acheter
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-xs text-muted">
        Les crédits n&apos;expirent pas. Une génération qui échoue te rend ses crédits.
      </p>
    </div>
  );
}
