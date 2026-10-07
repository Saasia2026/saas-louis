import { ArrowRight, Check, Sparkles, WandSparkles } from "lucide-react";
import Link from "next/link";
import { FeatureShowcase } from "@/app/feature-showcase";
import { LanguageSwitcher } from "@/app/language-switcher";
import { CompareSlider } from "@/app/compare-slider";
import { ExampleVideo } from "@/app/example-video";
import { Magnetic, ScrollWipe, SmoothScroll } from "@/app/landing-motion";
import { ParticleField } from "@/app/particle-field";
import { PhoneFrame } from "@/app/phone-frame";
import { Logo } from "@/app/logo";
import { ThemeToggle } from "@/app/theme-toggle";
import { BADGE, OFF_BADGE, TIERS, tierCard } from "@/app/tier-style";
import { VideoMarquee } from "@/app/video-marquee";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { CREDIT_PACKS, SUBSCRIPTION_PLANS, formatPrice } from "@/lib/credit-packs";
import { SWAP_SHEET_CREDITS, swapMethodRate, swapMethodSecondsFor } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";

// Vidéos d'exemple (public/examples), dans l'ordre des textes de
// landing.exampleList : de vrais rendus du site.
const EXAMPLES = ["ours", "chien"];

// Rendus verticaux du bandeau, dans l'ordre des textes de
// landing.showcaseList.
const REEL = ["genjutsu-diable", "genjutsu-lincoln", "genjutsu-cage"];

// Rendu montré pour chaque fonctionnalité, dans l'ordre des textes de
// landing.featureList ; null : la carte « crédits rendus » à la place.
const FEATURE_MEDIA: (string | null)[] = ["genjutsu-cage", "ours", "genjutsu-diable", "mma-apres", null];

// Meilleure réduction réelle d'un abonnement (annuel) sur le pack aux mêmes
// crédits — le même calcul que la page Crédits.
const MAX_SUBSCRIPTION_OFF = Math.max(
  ...SUBSCRIPTION_PLANS.map((plan) => {
    const pack = CREDIT_PACKS.find((p) => p.id === plan.id)!;
    return Math.round((1 - Math.round(plan.year / 12) / pack.amount) * 100);
  }),
);

