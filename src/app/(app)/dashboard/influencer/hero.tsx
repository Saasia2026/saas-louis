import { LogoMark } from "@/app/logo-mark";
import { PhoneFrame } from "@/app/phone-frame";
import { fmt } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { INFLUENCER_CREDITS, INFLUENCER_PRESETS, presetImage } from "@/lib/influencer";
import { TitleLines } from "@/app/title-lines";

// Exemples de la mosaïque, colonne par colonne.
const COLUMNS = [
  ["horn-hair", "walrus-cowboy"],
  ["dome-mustache", "platinum-bob-moto"],
  ["tower-afro", "twist-horns"],
  ["bowl-muscle", "block-hair"],
];

// En-tête de la page Influenceur IA : le titre, une mosaïque d'exemples, et
// un influenceur en vidéo verticale dans un téléphone, le nom de la page
// posé dessus.
export function InfluencerHero({ t }: { t: Dictionary["influencer"] }) {
  return (
    <header className="grid animate-fade-up grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line pb-8 sm:gap-8 sm:pb-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_auto]">
      <div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="text-gradient mt-3 font-headline text-[2.2rem] leading-[0.92] sm:mt-4 sm:text-6xl">
          <TitleLines text={t.title} />
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted sm:mt-4 sm:text-base">{t.intro}</p>
        <ul className="mt-4 flex flex-wrap gap-1.5 text-[0.6875rem] font-medium sm:mt-6 sm:gap-2 sm:text-xs">
          {[
            fmt(t.factCost, { n: INFLUENCER_CREDITS }),
            t.factTime,
            fmt(t.factExamples, { n: INFLUENCER_PRESETS.length }),
          ].map((fact) => (
            <li key={fact} className="rounded-full border border-line bg-surface px-2.5 py-1 text-muted sm:px-3 sm:py-1.5">
              {fact}
            </li>
          ))}
        </ul>
      </div>

      {/* Mosaïque : des personnages faits avec le générateur, en colonnes
          décalées, entre le titre et le téléphone. */}
      <div aria-hidden className="hidden min-w-0 items-center gap-3 lg:flex">
        {COLUMNS.map((column, i) => (
          <div key={i} className={`flex min-w-0 flex-1 flex-col gap-3 ${i % 2 ? "translate-y-6" : "-translate-y-6"}`}>
            {column.map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={id}
                src={presetImage(id)}
                alt=""
                className="aspect-[3/4] w-full rounded-2xl border border-line bg-white object-cover"
              />
            ))}
          </div>
        ))}
      </div>

      {/* Téléphone : à côté du titre, plus petit sur un téléphone. */}
      <PhoneFrame className="w-[6.75rem] sm:mx-auto sm:w-[12rem]">
        <video
          src="/influencers/hero.mp4"
          poster="/influencers/hero.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-[7%] z-10 hidden justify-center sm:flex">
          <span className="flex items-center gap-1.5 rounded-full bg-black/55 py-1.5 pr-3 pl-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <LogoMark className="size-5" animated={false} />
            {t.title}
          </span>
        </div>
      </PhoneFrame>
    </header>
  );
}
