"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import type { Offer } from "./offers";
import s from "./offer-popup.module.css";

// Pop-up d'offre, à chaque visite : il arrive quelques secondes après
// l'ouverture de la page et change d'offre d'une page à l'autre. Fermé, il
// ne revient plus pendant la visite (sessionStorage), puis revient à la
// visite suivante.
const CLOSED = "twinpost-offer-closed";
const TURN = "twinpost-offer-turn";
const DELAY_MS = 6000;

function read(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Stockage bloqué : le pop-up se ferme quand même pour cette page.
  }
}

// Coupe « Moins cher, en abonnement. » en « Moins cher, » + « en abonnement. »
function split(title: string): [string, string] {
  const m = /^(.+?[,.:!?])\s+(.+)$/.exec(title);
  return m ? [m[1], m[2]] : [title, ""];
}

export function OfferPopup({
  offers,
  side = "left",
  landing = false,
}: {
  offers: Offer[];
  side?: "left" | "right";
  landing?: boolean;
}) {
  const { t } = useI18n();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!offers.length || read(CLOSED)) return;
    const turn = Number(read(TURN) ?? 0) || 0;
    const timer = window.setTimeout(() => {
      setOffer(offers[turn % offers.length]);
      write(TURN, String(turn + 1));
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [offers]);

  if (!offer) return null;

  const close = () => {
    write(CLOSED, "1");
    setLeaving(true);
    window.setTimeout(() => setOffer(null), 350);
  };
  const [top, bottom] = split(offer.title);

  return (
    <aside
      role="dialog"
      aria-label={t.offers.label}
      className={[s.card, side === "right" ? s.right : s.left, landing && s.landing, leaving && s.leaving].filter(Boolean).join(" ")}
    >
      <div className={s.media}>
        <video src={`${offer.video}.mp4`} poster={`${offer.video}.jpg`} muted loop autoPlay playsInline aria-hidden />
        <span className={s.tag}>{t.offers.label}</span>
      </div>
      <div className={s.body}>
        <p className={s.title}>
          {top} {bottom && <em>{bottom}</em>}
        </p>
        <p className={s.text}>{offer.text}</p>
        <Link href={offer.href} className={s.cta} onClick={() => write(CLOSED, "1")}>
          {offer.cta}
          <ArrowRight />
        </Link>
      </div>
      <button type="button" className={s.close} onClick={close} aria-label={t.offers.close} title={t.offers.close}>
        <X />
      </button>
    </aside>
  );
}
