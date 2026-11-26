import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { LanguageSwitcher } from "@/app/language-switcher";
import { OfferPopup } from "@/app/offer-popup";
import { offersFor } from "@/app/offers";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { swapMethodRate } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";
import h from "./app-bar.module.css";
import { BottomNav, MainNav, SideNav } from "./nav-links";

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
    // Toujours sombre, comme la landing : les pages sont posées sur des
    // vidéos et des cartes de verre.
    <div className="video-page flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-clip bg-bg">
      {/* Menu latéral sur grand écran : le logo et les pages. */}
      <SideNav />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
      {/* Barre du haut, sans bandeau : le nom, le solde, la langue et la
          déconnexion flottent sur la page. */}
      <header className={h.bar}>
        {/* Sur grand écran, le nom est dans le menu latéral. */}
        <Link href="/dashboard" className={`${h.brand} lg:hidden`}>
          TwinPost
        </Link>
        <div className="ml-4 hidden min-w-0 md:block lg:hidden">
          <MainNav />
        </div>

        <div className={h.right}>
          {/* Solde (sa durée de vidéo en infobulle) : la pilule mène à la recharge. */}
          <Link
            href="/dashboard/credits"
            title={`${compactBalance ? `${numberFormat.format(credits)} ${t.common.credits} · ` : ""}${videoLabel} · ${t.shell.recharge}`}
            className={h.credits}
          >
            <b>{creditsLabel}</b>
            <small>{t.common.credits}</small>
            <span className={h.plus}>
              <Plus />
            </span>
            <span className="sr-only">{t.shell.recharge}</span>
          </Link>
          <div className={`${h.tools} flex items-center`}>
            <LanguageSwitcher />
          </div>
          <form action={signOut}>
            <button type="submit" title={t.common.signOut} className={h.icon}>
              <LogOut />
              <span className="sr-only">{t.common.signOut}</span>
            </button>
          </form>
        </div>
      </header>
      <BottomNav />

      {/* Sur téléphone, la fin de la page passe au-dessus de la barre du bas. */}
      <main className="relative isolate min-w-0 flex-1 overflow-x-clip px-4 pt-6 pb-28 sm:px-8 sm:pt-10 md:pb-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
      </div>
      <OfferPopup offers={offersFor(t, locale, true)} />
    </div>
  );
}
