import Link from "next/link";
import { BackdropPhoto } from "@/app/backdrop-photo";
import { LanguageSwitcher } from "@/app/language-switcher";
import { getDictionary } from "@/i18n/server";

// Page introuvable, au style de la landing : vidéo plein cadre, titre en
// deux temps en bas à gauche, retour à l'accueil ou au studio.
export default async function NotFound() {
  const t = await getDictionary();
  const N = t.notFound;

  return (
    <main className="video-page relative isolate flex min-h-dvh flex-1 flex-col">
      <BackdropPhoto src="/photos/mirror.jpg" focus="50% 40%" />
      <header className="flex items-center justify-between px-5 pt-5 sm:px-8 lg:px-12" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        <Link href="/" className="font-wide text-[0.95rem] tracking-wide uppercase">
          TwinPost
        </Link>
        <LanguageSwitcher />
      </header>

      <div
        className="mt-auto w-full px-5 sm:px-8 lg:px-12"
        style={{ paddingBottom: "max(2.5rem, calc(1.5rem + env(safe-area-inset-bottom)))" }}
      >
        <p className="eyebrow animate-fade-up">{N.eyebrow}</p>
        <h1 className="mt-5 animate-fade-up font-headline text-6xl leading-[0.94] [animation-delay:80ms] sm:text-7xl xl:text-8xl">
          <span className="block">{N.titleTop}</span>
          <span className="text-shine block">{N.titleBottom}</span>
        </h1>
        <p className="mt-5 max-w-sm animate-fade-up text-lg leading-snug text-muted [animation-delay:120ms]">{N.text}</p>
        <div className="mt-8 flex animate-fade-up flex-wrap gap-3 [animation-delay:160ms]">
          <Link href="/" className="btn btn-primary">
            {N.home}
          </Link>
          <Link href="/dashboard/generate" className="btn btn-secondary">
            {N.studio}
          </Link>
        </div>
      </div>
    </main>
  );
}
