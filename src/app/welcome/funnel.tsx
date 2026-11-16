"use client";

import { Check, ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { buyCredits, subscribe } from "@/app/(app)/dashboard/credits/actions";
import { loadDraft } from "@/app/(app)/dashboard/generate/draft";
import { BADGE, OFF_BADGE_SM, TIERS, tierCard } from "@/app/tier-style";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  CREDIT_PACKS,
  formatPrice,
  planCredits,
  subscriptionMonthly,
  subscriptionOff,
  type BillingInterval,
} from "@/lib/credit-packs";
import {
  asksAudience,
  AUDIENCES,
  clipCredits,
  GOALS,
  PACE_VIDEOS,
  PACES,
  PLATFORMS,
  recommendedPlan,
  targetsAbove,
  type Audience,
  type Goal,
  type Pace,
  type Platform,
  type Target,
} from "@/lib/onboarding";
import { InfluencerCreator, type CreatedInfluencer } from "@/app/(app)/dashboard/influencer/creator";
import { finishOnboarding } from "./actions";

type Step = "goal" | "platforms" | "audience" | "target" | "pace" | "create" | "plan";

// Après les questions, la création de l'influenceur (facultative) avant les
// offres : le nouvel inscrit voit ce qu'il obtient avant de payer.
function stepsFor(goal: Goal | undefined): Step[] {
  return asksAudience(goal)
    ? ["goal", "platforms", "audience", "target", "pace", "create", "plan"]
    : ["goal", "platforms", "pace", "create", "plan"];
}

// Le pack sans abonnement proposé sous l'offre recommandée.
const STARTER_PACK = CREDIT_PACKS[0];

