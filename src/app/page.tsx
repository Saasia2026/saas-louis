import { Landing, type LandingPack } from "@/app/landing";
import { TIERS } from "@/app/tier-style";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { CREDIT_PACKS, SUBSCRIPTION_PLANS, bonusCredits, creditsPerEuro, formatPrice, subscriptionOff } from "@/lib/credit-packs";
import { createClient } from "@/lib/supabase/server";

// Meilleure réduction réelle d'un abonnement (annuel) sur le pack aux mêmes
// crédits — le même calcul que la page Crédits.
const MAX_SUBSCRIPTION_OFF = Math.max(...SUBSCRIPTION_PLANS.map((plan) => subscriptionOff(plan, "year")));

// Trois recharges en vitrine ; toute la grille est sur la page Crédits.
const LANDING_PACKS = ["c1000", "c4000", "c5000"].map((id) => CREDIT_PACKS.find((p) => p.id === id)!);

// « Filmé par une personne. Joué par ton personnage. » -> deux lignes, la
// seconde en italique.
function twoLines(text: string): [string, string] {
  const at = text.indexOf(". ");
  return at < 0 ? [text, ""] : [text.slice(0, at + 1), text.slice(at + 2)];
}

const firstSentence = (text: string) => text.split(/(?<=[.!?])\s/)[0];

export default async function Home() {
  const [t, locale, supabase] = await Promise.all([getDictionary(), getLocale(), createClient()]);
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  // Le studio s'ouvre sans compte : la connexion vient au lancement.
  const studioHref = loggedIn ? "/dashboard/generate" : "/studio";
  const startHref = loggedIn ? "/dashboard/credits" : "/login";
  const L = t.landing;
  const intl = INTL_LOCALES[locale];
  const [examplesTop, examplesBottom] = twoLines(L.examplesTitle);
  const [featuresTop, featuresBottom] = twoLines(L.featuresTitle);
  const [subsBefore, subsAfter = ""] = L.pricingSubs.split("{off}");

  const packs: LandingPack[] = LANDING_PACKS.map((pack) => {
    const bonus = bonusCredits(pack);
    return {
      id: pack.id,
      credits: `${pack.credits.toLocaleString(intl)} ${t.common.credits}`,
      price: formatPrice(pack.amount, intl),
      perEuro: fmt(L.perEuro, { n: creditsPerEuro(pack) }),
      bonus: bonus > 0 ? fmt(L.bonusFree, { n: bonus }) : null,
      tagline: t.creditsPage.taglines[pack.tier],
      featured: TIERS[pack.tier].badge === "popular",
    };
  });

  return (
    <>
      <Landing
        loggedIn={loggedIn}
        studioHref={studioHref}
        startHref={startHref}
        creditsHref={loggedIn ? "/dashboard/credits" : "/login"}
        packs={packs}
        copy={{
          home: L.home,
          examples: L.examples,
          howItWorks: L.howItWorks,
          pricing: L.pricing,
          signIn: t.login.signIn,
          start: loggedIn ? L.studioShort : L.start,
          eyebrow: L.eyebrow,
          titleTop: L.titleTop,
          titleBottom: L.titleBottom,
          heroText: L.heroText,
          ctaFirst: loggedIn ? L.openStudio : L.ctaFirst,
          seeExamples: L.seeExamples,
          examplesTop,
          examplesBottom,
          examplesText: L.featureList[1].text,
          compareBefore: L.compareBefore,
          compareAfter: L.compareAfter,
          featuresTop,
          featuresBottom,
          steps: L.steps.map((step) => ({
            title: step.title,
            text: firstSentence(step.text),
          })),
          finalTop: L.finalTitleTop,
          finalBottom: L.finalTitleBottom,
          popular: L.popular,
          subsBefore,
          subsOff: fmt(t.creditsPage.off, { pct: MAX_SUBSCRIPTION_OFF }),
          subsAfter,
          allPrices: L.allPrices,
          terms: t.terms.link,
          nextScreen: L.nextScreen,
        }}
      />
    </>
  );
}
