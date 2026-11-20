import "server-only";
import { fmt, INTL_LOCALES, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  bonusCredits,
  creditsPerEuro,
  formatPrice,
  subscriptionOff,
  subscriptionYearlySaving,
} from "@/lib/credit-packs";

// Offres des pop-ups : uniquement de vraies offres, calculées depuis la grille
// de prix (jamais de faux prix barrés). Rangées de la moins forte à la plus
// forte : chaque page en montre une plus alléchante que la précédente, chacune
// dans un format différent (petite carte, affiche, fenêtre au centre).
export type OfferLook = "card" | "poster" | "spotlight";

export type Offer = {
  id: string;
  look: OfferLook;
  kicker?: string;
  title: string;
  text: string;
  // Gros chiffre de l'affiche et de la fenêtre au centre.
  figure?: string;
  figureLabel?: string;
  cta: string;
  href: string;
  // Photo de la carte (chemin complet).
  photo: string;
};

const MAX_SUBSCRIPTION_OFF = Math.max(...SUBSCRIPTION_PLANS.map((plan) => subscriptionOff(plan, "year")));

// Recharge mise en avant : celle qui offre le plus de crédits en plus parmi
// les tailles courantes (jusqu'à 5 000 crédits, comme sur la landing).
const BONUS_PACK = CREDIT_PACKS.filter((p) => p.credits <= 5000).sort((a, b) => bonusCredits(b) - bonusCredits(a))[0];

// Abonnement annuel qui fait économiser le plus sur un an.
const BEST_PLAN = [...SUBSCRIPTION_PLANS].sort((a, b) => subscriptionYearlySaving(b, "year") - subscriptionYearlySaving(a, "year"))[0];

// Bandeau du haut : la plus forte remise de l'abonnement annuel.
export function offerBarFor(t: Dictionary, loggedIn: boolean) {
  const B = t.offerBar;
  return {
    chip: B.chip,
    text: fmt(B.text, { off: fmt(t.creditsPage.off, { pct: MAX_SUBSCRIPTION_OFF }) }),
    short: fmt(B.short, { off: fmt(t.creditsPage.off, { pct: MAX_SUBSCRIPTION_OFF }) }),
    cta: B.cta,
    close: B.close,
    href: loggedIn ? "/dashboard/credits?billing=year" : "/login?next=/dashboard/credits",
  };
}

export function offersFor(t: Dictionary, locale: Locale, loggedIn: boolean): Offer[] {
  const intl = INTL_LOCALES[locale];
  const O = t.offers;
  const credits = loggedIn ? "/dashboard/credits" : "/login?next=/dashboard/credits";
  const yearly = loggedIn ? "/dashboard/credits?billing=year" : "/login?next=/dashboard/credits";

  const first: Offer = loggedIn
    ? {
        id: "subs",
        look: "card",
        title: O.subsTitle,
        text: fmt(t.landing.pricingSubs, { off: fmt(t.creditsPage.off, { pct: MAX_SUBSCRIPTION_OFF }) }),
        cta: t.landing.allPrices,
        href: credits,
        photo: "/photos/blue-eye.jpg",
      }
    : {
        id: "signup",
        look: "card",
        title: O.signupTitle,
        text: t.login.freeCredits,
        cta: t.login.submitSignUp,
        href: "/login",
        photo: "/photos/blue-eye.jpg",
      };

  const offers: Offer[] = [first];

  const bonus = bonusCredits(BONUS_PACK);
  if (bonus > 0) {
    offers.push({
      id: `pack-${BONUS_PACK.id}`,
      look: "poster",
      title: fmt(O.packTitle, { credits: BONUS_PACK.credits.toLocaleString(intl), bonus: bonus.toLocaleString(intl) }),
      text: `${formatPrice(BONUS_PACK.amount, intl)} · ${fmt(t.landing.perEuro, { n: creditsPerEuro(BONUS_PACK) })}`,
      figure: `+${bonus.toLocaleString(intl)}`,
      figureLabel: O.packFigure,
      cta: t.landing.allPrices,
      href: credits,
      photo: "/photos/red-glass.jpg",
    });
  }

  const saving = subscriptionYearlySaving(BEST_PLAN, "year");
  if (saving > 0) {
    const amount = formatPrice(saving, intl);
    offers.push({
      id: `saving-${BEST_PLAN.id}`,
      look: "spotlight",
      kicker: O.bestKicker,
      title: fmt(O.savingTitle, { amount }),
      text: fmt(O.savingText, {
        plan: `${t.creditsPage.subscriptions.plans[BEST_PLAN.tier]} ${BEST_PLAN.credits.toLocaleString(intl)}`,
        credits: BEST_PLAN.credits.toLocaleString(intl),
      }),
      figure: fmt(t.creditsPage.off, { pct: subscriptionOff(BEST_PLAN, "year") }),
      cta: O.savingCta,
      href: yearly,
      photo: "/photos/tongue.jpg",
    });
  }

  return offers;
}
