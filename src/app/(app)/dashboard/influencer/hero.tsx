import { TitleLines } from "@/app/title-lines";
import { fmt } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { INFLUENCER_CREDITS, INFLUENCER_PRESETS, presetImage } from "@/lib/influencer";

// Voile du bandeau : sombre à gauche pour le texte, la mosaïque se voit à
// droite.
const VEIL = "linear-gradient(to right, rgb(8 8 12 / 0.96), rgb(8 8 12 / 0.78) 45%, rgb(8 8 12 / 0.35))";

// En-tête de la page Influenceur IA, au style de la landing : un bandeau
// sombre posé sur la mosaïque des personnages faits avec le générateur, le
// titre à gauche, un influenceur en vidéo verticale à droite.
export function InfluencerHero({ t }: { t: Dictionary["influencer"] }) {
  return (
    <header className="video-page relative isolate animate-fade-up overflow-hidden rounded-[2rem] border border-white/10 bg-black">
      <div aria-hidden className="absolute inset-0 -z-20 grid grid-cols-4 content-center gap-3 p-3 sm:grid-cols-6 lg:grid-cols-8">
        {INFLUENCER_PRESETS.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            src={presetImage(p.id)}
            alt=""
            className={`aspect-[3/4] w-full rounded-xl bg-white object-cover ${i % 2 ? "translate-y-4" : "-translate-y-4"}`}
          />
        ))}
      </div>
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: VEIL }} />

      <div className="grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-14">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="mt-4 font-headline text-5xl leading-[0.95] sm:text-7xl">
            <TitleLines text={t.title} />
          </h1>
          <p className="mt-4 max-w-md text-base text-muted sm:text-lg">{t.intro}</p>
          <ul className="mt-6 flex flex-wrap gap-2 text-xs font-medium sm:text-sm">
            {[
              fmt(t.factCost, { n: INFLUENCER_CREDITS }),
              t.factTime,
              fmt(t.factExamples, { n: INFLUENCER_PRESETS.length }),
            ].map((fact) => (
              <li key={fact} className="glass rounded-full border border-line px-3 py-1.5">
                {fact}
              </li>
            ))}
          </ul>
        </div>

        {/* Un influenceur en vidéo, son nom posé dessus. */}
        <div className="relative mx-auto hidden w-48 sm:block lg:w-56">
          <video
            src="/influencers/hero.mp4"
            poster="/influencers/hero.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="aspect-[9/16] w-full rounded-3xl border border-white/20 object-cover shadow-2xl"
          />
          <span className="absolute inset-x-0 bottom-4 mx-auto w-max rounded-full bg-white px-3 py-1 text-xs font-bold text-black">
            {t.title}
          </span>
        </div>
      </div>
    </header>
  );
}
