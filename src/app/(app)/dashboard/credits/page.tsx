import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AUTO_RECHARGE_THRESHOLDS,
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  findCreditPack,
  formatPrice,
  planCredits,
  type BillingInterval,
} from "@/lib/credit-packs";
import { SWAP_ENGINES, SWAP_SHEET_CREDITS, swapSecondsFor } from "@/lib/generation";
import {
  activeSubscription,
  createStripe,
  fulfillCheckoutSession,
  fulfillInvoice,
  fulfillPaymentIntent,
  savedCard,
  stripeEnabled,
} from "@/lib/stripe";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
import {
  buyCredits,
  buyWithSavedCard,
  openBillingPortal,
  removeCard,
  saveAutoRecharge,
  subscribe,
} from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.credits} — TwinPost` };
}

const ERRORS = ["unavailable", "checkout", "card", "nocard", "portal", "subscribed"] as const;

export default async function CreditsPage(props: PageProps<"/dashboard/credits">) {
  const params = await props.searchParams;
  const sessionId = params.session_id;
  const intentId = params.payment_intent;
  const billing: BillingInterval = params.billing === "year" ? "year" : "month";
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const P = t.creditsPage;
  const S = P.subscriptions;
  const A = P.auto;
  const intl = INTL_LOCALES[locale];
  const price = (amount: number) => formatPrice(amount, intl);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/credits");
  const userId = auth.claims.sub;
  const enabled = stripeEnabled();

  // Retour de Stripe : les crédits sont ajoutés tout de suite, sans attendre
  // le webhook (qui ne joint pas localhost en développement). Tout est
  // idempotent : le webhook peut passer avant ou après.
  let notice: { ok: boolean; text: string } | null = null;
  if (typeof sessionId === "string" && enabled) {
    try {
      const session = await createStripe().checkout.sessions.retrieve(sessionId);
      if (session.metadata?.user_id !== userId) {
        notice = { ok: false, text: P.notices.mismatch };
      } else if (session.mode === "subscription") {
        const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id;
        const invoice = invoiceId ? await createStripe().invoices.retrieve(invoiceId) : null;
        if (invoice?.status === "paid") {
          await fulfillInvoice(invoice);
          notice = { ok: true, text: P.notices.subscribed };
        } else {
          notice = { ok: true, text: P.notices.pending };
        }
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
  } else if (typeof intentId === "string" && enabled) {
    // Retour de la vérification bancaire d'un achat en un clic.
    try {
      const intent = await createStripe().paymentIntents.retrieve(intentId);
      if (intent.metadata?.user_id !== userId) {
        notice = { ok: false, text: P.notices.mismatch };
      } else if (intent.status === "succeeded") {
        await fulfillPaymentIntent(intent);
        notice = { ok: true, text: P.notices.paid };
      } else if (intent.status === "processing") {
        notice = { ok: true, text: P.notices.pending };
      } else {
        notice = { ok: false, text: P.notices.card };
      }
    } catch (e) {
      console.error("CreditsPage", e instanceof Error ? e.message : e);
      notice = { ok: false, text: P.notices.verifyFailed };
    }
  } else if (params.paid) {
    notice = { ok: true, text: P.notices.paid };
  } else if (params.saved) {
    notice = { ok: true, text: P.notices.saved };
  } else if (params.removed) {
    notice = { ok: true, text: P.notices.removed };
  } else if (typeof params.error === "string") {
    const error = ERRORS.find((e) => e === params.error);
    if (error) {
      notice = { ok: false, text: error === "subscribed" ? P.notices.hasSubscription : P.notices[error] };
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining, stripe_customer_id, auto_recharge_pack, auto_recharge_threshold, auto_recharge_failed")
    .eq("id", userId)
    .single();
  const customerId = profile?.stripe_customer_id;
  const [card, subscription] = enabled
    ? await Promise.all([
        savedCard(customerId).catch(() => null),
        activeSubscription(customerId).catch(() => null),
      ])
    : [null, null];
  const autoPack = findCreditPack(profile?.auto_recharge_pack);
  // Clé à usage unique de l'achat en un clic (voir buyWithSavedCard).
  const nonce = crypto.randomUUID();
  const dateOf = (seconds: number) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "long" }).format(new Date(seconds * 1000));
  const brand = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

  return (
    <div>
      <PageHeader eyebrow={P.eyebrow} title={P.title}>
        {fmt(P.intro, {
          max: SWAP_ENGINES.genjutsu.creditsPerSecond.toLocaleString(intl),
          budget: SWAP_ENGINES.kling.creditsPerSecond.toLocaleString(intl),
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

      {/* Abonnements */}
      <section className="mt-12">
        <p className="eyebrow">{S.eyebrow}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{S.title}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">{S.intro}</p>
          </div>
          {!subscription && (
            <div className="flex rounded-full border border-line bg-surface-2 p-1 text-sm">
              {(["month", "year"] as const).map((interval) => (
                <Link
                  key={interval}
                  href={`?billing=${interval}`}
                  scroll={false}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 transition-colors ${
                    billing === interval ? "bg-accent text-white" : "text-muted hover:text-text"
                  }`}
                >
                  {interval === "year" ? S.yearly : S.monthly}
                  {interval === "year" && (
                    <span className={`text-xs ${billing === "year" ? "text-white/80" : "text-accent-light"}`}>
                      {S.yearlyBadge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {subscription ? (
          <div className="panel glow mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="font-semibold">
                {fmt(S.current, {
                  label: S.plans[subscription.planId as keyof typeof S.plans] ?? subscription.planId,
                  period: subscription.interval === "year" ? S.yearlyLabel : S.monthlyLabel,
                })}
              </p>
              <p className={`mt-1 text-sm ${subscription.status === "active" || subscription.status === "trialing" ? "text-muted" : "text-danger"}`}>
                {subscription.status === "past_due" || subscription.status === "unpaid"
                  ? S.pastDue
                  : subscription.renewsAt
                    ? fmt(subscription.cancelAtPeriodEnd ? S.ends : S.renews, { date: dateOf(subscription.renewsAt) })
                    : null}
              </p>
            </div>
            <form action={openBillingPortal}>
              <button type="submit" className="btn btn-secondary">
                {S.manage}
              </button>
            </form>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {SUBSCRIPTION_PLANS.map((plan) => {
              const featured = "highlight" in plan && plan.highlight;
              const credits = planCredits(plan, billing);
              return (
                <li key={plan.id} className={`panel lift flex flex-col p-6 ${featured ? "glow" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{S.plans[plan.id]}</h3>
                    {featured && (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white">
                        {P.popular}
                      </span>
                    )}
                  </div>
                  <p className="mt-6 font-wide text-4xl">
                    {price(plan[billing])}
                    <span className="ml-1 font-sans text-base font-normal text-muted">
                      / {billing === "year" ? S.perYear : S.perMonth}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {billing === "year"
                      ? fmt(S.equivalent, { price: price(Math.round(plan.year / 12)) })
                      : " "}
                  </p>
                  <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
                    <div className="flex justify-between gap-4 py-2.5">
                      <dt className="text-muted">
                        {fmt(billing === "year" ? S.creditsPerYear : S.creditsPerMonth, { credits })}
                      </dt>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <dt className="text-muted">{P.perCreditRow}</dt>
                      <dd className="font-medium tabular-nums">{price(Math.round((plan[billing] / credits) * 100) / 100)}</dd>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <dt className="text-muted">{P.secondsMaxRow}</dt>
                      <dd className="font-medium tabular-nums">{swapSecondsFor(credits, "genjutsu")}</dd>
                    </div>
                  </dl>
                  <form action={subscribe} className="mt-6">
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="interval" value={billing} />
                    <button
                      type="submit"
                      disabled={!enabled}
                      className={`btn w-full ${featured ? "btn-accent" : "btn-secondary"}`}
                    >
                      {S.subscribe}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Packs */}
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {CREDIT_PACKS.map((pack, i) => {
          const featured = "highlight" in pack && pack.highlight;
          return (
            <li
              key={pack.id}
              className={`panel lift relative flex animate-fade-up flex-col p-6 ${featured ? "glow" : ""}`}
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
                  <dd className="font-medium tabular-nums">{price(Math.round((pack.amount / pack.credits) * 100) / 100)}</dd>
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
              {card ? (
                <div className="mt-6 space-y-2">
                  {/* Carte enregistrée : un clic, sans ressaisir la carte. */}
                  <form action={buyWithSavedCard}>
                    <input type="hidden" name="pack" value={pack.id} />
                    <input type="hidden" name="nonce" value={`${nonce}-${pack.id}`} />
                    <button
                      type="submit"
                      disabled={!enabled}
                      className={`btn w-full ${featured ? "btn-accent" : "btn-secondary"}`}
                    >
                      {fmt(P.payWith, { brand: brand(card.brand), last4: card.last4 })}
                    </button>
                  </form>
                  <form action={buyCredits}>
                    <input type="hidden" name="pack" value={pack.id} />
                    <button type="submit" disabled={!enabled} className="w-full text-center text-xs text-muted hover:text-text">
                      {P.otherCard}
                    </button>
                  </form>
                </div>
              ) : (
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
              )}
            </li>
          );
        })}
      </ul>

      {/* Paiement automatique */}
      <section id="auto" className="mt-12 scroll-mt-24">
        <p className="eyebrow">{A.eyebrow}</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">{A.title}</h2>
        <div className="panel mt-6 divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="label">{A.card}</p>
              <p className="mt-1 text-sm">
                {card
                  ? fmt(A.cardValue, {
                      brand: brand(card.brand),
                      last4: card.last4,
                      month: String(card.expMonth).padStart(2, "0"),
                      year: String(card.expYear).slice(-2),
                    })
                  : A.noCard}
              </p>
            </div>
            {card && (
              <form action={removeCard}>
                <button type="submit" className="btn btn-ghost text-sm">
                  {A.remove}
                </button>
              </form>
            )}
          </div>

          <form action={saveAutoRecharge} className="space-y-4 p-5">
            {profile?.auto_recharge_failed ? (
              <p className="text-sm text-danger">{A.failed}</p>
            ) : autoPack ? (
              <p className="text-sm text-success">
                {fmt(A.on, {
                  pack: P.packs[autoPack.id],
                  price: price(autoPack.amount),
                  threshold: profile?.auto_recharge_threshold ?? 20,
                })}
              </p>
            ) : null}
            <label className="flex items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={Boolean(autoPack) && !profile?.auto_recharge_failed}
                disabled={!card}
                className="size-4 accent-[var(--accent)]"
              />
              {A.enable}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="label">{A.packLabel}</span>
                <select
                  name="pack"
                  defaultValue={autoPack?.id ?? "creator"}
                  disabled={!card}
                  className="field mt-1"
                >
                  {CREDIT_PACKS.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {P.packs[pack.id]} · {pack.credits} {t.common.credits} · {price(pack.amount)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="label">{A.thresholdLabel}</span>
                <select
                  name="threshold"
                  defaultValue={String(profile?.auto_recharge_threshold ?? 20)}
                  disabled={!card}
                  className="field mt-1"
                >
                  {AUTO_RECHARGE_THRESHOLDS.map((n) => (
                    <option key={n} value={n}>
                      {fmt(A.thresholdOption, { credits: n })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs leading-relaxed text-muted">{A.consent}</p>
            <button type="submit" disabled={!card} className="btn btn-secondary">
              {A.save}
            </button>
          </form>
        </div>
      </section>

      <p className="mt-6 text-xs text-muted">{P.footer}</p>
    </div>
  );
}
