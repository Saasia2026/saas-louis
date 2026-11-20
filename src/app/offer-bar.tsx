"use client";

import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import b from "./offer-bar.module.css";

// Cookie de session : bandeau masqué jusqu'à la fermeture du navigateur.
export const OFFER_BAR_COOKIE = "offer_bar_closed";

// Pages où le bandeau gênerait : le tunnel d'accueil (il a déjà ses offres),
// la page des crédits (c'est là qu'il mène) et les pages de compte.
const HIDDEN = ["/welcome", "/dashboard/credits", "/auth"];

// Bandeau d'offre permanent en haut de toutes les pages, comme sur les
// sites d'outils IA : une vraie offre (l'abonnement annuel, calculé depuis la
// grille de prix), jamais de faux compte à rebours. Il réserve sa hauteur
// via --offer-bar (voir offer-bar.module.css) ; la croix le masque pour la
// session.
export function OfferBar({
  chip,
  text,
  short,
  cta,
  close,
  href,
}: {
  chip: string;
  text: string;
  short: string;
  cta: string;
  close: string;
  href: string;
}) {
  const pathname = usePathname();
  const [closed, setClosed] = useState(false);
  if (closed || HIDDEN.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className={b.bar} data-offer-bar role="region" aria-label={chip}>
      <Link href={href} className={b.link}>
        <span className={b.chip}>{chip}</span>
        <span className={b.text}>{text}</span>
        <span className={b.short}>{short}</span>
        <span className={b.cta}>
          {cta}
          <ArrowUpRight />
        </span>
      </Link>
      <button
        type="button"
        className={b.close}
        aria-label={close}
        title={close}
        onClick={() => {
          document.cookie = `${OFFER_BAR_COOKIE}=1; path=/; samesite=lax`;
          setClosed(true);
        }}
      >
        <X />
      </button>
    </div>
  );
}
