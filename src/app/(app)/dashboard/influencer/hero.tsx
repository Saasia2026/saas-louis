import { LogoMark } from "@/app/logo-mark";
import { PhoneFrame } from "@/app/phone-frame";
import { fmt } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { INFLUENCER_CREDITS, INFLUENCER_PRESETS, presetImage } from "@/lib/influencer";

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
    <header className="grid animate-fade-up items-center gap-8 border-b border-line pb-10 md:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_auto]">
      <div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="text-gradient mt-4 font-headline text-[2.6rem] leading-[0.92] sm:text-6xl">{t.title}</h1>
        <p className="mt-4 max-w-md text-muted">{t.intro}</p>
        <ul className="mt-6 flex flex-wrap gap-2 text-xs font-medium">
          {[
            fmt(t.factCost, { n: INFLUENCER_CREDITS }),
            t.factTime,
            fmt(t.factExamples, { n: INFLUENCER_PRESETS.length }),
          ].map((fact) => (
            <li key={fact} className="rounded-full border border-line bg-surface px-3 py-1.5 text-muted">
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

      <PhoneFrame className="mx-auto w-[10rem] sm:w-[12rem]">
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
        <div className="pointer-events-none absolute inset-x-0 bottom-[7%] z-10 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-black/55 py-1.5 pr-3 pl-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <LogoMark className="size-5" animated={false} />
            {t.title}
          </span>
        </div>
      </PhoneFrame>
    </header>
  );
}
