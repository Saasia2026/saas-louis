import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

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
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="font-display text-xl">
            Twin<span className="text-neon-purple">Post</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/dashboard/generate" className="hover:text-text">
              Générer
            </Link>
            <Link href="/dashboard/characters" className="hover:text-text">
              Personnages
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/dashboard/credits"
            className="rounded-full border border-neon-cyan/40 px-3 py-1 text-neon-cyan hover:bg-neon-cyan/10"
          >
            {profile?.credits_remaining ?? 0} crédits
          </Link>
          <span
            title={displayName}
            className="flex size-8 items-center justify-center rounded-full bg-neon-purple/20 font-semibold uppercase text-neon-purple"
          >
            {displayName.charAt(0)}
          </span>
          <form action={signOut}>
            <button type="submit" className="text-muted hover:text-text">
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
