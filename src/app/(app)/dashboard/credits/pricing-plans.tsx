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
import { subscribe } from "./actions";
import s from "./credits.module.css";

// Vidéo de fond de chaque abonnement (sans extension).
const PLAN_VIDEO = { pro: "/demos/demo-09", creator: "/demos/demo-20" } as const;

const PRO = SUBSCRIPTION_PLANS.filter((p) => p.tier === "pro");
const CREATOR = SUBSCRIPTION_PLANS.filter((p) => p.tier === "creator");
const MAX_YEARLY_OFF = Math.max(...SUBSCRIPTION_PLANS.map((p) => subscriptionOff(p, "year")));

// Les deux abonnements, au style de la landing : une carte sur une vidéo
// (nom, accroche en italique, prix barré face aux recharges, bouton blanc
// avec la réduction réelle), puis les crédits et ce qui est compris.
export function PricingPlans({ enabled, initialBilling }: { enabled: boolean; initialBilling: BillingInterval }) {
  const { t, locale } = useI18n();
  const P = t.creditsPage;
  const S = P.subscriptions;
  const [billing, setBilling] = useState<BillingInterval>(initialBilling);
  const [creatorSize, setCreatorSize] = useState(0);

  return (
    <div>
      <div className="flex justify-center">
        <div className="rail flex gap-0.5 border border-line text-xs">
          {(["month", "year"] as const).map((interval) => (
            <button
              key={interval}
              type="button"
              onClick={() => setBilling(interval)}
              aria-pressed={billing === interval}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                billing === interval ? "bg-text text-bg" : "text-muted hover:text-text"
              }`}
            >
              {interval === "year" ? S.yearly : S.monthly}
              {interval === "year" && (
                <span className="rounded-full bg-accent px-1.5 py-px text-[0.625rem] font-bold text-white tabular-nums">
                  {fmt(P.off, { pct: MAX_YEARLY_OFF })}
                </span>
              )}
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
            <div role="radiogroup" aria-label={P.sizeLabel} className={s.sizes}>
              {CREATOR.map((plan, i) => (
                <button key={plan.id} type="button" role="radio" aria-checked={creatorSize === i} onClick={() => setCreatorSize(i)}>
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
  const monthly = subscriptionMonthly(plan, billing);
  const reference = packMonthlyEquivalent(plan);
  const pct = subscriptionOff(plan, billing);
  const saving = subscriptionYearlySaving(plan, billing);
  const credits = planCredits(plan, billing);
  const n = (x: number) => x.toLocaleString(intl);

  return (
    <li className="flex flex-col">
      <div className={s.plan}>
        <video
          src={`${PLAN_VIDEO[plan.tier]}.mp4`}
          poster={`${PLAN_VIDEO[plan.tier]}.jpg`}
          muted
          loop
          autoPlay
          playsInline
          aria-hidden
        />
        <div className={s.planTop}>
          <h3 className={s.planName}>{S.plans[plan.tier]}</h3>
          {popular && (
            <span className={s.pill}>
              <Sparkles />
              {P.mostPopular}
            </span>
          )}
          {sizes}
        </div>
        <p className={s.tagline}>{P.taglines[plan.tier]}</p>

        <div className={s.priceRow}>
          {pct > 0 && <span className={s.ref}>{price(reference)}</span>}
          <span className={s.price}>{price(monthly)}</span>
          <span className={s.per}>
            {P.perMonthShort}, {billing === "year" ? fmt(P.billedYearly, { price: price(plan.year) }) : P.billedMonthly}
          </span>
        </div>

        <form action={subscribe}>
          <input type="hidden" name="plan" value={plan.id} />
          <input type="hidden" name="interval" value={billing} />
          <button type="submit" disabled={!enabled} className={s.subscribe}>
            {S.subscribe}
            {pct > 0 && (
              <span className={s.deal}>
                {fmt(P.off, { pct })}
                {saving > 0 && (
                  <>
                    <span aria-hidden className="opacity-50">·</span>
                    {fmt(P.save, { amount: price(saving) })}
                  </>
                )}
              </span>
            )}
          </button>
        </form>
      </div>

      <div className="px-2 pt-6">
        <p className="flex items-center gap-3 text-lg">
          <span className="grid size-6 place-items-center rounded-full bg-text text-bg">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          <span className="font-bold tabular-nums">
            {fmt(billing === "year" ? S.creditsPerYear : S.creditsPerMonth, { credits: n(credits) })}
          </span>
        </p>

        <div className="mt-5">
          <p className="text-sm text-muted">{P.included}</p>
          <ul className="mt-3 space-y-2.5 text-[0.9375rem]">
            {P.features.map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line-strong">
                  <Check className="size-3" strokeWidth={3} />
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
