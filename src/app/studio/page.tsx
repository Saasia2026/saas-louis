import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { OfferPopup } from "@/app/offer-popup";
import { offersFor } from "@/app/offers";
import { ThemeToggle } from "@/app/theme-toggle";
import { getDictionary, getLocale } from "@/i18n/server";
import { higgsfieldEnabled, studioRestyleStyles } from "@/lib/higgsfield";
import { createClient } from "@/lib/supabase/server";
import { Studio } from "../(app)/dashboard/generate/studio";

export const metadata: Metadata = {
  title: "Studio — TwinPost",
};

// Studio ouvert sans compte : le visiteur dépose son clip et son personnage,
// règle son rendu et voit le prix ; la connexion n'arrive qu'au lancement.
export default async function GuestStudioPage(props: PageProps<"/studio">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    // Un lien partagé depuis le fil garde sa démo une fois connecté.
    const { reel } = await props.searchParams;
    redirect(typeof reel === "string" ? `/dashboard/generate?reel=${encodeURIComponent(reel)}` : "/dashboard/generate");
  }
  const [t, locale, styles] = await Promise.all([getDictionary(), getLocale(), studioRestyleStyles()]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
      <header className="topbar-shell z-20">
        <div className="topbar pointer-events-auto mx-auto max-w-7xl gap-3 py-1.5 pr-2 pl-4">
          <Logo className="min-w-0 shrink" />
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <div className="flex items-center">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <Link href="/login?next=/dashboard/generate" className="btn btn-primary px-4 py-2 text-[0.8125rem]">
              {t.login.submitSignIn}
            </Link>
          </div>
        </div>
      </header>
      <main className="relative isolate min-w-0 flex-1 overflow-x-clip px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <Studio
            userId={null}
            credits={0}
            engines={higgsfieldEnabled() ? ["genjutsu"] : []}
            styles={styles}
          />
        </div>
      </main>
      <OfferPopup offers={offersFor(t, locale, false)} />
    </div>
  );
}
