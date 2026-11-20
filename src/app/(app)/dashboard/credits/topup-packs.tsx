"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useState } from "react";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import {
  SLIDER_PACKS,
  TOPUP_PACKS,
  formatPrice,
  packOff,
  packReference,
  per100,
  type CreditPack,
} from "@/lib/credit-packs";
import { buyCredits, buyWithSavedCard } from "./actions";
import c from "./credits.module.css";

type Card = { brand: string; last4: string } | null;

// Ordre des cartes sous le curseur : la plus grande, mise en avant, d'abord.
const CARDS = [...TOPUP_PACKS].reverse();

// Recharges : un curseur de 5 000 à 100 000 crédits, puis des cartes de 4 000
// à 500. Prix barré = les mêmes crédits au tarif du pack de 500 ; la
// réduction affichée est donc réelle.
export function TopupPacks({ card, nonce, enabled }: { card: Card; nonce: string; enabled: boolean }) {
  const { t, locale } = useI18n();
  const P = t.creditsPage;
  const intl = INTL_LOCALES[locale];
  const price = (amount: number) => formatPrice(amount, intl);
  const n = (x: number) => x.toLocaleString(intl);
  const [index, setIndex] = useState(0);
  const big = SLIDER_PACKS[index];

  return (
    <div className="space-y-5">
      {/* Grand format au curseur. */}
      <div className={c.big}>
        <video src="/demos/demo-17.mp4" poster="/demos/demo-17.jpg" muted loop autoPlay playsInline aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${c.badge} ${c.badgeSolid}`}>{P.bestValue}</span>
              {packOff(big) > 0 && <span className={c.badge}>{fmt(P.off, { pct: packOff(big) })}</span>}
            </div>
            <h3 className={`${c.bigTitle} mt-3`}>
              {n(big.credits)} <em>{t.common.credits}</em>
            </h3>
          </div>
          <div className="text-right">
            <p className="flex items-baseline justify-end gap-3">
              <span className={c.ref}>{price(packReference(big))}</span>
              <span className={c.bigPrice}>{price(big.amount)}</span>
            </p>
            <p className={`${c.muted} mt-2 text-sm tabular-nums`}>{fmt(P.per100, { price: price(per100(big)) })}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            {/* Repères au-dessus de chaque cran, alignés sur les points. */}
            <div className={`${c.ticks} relative mx-[22px] h-5 text-xs font-semibold tabular-nums sm:text-sm`}>
              {SLIDER_PACKS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index}
                  style={{ left: `${(i / LAST) * 100}%` }}
                  className={`absolute top-0 -translate-x-1/2 ${
                    i % 2 === 1 && i !== LAST ? "max-sm:hidden" : ""
                  }`}
                >
                  {p.credits / 1000}k
                </button>
              ))}
            </div>
            <Slider index={index} setIndex={setIndex} label={P.sliderLabel} valueText={`${n(big.credits)} ${t.common.credits}`} />
          </div>
          <BuyButton pack={big} card={card} nonce={nonce} enabled={enabled} light />
        </div>
      </div>

      {/* Cartes de 4 000 à 500 crédits ; la plus grande mise en avant. */}
      <ul className="grid gap-5 md:grid-cols-2">
        {CARDS.map((pack, i) => {
          const featured = i === 0;
          const off = packOff(pack);
          return (
            <li
              key={pack.id}
              className={`flex flex-col rounded-[1.75rem] border p-6 transition-transform duration-300 hover:-translate-y-1 sm:p-7 ${
                featured ? "border-transparent bg-text text-bg" : "border-line bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="font-headline text-3xl leading-none tabular-nums sm:text-4xl">
                  {n(pack.credits)} <span className="text-shine text-inherit">{t.common.credits}</span>
                </h3>
                {off > 0 && (
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${featured ? "border-bg/30" : "border-line-strong"}`}>
                    {fmt(P.off, { pct: off })}
                  </span>
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-end justify-between gap-4 sm:mt-auto sm:pt-10">
                <div>
                  <p className="flex items-baseline gap-2.5">
                    <span className="font-headline text-3xl leading-none tabular-nums">{price(pack.amount)}</span>
                    {off > 0 && (
                      <span className="font-headline text-xl line-through decoration-2 opacity-45">{price(packReference(pack))}</span>
                    )}
                  </p>
                  <p className="mt-1.5 text-sm tabular-nums opacity-65">{fmt(P.per100, { price: price(per100(pack)) })}</p>
                </div>
                <BuyButton pack={pack} card={card} nonce={nonce} enabled={enabled} inverted={featured} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const LAST = SLIDER_PACKS.length - 1;
// Diamètre de la poignée, en px : les crans vont de son centre à gauche à
// son centre à droite.
const KNOB = 44;

// Curseur façon Higgsfield : rail épais, remplissage citron jusqu'à la
// poignée, un point par cran. Un vrai <input type="range"> transparent par
// dessus garde le clavier, le glisser et l'accessibilité ; sa poignée a la
// taille de la poignée dessinée, donc les positions coïncident.
function Slider({
  index,
  setIndex,
  label,
  valueText,
}: {
  index: number;
  setIndex: (i: number) => void;
  label: string;
  valueText: string;
}) {
  const at = (i: number) => `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${i / LAST})`;
  return (
    <div className={c.track}>
      {/* Remplissage jusqu'au bord droit de la poignée. */}
      <div aria-hidden className={c.fill} style={{ width: `calc(${at(index)} + ${KNOB / 2}px)` }} />
      {SLIDER_PACKS.map((p, i) => (
        <span
          key={p.id}
          aria-hidden
          className={c.notch}
          style={{ left: at(i), background: i <= index ? "rgb(12 12 16 / 0.35)" : "rgb(255 255 255 / 0.3)" }}
        />
      ))}
      <input
        type="range"
        min={0}
        max={LAST}
        step={1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 [&::-moz-range-thumb]:size-11 [&::-webkit-slider-thumb]:size-11 [&::-webkit-slider-thumb]:appearance-none"
      />
      <span aria-hidden className={c.knob} style={{ left: at(index) }}>
        <ChevronsLeftRight className="size-5" strokeWidth={2.5} />
      </span>
    </div>
  );
}

// Achat : en un clic avec la carte enregistrée, sinon page de paiement Stripe.
// `light` : sur la carte sombre de la grande recharge ; `inverted` : sur la
// carte claire mise en avant.
function BuyButton({
  pack,
  card,
  nonce,
  enabled,
  light = false,
  inverted = false,
}: {
  pack: CreditPack;
  card: Card;
  nonce: string;
  enabled: boolean;
  light?: boolean;
  inverted?: boolean;
}) {
  const { t } = useI18n();
  const P = t.creditsPage;
  const brand = card ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "";
  const cls = light
    ? c.buyLight
    : inverted
      ? "btn shrink-0 bg-bg px-6 py-3 text-base text-text hover:opacity-90"
      : "btn btn-accent shrink-0 px-6 py-3 text-base";
  if (!card) {
    return (
      <form action={buyCredits}>
        <input type="hidden" name="pack" value={pack.id} />
        <button type="submit" disabled={!enabled} className={cls}>
          {P.buy}
        </button>
      </form>
    );
  }
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <form action={buyWithSavedCard}>
        <input type="hidden" name="pack" value={pack.id} />
        <input type="hidden" name="nonce" value={`${nonce}-${pack.id}`} />
        <button type="submit" disabled={!enabled} className={cls}>
          {fmt(P.payWith, { brand, last4: card.last4 })}
        </button>
      </form>
      <form action={buyCredits}>
        <input type="hidden" name="pack" value={pack.id} />
        <button type="submit" disabled={!enabled} className={light ? c.otherLight : "text-xs opacity-65 hover:opacity-100"}>
          {P.otherCard}
        </button>
      </form>
    </div>
  );
}
