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
import { Breadcrumb, SidebarNav, TopNav } from "./nav-links";

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

  const avatar = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surface-3 to-surface-2 text-xs font-semibold uppercase ring-1 ring-line-strong">
      {displayName.charAt(0)}
    </span>
  );

  return (
    <div className="flex flex-1 overflow-x-clip">
      {/* Même fond que le landing, en plus discret : l'outil reste
          concentré, le site reste un seul monde. */}
      <ParticleField subtle />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/80 px-3 py-4 md:flex">
        <div className="px-2">
          <Logo href="/dashboard" />
        </div>

        <Link href="/dashboard/generate" className="btn btn-accent mt-6 w-full">
          <Plus />
          {t.shell.newVideo}
        </Link>

        <p className="mt-7 mb-2 px-2.5 text-[0.6875rem] font-semibold tracking-[0.14em] text-faint uppercase">
          {t.shell.workspace}
        </p>
        <SidebarNav />

        <div className="mt-auto flex flex-col gap-3 pt-4">
          {/* Solde : en grand, traduit en durée de vidéo, avec la recharge. */}
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Coins className="size-3.5 text-accent-light" />
              {t.shell.nav.credits}
            </p>
            <p className="mt-2 truncate font-headline text-3xl leading-none tabular-nums" title={creditsLabel}>
              {creditsLabel}
            </p>
            <p className="mt-1.5 truncate text-xs text-faint">{videoLabel}</p>
            <Link href="/dashboard/credits" className="btn btn-accent mt-3 w-full">
              <Plus />
              {t.shell.recharge}
            </Link>
          </div>

          <div className="flex items-center justify-between border-t border-line px-1 pt-3">
            <ThemeToggle />
            <LanguageSwitcher up />
          </div>

          <div className="flex items-center gap-3 rounded-xl px-2 py-1">
            {avatar}
            <span className="min-w-0 flex-1 truncate text-sm text-muted" title={displayName}>
              {displayName}
            </span>
            <form action={signOut}>
              <button type="submit" title={t.common.signOut} className="btn btn-ghost p-2">
                <LogOut />
                <span className="sr-only">{t.common.signOut}</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-20 border-b border-line">
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-8">
            <div className="min-w-0 shrink md:hidden">
              <Logo href="/dashboard" />
            </div>
            <div className="hidden md:block">
              <Breadcrumb />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/dashboard/credits" className="chip min-w-0 shrink">
                <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="truncate font-medium text-text tabular-nums">{creditsLabel}</span>
                <span className="hidden sm:inline">{t.common.credits}</span>
              </Link>
              <div className="flex items-center md:hidden">
                <ThemeToggle />
                <LanguageSwitcher />
              </div>
              <form action={signOut} className="md:hidden">
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
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
