import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAspectRatio } from "@/lib/generation";
import { higgsfieldEnabled } from "@/lib/higgsfield";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Studio, type Job } from "./studio";

export const metadata: Metadata = {
  title: "Studio — TwinPost", // Même nom dans les trois langues.
};

// Le découpage du clip, le suivi des plans et le montage passent par les
// server actions de cette page.
export const maxDuration = 300;

const STALE_PENDING_MS = 10 * 60_000;

// Rendu serveur à chaque requête : l'heure courante est celle de la requête.
function stalePendingBefore() {
  return new Date(Date.now() - STALE_PENDING_MS).toISOString();
}

export default async function GeneratePage(props: PageProps<"/dashboard/generate">) {
  // ?v= : remplacement en cours rouvert depuis Mes vidéos.
  const { v } = await props.searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    redirect("/login");
  }

  // Lancement coupé en route (fonction interrompue pendant la préparation) :
  // la génération est restée « pending », débitée. Au-delà de 10 min, soit
  // deux fois la durée maximale d'un lancement, elle est remboursée.
  const admin = createAdminClient();
  const { data: stale } = await admin
    .from("generations")
    .select("id")
    .eq("user_id", auth.claims.sub)
    .eq("kind", "swap")
    .eq("status", "pending")
    .lt("created_at", stalePendingBefore());
  for (const g of stale ?? []) await admin.rpc("fail_generation", { p_generation_id: g.id });

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining, auto_recharge_pack, auto_recharge_failed")
    .eq("id", auth.claims.sub)
    .single();

  // Remplacement encore en cours : il n'avance que suivi, on le reprend donc
  // plutôt que d'afficher un studio vide, même longtemps après (son rendu est
  // récupéré, ou ses crédits rendus : voir advanceSwap).
  const query = supabase
    .from("generations")
    .select("id, metadata, duration_seconds")
    .eq("kind", "swap")
    .eq("status", "processing");
  const { data: running } = await (typeof v === "string" ? query.eq("id", v) : query)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const aspectRatio = (running?.metadata as { aspect_ratio?: unknown } | null)?.aspect_ratio;
  const resume =
    running?.duration_seconds && isAspectRatio(aspectRatio)
      ? {
          id: running.id,
          job: { aspectRatio, durationSeconds: running.duration_seconds } satisfies Job,
        }
      : undefined;

  return (
    <Studio
      userId={auth.claims.sub}
      resume={resume}
      credits={profile?.credits_remaining ?? 0}
      autoRecharge={Boolean(profile?.auto_recharge_pack) && !profile?.auto_recharge_failed}
      engines={higgsfieldEnabled() ? ["genjutsu", "kling"] : ["kling"]}
    />
  );
}
