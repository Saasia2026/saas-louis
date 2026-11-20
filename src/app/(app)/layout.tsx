import { Coins, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { OfferPopup } from "@/app/offer-popup";
import { offersFor } from "@/app/offers";
import { ThemeToggle } from "@/app/theme-toggle";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { swapMethodRate } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";
import { latestTikTokAnalysis } from "@/lib/tiktok-analysis";
import { listTrendPicks } from "@/lib/trends";
import { BotsAquarium } from "./bots/aquarium";
import { BotsToggle } from "./bots/bots-toggle";
import { BottomNav, MainNav } from "./nav-links";

// Les bots tournent sur toutes les pages : l'analyse d'un compte TikTok
// (server action) prend environ 30 s.
export const maxDuration = 300;

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
  // Bots : sélection du jour et dernière analyse du compte TikTok.
  const [picks, account] = await Promise.all([
    listTrendPicks(locale).catch(() => []),
    latestTikTokAnalysis().catch(() => null),
  ]);
  const displayName = profile?.full_name || profile?.email || "";
  const credits = profile?.credits_remaining ?? 0;
  const numberFormat = new Intl.NumberFormat(INTL_LOCALES[locale]);
  // Au-delà de 100 000, le solde s'abrège (« 1,2 M ») pour tenir dans la
  // barre ; le nombre exact reste dans l'infobulle.
  const compactBalance = credits >= 100_000;
  const creditsLabel = compactBalance
    ? new Intl.NumberFormat(INTL_LOCALES[locale], { notation: "compact", maximumFractionDigits: 1 }).format(credits)
    : numberFormat.format(credits);
  // Ce que le solde représente : secondes de vidéo en 720p (une passe), en
  // minutes au-delà de deux.
  const videoSeconds = Math.floor(credits / swapMethodRate());
  const videoLabel =
    videoSeconds >= 120
      ? fmt(t.shell.creditsMinutes, { n: numberFormat.format(Math.floor(videoSeconds / 60)) })
      : fmt(t.shell.creditsSeconds, { n: videoSeconds });

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
      {/* Barre du haut, en pilule flottante : la navigation y tient en une
          ligne et laisse tout l'écran au contenu. */}
      <header className="topbar-shell z-20">
        <div className="topbar pointer-events-auto mx-auto max-w-7xl gap-3 py-1.5 pr-2 pl-4">
          <div className="shrink-0">
            <Logo href="/dashboard" compact />
          </div>
          <div className="ml-2 hidden min-w-0 md:block lg:ml-4">
            <MainNav />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {/* Solde en grand (sa durée de vidéo en infobulle), avec la recharge. */}
            <div
              title={compactBalance ? `${numberFormat.format(credits)} ${t.common.credits} · ${videoLabel}` : videoLabel}
              className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-1 pl-3.5"
            >
              <Coins className="size-4 shrink-0 text-accent-light" />
              <span className="min-w-0">
                <span className="block max-w-[9rem] truncate font-headline text-lg leading-none tabular-nums sm:max-w-none">
                  {creditsLabel}
                </span>
              </span>
              <Link href="/dashboard/credits" title={t.shell.recharge} className="btn btn-accent size-9 p-0 sm:size-8">
                <Plus />
                <span className="sr-only">{t.shell.recharge}</span>
              </Link>
            </div>

            <div className="flex items-center">
              <BotsToggle />
              <ThemeToggle />
              <LanguageSwitcher />
            </div>

            <span
              title={displayName}
              className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold uppercase xl:flex"
            >
              {displayName.charAt(0)}
            </span>
            <form action={signOut}>
              <button type="submit" title={t.common.signOut} className="btn btn-ghost size-9 p-0">
                <LogOut />
                <span className="sr-only">{t.common.signOut}</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <BottomNav />

      {/* Sur téléphone, la fin de la page passe au-dessus de la barre du bas. */}
      <main className="relative isolate min-w-0 flex-1 overflow-x-clip px-4 pt-6 pb-28 sm:px-8 sm:pt-10 md:pb-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
      <BotsAquarium userId={data.claims.sub} picks={picks} account={account} />
      <OfferPopup offers={offersFor(t, locale, true)} />
    </div>
  );
}
