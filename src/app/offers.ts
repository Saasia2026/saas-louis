import "server-only";
import { fmt, INTL_LOCALES, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { CREDIT_PACKS, SUBSCRIPTION_PLANS, bonusCredits, creditsPerEuro, formatPrice, subscriptionOff } from "@/lib/credit-packs";

// Offres des pop-ups : uniquement de vraies offres, calculées depuis la grille
// de prix (jamais de faux prix barrés).
export type Offer = {
  id: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  video: string;
};

const MAX_SUBSCRIPTION_OFF = Math.max(...SUBSCRIPTION_PLANS.map((plan) => subscriptionOff(plan, "year")));

// Recharge mise en avant : celle qui offre le plus de crédits en plus.
const BONUS_PACK = [...CREDIT_PACKS].sort((a, b) => bonusCredits(b) - bonusCredits(a))[0];

export function offersFor(t: Dictionary, locale: Locale, loggedIn: boolean): Offer[] {
  const intl = INTL_LOCALES[locale];
  const credits = loggedIn ? "/dashboard/credits" : "/login?next=/dashboard/credits";
  const subs = {
    id: "subs",
    title: t.offers.subsTitle,
    text: fmt(t.landing.pricingSubs, { off: fmt(t.creditsPage.off, { pct: MAX_SUBSCRIPTION_OFF }) }),
    cta: t.landing.allPrices,
    href: credits,
    video: "/demos/demo-17",
  };
  const bonus = bonusCredits(BONUS_PACK);
  const pack = {
    id: `pack-${BONUS_PACK.id}`,
    title: fmt(t.offers.packTitle, { credits: BONUS_PACK.credits.toLocaleString(intl), bonus: bonus.toLocaleString(intl) }),
    text: `${formatPrice(BONUS_PACK.amount, intl)} · ${fmt(t.landing.perEuro, { n: creditsPerEuro(BONUS_PACK) })}`,
    cta: t.landing.allPrices,
    href: credits,
    video: "/demos/demo-09",
  };
  if (!loggedIn) {
    return [
      {
        id: "signup",
        title: t.offers.signupTitle,
        text: t.login.freeCredits,
        cta: t.login.submitSignUp,
        href: "/login",
        video: "/demos/demo-21",
      },
      subs,
    ];
  }
  return bonus > 0 ? [subs, pack] : [subs];
}
