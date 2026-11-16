"use client";

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  SUBSCRIPTION_PLANS,
  formatPrice,
  packMonthlyEquivalent,
  planCredits,
  subscriptionMonthly,
  subscriptionOff,
  subscriptionYearlySaving,
  type BillingInterval,
  type SubscriptionPlan,
} from "@/lib/credit-packs";
import { SHORT_CLIP_SECONDS, swapShortClipsFor } from "@/lib/generation";
import { subscribe } from "./actions";
import { HOT_PILL, LIME, PINK, PLAN_LOOK } from "./pricing-look";

const PRO = SUBSCRIPTION_PLANS.filter((p) => p.tier === "pro");
const CREATOR = SUBSCRIPTION_PLANS.filter((p) => p.tier === "creator");
const MAX_YEARLY_OFF = Math.max(...SUBSCRIPTION_PLANS.map((p) => subscriptionOff(p, "year")));

// Les deux abonnements, façon page de prix Higgsfield : la carte colorée
// (nom, prix barré face aux recharges, bouton avec la réduction réelle),
// puis les crédits et ce qu'ils donnent en vidéos.
export function PricingPlans({ enabled, initialBilling }: { enabled: boolean; initialBilling: BillingInterval }) {
  const { t, locale } = useI18n();
  const P = t.creditsPage;
  const S = P.subscriptions;
  const [billing, setBilling] = useState<BillingInterval>(initialBilling);
  const [creatorSize, setCreatorSize] = useState(0);

  return (
    <div>
      <div className="flex justify-center">
        <div className="rail flex gap-1 border border-line text-sm">
          {(["month", "year"] as const).map((interval) => (
            <button
              key={interval}
              type="button"
              onClick={() => setBilling(interval)}
              aria-pressed={billing === interval}
              className={`flex items-center gap-2 rounded-full px-4 py-2 font-semibold transition-colors ${
                billing === interval ? "bg-text text-bg" : "text-muted hover:text-text"
              }`}
            >
              {interval === "year" ? S.yearly : S.monthly}
              {interval === "year" && <span className={HOT_PILL}>{fmt(P.off, { pct: MAX_YEARLY_OFF })}</span>}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-8 grid gap-6 md:grid-cols-2">
        <PlanCard plan={PRO[0]} billing={billing} enabled={enabled} popular locale={locale} />
        <PlanCard
          plan={CREATOR[creatorSize]}
          billing={billing}
          enabled={enabled}
          locale={locale}
          sizes={
            <div role="radiogroup" aria-label={P.sizeLabel} className="flex gap-0.5 rounded-full bg-black/20 p-1 text-sm font-bold">
              {CREATOR.map((plan, i) => (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={creatorSize === i}
                  onClick={() => setCreatorSize(i)}
                  className={`rounded-full px-3 py-1 tabular-nums transition-colors ${
                    creatorSize === i ? "bg-white text-[#9b1659] shadow-sm" : "text-white/80 hover:text-white"
                  }`}
                >
                  {plan.credits / 1000}K
                </button>
              ))}
            </div>
          }
        />
      </ul>
    </div>
  );
}

function PlanCard({
  plan,
  billing,
  enabled,
  popular,
  sizes,
  locale,
}: {
  plan: SubscriptionPlan;
  billing: BillingInterval;
  enabled: boolean;
  popular?: boolean;
  sizes?: React.ReactNode;
  locale: keyof typeof INTL_LOCALES;
}) {
  const { t } = useI18n();
  const P = t.creditsPage;
  const S = P.subscriptions;
  const intl = INTL_LOCALES[locale];
  const price = (amount: number) => formatPrice(amount, intl);
  const look = PLAN_LOOK[plan.tier];
  const dot = plan.tier === "pro" ? LIME : PINK;
  const monthly = subscriptionMonthly(plan, billing);
  const reference = packMonthlyEquivalent(plan);
  const pct = subscriptionOff(plan, billing);
  const saving = subscriptionYearlySaving(plan, billing);
  const credits = planCredits(plan, billing);
  const n = (x: number) => x.toLocaleString(intl);

  return (
    <li className="flex flex-col">
      <div className="relative overflow-hidden rounded-[1.75rem] p-6 sm:p-7" style={look}>
        {/* Reflet en haut de la carte. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-headline text-5xl leading-none">{S.plans[plan.tier]}</h3>
            {popular && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/15 px-3 py-1 text-sm font-bold">
                <Sparkles className="size-4" />
                {P.mostPopular}
              </span>
            )}
            {sizes}
          </div>
          <p className="mt-2 text-[0.9375rem] font-medium opacity-80">{P.taglines[plan.tier]}</p>

          <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {pct > 0 && (
              <span className="font-headline text-3xl leading-none opacity-55 line-through decoration-2">{price(reference)}</span>
            )}
            <span className="font-headline text-6xl leading-none tabular-nums">{price(monthly)}</span>
            <span className="text-base font-semibold opacity-80">
              {P.perMonthShort}, {billing === "year" ? fmt(P.billedYearly, { price: price(plan.year) }) : P.billedMonthly}
            </span>
          </div>

          <form action={subscribe} className="mt-6">
            <input type="hidden" name="plan" value={plan.id} />
            <input type="hidden" name="interval" value={billing} />
            <button
              type="submit"
              disabled={!enabled}
              className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-white px-5 py-4 text-lg font-bold text-[#0b0b0f] shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
            >
              {S.subscribe}
              {pct > 0 && (
                <span className={`${HOT_PILL} text-sm`}>
                  {fmt(P.off, { pct })}
                  {saving > 0 && (
                    <>
                      <span aria-hidden className="opacity-60">|</span>
                      {fmt(P.save, { amount: price(saving) })}
                    </>
                  )}
                </span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Les crédits et ce qu'ils donnent, en arbre comme chez Higgsfield. */}
      <div className="px-2 pt-6">
        <p className="flex items-center gap-3 text-lg">
          <span className="grid size-6 place-items-center rounded-full" style={{ background: dot }}>
            <span className="size-2 rounded-full bg-black/70" />
          </span>
          <span className="font-bold tabular-nums">
            {fmt(billing === "year" ? S.creditsPerYear : S.creditsPerMonth, { credits: n(credits) })}
          </span>
        </p>
        <ul className="mt-2 ml-3 space-y-2 border-l-2 pl-5 text-[0.9375rem] tabular-nums" style={{ borderColor: dot }}>
          <li>
            {fmt(P.clipsStd, { n: n(swapShortClipsFor(credits, { model: "standard" })), s: SHORT_CLIP_SECONDS })}
          </li>
          <li className="text-muted">
            {fmt(P.clipsMax, { n: n(swapShortClipsFor(credits)), s: SHORT_CLIP_SECONDS })}
          </li>
        </ul>

        <div className="mt-6 border-t border-line pt-5">
          <p className="text-sm text-muted">{P.included}</p>
          <ul className="mt-3 space-y-2.5 text-[0.9375rem]">
            {P.features.map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: dot }}>
                  <Check className="size-3.5 text-black" strokeWidth={3} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}
