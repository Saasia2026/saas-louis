import { LogOut, Plus, Zap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { getDictionary } from "@/i18n/server";
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

  const t = await getDictionary();
  const displayName = profile?.full_name || profile?.email || "";
  const credits = profile?.credits_remaining ?? 0;

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

        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/dashboard/credits"
            className="spotlight group rounded-xl border border-line bg-surface-2 p-3 transition-colors hover:border-line-strong"
          >
            <span className="flex items-center justify-between text-xs text-muted">
              {t.shell.nav.credits}
              <Zap className="size-3.5 text-accent-light" />
            </span>
            <span className="mt-1 block font-wide text-2xl tabular-nums">{credits}</span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                style={{ width: `${Math.min(100, Math.max(4, (credits / 150) * 100))}%` }}
              />
            </span>
            <span className="mt-2 block text-xs text-faint transition-colors group-hover:text-muted">
              {t.shell.recharge}
            </span>
          </Link>

          <div className="flex items-center gap-3 rounded-xl px-2 py-1">
            {avatar}
            <span className="min-w-0 flex-1 truncate text-sm text-muted" title={displayName}>
              {displayName}
            </span>
            <LanguageSwitcher up />
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
                <span className="font-medium text-text tabular-nums">{credits}</span>
                {t.common.credits}
              </Link>
              <div className="md:hidden">
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
