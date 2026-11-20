import { Check, CreditCard, Info, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  findSubscriptionPlan,
  formatPrice,
  usageCharge,
  USAGE_MIN_CENTS,
  type BillingInterval,
} from "@/lib/credit-packs";
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
import { GENJUTSU_RATES } from "@/lib/generation";
import { CANCEL_REASONS, PAUSE_MONTHS, RETENTION_OFF_PERCENT } from "@/lib/retention";
import { safeNextPath } from "@/lib/safe-next-path";
import { createClient } from "@/lib/supabase/server";
import { BADGE } from "@/app/tier-style";
import {
  acceptRetentionOffer,
  addCard,
  cancelSubscription,
  openBillingPortal,
  pauseSubscription,
  removeCard,
  resumeSubscription,
  savePayAsYouGo,
} from "./actions";
import { TitleLines } from "@/app/title-lines";
import { PricingPlans } from "./pricing-plans";
import { TopupPacks } from "./topup-packs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.credits} — TwinPost` };
}

const ERRORS = ["unavailable", "checkout", "card", "nocard", "portal", "subscribed", "cancel"] as const;

// Voile du bandeau, sur la vidéo de fond : sombre en bas pour lire le solde.
const HERO_VEIL = "linear-gradient(to bottom, rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.25) 40%, rgb(0 0 0 / 0.78))";

