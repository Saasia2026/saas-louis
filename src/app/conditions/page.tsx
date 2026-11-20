import type { Metadata } from "next";
import Link from "next/link";
import { LanguageSwitcher } from "@/app/language-switcher";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.terms.title} — TwinPost` };
}

// Conditions d'utilisation : ce que le créateur garantit sur le clip et le
// personnage qu'il dépose, et ce que le service interdit. Affichées avant
// l'inscription (voir login/page.tsx) et depuis le pied de page. Au style de
// la landing : un bandeau vidéo avec le titre, puis le texte, numéroté, sur
// fond sombre pour la lecture.
export default async function TermsPage() {
  const t = await getDictionary();
  const T = t.terms;

  return (
    <div className="video-page flex min-h-dvh flex-1 flex-col bg-bg">
      <section className="relative isolate flex min-h-[42vh] flex-col overflow-hidden">
        <video
          src="/demos/demo-17.mp4"
          poster="/demos/demo-17.jpg"
          muted
          loop
          autoPlay
          playsInline
          aria-hidden
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: "linear-gradient(to bottom, rgb(8 8 11 / 0.55), rgb(8 8 11 / 0.25) 40%, #08080b)" }}
        />
        <header
          className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-5 sm:px-6"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <Link href="/" className="font-wide text-[0.95rem] tracking-wide uppercase">
            TwinPost
          </Link>
          <LanguageSwitcher />
        </header>
        <div className="mx-auto mt-auto w-full max-w-3xl px-5 pt-16 pb-8 sm:px-6">
          <p className="eyebrow animate-fade-up">{T.eyebrow}</p>
          <h1 className="mt-4 animate-fade-up font-headline text-5xl leading-[0.95] [animation-delay:80ms] sm:text-6xl">{T.title}</h1>
          <p className="mt-3 animate-fade-up text-sm text-muted [animation-delay:120ms]">{T.updated}</p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 sm:px-6">
        <ol className="flex flex-col">
          {T.sections.map((section, i) => (
            <li key={section.title} className="grid gap-3 border-t border-line py-8 sm:grid-cols-[3rem_minmax(0,1fr)]">
              <span className="font-headline text-sm text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <section>
                <h2 className="font-headline text-2xl leading-tight">{section.title}</h2>
                <div className="mt-3 flex flex-col gap-2 text-[0.9375rem] leading-relaxed text-muted">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            </li>
          ))}
        </ol>

        <Link href="/" className="btn btn-accent mt-6">
          {T.back}
        </Link>
      </main>
    </div>
  );
}
