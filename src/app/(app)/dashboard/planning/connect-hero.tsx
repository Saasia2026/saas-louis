import { Plus } from "lucide-react";
import { getDictionary } from "@/i18n/server";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/zernio";
import { connectAccount } from "./actions";
import { PlatformBadge } from "./platform-badge";

// Semaine d'exemple, faite de vrais rendus : ce que le planning donnera.
const PREVIEW: { poster: string; day: number; platform: SocialPlatform; tilt: string }[] = [
  { poster: "/showcase/henry.jpg", day: 1, platform: "tiktok", tilt: "-rotate-6 translate-y-3" },
  { poster: "/examples/micro-apres.jpg", day: 3, platform: "instagram", tilt: "z-10 -translate-y-1" },
  { poster: "/showcase/courtyard.jpg", day: 5, platform: "youtube", tilt: "rotate-6 translate-y-3" },
];

// Accueil du planning tant qu'aucun réseau n'est connecté.
export async function ConnectHero() {
  const P = (await getDictionary()).planning;
  return (
    <section className="panel mt-8 grid animate-fade-up items-center gap-8 overflow-hidden p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        <h2 className="font-headline text-[clamp(2.5rem,5vw,4rem)] leading-[0.88]">{P.heroTitle}</h2>
        <p className="mt-4 max-w-lg text-[0.9375rem] leading-relaxed text-muted">{P.heroText}</p>
        <ol className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          {P.steps.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white tabular-nums">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <div className="mt-7 grid max-w-lg grid-cols-2 gap-2.5">
          {SOCIAL_PLATFORMS.map((platform) => (
            <form key={platform} action={connectAccount}>
              <input type="hidden" name="platform" value={platform} />
              <button
                type="submit"
                className="btn btn-secondary w-full justify-start gap-3 py-3 text-[0.9375rem]"
              >
                <PlatformBadge platform={platform} className="size-7" />
                {P.platforms[platform]}
                <Plus className="ml-auto" />
              </button>
            </form>
          ))}
        </div>
      </div>

      <div aria-hidden className="relative mx-auto hidden h-80 w-full max-w-[22rem] items-center justify-center lg:flex">
        {PREVIEW.map((p) => (
          <div
            key={p.poster}
            className={`relative -mx-3 w-36 overflow-hidden rounded-2xl border border-line-strong bg-black bg-clip-padding shadow-[0_24px_50px_-20px_rgb(0_0_0/0.8)] ${p.tilt}`}
          >
            {/* Affiche statique d'un rendu : pas d'optimisation Next. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.poster} alt="" className="aspect-[9/16] w-full object-cover" />
            <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white tabular-nums">
              {P.weekdays[p.day]} 18:00
            </span>
            <span className="absolute top-2 right-2">
              <PlatformBadge platform={p.platform} className="size-6" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
