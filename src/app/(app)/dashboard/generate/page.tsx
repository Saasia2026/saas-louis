import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getConversation } from "@/lib/conversations";
import { falEnabled } from "@/lib/fal";
import { availablePresets, isAspectRatio, maxVideoSeconds } from "@/lib/generation";
import { higgsfieldEnabled } from "@/lib/higgsfield";
import { createClient } from "@/lib/supabase/server";
import { Studio, type Job } from "./studio";

export const metadata: Metadata = {
  title: "Studio — TwinPost", // Même nom dans les trois langues.
};

// Le storyboard, le lancement des plans et le montage passent par les
// server actions de cette page.
export const maxDuration = 300;

const RESUME_WINDOW_MS = 24 * 60 * 60_000;

// Rendu serveur à chaque requête : l'heure courante est celle de la requête.
function resumeSince() {
  return new Date(Date.now() - RESUME_WINDOW_MS).toISOString();
}

export default async function GeneratePage(props: PageProps<"/dashboard/generate">) {
  // ?c= : discussion du Director rouverte depuis la barre latérale.
  const { c } = await props.searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining, plan")
    .eq("id", auth.claims.sub)
    .single();

  const { data: characters } = await supabase
    .from("characters")
    .select("id, name")
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  const conversation = typeof c === "string" ? await getConversation(c) : null;

  // Vidéo encore en cours (elle s'enchaîne toute seule) : on la reprend
  // plutôt que d'afficher un formulaire vide.
  const running = await supabase
    .from("generations")
    .select("id, kind, metadata, duration_seconds")
    .in("kind", ["video", "swap"])
    .eq("status", "processing")
    // Un remplacement n'avance que suivi : il est repris même longtemps
    // après, pour récupérer son rendu ou le rembourser (voir advanceSwap).
    .or(`kind.eq.swap,created_at.gte.${resumeSince()}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    .then(({ data }) => data);
  const aspectRatio = (running?.metadata as { aspect_ratio?: unknown } | null)?.aspect_ratio;
  const resume =
    running?.duration_seconds && isAspectRatio(aspectRatio)
      ? {
          id: running.id,
          job: {
            kind: running.kind === "swap" ? "swap" : "video",
            aspectRatio,
            durationSeconds: running.duration_seconds,
          } satisfies Job,
        }
      : undefined;

  return (
    <Studio
      userId={auth.claims.sub}
      resume={resume}
      credits={profile?.credits_remaining ?? 0}
      maxVideoSeconds={maxVideoSeconds(profile?.plan ?? "free")}
      presets={availablePresets(falEnabled(), false).map((p) => p.id)}
      characters={characters ?? []}
      swapEngines={higgsfieldEnabled() ? ["genjutsu", "kling"] : ["kling"]}
      conversation={conversation}
    />
  );
}
