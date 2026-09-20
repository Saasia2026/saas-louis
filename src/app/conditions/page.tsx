import type { Metadata } from "next";
import Link from "next/link";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { ThemeToggle } from "@/app/theme-toggle";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.terms.title} — TwinPost` };
}

// Conditions d'utilisation : ce que le créateur garantit sur le clip et le
// personnage qu'il dépose, et ce que le service interdit. Affichées avant
// l'inscription (voir login/page.tsx) et depuis le pied de page.
export default async function TermsPage() {
  const t = await getDictionary();
  const T = t.terms;

  return (
    <div className="flex flex-1 flex-col">
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6">
        <p className="eyebrow">{T.eyebrow}</p>
        <h1 className="text-gradient mt-4 text-4xl font-semibold tracking-tight">{T.title}</h1>
        <p className="mt-3 text-sm text-muted">{T.updated}</p>

        <div className="mt-10 flex flex-col gap-8">
          {T.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 flex flex-col gap-2 text-[0.9375rem] leading-relaxed text-muted">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <Link href="/" className="btn btn-secondary mt-12">
          {T.back}
        </Link>
      </main>
    </div>
  );
}
