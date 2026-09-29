import {
  ArrowRight,
  AudioLines,
  Check,
  Clapperboard,
  Infinity as InfinityIcon,
  Scissors,
  ShieldCheck,
  UserRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "@/app/language-switcher";
import { CompareSlider } from "@/app/compare-slider";
import { ExampleVideo } from "@/app/example-video";
import { FinalScene } from "@/app/final-scene";
import { Magnetic, ScrollWipe, SmoothScroll } from "@/app/landing-motion";
import { Logo } from "@/app/logo";
import { ThemeToggle } from "@/app/theme-toggle";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { CREDIT_PACKS, formatPrice } from "@/lib/credit-packs";
import { SWAP_ENGINES, SWAP_SHEET_CREDITS } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";

// Vidéos d'exemple (public/examples), dans l'ordre des textes de
// landing.exampleList : de vrais rendus du site.
const EXAMPLES = ["ours", "chien"];

// Icône et largeur de chaque carte de fonctionnalité, dans l'ordre des
// textes de landing.featureList.
const FEATURE_ICONS: { icon: LucideIcon; wide?: boolean }[] = [
  { icon: Clapperboard, wide: true },
  { icon: UserRound },
  { icon: AudioLines },
  { icon: Scissors },
  { icon: ShieldCheck, wide: true },
];

export default async function Home() {
  const [t, locale, supabase] = await Promise.all([getDictionary(), getLocale(), createClient()]);
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const start = loggedIn ? "/dashboard/generate" : "/login";
  const L = t.landing;
  const price = (amount: number) => formatPrice(amount, INTL_LOCALES[locale]);

  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <SmoothScroll />
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Logo className="min-w-0 shrink" />
          <nav className="flex shrink-0 items-center gap-0.5 text-sm sm:gap-1">
            <a href="#exemples" className="btn btn-ghost hidden px-3 sm:inline-flex">
              {L.examples}
            </a>
            <a href="#fonctionnalites" className="btn btn-ghost hidden px-3 sm:inline-flex">
              {L.features}
            </a>
            <a href="#tarifs" className="btn btn-ghost hidden px-3 sm:inline-flex">
              {L.pricing}
            </a>
            <ThemeToggle />
            <LanguageSwitcher />
            <Link href={start} className="btn btn-primary ml-0.5 shrink-0 px-2.5 text-[0.8125rem] sm:ml-1 sm:px-4 sm:text-sm">
              {loggedIn ? L.studioShort : L.start}
              <ArrowRight className="hidden sm:inline-flex" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Accroche */}
        <section className="relative isolate">
          <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-32">
            <p className="eyebrow animate-fade-up">{L.eyebrow}</p>
            <h1 className="mx-auto mt-8 max-w-6xl animate-fade-up font-wide text-[2.1rem] leading-[1.02] uppercase [animation-delay:80ms] min-[420px]:text-[2.7rem] sm:text-7xl lg:text-8xl">
              <span className="text-gradient">{L.titleTop}</span>
              <br />
              <span className="text-shine">
                {L.titleBottom}
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl animate-fade-up text-[0.9375rem] leading-relaxed text-muted [animation-delay:160ms] sm:mt-7 sm:text-lg">
              {L.subtitle}
            </p>
            <div className="mt-8 flex animate-fade-up flex-col justify-center gap-3 [animation-delay:240ms] sm:mt-9 sm:flex-row sm:flex-wrap">
              <Link href={start} className="btn btn-accent w-full px-5 py-3 text-[0.9375rem] sm:w-auto">
                <WandSparkles />
                {L.ctaFirst}
              </Link>
              <a href="#tarifs" className="btn btn-secondary w-full px-5 py-3 text-[0.9375rem] sm:w-auto">
                {L.ctaPricing}
              </a>
            </div>
            <p className="mt-5 flex animate-fade-up flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted [animation-delay:300ms]">
              {L.perks.map((perk) => (
                <span key={perk} className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-success" />
                  {perk}
                </span>
              ))}
            </p>
          </div>

          {/* Démo : le rideau avant/après sur un vrai plan fourni, en vidéo. */}
          <div className="mx-auto max-w-6xl animate-fade-up px-4 pb-24 [animation-delay:380ms] sm:px-6">
            <div className="relative isolate mx-auto w-full max-w-[21rem] sm:max-w-[23rem]">
              <video
                src="/examples/micro-apres.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden
                className="ambient"
              />
              <CompareSlider
                before="/examples/micro-avant.mp4"
                after="/examples/micro-apres.mp4"
                posterBefore="/examples/micro-avant.jpg"
                posterAfter="/examples/micro-apres.jpg"
                labelBefore={L.compareBefore}
                labelAfter={L.compareAfter}
              />
            </div>
            <p className="mx-auto mt-5 max-w-sm text-center text-xs leading-relaxed text-faint">
              {L.compareHint}
            </p>
          </div>
        </section>

        {/* Modèles */}
        <section className="border-y border-line py-5">
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-sm text-muted sm:px-6">
            {L.models.map((model) => (
              <li key={model}>{model}</li>
            ))}
          </ul>
        </section>

        {/* Exemples */}
        <section id="exemples" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-24">
          <p className="eyebrow">{L.examples}</p>
          <h2 className="reveal text-gradient mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {L.examplesTitle}
          </h2>
          {/* Galerie sans cadre : la vidéo est la carte, la légende reste en
              retrait — présentation d'études de cas, pas de vitrine SaaS. */}
          <ul className="mt-12 grid gap-x-6 gap-y-12 md:grid-cols-2">
            {L.exampleList.map(({ title, text }, i) => (
              <li key={title} className="reveal">
                <ExampleVideo
                  src={`/examples/${EXAMPLES[i]}.mp4`}
                  poster={`/examples/${EXAMPLES[i]}.jpg`}
                  label={title}
                  soundOn={L.soundOn}
                  soundOff={L.soundOff}
                />
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">{L.features}</p>
          <h2 className="reveal text-gradient mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {L.featuresTitle}
          </h2>
          <ul className="mt-12 grid gap-4 md:grid-cols-3">
            {L.featureList.map(({ title, text }, i) => {
              const { icon: Icon, wide } = FEATURE_ICONS[i];
              return (
                <li
                  key={title}
                  className={`panel spotlight lift reveal group p-6 sm:p-8 ${wide ? "md:col-span-2" : ""}`}
                >
                  <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-text">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{text}</p>
                </li>
              );
            })}
            <li className="panel spotlight lift group flex flex-col justify-between p-6 sm:p-8">
              <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-text">
                <InfinityIcon className="size-5" />
              </span>
              <div>
                <p className="mt-5 font-wide text-4xl">{price(0)}</p>
                <p className="mt-2 text-sm text-muted">{L.noSubscription}</p>
              </div>
            </li>
          </ul>
        </section>

        {/* Étapes */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <p className="eyebrow">{L.howItWorks}</p>
          <ol className="mt-8 divide-y divide-line border-y border-line">
            {L.steps.map((step, i) => (
              <li
                key={step.title}
                className="group reveal grid gap-2 py-8 transition-colors hover:bg-surface/70 sm:grid-cols-[7rem_1fr_1.4fr] sm:gap-8 sm:px-4"
              >
                <span className="font-wide text-3xl text-line-strong transition-colors duration-300 group-hover:text-accent-light">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-wide text-xl uppercase">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Bande cinéma : le remplacement se rejoue tout seul au rythme du
            défilement — l'argument du produit, sans un mot. */}
        <section className="relative isolate border-y border-line px-4 py-16 sm:py-24">
          <div className="relative mx-auto max-w-6xl">
            <video
              src="/examples/micro-apres.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden
              className="ambient"
            />
            <ScrollWipe
              before="/examples/micro-avant.mp4"
              after="/examples/micro-apres.mp4"
              posterBefore="/examples/micro-avant.jpg"
              posterAfter="/examples/micro-apres.jpg"
              labelBefore={L.compareBefore}
              labelAfter={L.compareAfter}
            />
          </div>
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">{L.pricing}</p>
          <h2 className="reveal text-gradient mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            {L.pricingTitle}
          </h2>
          <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
            {fmt(L.pricingText, {
              max: SWAP_ENGINES.genjutsu.creditsPerSecond.toLocaleString(INTL_LOCALES[locale]),
              budget: SWAP_ENGINES.kling.creditsPerSecond.toLocaleString(INTL_LOCALES[locale]),
              sheet: SWAP_SHEET_CREDITS,
            })}
          </p>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {CREDIT_PACKS.map((pack, i) => {
              const featured = "highlight" in pack && pack.highlight;
              return (
                <li
                  key={pack.id}
                  className={`panel spotlight lift flex animate-fade-up flex-col p-6 ${featured ? "glow" : ""}`}
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{t.creditsPage.packs[pack.id]}</h3>
                    {featured && (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white">
                        {L.popular}
                      </span>
                    )}
                  </div>
                  <p className="mt-6 font-wide text-5xl">{price(pack.amount)}</p>
                  <p className="mt-2 text-sm text-muted tabular-nums">
                    {pack.credits} {t.common.credits} · {price(Math.round(pack.amount / pack.credits))}{" "}
                    {L.perCredit}
                  </p>
                  <Link
                    href={start}
                    className={`btn mt-8 w-full ${featured ? "btn-accent" : "btn-secondary"}`}
                  >
                    {L.start}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Appel final : une déclaration pleine page, pas une carte. Pas de
            reveal : en bout de page, la timeline de défilement peut ne jamais
            se dérouler assez et laisser la section invisible. */}
        <section className="relative isolate overflow-hidden border-t border-line px-4 py-20 sm:px-6 sm:py-40">
          <FinalScene />
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="mx-auto font-wide text-[1.9rem] leading-[1.05] uppercase sm:text-6xl lg:text-7xl">
              <span className="text-gradient">{L.finalTitleTop}</span>
              <br className="hidden sm:block" />{" "}
              <span className="text-shine">{L.finalTitleBottom}</span>
            </h2>
            <Magnetic>
              <Link href={start} className="btn btn-primary mt-10 px-8 py-3.5 text-base">
                {loggedIn ? L.openStudio : L.startFree}
                <ArrowRight />
              </Link>
            </Magnetic>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <Logo />
          <div className="flex items-center gap-3">
            <Link href="/conditions" className="text-xs text-muted hover:text-text">
              {t.terms.link}
            </Link>
            <ThemeToggle />
            <LanguageSwitcher up />
            <span className="text-xs text-faint">© {new Date().getFullYear()} TwinPost</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
