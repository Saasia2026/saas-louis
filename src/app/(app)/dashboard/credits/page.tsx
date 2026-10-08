import { Check, CreditCard, Plus, RefreshCw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AUTO_RECHARGE_THRESHOLDS,
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  findCreditPack,
  formatPrice,
  packMonthlyEquivalent,
  planCredits,
  subscriptionMonthly,
  subscriptionOff,
  type BillingInterval,
} from "@/lib/credit-packs";
import { SWAP_SHEET_CREDITS, swapMethodRate, swapMethodSecondsFor } from "@/lib/generation";
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
import { BADGE, OFF_BADGE, TIERS, tierCard } from "@/app/tier-style";
import { PageHeader } from "../../page-header";
import {
  addCard,
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

// Ce que la carte enregistrée permet, chacun avec sa petite icône.
const BENEFITS = [
  { key: "oneClick", icon: Zap, tile: "bg-amber-500/15 text-amber-500" },
  { key: "autoRecharge", icon: RefreshCw, tile: "bg-emerald-500/15 text-emerald-500" },
  { key: "secure", icon: ShieldCheck, tile: "bg-accent/15 text-accent" },
] as const;

// Les crédits d'une offre et ce qu'ils représentent en vidéo (720p, une
// passe, fiche d'un personnage comprise ; 15 s ; haute fidélité).
function CreditsBox({
  credits,
  color,
  title,
  P,
}: {
  credits: number;
  color: string;
  title: string;
  P: Awaited<ReturnType<typeof getDictionary>>["creditsPage"];
}) {
  const clips = Math.floor(credits / (15 * swapMethodRate() + SWAP_SHEET_CREDITS));
  const fidelity = Math.max(0, Math.floor((credits - SWAP_SHEET_CREDITS) / swapMethodRate(false, true)));
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Sparkles className="size-4 shrink-0" style={{ color }} />
        {title}
      </p>
      <ul className="mt-2 space-y-1 pl-6 text-sm text-muted tabular-nums">
        <li>{fmt(P.eqSeconds, { n: swapMethodSecondsFor(credits) })}</li>
        {clips > 0 && <li>{fmt(P.eqClips, { n: clips })}</li>}
        <li>{fmt(P.eqFidelity, { n: fidelity })}</li>
      </ul>
    </div>
  );
}

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
  } else if (params.added) {
    notice = { ok: true, text: P.notices.cardAdded };
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
  const balance = profile?.credits_remaining ?? 0;

  return (
    <div>
      <PageHeader eyebrow={P.eyebrow} title={P.title}>
        {fmt(P.intro, {
          max: swapMethodRate().toLocaleString(intl),
          hd: swapMethodRate(true).toLocaleString(intl),
          sheet: SWAP_SHEET_CREDITS,
        })}
      </PageHeader>

      {notice && (
        <p
          role="status"
          className={`mt-8 rounded-xl border px-4 py-3 text-sm ${
            notice.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </p>
      )}

      {/* Solde et moyen de paiement côte à côte. */}
      <div className="mt-8 grid animate-fade-up gap-5 lg:grid-cols-5 lg:items-start">
        <div className="panel flex flex-col p-6 lg:col-span-2">
          <p className="label">{P.balance}</p>
          <p className="mt-3 font-headline text-6xl leading-none tabular-nums">
            {balance.toLocaleString(intl)}
            <span className="ml-2 font-sans text-base font-normal normal-case text-muted">{t.common.credits}</span>
          </p>
          <p className="mt-2 text-sm text-muted tabular-nums">
            {fmt(P.eqSeconds, { n: swapMethodSecondsFor(balance).toLocaleString(intl) })}
          </p>
          <div className="mt-auto pt-6">
            <a href="#packs" className="btn btn-secondary">
              <Plus />
              {P.topUp}
            </a>
          </div>
        </div>

        <section id="auto" className="panel scroll-mt-24 p-6 lg:col-span-3">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">
              <CreditCard className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{A.title}</h2>
              <p className="mt-1 text-sm text-muted">{A.subtitle}</p>
            </div>
          </div>

          {!card ? (
            <>
              <ul className="mt-6 grid gap-5 sm:grid-cols-3">
                {BENEFITS.map(({ key, icon: Icon, tile }) => (
                  <li key={key}>
                    <span className={`flex size-9 items-center justify-center rounded-lg ${tile}`}>
                      <Icon className="size-4" />
                    </span>
                    <p className="mt-3 text-sm font-semibold">{A.benefits[key]}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{A.benefits[`${key}Desc`]}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
                <form action={addCard}>
                  <button type="submit" disabled={!enabled} className="btn btn-accent">
                    <Plus />
                    {A.addCardCta}
                  </button>
                </form>
                <p className="text-xs text-faint">{A.addCardHint}</p>
              </div>
            </>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                    <Check className="size-3.5" />
                    {A.cardSaved}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {fmt(A.cardValue, {
                      brand: brand(card.brand),
                      last4: card.last4,
                      month: String(card.expMonth).padStart(2, "0"),
                      year: String(card.expYear).slice(-2),
                    })}
                  </p>
                </div>
                <form action={removeCard}>
                  <button type="submit" className="btn btn-ghost">
                    {A.remove}
                  </button>
                </form>
              </div>

              <form action={saveAutoRecharge} className="mt-6 space-y-4 border-t border-line pt-6">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-semibold">{A.rechargeTitle}</span>
                    <span className="mt-0.5 block text-xs text-muted">{A.rechargeSubtitle}</span>
                  </span>
                  <span className="relative inline-flex shrink-0">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={Boolean(autoPack) && !profile?.auto_recharge_failed}
                      className="peer sr-only"
                    />
                    <span className="h-6 w-11 rounded-full border border-line-strong bg-surface-3 transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50" />
                    <span className="pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                  </span>
                </label>
                {profile?.auto_recharge_failed ? (
                  <p className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{A.failed}</p>
                ) : autoPack ? (
                  <p className="rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-sm text-success">
                    {fmt(A.on, {
                      pack: P.packs[autoPack.id],
                      price: price(autoPack.amount),
                      threshold: profile?.auto_recharge_threshold ?? 20,
                    })}
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="label">{A.packLabel}</span>
                    <select name="pack" defaultValue={autoPack?.id ?? "creator"} className="field mt-1">
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
                <p className="text-xs leading-relaxed text-faint">{A.consent}</p>
                <button type="submit" className="btn btn-accent">
                  {A.save}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {/* Abonnements : une teinte par offre, la réduction réelle face aux
          packs (même nombre de crédits), ce que les crédits représentent. */}
      <section className="mt-14">
        <p className="eyebrow">{S.eyebrow}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-headline text-4xl leading-none sm:text-5xl">{S.title}</h2>
            <p className="mt-3 max-w-xl text-sm text-muted">{S.intro}</p>
          </div>
          {!subscription && (
            <div className="flex rounded-xl border border-line bg-surface-2 p-1 text-sm">
              {(["month", "year"] as const).map((interval) => (
                <Link
                  key={interval}
                  href={`?billing=${interval}`}
                  scroll={false}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-semibold transition-colors ${
                    billing === interval ? "bg-accent text-white" : "text-muted hover:text-text"
                  }`}
                >
                  {interval === "year" ? S.yearly : S.monthly}
                  {interval === "year" && <span className={OFF_BADGE}>{S.yearlyBadge}</span>}
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
          <ul className="mt-8 grid gap-5 lg:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((plan) => {
              const tier = TIERS[plan.id];
              const credits = planCredits(plan, billing);
              // Référence : les mêmes crédits achetés en packs de l'offre.
              const reference = packMonthlyEquivalent(plan);
              const monthly = subscriptionMonthly(plan, billing);
              const pct = subscriptionOff(plan, billing);
              const saving = reference * 12 - (billing === "year" ? plan.year : plan.month * 12);
              return (
                <li
                  key={plan.id}
                  className="flex flex-col rounded-2xl border p-6 transition-transform duration-200 hover:-translate-y-1"
                  style={tierCard(tier.color, tier.strength)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-headline text-4xl leading-none">{S.plans[plan.id]}</h3>
                    {pct > 0 && <span className={OFF_BADGE}>{fmt(P.off, { pct })}</span>}
                    {tier.badge === "popular" && <span className={`${BADGE} bg-accent text-white`}>{P.popular}</span>}
                    {tier.badge === "best" && <span className={`${BADGE} bg-amber-400 text-black`}>{P.bestValue}</span>}
                  </div>
                  <p className="mt-2 text-sm text-muted">{P.taglines[plan.id]}</p>

                  <CreditsBox credits={credits} color={tier.color} title={fmt(billing === "year" ? S.creditsPerYear : S.creditsPerMonth, { credits })} P={P} />

                  <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-headline text-2xl text-faint line-through decoration-rose-500/80 decoration-2">
                      {price(reference)}
                    </span>
                    <span className="font-headline text-5xl leading-none">{price(monthly)}</span>
                    <span className="text-sm text-muted">/ {S.perMonth}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {fmt(P.vsPacks, { price: price(reference) })}
                    {billing === "year" && <> · {fmt(P.billedYearly, { price: price(plan.year) })}</>}
                  </p>

                  <form action={subscribe} className="mt-6">
                    <input type="hidden" name="plan" value={plan.id} />
                    <input type="hidden" name="interval" value={billing} />
                    <button
                      type="submit"
                      disabled={!enabled}
                      className={`btn w-full py-3 text-[0.9375rem] ${tier.badge === "popular" ? "btn-accent" : "btn-primary"}`}
                    >
                      {S.subscribe}
                    </button>
                  </form>
                  <p className="mt-3 rounded-lg bg-surface-2/70 py-2 text-center text-sm font-semibold">
                    {fmt(P.yearlySave, { amount: price(saving) })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Packs : le prix de référence, sans engagement. */}
      <section id="packs" className="mt-14 scroll-mt-24">
        <p className="eyebrow">{P.packsEyebrow}</p>
        <h2 className="mt-3 font-headline text-4xl leading-none sm:text-5xl">{P.packsTitle}</h2>
        <p className="mt-3 max-w-xl text-sm text-muted">{P.packsIntro}</p>
        <ul className="mt-8 grid gap-5 lg:grid-cols-3">
          {CREDIT_PACKS.map((pack, i) => {
            const tier = TIERS[pack.id];
            return (
              <li
                key={pack.id}
                className="flex animate-fade-up flex-col rounded-2xl border p-6 transition-transform duration-200 hover:-translate-y-1"
                style={{ ...tierCard(tier.color, Math.round(tier.strength / 2)), animationDelay: `${100 + i * 90}ms` }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-headline text-4xl leading-none">{P.packs[pack.id]}</h3>
                  <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-muted">{P.packTag}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{P.taglines[pack.id]}</p>

                <CreditsBox credits={pack.credits} color={tier.color} title={`${pack.credits} ${t.common.credits}`} P={P} />

                <p className="mt-6 font-headline text-5xl leading-none">{price(pack.amount)}</p>
                {card ? (
                  <div className="mt-6 space-y-2">
                    {/* Carte enregistrée : un clic, sans ressaisir la carte. */}
                    <form action={buyWithSavedCard}>
                      <input type="hidden" name="pack" value={pack.id} />
                      <input type="hidden" name="nonce" value={`${nonce}-${pack.id}`} />
                      <button type="submit" disabled={!enabled} className="btn btn-secondary w-full py-3">
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
                    <button type="submit" disabled={!enabled} className="btn btn-secondary w-full py-3">
                      {P.buy}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-6 text-xs text-muted">{P.footer}</p>
    </div>
  );
}
