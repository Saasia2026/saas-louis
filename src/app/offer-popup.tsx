"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import type { Offer } from "./offers";
import s from "./offer-popup.module.css";

// Pop-up d'offre, de plus en plus alléchant : à chaque page, quelques
// secondes après l'ouverture, l'offre suivante de la liste (rangée de la
// moins forte à la plus forte), chacune dans son format — petite carte,
// affiche avec un gros chiffre, puis fenêtre au centre. Une fois la plus
// forte atteinte, c'est elle qui revient. Fermer la plus forte, ou cliquer
// une offre, arrête les pop-ups pour la visite (sessionStorage) ; la visite
// suivante recommence au début.
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

// « Moins cher, en abonnement. » -> « Moins cher, » + « en abonnement. »
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
      setOffer(offers[Math.min(turn, offers.length - 1)]);
      write(TURN, String(turn + 1));
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [offers]);

  useEffect(() => {
    if (offer?.look !== "spotlight") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!offer) return null;

  const strongest = offer === offers[offers.length - 1];
  function dismiss(stop: boolean) {
    if (stop) write(CLOSED, "1");
    setLeaving(true);
    window.setTimeout(() => setOffer(null), 350);
  }
  const close = () => dismiss(strongest);
  const take = () => write(CLOSED, "1");
  const [top, bottom] = split(offer.title);
  const title = (
    <p className={s.title}>
      {top} {bottom && <em>{bottom}</em>}
    </p>
  );
  // eslint-disable-next-line @next/next/no-img-element
  const video = <img src={offer.photo} alt="" aria-hidden />;
  const closeButton = (
    <button type="button" className={s.close} onClick={close} aria-label={t.offers.close} title={t.offers.close}>
      <X />
    </button>
  );
  const cta = (
    <Link href={offer.href} className={s.cta} onClick={take}>
      {offer.cta}
      <ArrowRight />
    </Link>
  );

  // 3 · Fenêtre au centre, sur la vidéo : la meilleure offre.
  if (offer.look === "spotlight") {
    return (
      <div className={[s.backdrop, leaving && s.leaving].filter(Boolean).join(" ")} onClick={(e) => e.target === e.currentTarget && close()}>
        <aside role="dialog" aria-modal="true" aria-label={t.offers.label} className={s.spotlight}>
          {video}
          {offer.kicker && <span className={s.tag}>{offer.kicker}</span>}
          <div className={s.spotBody}>
            <p className={s.bigFigure}>{offer.figure}</p>
            {title}
            <p className={s.text}>{offer.text}</p>
            <div className={s.spotActions}>
              {cta}
              <button type="button" className={s.later} onClick={close}>
                {t.offers.later}
              </button>
            </div>
          </div>
          {closeButton}
        </aside>
      </div>
    );
  }

  const place = [side === "right" ? s.right : s.left, landing && s.landing, leaving && s.leaving];

  // 2 · Affiche plein cadre, avec le gros chiffre.
  if (offer.look === "poster") {
    return (
      <aside role="dialog" aria-label={t.offers.label} className={[s.card, s.poster, ...place].filter(Boolean).join(" ")}>
        <div className={s.media}>{video}</div>
        <span className={s.tag}>{t.offers.label}</span>
        <div className={s.body}>
          <p className={s.figure}>
            {offer.figure} <span>{offer.figureLabel}</span>
          </p>
          {title}
          <p className={s.text}>{offer.text}</p>
          {cta}
        </div>
        {closeButton}
      </aside>
    );
  }

  // 1 · Petite carte vidéo.
  return (
    <aside role="dialog" aria-label={t.offers.label} className={[s.card, ...place].filter(Boolean).join(" ")}>
      <div className={s.media}>
        {video}
        <span className={s.tag}>{t.offers.label}</span>
      </div>
      <div className={s.body}>
        {title}
        <p className={s.text}>{offer.text}</p>
        {cta}
      </div>
      {closeButton}
    </aside>
  );
}