export default async function Home() {
  const [t, locale, supabase] = await Promise.all([getDictionary(), getLocale(), createClient()]);
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const start = loggedIn ? "/dashboard/generate" : "/login";
  const L = t.landing;
  const P = t.creditsPage;
  const price = (amount: number) => formatPrice(amount, INTL_LOCALES[locale]);
  // La réduction s'affiche en badge au milieu de la phrase.
  const [subsBefore, subsAfter = ""] = L.pricingSubs.split("{off}");

  const reel = [
    ...REEL.map((file, i) => ({
      src: `/examples/${file}.mp4`,
      poster: `/examples/${file}.jpg`,
      label: L.showcaseList[i].title,
    })),
    { src: "/examples/micro-apres.mp4", poster: "/examples/micro-apres.jpg", label: L.compareAfter },
    { src: "/examples/mma-apres.mp4", poster: "/examples/mma-apres.jpg", label: L.compareAfter },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <SmoothScroll />
      <ParticleField />
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
            <Link href={start} className="btn btn-accent ml-0.5 shrink-0 px-3 text-[0.8125rem] sm:ml-1 sm:px-5 sm:text-sm">
              {loggedIn ? L.studioShort : L.start}
              <ArrowRight className="hidden sm:inline-flex" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Accroche : le texte à gauche, la démo dans un téléphone à droite —
            l'un sous l'autre sur mobile. */}
        <section className="relative isolate">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14 lg:pt-20 lg:pb-24">
            <div className="text-center lg:text-left">
              <p className="inline-flex max-w-full animate-fade-up items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-[0.6875rem] font-medium text-muted sm:text-xs">
                <Sparkles className="size-3.5 shrink-0 text-accent-hot" />
                {L.eyebrow}
              </p>
              <h1 className="mt-6 animate-fade-up font-headline text-[3.25rem] leading-[0.88] [animation-delay:80ms] min-[400px]:text-[3.75rem] sm:text-8xl lg:text-[6.5rem] xl:text-[7.25rem]">
                <span className="block text-gradient">{L.titleTop}</span>
                <span className="block text-shine">{L.titleBottom}</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl animate-fade-up text-[0.9375rem] leading-relaxed text-muted [animation-delay:160ms] sm:text-lg lg:mx-0">
                {L.heroText}
              </p>
              <div className="mt-8 flex animate-fade-up flex-col justify-center gap-3 [animation-delay:240ms] sm:flex-row sm:flex-wrap lg:justify-start">
                <Link href={start} className="btn btn-accent w-full px-7 py-4 text-base sm:w-auto sm:text-lg">
                  <WandSparkles />
                  {L.ctaFirst}
                </Link>
                <a href="#tarifs" className="btn btn-hot w-full px-7 py-4 text-base sm:w-auto sm:text-lg">
                  {L.ctaPricing}
                </a>
              </div>
              <p className="mt-5 flex animate-fade-up flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted [animation-delay:300ms] lg:justify-start">
                {L.perks.map((perk) => (
                  <span key={perk} className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-success" />
                    {perk}
                  </span>
                ))}
              </p>
            </div>

            {/* Démo : le rideau avant/après sur un vrai plan fourni, en vidéo. */}
            <div className="animate-fade-up [animation-delay:380ms]">
              <PhoneFrame ambient="/examples/micro-apres.jpg" className="mx-auto w-full max-w-[17rem] sm:max-w-[19rem]">
                <CompareSlider
                  before="/examples/micro-avant.mp4"
                  after="/examples/micro-apres.mp4"
                  posterBefore="/examples/micro-avant.jpg"
                  posterAfter="/examples/micro-apres.jpg"
                  labelBefore={L.compareBefore}
                  labelAfter={L.compareAfter}
                  bare
                />
              </PhoneFrame>
              <p className="mx-auto mt-5 max-w-[17rem] text-center text-xs leading-relaxed text-faint sm:max-w-[19rem]">
                {L.compareHint}
              </p>
            </div>
          </div>
        </section>

        {/* Bandeau de rendus sur toute la largeur, puis ce que le moteur
            garde du clip. */}
        <section aria-label={L.reelEyebrow} className="border-y border-line bg-surface/40 py-8 sm:py-12">
          <p className="eyebrow mb-6 px-4 text-center">{L.reelEyebrow}</p>
          <VideoMarquee items={reel} />
          <ul className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-center gap-2 px-4 sm:px-6">
            {L.models.map((model, i) => (
              <li
                key={model}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${i === 0 ? "border-accent/50 text-accent-light" : "border-line text-muted"}`}
              >
                {model}
              </li>
            ))}
          </ul>
        </section>

        {/* Exemples */}
        <section id="exemples" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16 sm:px-6 sm:pt-24">
          <p className="eyebrow">{L.examples}</p>
          <h2 className="reveal text-gradient mt-5 max-w-3xl font-headline text-5xl leading-[0.92] sm:text-7xl">
            {L.examplesTitle}
          </h2>
          <ul className="mt-12 grid gap-x-6 gap-y-10 md:grid-cols-2">
            {L.exampleList.map(({ title }, i) => (
              <li key={title} className="reveal">
                <ExampleVideo
                  src={`/examples/${EXAMPLES[i]}.mp4`}
                  poster={`/examples/${EXAMPLES[i]}.jpg`}
                  label={title}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* Bande cinéma : le remplacement se rejoue tout seul au rythme du
            défilement. Un combat, rendu par le site avec la méthode du
            mannequin ; le texte à côté sur ordinateur, au-dessus sur mobile. */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
          <div className="text-center lg:text-left">
            <p className="eyebrow">{L.wipeEyebrow}</p>
            <h2 className="reveal mt-5 font-headline text-5xl leading-[0.92] sm:text-7xl lg:text-8xl">
              <span className="block text-gradient">{L.wipeTitleTop}</span>
              <span className="block text-shine">{L.wipeTitleBottom}</span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-[0.9375rem] leading-relaxed text-muted lg:mx-0">{L.wipeText}</p>
          </div>
          <div>
            <ScrollWipe
              before="/examples/mma-avant.mp4"
              after="/examples/mma-apres.mp4"
              posterBefore="/examples/mma-avant.jpg"
              posterAfter="/examples/mma-apres.jpg"
              labelBefore={L.compareBefore}
              labelAfter={L.compareAfter}
            />
          </div>
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <p className="eyebrow">{L.features}</p>
          <h2 className="reveal text-gradient mt-5 max-w-3xl font-headline text-5xl leading-[0.92] sm:text-7xl">
            {L.featuresTitle}
          </h2>
          <FeatureShowcase
            items={L.featureList.map(({ title, text }, i) => {
              const file = FEATURE_MEDIA[i];
              return {
                title,
                text,
                media: file
                  ? { kind: "video" as const, src: `/examples/${file}.mp4`, poster: `/examples/${file}.jpg` }
                  : { kind: "refund" as const },
              };
            })}
            refund={{
              clip: L.refundClip,
              status: L.refundStatus,
              refunded: fmt(L.refundCredits, { n: 15 * swapMethodRate() + SWAP_SHEET_CREDITS }),
              balance: L.refundBalance,
              balanceValue: `${CREDIT_PACKS[1].credits} ${t.common.credits}`,
              poster: "/examples/mma-avant.jpg",
            }}
          />
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
                <span className="font-headline text-4xl text-accent-light/60 transition-colors duration-300 group-hover:text-accent-hot">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-headline text-3xl leading-none">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Tarifs : une couleur par offre, comme la page Crédits. */}
        <section id="tarifs" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
          <p className="eyebrow">{L.pricing}</p>
          <h2 className="reveal text-gradient mt-5 font-headline text-5xl leading-[0.92] sm:text-7xl">
            {L.pricingTitle}
          </h2>
          <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
            {fmt(L.pricingText, {
              max: swapMethodRate().toLocaleString(INTL_LOCALES[locale]),
              hd: swapMethodRate(true).toLocaleString(INTL_LOCALES[locale]),
              sheet: SWAP_SHEET_CREDITS,
            })}
          </p>
          <ul className="mt-10 grid gap-5 lg:grid-cols-3">
            {CREDIT_PACKS.map((pack, i) => {
              const tier = TIERS[pack.id];
              const featured = tier.badge === "popular";
              return (
                <li
                  key={pack.id}
                  className="flex animate-fade-up flex-col rounded-2xl border p-6 transition-transform duration-200 hover:-translate-y-1"
                  style={{ ...tierCard(tier.color, tier.strength), animationDelay: `${i * 90}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-headline text-4xl leading-none">{P.packs[pack.id]}</h3>
                    {featured && <span className={`${BADGE} bg-accent text-white`}>{L.popular}</span>}
                  </div>
                  <p className="mt-2 text-sm text-muted">{P.taglines[pack.id]}</p>
                  <p className="mt-6 font-headline text-6xl leading-none">{price(pack.amount)}</p>
                  <p className="mt-3 flex items-center gap-2 text-sm font-semibold tabular-nums">
                    <Sparkles className="size-4 shrink-0" style={{ color: tier.color }} />
                    {pack.credits} {t.common.credits}
                  </p>
                  <p className="mt-1 pl-6 text-sm text-muted tabular-nums">
                    {fmt(P.eqSeconds, { n: swapMethodSecondsFor(pack.credits) })}
                  </p>
                  <Link
                    href={start}
                    className={`btn mt-8 w-full py-3.5 text-base ${featured ? "btn-accent" : i === 2 ? "btn-hot" : "btn-primary"}`}
                  >
                    {L.start}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href={loggedIn ? "/dashboard/credits" : "/login"}
            className="mt-6 inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted hover:text-text"
          >
            {subsBefore}
            <span className={OFF_BADGE}>{fmt(P.off, { pct: MAX_SUBSCRIPTION_OFF })}</span>
            {subsAfter}
            <ArrowRight className="size-3.5" />
          </Link>
        </section>

        {/* Appel final : une déclaration pleine page, pas une carte. Pas de
            reveal : en bout de page, la timeline de défilement peut ne jamais
            se dérouler assez et laisser la section invisible. */}
        <section className="relative isolate overflow-hidden border-t border-line px-4 py-20 sm:px-6 sm:py-40">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="mx-auto font-headline text-[2.8rem] leading-[0.92] sm:text-7xl lg:text-8xl">
              <span className="text-gradient">{L.finalTitleTop}</span>
              <br className="hidden sm:block" />{" "}
              <span className="text-shine">{L.finalTitleBottom}</span>
            </h2>
            <Magnetic>
              <Link href={start} className="btn btn-accent mt-10 px-10 py-5 text-lg">
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
