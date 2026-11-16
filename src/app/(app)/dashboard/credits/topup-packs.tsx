"use client";

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
import { SHORT_CLIP_SECONDS, swapShortClipsFor } from "@/lib/generation";
import { buyCredits, buyWithSavedCard } from "./actions";
import { LIME, LIME_PILL } from "./pricing-look";

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
  const clips = (p: CreditPack) =>
    fmt(P.clipsStd, { n: n(swapShortClipsFor(p.credits, { model: "standard" })), s: SHORT_CLIP_SECONDS });

  return (
    <div className="space-y-5">
      {/* Grand format au curseur. */}
      <div className="rounded-[1.75rem] border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-headline text-4xl leading-none tabular-nums sm:text-5xl">
                {n(big.credits)} {t.common.credits}
              </h3>
              <span className="rounded-md border border-line-strong bg-surface-2 px-2 py-0.5 text-xs font-bold">{P.bestValue}</span>
              {packOff(big) > 0 && <span className={LIME_PILL}>{fmt(P.off, { pct: packOff(big) })}</span>}
            </div>
            <p className="mt-2 text-[0.9375rem] text-muted tabular-nums">{clips(big)}</p>
          </div>
          <div className="text-right">
            <p className="flex items-baseline justify-end gap-3">
              <span className="font-headline text-2xl text-faint line-through decoration-2">{price(packReference(big))}</span>
              <span className="font-headline text-4xl leading-none tabular-nums sm:text-5xl">{price(big.amount)}</span>
            </p>
            <p className="mt-2 text-sm text-muted tabular-nums">{fmt(P.per100, { price: price(per100(big)) })}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-xs font-semibold text-muted tabular-nums sm:text-sm">
              {SLIDER_PACKS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`transition-colors ${i === index ? "text-text" : "hover:text-text"} ${
                    i % 2 === 1 && i !== SLIDER_PACKS.length - 1 ? "max-sm:hidden" : ""
                  }`}
                >
                  {p.credits / 1000}k
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={SLIDER_PACKS.length - 1}
              step={1}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
              aria-label={P.sliderLabel}
              aria-valuetext={`${n(big.credits)} ${t.common.credits}`}
              className="mt-3 h-2 w-full cursor-pointer"
              style={{ accentColor: LIME }}
            />
          </div>
          <BuyButton pack={big} card={card} nonce={nonce} enabled={enabled} />
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
              className={`flex flex-col rounded-[1.75rem] border p-6 sm:p-7 ${featured ? "border-[#c8f04a]/50" : "border-line bg-surface"}`}
              style={
                featured
                  ? {
                      background:
                        "linear-gradient(180deg, color-mix(in oklab, #c8f04a 10%, var(--surface)) 0%, color-mix(in oklab, #c8f04a 28%, var(--surface)) 100%)",
                      boxShadow: "0 0 0 1px rgb(200 240 74 / 0.25), 0 20px 60px -30px rgb(200 240 74 / 0.6)",
                    }
                  : undefined
              }
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="font-headline text-3xl leading-none tabular-nums sm:text-4xl">
                  {n(pack.credits)} {t.common.credits}
                </h3>
                {off > 0 && <span className={LIME_PILL}>{fmt(P.off, { pct: off })}</span>}
              </div>
              <p className="mt-2 text-[0.9375rem] text-muted tabular-nums">{clips(pack)}</p>
              <div className="mt-10 flex flex-wrap items-end justify-between gap-4 sm:mt-auto sm:pt-12">
                <div>
                  <p className="flex items-baseline gap-2.5">
                    <span className="font-headline text-3xl leading-none tabular-nums">{price(pack.amount)}</span>
                    {off > 0 && (
                      <span className="font-headline text-xl text-faint line-through decoration-2">{price(packReference(pack))}</span>
                    )}
                  </p>
                  <p className="mt-1.5 text-sm text-muted tabular-nums">{fmt(P.per100, { price: price(per100(pack)) })}</p>
                </div>
                <BuyButton pack={pack} card={card} nonce={nonce} enabled={enabled} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Achat : en un clic avec la carte enregistrée, sinon page de paiement Stripe.
function BuyButton({ pack, card, nonce, enabled }: { pack: CreditPack; card: Card; nonce: string; enabled: boolean }) {
  const { t } = useI18n();
  const P = t.creditsPage;
  const brand = card ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "";
  const cls =
    "btn shrink-0 rounded-full border border-line-strong bg-surface-2 px-6 py-3 text-base font-semibold hover:bg-surface-3";
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
        <button type="submit" disabled={!enabled} className="text-xs text-muted hover:text-text">
          {P.otherCard}
        </button>
      </form>
    </div>
  );
}
