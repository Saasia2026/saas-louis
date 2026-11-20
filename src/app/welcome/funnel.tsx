"use client";

import { ArrowRight, Check, ChevronLeft, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { buyCredits, subscribe } from "@/app/(app)/dashboard/credits/actions";
import { loadDraft } from "@/app/(app)/dashboard/generate/draft";
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
import { TitleLines } from "@/app/title-lines";
import F from "./funnel.module.css";

type Step = "intro" | "goal" | "platforms" | "audience" | "target" | "pace" | "building" | "create" | "plan";

// Une montée en puissance jusqu'aux offres : l'accroche avec les vraies
// démos, les questions, le plan qui se construit sous ses yeux à partir de
// ses réponses, la création de son influenceur (facultative), puis les
// offres, présentées comme ce qui le fait vivre.
function stepsFor(goal: Goal | undefined): Step[] {
  return asksAudience(goal)
    ? ["intro", "goal", "platforms", "audience", "target", "pace", "building", "create", "plan"]
    : ["intro", "goal", "platforms", "pace", "building", "create", "plan"];
}

// Écrans larges (deux colonnes sur ordinateur) ; les questions restent
// étroites.
const WIDE: Step[] = ["intro", "plan"];

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
  const [step, setStep] = useState<Step>("intro");
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

  // Retour : l'écran « on prépare ton plan » ne se rejoue pas.
  function back() {
    const previous = steps[index - 1];
    go(previous === "building" ? steps[index - 2] : previous);
  }

  // Le plan qui se construit : ses propres réponses, une par une.
  const plan = pace ? recommendedPlan(pace) : undefined;
  const where = new Intl.ListFormat(locale, { type: "conjunction" }).format(
    platforms.filter((p) => p !== "other").map((p) => W.platforms.options[p]),
  );
  const buildingLines = [
    goal && { label: W.building.goal, value: target ? W.target.options[target] : W.goal.options[goal].label },
    where && { label: W.building.where, value: where },
    pace && { label: W.building.pace, value: fmt(W.pace.perMonth, { n: PACE_VIDEOS[pace] }) },
    plan && { label: W.building.offer, value: t.creditsPage.subscriptions.plans[plan.tier] },
  ].filter((l): l is { label: string; value: string } => Boolean(l));

  function later() {
    startLeaving(async () => {
      if (!saved.current) await finishOnboarding(answers);
      router.push(next);
    });
  }

  return (
    <div className={`mx-auto w-full ${WIDE.includes(step) ? "max-w-5xl" : "max-w-xl"}`}>
      {/* Retour à la question précédente, l'avancée en chiffres et en trait ;
          sur les offres, une croix pour fermer et aller sur le site. */}
      {step !== "intro" && (
        <div className={F.top}>
          {index > 0 && step !== "building" ? (
            <button type="button" onClick={back} className={F.round}>
              <ChevronLeft />
              <span className="sr-only">{W.back}</span>
            </button>
          ) : (
            <span className={F.roundSpacer} />
          )}
          <span className={F.count}>
            {String(index + 1).padStart(2, "0")} <i>/ {String(steps.length).padStart(2, "0")}</i>
          </span>
          <span className={F.track}>
            <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </span>
          {step === "plan" ? (
            <button type="button" onClick={later} disabled={leaving} title={W.close} className={F.round}>
              <X />
              <span className="sr-only">{W.close}</span>
            </button>
          ) : (
            <span className={F.roundSpacer} />
          )}
        </div>
      )}

      <div key={step} className={`animate-fade-up ${WIDE.includes(step) ? "" : F.card}`}>
        {step === "intro" && <IntroStep credits={credits} onStart={() => go("goal")} />}

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

        {step === "building" && <BuildingStep lines={buildingLines} onDone={() => advance("building")} />}

        {step === "create" && (
          <div>
            <h1 className={F.title}>{influencer ? W.create.done : W.create.question}</h1>
            <p className="mt-3 text-sm text-muted">{fmt(W.create.hint, { n: credits })}</p>
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
                className={F.skip}
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
      <h1 className={F.title}>{title}</h1>
      {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
      <div className={F.options}>{children}</div>
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
      className={`${F.option} ${selected ? F.selected : ""}`}
    >
      <span className="min-w-0">
        <span className={F.optionLabel}>{label}</span>
        {hint && <span className={F.optionHint}>{hint}</span>}
      </span>
      <span className={F.tick}>{selected && <Check />}</span>
    </button>
  );
}

// Accroche : ce que l'outil fait, montré par les vraies démos qui défilent
// dans un téléphone, et un seul bouton pour commencer.
function IntroStep({ credits, onStart }: { credits: number; onStart: () => void }) {
  const { t } = useI18n();
  const W = t.welcome;
  return (
    <div className={F.intro}>
      <p className="eyebrow">{W.intro.eyebrow}</p>
      <h1 className={F.hero}>
        <TitleLines text={W.intro.title} />
      </h1>
      <p className="mt-5 max-w-md text-muted sm:text-lg">{W.intro.text}</p>
      <button type="button" onClick={onStart} className="btn btn-accent mt-8 w-full py-4 text-lg sm:w-auto sm:px-10">
        {W.intro.start}
        <ArrowRight />
      </button>
      <p className="mt-3 text-sm text-muted">{fmt(W.intro.meta, { n: credits })}</p>
    </div>
  );
}

// « On prépare ton plan » : ses réponses apparaissent une à une, cochées,
// puis l'écran suivant arrive tout seul.
const LINE_MS = 650;
function BuildingStep({ lines, onDone }: { lines: { label: string; value: string }[]; onDone: () => void }) {
  const { t } = useI18n();
  const W = t.welcome;
  const [shown, setShown] = useState(0);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  });
  useEffect(() => {
    if (shown < lines.length) {
      const timer = setTimeout(() => setShown((n) => n + 1), LINE_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => finish.current(), 1100);
    return () => clearTimeout(timer);
  }, [shown, lines.length]);
  const done = shown >= lines.length;

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className={F.spinner}>{done ? <Check /> : <LoaderCircle className="animate-spin" />}</span>
        <h1 className={F.title}>{done ? W.building.done : W.building.title}</h1>
      </div>
      <ul className={F.lines}>
        {lines.map((line, i) => (
          <li key={line.label} className={i < shown ? F.lineIn : ""}>
            <span>{line.label}</span>
            <b>
              {line.value}
              <Check />
            </b>
          </li>
        ))}
      </ul>
      {/* Progression du plan. */}
      <div className={F.bar}>
        <span style={{ width: `${(Math.min(shown, lines.length) / Math.max(1, lines.length)) * 100}%` }} />
      </div>
    </div>
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
  const named = platforms.filter((p) => p !== "other").map((p) => W.platforms.options[p]);
  const where = named.length ? new Intl.ListFormat(locale, { type: "conjunction" }).format(named) : "";

  const objective =
    asksAudience(goal) && target
      ? fmt(where ? W.plan.targetOn : W.plan.target, { target: W.target.options[target], platforms: where })
      : W.plan.goals[goal];
  const pct = subscriptionOff(plan, billing);
  const monthly = price(subscriptionMonthly(plan, billing));
  const planName = S.plans[plan.tier];

  // Le formulaire d'abonnement, dans la carte et dans la barre du bas
  // (téléphone).
  const subscribeForm = (className: string) => (
    <form action={subscribe} className={className}>
      <input type="hidden" name="plan" value={plan.id} />
      <input type="hidden" name="interval" value={billing} />
      <input type="hidden" name="next" value={next} />
      <button type="submit" disabled={!paymentsEnabled} className="btn btn-accent w-full py-3.5 text-base">
        {fmt(W.plan.subscribe, { plan: planName })}
        <ArrowRight />
      </button>
    </form>
  );

  const unlocks = [
    fmt(billing === "year" ? S.creditsPerYear : S.creditsPerMonth, {
      credits: planCredits(plan, billing).toLocaleString(INTL_LOCALES[locale]),
    }),
    W.plan.unlockSwap,
    W.plan.unlockEngines,
    W.plan.unlockSchedule,
  ];

  return (
    <div className="pb-24 md:pb-0">
      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12">
        {/* Ce que l'offre fait vivre : son influenceur, ou les démos. */}
        <div className="mx-auto w-full max-w-[16rem] md:sticky md:top-24 md:max-w-none">
          <div className={F.visual}>
            {influencer ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={influencer.url} alt="" />
            ) : (
              <video src="/demos/demo-20.mp4" poster="/demos/demo-20.jpg" muted loop autoPlay playsInline aria-hidden />
            )}
            {influencer && <p>{W.plan.ready}</p>}
          </div>
        </div>

        <div className="min-w-0">
          <p className="eyebrow">{W.plan.eyebrow}</p>
          <h1 className={`mt-4 ${F.title}`}>{objective}</h1>
          <p className="mt-4 text-muted">
            {fmt(W.plan.pace, { pace: W.pace.options[pace], n: PACE_VIDEOS[pace] })}
          </p>
          {asksAudience(goal) && pace === "weekly" && <p className="mt-2 text-sm text-muted">{W.plan.tip}</p>}

          {/* L'offre qui couvre ce rythme, et tout ce qu'elle débloque. */}
          <div className={`mt-8 ${F.offer}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-headline text-4xl leading-none">{planName}</h2>
                <span className={F.chip}>{W.plan.recommended}</span>
              </div>
              <div className={F.billing}>
                {(["month", "year"] as const).map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => setBilling(interval)}
                    aria-pressed={billing === interval}
                    className={billing === interval ? F.billingOn : ""}
                  >
                    {interval === "year" ? S.yearly : S.monthly}
                    {interval === "year" && <small>{fmt(P.off, { pct: subscriptionOff(plan, "year") })}</small>}
                  </button>
                ))}
              </div>
            </div>

            <p className="eyebrow mt-6">{W.plan.unlock}</p>
            <ul className={F.unlocks}>
              {unlocks.map((line) => (
                <li key={line}>
                  <span>
                    <Check />
                  </span>
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
              <span className="font-headline text-5xl leading-none">{monthly}</span>
              <span className="text-sm text-muted">/ {S.perMonth}</span>
              {pct > 0 && <span className={F.chip}>{fmt(P.off, { pct })}</span>}
            </div>
            {billing === "year" && <p className="mt-1 text-xs text-muted">{fmt(P.billedYearly, { price: price(plan.year) })}</p>}

            {subscribeForm("mt-6")}
            <p className="mt-3 text-center text-xs text-faint">{W.plan.cancelAnytime}</p>
          </div>

          {/* Sans abonnement : le plus petit pack. */}
          <form
            action={buyCredits}
            className={`mt-4 ${F.pack}`}
          >
            <input type="hidden" name="pack" value={STARTER_PACK.id} />
            <input type="hidden" name="next" value={next} />
            <p className="text-sm">
              {fmt(W.plan.noCommitment, {
                credits: STARTER_PACK.credits.toLocaleString(INTL_LOCALES[locale]),
                price: price(STARTER_PACK.amount),
              })}
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
      </div>

      {/* Téléphone : le prix et le bouton toujours à portée de pouce. */}
      <div className={F.dock}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="shrink-0">
            <p className="font-headline text-2xl leading-none">{monthly}</p>
            <p className="text-[0.6875rem] text-muted">/ {S.perMonth}</p>
          </div>
          {subscribeForm("min-w-0 flex-1")}
        </div>
      </div>
    </div>
  );
}
