import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { OfferPopup } from "@/app/offer-popup";
import { offersFor } from "@/app/offers";
import { StudioStage } from "@/app/studio-stage";
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
    <div className="video-page flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-clip bg-bg">
      {/* Sans bande : le nom à gauche, la langue et la connexion à droite,
          posés sur la vidéo comme sur la landing. */}
      <header
        className="relative z-20 flex items-center justify-between gap-3 px-5 pt-5 sm:px-8 lg:px-12"
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
      >
        <Logo className="min-w-0 shrink" />
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <Link href="/login?next=/dashboard/generate" className="btn btn-primary px-4 py-2 text-[0.8125rem]">
            {t.login.submitSignIn}
          </Link>
        </div>
      </header>
      <main className="relative isolate min-w-0 flex-1 overflow-x-clip px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <StudioStage>
            <Studio
              userId={null}
              credits={0}
              engines={higgsfieldEnabled() ? ["genjutsu"] : []}
              styles={styles}
            />
          </StudioStage>
        </div>
      </main>
      <OfferPopup offers={offersFor(t, locale, false)} />
    </div>
  );
}
