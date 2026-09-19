import { Coins, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { ThemeToggle } from "@/app/theme-toggle";
import { INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
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
  const creditsLabel = new Intl.NumberFormat(INTL_LOCALES[locale]).format(credits);

  const avatar = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surface-3 to-surface-2 text-xs font-semibold uppercase ring-1 ring-line-strong">
      {displayName.charAt(0)}
    </span>
  );

  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface/80 px-3 py-4 md:flex">
        <div className="px-2">
          <Logo href="/dashboard" />
        </div>

        <Link href="/dashboard/generate" className="btn btn-accent mt-6 w-full">
          <Plus />
          {t.shell.newVideo}
        </Link>

        <p className="mt-6 mb-2 px-3 text-xs font-medium text-faint">{t.shell.workspace}</p>
        <SidebarNav />

        <div className="mt-auto flex flex-col gap-3 pt-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-3 text-muted">
              <Coins className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted">{t.shell.nav.credits}</span>
              <span className="block truncate text-sm font-medium tabular-nums" title={creditsLabel}>
                {creditsLabel}
              </span>
            </span>
            <Link
              href="/dashboard/credits"
              title={t.shell.recharge}
              className="btn btn-secondary size-8 shrink-0 p-0"
            >
              <Plus />
              <span className="sr-only">{t.shell.recharge}</span>
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
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
            <div className="md:hidden">
              <Logo href="/dashboard" />
            </div>
            <div className="hidden md:block">
              <Breadcrumb />
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/credits" className="chip">
                <span className="size-1.5 animate-pulse rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                <span className="font-medium text-text tabular-nums">{creditsLabel}</span>
                {t.common.credits}
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

        <main className="relative isolate flex-1 px-4 py-10 sm:px-8">
          <div aria-hidden className="grid-bg pointer-events-none absolute inset-x-0 top-0 -z-10 h-96" />
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 left-1/2 -z-10 h-72 w-[40rem] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(91_124_255/0.14),transparent)] blur-2xl"
          />
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