export function Funnel({
  next: initialNext,
  paymentsEnabled,
  userId,
  credits,
}: {
  next: string;
  paymentsEnabled: boolean;
  userId: string | null;
  credits: number;
}) {
  const { t, locale } = useI18n();
  const W = t.welcome;
  const router = useRouter();
  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<Goal>();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [audience, setAudience] = useState<Audience>();
  const [target, setTarget] = useState<Target>();
  const [pace, setPace] = useState<Pace>();
  const [billing, setBilling] = useState<BillingInterval>("year");
  const [hasDraft, setHasDraft] = useState(false);
  const [influencer, setInfluencer] = useState<CreatedInfluencer>();
  // Influenceur créé : le studio l'ouvre comme personnage.
  const next = influencer ? `/dashboard/generate?influencer=${influencer.id}` : initialNext;
  const [leaving, startLeaving] = useTransition();
  const saved = useRef(false);

  const steps = stepsFor(goal);
  const index = steps.indexOf(step);
  const intl = INTL_LOCALES[locale];
  const price = (amount: number) => formatPrice(amount, intl);

  // Projet préparé dans le studio avant l'inscription : on le rappelle.
  useEffect(() => {
    loadDraft()
      .then((d) => setHasDraft(Boolean(d)))
      .catch(() => {});
  }, []);

  const answers = { goal, platforms, audience, target, pace };

  // Arrivé sur le plan : réponses gardées, le tunnel ne reviendra plus.
  useEffect(() => {
    if (step !== "plan" || saved.current) return;
    saved.current = true;
    void finishOnboarding(answers);
    // Une seule fois, avec les réponses du moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function go(to: Step) {
    setStep(to);
    window.scrollTo({ top: 0 });
  }
  function advance(from: Step, nextGoal = goal) {
    const list = stepsFor(nextGoal);
    go(list[list.indexOf(from) + 1]);
  }

  function later() {
    startLeaving(async () => {
      if (!saved.current) await finishOnboarding(answers);
      router.push(next);
    });
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Retour à la question précédente ; sur les offres, une croix pour
          fermer et aller sur le site sans choisir. */}
      <div className="flex h-9 items-center justify-between">
        {index > 0 ? (
          <button type="button" onClick={() => go(steps[index - 1])} className="btn btn-ghost size-9 p-0">
            <ChevronLeft />
            <span className="sr-only">{W.back}</span>
          </button>
        ) : (
          <span />
        )}
        {step === "plan" && (
          <button type="button" onClick={later} disabled={leaving} title={W.close} className="btn btn-ghost size-9 p-0">
            <X />
            <span className="sr-only">{W.close}</span>
          </button>
        )}
      </div>

      <div key={step} className="mt-6 animate-fade-up">
        {step === "goal" && (
          <Question title={W.goal.question}>
            {GOALS.map((g) => (
              <Option
                key={g}
                label={W.goal.options[g].label}
                hint={W.goal.options[g].hint}
                selected={goal === g}
                onClick={() => {
                  setGoal(g);
                  advance("goal", g);
                }}
              />
            ))}
          </Question>
        )}

        {step === "platforms" && (
          <Question title={W.platforms.question} hint={W.platforms.hint}>
            {PLATFORMS.map((p) => (
              <Option
                key={p}
                label={W.platforms.options[p]}
                selected={platforms.includes(p)}
                onClick={() =>
                  setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))
                }
              />
            ))}
            <button
              type="button"
              disabled={platforms.length === 0}
              onClick={() => advance("platforms")}
              className="btn btn-accent mt-4 w-full py-3.5 text-base"
            >
              {W.continue}
            </button>
          </Question>
        )}

        {step === "audience" && (
          <Question title={W.audience.question}>
            {AUDIENCES.map((a) => (
              <Option
                key={a}
                label={W.audience.options[a]}
                selected={audience === a}
                onClick={() => {
                  setAudience(a);
                  // Un objectif sous les abonnés actuels n'a plus de sens.
                  if (target && !targetsAbove(a).includes(target)) setTarget(undefined);
                  advance("audience");
                }}
              />
            ))}
          </Question>
        )}

        {step === "target" && (
          <Question title={W.target.question}>
            {targetsAbove(audience).map((g) => (
              <Option
                key={g}
                label={W.target.options[g]}
                selected={target === g}
                onClick={() => {
                  setTarget(g);
                  advance("target");
                }}
              />
            ))}
          </Question>
        )}

        {step === "pace" && (
          <Question title={W.pace.question}>
            {PACES.map((p) => (
              <Option
                key={p}
                label={W.pace.options[p]}
                hint={fmt(W.pace.perMonth, { n: PACE_VIDEOS[p] })}
                selected={pace === p}
                onClick={() => {
                  setPace(p);
                  advance("pace");
                }}
              />
            ))}
          </Question>
        )}

        {step === "create" && (
          <div>
            <h1 className="font-headline text-4xl leading-[0.95] sm:text-5xl">{W.create.question}</h1>
            <p className="mt-3 text-sm text-muted">{W.create.hint}</p>
            <div className="mt-8">
              {userId ? (
                <InfluencerCreator
                  userId={userId}
                  credits={credits}
                  stacked
                  onCreated={setInfluencer}
                  onContinue={() => advance("create")}
                />
              ) : null}
            </div>
            {!influencer && (
              <button
                type="button"
                onClick={() => advance("create")}
                className="mt-6 w-full text-center text-sm text-muted hover:text-text hover:underline"
              >
                {W.create.skip}
              </button>
            )}
          </div>
        )}

        {step === "plan" && goal && pace && (
          <PlanStep
            influencer={influencer}
            goal={goal}
            platforms={platforms}
            target={target}
            pace={pace}
            billing={billing}
            setBilling={setBilling}
            next={next}
            hasDraft={hasDraft}
            paymentsEnabled={paymentsEnabled}
            price={price}
            later={later}
            leaving={leaving}
          />
        )}
      </div>
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-headline text-4xl leading-[0.95] sm:text-5xl">{title}</h1>
      {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
      <div className="mt-8 space-y-2.5">{children}</div>
    </div>
  );
}