export default async function CreditsPage(props: PageProps<"/dashboard/credits">) {
  const params = await props.searchParams;
  const sessionId = params.session_id;
  const intentId = params.payment_intent;
  const billing: BillingInterval = params.billing === "month" ? "month" : "year";
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
  } else if (params.canceled) {
    notice = { ok: true, text: P.notices.canceled };
  } else if (params.offer) {
    notice = { ok: true, text: fmt(P.notices.offer, { pct: RETENTION_OFF_PERCENT }) };
  } else if (params.paused) {
    notice = { ok: true, text: fmt(P.notices.paused, { months: String(params.paused) }) };
  } else if (params.resumed) {
    notice = { ok: true, text: P.notices.resumed };
  } else if (typeof params.error === "string") {
    const error = ERRORS.find((e) => e === params.error);
    if (error) {
      notice = { ok: false, text: error === "subscribed" ? P.notices.hasSubscription : P.notices[error] };
    }
  }

  // Payé depuis le tunnel d'accueil : crédits ajoutés, retour au studio où
  // le projet attend (hors du try : redirect() lève une exception).
  const paidNext = safeNextPath(params.next, "");
  if (paidNext && typeof sessionId === "string" && notice?.ok && notice.text !== P.notices.pending) {
    redirect(paidNext);
  }

  // Arrivée depuis le studio, à court de crédits pour une vidéo.
  const need = Number(params.need);
  const needNotice = Number.isInteger(need) && need > 0 ? fmt(P.notices.need, { n: need }) : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "credits_remaining, subscription_credits, subscription_credits_expire_at, stripe_customer_id, pay_as_you_go, auto_recharge_failed",
    )
    .eq("id", userId)
    .single();
  const customerId = profile?.stripe_customer_id;
  const [card, subscription] = enabled
    ? await Promise.all([
        savedCard(customerId).catch(() => null),
        activeSubscription(customerId).catch(() => null),
      ])
    : [null, null];
  const payAsYouGo = Boolean(profile?.pay_as_you_go) && !profile?.auto_recharge_failed;
  // Abonnement à jour : la résiliation prend effet à la fin de la période
  // payée et peut être annulée. Paiement en échec : elle est immédiate.
  const subscriptionPaid = subscription?.status === "active" || subscription?.status === "trialing";
  const canCancel = Boolean(subscription) && (!subscription?.ending || !subscriptionPaid);
  const subscribedPlan = subscription ? findSubscriptionPlan(subscription.planId) : undefined;
  // Clé à usage unique de l'achat en un clic (voir buyWithSavedCard).
  const nonce = crypto.randomUUID();
  const dateOf = (seconds: number) =>
    new Intl.DateTimeFormat(intl, { dateStyle: "long" }).format(new Date(seconds * 1000));
  const brand = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);
  const balance = profile?.credits_remaining ?? 0;
  // Part du solde venue de l'abonnement, perdue à la fin de la période payée.
  const expiring = Math.min(balance, profile?.subscription_credits ?? 0);
  const expiresAt = profile?.subscription_credits_expire_at;
  const usagePer100 = price(usageCharge(100).amount);

  // Parcours de résiliation (?cancel=1 puis ?cancel=2, voir lib/retention.ts).
  // Crédits d'abonnement restants, leur valeur au prix de la formule et les
  // secondes de vidéo Shinka 720p qu'ils représentent.
  const R = S.retention;
  const keptCredits = subscriptionPaid ? expiring : 0;
  const keptValue = subscribedPlan
    ? Math.round(
        (keptCredits *
          (subscription?.interval === "year" ? subscribedPlan.year / 12 : subscribedPlan.month)) /
          subscribedPlan.credits,
      )
    : 0;
  const keptSeconds = Math.floor(keptCredits / GENJUTSU_RATES.standard["720p"]);
  const offerEligible =
    subscription?.status === "active" &&
    subscription.interval === "month" &&
    !subscription.ending &&
    !subscription.retentionOfferUsed;
  const requestedStep = canCancel ? (params.cancel === "1" ? 1 : params.cancel === "2" ? 2 : 0) : 0;
  // Rien à rappeler ni à proposer : directement la confirmation.
  const cancelStep = requestedStep === 1 && keptCredits === 0 && !offerEligible ? 2 : requestedStep;

  return (
    <div>
      {/* Bandeau sur une vidéo, comme la landing : titre en deux temps,
          solde dans une carte de verre. Sombre dans les deux thèmes. */}
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0a0e] px-5 py-14 text-center text-white sm:py-20">
        <video
          src="/demos/demo-21.mp4"
          poster="/demos/demo-21.jpg"
          muted
          loop
          autoPlay
          playsInline
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20 size-full object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: HERO_VEIL }} />
        <p className="text-sm font-medium text-white/70">{P.title}</p>
        <h1 className="mx-auto mt-3 max-w-4xl font-headline text-5xl leading-[0.95] text-white sm:text-7xl">
          <TitleLines text={P.heroTitle} />
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[0.9375rem] text-white/70">{P.heroText}</p>
        <div className="mt-8 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-white/15 bg-black/40 px-5 py-3 backdrop-blur">
          <span className="text-sm text-white/60">{P.balance}</span>
          <span className="font-headline text-3xl leading-none tabular-nums">
            {balance.toLocaleString(intl)} <span className="font-sans text-sm font-normal text-white/60">{t.common.credits}</span>
          </span>
        </div>
        {expiring > 0 && expiresAt && (
          <p className="mt-3 text-sm text-white/60 tabular-nums">
            {fmt(P.expiring, { n: expiring.toLocaleString(intl), date: dateOf(Date.parse(expiresAt) / 1000) })}
          </p>
        )}
      </section>

      {notice && (
        <p
          role="status"
          className={`mt-8 rounded-2xl border px-4 py-3 text-sm ${
            notice.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </p>
      )}
      {/* Arrivée depuis le studio à court de crédits. */}
      {needNotice && !notice && (
        <p role="status" className="mt-8 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          {needNotice}
        </p>
      )}

      {/* Abonnements : Pro et Creator (3K / 6K / 9K), ou l'abonnement en cours. */}
      <section className="mt-12">
        {subscription ? (
          <div className="panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {fmt(S.current, {
                    label: subscribedPlan
                      ? `${S.plans[subscribedPlan.tier]} · ${subscribedPlan.credits.toLocaleString(intl)} ${t.common.credits}`
                      : subscription.planId,
                    period: subscription.interval === "year" ? S.yearlyLabel : S.monthlyLabel,
                  })}
                </p>
                <p className={`mt-1 text-sm ${subscriptionPaid ? "text-muted" : "text-danger"}`}>
                  {subscription.status === "past_due" || subscription.status === "unpaid"
                    ? S.pastDue
                    : subscription.renewsAt
                      ? fmt(subscription.ending ? S.ends : S.renews, { date: dateOf(subscription.renewsAt) })
                      : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {subscription.ending && subscriptionPaid && (
                  <form action={resumeSubscription}>
                    <button type="submit" className="btn btn-accent">
                      {S.resume}
                    </button>
                  </form>
                )}
                <form action={openBillingPortal}>
                  <button type="submit" className="btn btn-secondary">
                    {S.manage}
                  </button>
                </form>
              </div>
            </div>
            {/* Résilier : un petit lien discret sous la ligne, pas un bouton. */}
            {canCancel && cancelStep === 0 && (
              <p className="mt-3 text-right">
                <Link href="?cancel=1" scroll={false} className="text-xs text-faint hover:text-muted hover:underline">
                  {S.cancel}
                </Link>
              </p>
            )}

            {/* Résiliation, 1re étape : crédits perdus, offres pour rester
                (pause, remise) et « Continuer la résiliation » visible. */}
            {cancelStep === 1 && (
              <div className="mt-5 border-t border-line pt-5">
                <p className="font-semibold">{R.title}</p>
                {keptCredits > 0 && expiresAt && (
                  <>
                    <p className="mt-1 max-w-xl text-sm text-muted">
                      {fmt(R.lose, { date: dateOf(Date.parse(expiresAt) / 1000) })}
                    </p>
                    <div className="mt-4 grid max-w-xl grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface-2 py-4 text-center">
                      <div className="px-2">
                        <p className="font-headline text-3xl leading-none tabular-nums">{keptCredits.toLocaleString(intl)}</p>
                        <p className="mt-1.5 text-xs text-muted">{R.credits}</p>
                      </div>
                      <div className="px-2">
                        <p className="font-headline text-3xl leading-none tabular-nums">{price(keptValue)}</p>
                        <p className="mt-1.5 text-xs text-muted">{R.paid}</p>
                      </div>
                      <div className="px-2">
                        <p className="font-headline text-3xl leading-none tabular-nums">
                          {keptSeconds.toLocaleString(intl)} s
                        </p>
                        <p className="mt-1.5 text-xs text-muted">{R.video}</p>
                      </div>
                    </div>
                  </>
                )}

                {/* Pause : garder l'abonnement mais suspendre la facturation. */}
                {offerEligible && (
                  <div className="mt-4 max-w-xl rounded-2xl border border-line bg-surface-2 p-4">
                    <p className="font-semibold">{R.pauseTitle}</p>
                    <p className="mt-1 text-sm text-muted">{R.pauseText}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {PAUSE_MONTHS.map((m) => (
                        <form key={m} action={pauseSubscription}>
                          <input type="hidden" name="months" value={m} />
                          <button type="submit" className="btn btn-secondary">
                            {fmt(R.pauseBtn, { n: m })}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                )}

                {/* Remise sur le prochain mois. */}
                {offerEligible && subscribedPlan && (
                  <div className="mt-3 max-w-xl rounded-2xl border border-accent/40 bg-accent-soft p-4">
                    <p className="font-semibold">{fmt(R.offerTitle, { pct: RETENTION_OFF_PERCENT })}</p>
                    <p className="mt-1 text-sm text-muted">
                      {fmt(R.offerText, {
                        price: price(Math.round(subscribedPlan.month * (1 - RETENTION_OFF_PERCENT / 100))),
                        full: price(subscribedPlan.month),
                        credits: subscribedPlan.credits.toLocaleString(intl),
                      })}
                    </p>
                    <form action={acceptRetentionOffer} className="mt-3">
                      <button type="submit" className="btn btn-accent">
                        {R.offerTake}
                      </button>
                    </form>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link href="/dashboard/credits" scroll={false} className="btn btn-secondary">
                    {S.cancelKeep}
                  </Link>
                  <Link href="?cancel=2" scroll={false} className="btn btn-ghost">
                    {R.continue}
                  </Link>
                </div>
              </div>
            )}

            {/* Résiliation, 2e étape : la confirmation, qui dit quand elle prend
                effet, avec une raison facultative. */}
            {cancelStep === 2 && (
              <div className="mt-5 border-t border-line pt-5">
                <p className="font-semibold">{S.cancelTitle}</p>
                <p className="mt-1 max-w-xl text-sm text-muted">
                  {subscriptionPaid && subscription.renewsAt
                    ? fmt(S.cancelAtEnd, { date: dateOf(subscription.renewsAt) })
                    : S.cancelNow}
                </p>
                <form action={cancelSubscription} className="mt-4">
                  <fieldset>
                    <legend className="text-sm text-muted">{R.reason}</legend>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CANCEL_REASONS.map((reason) => (
                        <label key={reason} className="chip cursor-pointer has-[:checked]:border-accent has-[:checked]:text-text">
                          <input type="radio" name="reason" value={reason} className="sr-only" />
                          {R.reasons[reason]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <textarea
                    name="comment"
                    rows={3}
                    maxLength={500}
                    placeholder={R.commentPlaceholder}
                    className="mt-3 w-full max-w-xl resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="submit" className="btn btn-secondary">
                      {S.cancelConfirm}
                    </button>
                    <Link href="/dashboard/credits" scroll={false} className="btn btn-ghost">
                      {S.cancelKeep}
                    </Link>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : (
          <PricingPlans enabled={enabled} initialBilling={billing} />
        )}
      </section>

      {/* Recharges : curseur de 5 000 à 100 000, cartes de 4 000 à 500. */}
      <section id="packs" className="mt-20 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-headline text-4xl leading-none sm:text-5xl">
              <TitleLines text={P.topupsTitle} stacked={false} />
            </h2>
            <p className="mt-3 text-[0.9375rem] text-muted">{P.topupsIntro}</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Info className="size-4 shrink-0" />
            {P.topupsNoExpiry}
          </p>
        </div>
        <div className="mt-8">
          <TopupPacks card={card ? { brand: card.brand, last4: card.last4 } : null} nonce={nonce} enabled={enabled} />
        </div>
      </section>

      {/* Paiement à l'usage : la carte paie ce qui manque au lancement. */}
      <section
        id="auto"
        className="panel mt-20 scroll-mt-24 p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-headline text-4xl leading-none sm:text-5xl">{A.usageTitle}</h2>
          <span className={`${BADGE} bg-text text-bg`}>{A.recommended}</span>
        </div>
        <p className="mt-3 max-w-lg text-sm text-muted">{A.usagePitch}</p>
        <ul className="mt-5 space-y-2.5 text-sm">
          {[A.benefitBlocked, fmt(A.benefitPrice, { price: usagePer100 }), A.benefitFree].map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-accent-light" />
              {line}
            </li>
          ))}
        </ul>
        {!card ? (
          <div className="mt-7">
            <form action={addCard}>
              <button type="submit" disabled={!enabled} className="btn btn-accent w-full py-3.5 text-base sm:w-auto sm:px-8">
                <CreditCard />
                {A.activateCta}
              </button>
            </form>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
              <Lock className="size-3.5 shrink-0" />
              {A.addCardHint}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              {fmt(A.usageConsent, { price: usagePer100, min: price(USAGE_MIN_CENTS) })}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/70 px-4 py-3">
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

            <form action={savePayAsYouGo} className="mt-5 space-y-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span className="text-sm font-semibold">{A.toggleLabel}</span>
                <span className="relative inline-flex shrink-0">
                  <input type="checkbox" name="enabled" defaultChecked={payAsYouGo} className="peer sr-only" />
                  <span className="h-6 w-11 rounded-full border border-line-strong bg-surface-3 transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50" />
                  <span className="pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-checked:bg-black" />
                </span>
              </label>
              {profile?.auto_recharge_failed ? (
                <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{A.usageFailed}</p>
              ) : payAsYouGo ? (
                <p className="rounded-xl border border-success/20 bg-success/5 px-3 py-2 text-sm text-success">{A.usageOn}</p>
              ) : null}
              <button type="submit" className="btn btn-accent">
                {A.save}
              </button>
            </form>
          </>
        )}
      </section>

      <p className="mt-6 text-xs text-muted">{P.footer}</p>
      <p className="mt-1 text-xs text-faint">{P.refNote}</p>
    </div>
  );
}
