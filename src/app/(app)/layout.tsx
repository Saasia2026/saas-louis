import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { Logo } from "@/app/logo";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "./nav-links";

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

  const displayName = profile?.full_name || profile?.email || "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" />
            <NavLinks />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/dashboard/credits" className="chip">
              <span className="size-1.5 rounded-full bg-accent" />
              <span className="font-mono text-text">{profile?.credits_remaining ?? 0}</span>
              crédits
            </Link>
            <span
              title={displayName}
              className="flex size-8 items-center justify-center rounded-full border border-line bg-surface-3 text-xs font-medium uppercase"
            >
              {displayName.charAt(0)}
            </span>
            <form action={signOut}>
              <button type="submit" className="btn btn-ghost px-3">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
