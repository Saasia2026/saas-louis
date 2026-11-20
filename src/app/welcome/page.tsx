import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LanguageSwitcher } from "@/app/language-switcher";
import { Logo } from "@/app/logo";
import { ThemeToggle } from "@/app/theme-toggle";
import { getDictionary } from "@/i18n/server";
import { safeNextPath } from "@/lib/safe-next-path";
import { stripeEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { Funnel } from "./funnel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.welcome.title} — TwinPost` };
}

// La création d'un influenceur, dans le tunnel, attend son image.
export const maxDuration = 120;

// Tunnel d'accueil d'un nouvel inscrit : quelques questions sur ce qu'il
// veut faire, puis l'offre qui lui correspond. Il peut le passer (« Plus
// tard ») ; une fois vu, il ne revient plus.
export default async function WelcomePage(props: PageProps<"/welcome">) {
  const { next: nextParam } = await props.searchParams;
  const next = safeNextPath(nextParam, "/dashboard/generate");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect(`/login?next=${encodeURIComponent(`/welcome?next=${next}`)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at, credits_remaining")
    .eq("id", auth.claims.sub)
    .single();
  if (profile?.onboarded_at) redirect(next);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
      <header className="topbar-shell z-20">
        <div className="topbar pointer-events-auto mx-auto max-w-7xl gap-3 py-1.5 pr-2 pl-4">
          <Logo href={next} className="min-w-0 shrink" />
          <div className="ml-auto flex shrink-0 items-center">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="relative isolate min-w-0 flex-1 px-4 py-10 sm:px-8 sm:py-16">
        <Funnel
          next={next}
          paymentsEnabled={stripeEnabled()}
          userId={auth.claims.sub}
          credits={profile?.credits_remaining ?? 0}
        />
      </main>
    </div>
  );
}
