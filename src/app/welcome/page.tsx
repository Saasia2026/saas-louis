import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackdropPhoto } from "@/app/backdrop-photo";
import { LanguageSwitcher } from "@/app/language-switcher";
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
// tard ») ; une fois vu, il ne revient plus. Posé sur une vidéo plein cadre,
// comme la landing et la connexion.
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
    <div className="video-page relative isolate flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-clip">
      <BackdropPhoto src="/photos/shelves.jpg" focus="50% 20%" />
      <header className="flex items-center justify-between px-5 pt-5 sm:px-8 lg:px-12" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        <Link href={next} className="font-wide text-[0.95rem] tracking-wide uppercase">
          TwinPost
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="relative min-w-0 flex-1 px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
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