function Option({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      </span>
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
          selected ? "border-accent bg-accent text-white" : "border-line-strong"
        }`}
      >
        {selected && <Check className="size-3.5" />}
      </span>
    </button>
  );
}

function PlanStep({
  influencer,
  goal,
  platforms,
  target,
  pace,
  billing,
  setBilling,
  next,
  hasDraft,
  paymentsEnabled,
  price,
  later,
  leaving,
}: {
  influencer?: CreatedInfluencer;
  goal: Goal;
  platforms: Platform[];
  target?: Target;
  pace: Pace;
  billing: BillingInterval;
  setBilling: (b: BillingInterval) => void;
  next: string;
  hasDraft: boolean;
  paymentsEnabled: boolean;
  price: (amount: number) => string;
  later: () => void;
  leaving: boolean;
}) {
  const { t, locale } = useI18n();
  const W = t.welcome;
  const P = t.creditsPage;
  const S = P.subscriptions;
  const plan = recommendedPlan(pace);
  const tier = TIERS[plan.tier];
  const named = platforms.filter((p) => p !== "other").map((p) => W.platforms.options[p]);
  const where = named.length ? new Intl.ListFormat(locale, { type: "conjunction" }).format(named) : "";

  const objective =
    asksAudience(goal) && target
      ? fmt(where ? W.plan.targetOn : W.plan.target, { target: W.target.options[target], platforms: where })
      : W.plan.goals[goal];
  const pct = subscriptionOff(plan, billing);

  return (
    <div>
      {/* L'influenceur créé juste avant : ce que l'offre va faire vivre. */}
      {influencer && (
        <div className="mb-8 flex items-center gap-4 rounded-2xl border border-line bg-surface p-2.5 pr-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={influencer.url} alt="" className="aspect-[3/4] w-16 shrink-0 rounded-xl object-cover" />
          <p className="font-semibold">{W.plan.ready}</p>
        </div>
      )}
      <p className="eyebrow">{W.plan.eyebrow}</p>
      <h1 className="mt-3 font-headline text-4xl leading-[0.95] sm:text-5xl">{objective}</h1>
      <p className="mt-4 text-muted">
        {fmt(W.plan.pace, { pace: W.pace.options[pace], n: PACE_VIDEOS[pace] })}
      </p>
      {asksAudience(goal) && pace === "weekly" && <p className="mt-2 text-sm text-muted">{W.plan.tip}</p>}

      {/* L'offre qui couvre ce rythme. */}
      <div className="mt-8 rounded-3xl border p-6" style={tierCard(tier.color, tier.strength)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-headline text-4xl leading-none">{S.plans[plan.tier]}</h2>
            <span className={`${BADGE} bg-accent text-white`}>{W.plan.recommended}</span>
          </div>
          <div className="rail flex gap-1 border border-line text-xs">
            {(["month", "year"] as const).map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => setBilling(interval)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition-colors ${
                  billing === interval ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                {interval === "year" ? S.yearly : S.monthly}
                {interval === "year" && <span className={OFF_BADGE_SM}>{fmt(P.off, { pct: subscriptionOff(plan, "year") })}</span>}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-accent-light" />
            {fmt(billing === "year" ? S.creditsPerYear : S.creditsPerMonth, {
              credits: planCredits(plan, billing).toLocaleString(INTL_LOCALES[locale]),
            })}
          </li>
          <li className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-accent-light" />
            {fmt(W.plan.covers, {
              n: Math.floor(plan.credits / clipCredits()),
              max: Math.floor(plan.credits / clipCredits(true)),
            })}
          </li>
        </ul>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
          <span className="font-headline text-5xl leading-none">{price(subscriptionMonthly(plan, billing))}</span>
          <span className="text-sm text-muted">/ {S.perMonth}</span>
          {pct > 0 && <span className="text-sm font-semibold text-success">{fmt(P.off, { pct })}</span>}
        </div>
        {billing === "year" && <p className="mt-1 text-xs text-muted">{fmt(P.billedYearly, { price: price(plan.year) })}</p>}

        <form action={subscribe} className="mt-6">
          <input type="hidden" name="plan" value={plan.id} />
          <input type="hidden" name="interval" value={billing} />
          <input type="hidden" name="next" value={next} />
          <button type="submit" disabled={!paymentsEnabled} className="btn btn-accent w-full py-3.5 text-base">
            {fmt(W.plan.subscribe, { plan: S.plans[plan.tier] })}
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-faint">{W.plan.cancelAnytime}</p>
      </div>

      {/* Sans abonnement : le plus petit pack. */}
      <form
        action={buyCredits}
        className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
      >
        <input type="hidden" name="pack" value={STARTER_PACK.id} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm">
          {fmt(W.plan.noCommitment, { credits: STARTER_PACK.credits, price: price(STARTER_PACK.amount) })}
        </p>
        <button type="submit" disabled={!paymentsEnabled} className="btn btn-secondary">
          {W.plan.buyPack}
        </button>
      </form>

      {hasDraft && <p className="mt-6 text-sm text-muted">{W.plan.draftKept}</p>}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/dashboard/credits" className="text-muted hover:text-text hover:underline">
          {W.plan.allOffers}
        </Link>
        <button type="button" onClick={later} disabled={leaving} className="text-muted hover:text-text hover:underline">
          {W.plan.later}
        </button>
      </div>
    </div>
  );
}
