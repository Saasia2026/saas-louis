import { BackdropVideo } from "@/app/backdrop-video";
import { getDictionary } from "@/i18n/server";

// Scène du studio : une vidéo plein écran derrière toute la page, un titre
// centré sur une ligne, puis le générateur posé par-dessus en verre
// (.studio-stage rend les cartes translucides).
export async function StudioStage({ children }: { children: React.ReactNode }) {
  const L = (await getDictionary()).landing;
  return (
    <>
      <BackdropVideo h="/demos/demo-21" v="/examples/gallery/g-105" />
      <header className="mx-auto mb-8 max-w-4xl animate-fade-up pt-2 text-center sm:mb-10 sm:pt-6">
        <p className="eyebrow justify-center">{L.eyebrow}</p>
        <h1 className="mt-4 font-headline text-4xl leading-[1] text-white sm:text-6xl">
          {L.titleTop} <span className="text-shine">{L.titleBottom}</span>
        </h1>
      </header>
      <div className="studio-stage">{children}</div>
    </>
  );
}
