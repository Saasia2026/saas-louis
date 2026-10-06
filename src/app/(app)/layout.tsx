import { Coins, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { ParticleField } from "@/app/particle-field";
import { ThemeToggle } from "@/app/theme-toggle";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { swapMethodRate } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";
import { MainNav, TopNav } from "./nav-links";

// Espace connecté. Le proxy redirige déjà, mais on revérifie ici :
// le proxy n'est qu'une vérification optimiste.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, credits_remaining")
    .eq("id", data.claims.sub)
    .single();

  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const displayName = profile?.full_name || profile?.email || "";
  const credits = profile?.credits_remaining ?? 0;
  const numberFormat = new Intl.NumberFormat(INTL_LOCALES[locale]);
  const creditsLabel = numberFormat.format(credits);
  // Ce que le solde représente : secondes de vidéo en 720p (une passe), en
  // minutes au-delà de deux.
  const videoSeconds = Math.floor(credits / swapMethodRate());
  const videoLabel =
    videoSeconds >= 120
      ? fmt(t.shell.creditsMinutes, { n: numberFormat.format(Math.floor(videoSeconds / 60)) })
      : fmt(t.shell.creditsSeconds, { n: videoSeconds });

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
      {/* Même fond que le landing, en plus discret : l'outil reste
          concentré, le site reste un seul monde. */}
      <ParticleField subtle />

      {/* Barre du haut, sur toute la largeur : la navigation y tient en une
          ligne et laisse tout l'écran au contenu. */}
      <header className="glass sticky top-0 z-20 border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="min-w-0 shrink">
            <Logo href="/dashboard" compact />
          </div>
          <div className="ml-2 hidden md:block lg:ml-6">
            <MainNav />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Solde : en grand, traduit en durée de vidéo, avec la recharge. */}
            <div
              title={videoLabel}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/80 py-1 pr-1 pl-3"
            >
              <Coins className="size-4 shrink-0 text-accent-light" />
              <span className="min-w-0">
                <span className="block max-w-[9rem] truncate font-headline text-lg leading-none tabular-nums sm:max-w-none">
                  {creditsLabel}
                </span>
                <span className="hidden text-[0.6875rem] leading-tight text-faint xl:block">{videoLabel}</span>
              </span>
              <Link
                href="/dashboard/credits"
                title={t.shell.recharge}
                className="btn btn-accent px-2.5 py-1.5 text-[0.8125rem]"
              >
                <Plus />
                <span className="hidden lg:inline">{t.shell.recharge}</span>
              </Link>
            </div>

            <Link href="/dashboard/generate" className="btn btn-hot hidden lg:inline-flex">
              <Plus />
              {t.shell.newVideo}
            </Link>

            <div className="flex items-center">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>

            <span
              title={displayName}
              className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surface-3 to-surface-2 text-xs font-semibold uppercase ring-1 ring-line-strong xl:flex"
            >
              {displayName.charAt(0)}
            </span>
            <form action={signOut}>
              <button type="submit" title={t.common.signOut} className="btn btn-ghost p-2">
                <LogOut />
                <span className="sr-only">{t.common.signOut}</span>
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-line px-4 py-2 md:hidden">
          <TopNav />
        </div>
      </header>

      <main className="relative isolate min-w-0 flex-1 overflow-x-clip px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
