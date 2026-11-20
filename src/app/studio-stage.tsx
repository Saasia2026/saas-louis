import { BackdropVideo } from "@/app/backdrop-video";
import { getDictionary } from "@/i18n/server";

// Scène du studio, comme l'accueil de Dreamina ou la landing : une vidéo plein
// écran derrière toute la page, un grand titre, puis le générateur posé
// par-dessus en verre (.studio-stage rend les cartes translucides).
export async function StudioStage({ children }: { children: React.ReactNode }) {
  const L = (await getDictionary()).landing;
  return (
    <>
      <BackdropVideo h="/demos/demo-21" v="/examples/gallery/g-105" />
      <header className="mx-auto mb-8 max-w-3xl animate-fade-up pt-2 text-center sm:mb-12 sm:pt-6">
        <p className="eyebrow justify-center">{L.eyebrow}</p>
        <h1 className="mt-4 font-headline text-5xl leading-[0.95] text-white sm:text-7xl lg:text-8xl">
          <span className="block">{L.titleTop}</span>
          <span className="text-shine block">{L.titleBottom}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base whitespace-pre-line text-muted sm:text-lg">{L.heroText}</p>
      </header>
      <div className="studio-stage">{children}</div>
    </>
  );
}
