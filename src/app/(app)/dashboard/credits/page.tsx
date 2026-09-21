import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CREDIT_PACKS, formatPrice } from "@/lib/credit-packs";
import { SWAP_ENGINES, SWAP_SHEET_CREDITS, swapSecondsFor } from "@/lib/generation";
import { createStripe, fulfillCheckoutSession, stripeEnabled } from "@/lib/stripe";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
import { buyCredits } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.credits} — TwinPost` };
}

export default async function CreditsPage(props: PageProps<"/dashboard/credits">) {
  const { session_id: sessionId, error } = await props.searchParams;
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const P = t.creditsPage;
  const price = (amount: number) => formatPrice(amount, INTL_LOCALES[locale]);
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
        notice = { ok: false, text: P.notices.mismatch };
      } else if (session.payment_status === "paid") {
        await fulfillCheckoutSession(session);
        notice = { ok: true, text: P.notices.paid };
      } else {
        notice = { ok: true, text: P.notices.pending };
      }
    } catch (e) {
      console.error("CreditsPage", e instanceof Error ? e.message : e);
      notice = { ok: false, text: P.notices.verifyFailed };
    }
  } else if (error === "unavailable" || error === "checkout") {
    notice = { ok: false, text: P.notices[error] };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", auth.claims.sub)
    .single();
  const enabled = stripeEnabled();

  return (
    <div>
      <PageHeader eyebrow={P.eyebrow} title={P.title}>
        {fmt(P.intro, {
          max: SWAP_ENGINES.genjutsu.creditsPerSecond.toLocaleString(INTL_LOCALES[locale]),
          budget: SWAP_ENGINES.kling.creditsPerSecond.toLocaleString(INTL_LOCALES[locale]),
          sheet: SWAP_SHEET_CREDITS,
        })}
      </PageHeader>

      <div className="mt-8 flex animate-fade-up flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">{P.balance}</p>
          <p className="mt-1 font-wide text-5xl">
            {profile?.credits_remaining ?? 0}
            <span className="ml-2 font-sans text-base font-normal text-muted">{t.common.credits}</span>
          </p>
        </div>
        <p className="label">{P.secure}</p>
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
              className={`panel lift spotlight relative flex animate-fade-up flex-col p-6 ${featured ? "glow" : ""}`}
              style={{ animationDelay: `${100 + i * 90}ms` }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">{P.packs[pack.id]}</h2>
                {featured && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white">
                    {P.popular}
                  </span>
                )}
              </div>
              <p className="mt-6 font-wide text-4xl">{price(pack.amount)}</p>
              <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">{P.creditsRow}</dt>
                  <dd className="font-medium tabular-nums">{pack.credits}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">{P.perCreditRow}</dt>
                  <dd className="font-medium tabular-nums">{price(Math.round(pack.amount / pack.credits))}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">{P.secondsMaxRow}</dt>
                  <dd className="font-medium tabular-nums">{swapSecondsFor(pack.credits, "genjutsu")}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">{P.secondsBudgetRow}</dt>
                  <dd className="font-medium tabular-nums">{swapSecondsFor(pack.credits, "kling")}</dd>
                </div>
              </dl>
              <form action={buyCredits} className="mt-6">
                <input type="hidden" name="pack" value={pack.id} />
                <button
                  type="submit"
                  disabled={!enabled}
                  className={`btn w-full ${featured ? "btn-accent" : "btn-secondary"}`}
                >
                  {P.buy}
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-xs text-muted">
        {P.footer}
      </p>
    </div>
  );
}
