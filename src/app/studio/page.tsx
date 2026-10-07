import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { ParticleField } from "@/app/particle-field";
import { ThemeToggle } from "@/app/theme-toggle";
import { getDictionary } from "@/i18n/server";
import { higgsfieldEnabled } from "@/lib/higgsfield";
import { createClient } from "@/lib/supabase/server";
import { Studio } from "../(app)/dashboard/generate/studio";

export const metadata: Metadata = {
  title: "Studio — TwinPost",
};

// Studio ouvert sans compte : le visiteur dépose son clip et son personnage,
// règle son rendu et voit le prix ; la connexion n'arrive qu'au lancement.
export default async function GuestStudioPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/dashboard/generate");
  const t = await getDictionary();

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
      <ParticleField subtle />
      <header className="glass sticky top-0 z-20 border-b border-line">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Logo className="min-w-0 shrink" />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="flex items-center">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <Link href="/login?next=/dashboard/generate" className="btn btn-secondary px-3 py-2 text-[0.8125rem]">
              {t.login.submitSignIn}
            </Link>
          </div>
        </div>
      </header>
      <main className="relative isolate min-w-0 flex-1 overflow-x-clip px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-7xl">
          <Studio userId={null} credits={0} engines={higgsfieldEnabled() ? ["genjutsu"] : []} />
        </div>
      </main>
    </div>
  );
}
