import {
  ArrowRight,
  AudioLines,
  Check,
  Clapperboard,
  Film,
  Infinity as InfinityIcon,
  Scissors,
  ShieldCheck,
  Sparkles,
  UserRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "@/app/language-switcher";
import { ExampleVideo } from "@/app/example-video";
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
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-10 text-center sm:px-6 sm:pt-28">
            <p className="eyebrow animate-fade-up">{L.eyebrow}</p>
            <h1 className="mx-auto mt-7 max-w-5xl animate-fade-up font-wide text-[2rem] leading-[1.05] uppercase [animation-delay:80ms] min-[420px]:text-[2.6rem] sm:text-7xl">
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

          {/* Maquette du studio */}
          <div className="mx-auto max-w-5xl animate-fade-up px-4 pb-20 [animation-delay:380ms] sm:px-6">
            <div className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
                <span className="text-xs text-faint">{L.mockWindow}</span>
                <span className="ml-auto text-xs text-muted">{L.mockRendering}</span>
              </div>

              <div className="grid text-left md:grid-cols-[1.25fr_1fr]">
                <div className="min-w-0 border-b border-line p-5 md:border-r md:border-b-0">
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        { icon: Film, title: L.mockClip, meta: L.mockClipMeta },
                        { icon: UserRound, title: L.mockCharacter, meta: L.mockCharacterMeta },
                      ] as const
                    ).map(({ icon: Icon, title, meta }) => (
                      <div
                        key={title}
                        className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong bg-surface-2/60 text-center"
                      >
                        <Icon className="size-5 text-accent-light" />
                        <span className="text-sm font-medium">{title}</span>
                        <span className="text-xs text-faint">{meta}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl border border-line bg-surface-2 p-4">
                    <p className="text-[0.9375rem] leading-relaxed">
                      {L.mockTarget}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <span className="chip" aria-pressed="true">
                        <Sparkles />
                        {L.mockEngine}
                      </span>
                      <span className="tag">{L.mockBadge}</span>
                    </div>
                  </div>

                  <p className="mt-5 mb-3 text-xs font-medium text-muted">{L.mockPipeline}</p>
                  <ol className="flex flex-col gap-2">
                    {L.mockSteps.map((step, i) => (
                      <li key={step} className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-3 text-sm">
                          <span className="w-5 shrink-0 text-xs font-medium text-accent-light tabular-nums">
                            {i + 1}
                          </span>
                          <span className="truncate text-muted">{step}</span>
                        </div>
                        <span className="mt-2 block h-0.5 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full animate-grow rounded-full bg-accent"
                            style={{ animationDelay: `${i * 0.45}s` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Un vrai rendu du site plutôt qu'un aperçu dessiné. */}
                <div className="flex min-w-0 items-center justify-center bg-surface-2 p-4 sm:p-6">
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
                    <video
                      src="/examples/ours.mp4"
                      poster="/examples/ours.jpg"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-hidden
                      className="size-full object-cover"
                    />
                    <span className="absolute bottom-2 left-2 tag bg-black/70 text-white">{L.mockBadge}</span>
                  </div>
                </div>
              </div>
            </div>
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
          <h2 className="text-gradient mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {L.examplesTitle}
          </h2>
          <ul className="mt-12 grid gap-4 md:grid-cols-2">
            {L.exampleList.map(({ title, text }, i) => (
              <li key={title} className="panel p-3 sm:p-4">
                <ExampleVideo
                  src={`/examples/${EXAMPLES[i]}.mp4`}
                  poster={`/examples/${EXAMPLES[i]}.jpg`}
                  label={title}
                  soundOn={L.soundOn}
                  soundOff={L.soundOff}
                />
                <h3 className="mt-4 px-1 text-lg font-semibold">{title}</h3>
                <p className="mt-1 px-1 pb-1 text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">{L.features}</p>
          <h2 className="text-gradient mt-5 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            {L.featuresTitle}
          </h2>
          <ul className="mt-12 grid gap-4 md:grid-cols-3">
            {L.featureList.map(({ title, text }, i) => {
              const { icon: Icon, wide } = FEATURE_ICONS[i];
              return (
                <li
                  key={title}
                  className={`panel spotlight lift group p-6 ${wide ? "md:col-span-2" : ""}`}
                >
                  <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-text">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{text}</p>
                </li>
              );
            })}
            <li className="panel spotlight lift group flex flex-col justify-between p-6">
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
                className="group grid gap-2 py-8 transition-colors hover:bg-surface/70 sm:grid-cols-[7rem_1fr_1.4fr] sm:gap-8 sm:px-4"
              >
                <span className="font-wide text-3xl text-line-strong transition-all duration-300 group-hover:text-accent group-hover:[text-shadow:0_0_24px_var(--accent)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-wide text-xl uppercase">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Tarifs */}
        <section id="tarifs" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
          <p className="eyebrow">{L.pricing}</p>
          <h2 className="text-gradient mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
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

        {/* Appel final */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="panel px-5 py-12 text-center sm:px-6 sm:py-16">
            <h2 className="mx-auto max-w-3xl font-wide text-3xl uppercase sm:text-5xl">
              <span className="text-gradient">{L.finalTitleTop}</span>{" "}
              <span className="text-shine">{L.finalTitleBottom}</span>
            </h2>
            <Link href={start} className="btn btn-primary mt-8 px-6 py-3 text-[0.9375rem]">
              {loggedIn ? L.openStudio : L.startFree}
              <ArrowRight />
            </Link>
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
