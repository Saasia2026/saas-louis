import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { falEnabled } from "@/lib/fal";
import { availablePresets, isAspectRatio, maxVideoSeconds } from "@/lib/generation";
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

export default async function GeneratePage() {
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

  // Vidéo encore en cours (elle s'enchaîne toute seule) : on la reprend
  // plutôt que d'afficher un formulaire vide.
  const running = await supabase
    .from("generations")
    .select("id, metadata, duration_seconds")
    .eq("kind", "video")
    .eq("status", "processing")
    .gte("created_at", resumeSince())
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
            kind: "video",
            aspectRatio,
            durationSeconds: running.duration_seconds,
          } satisfies Job,
        }
      : undefined;

  return (
    <Studio
      resume={resume}
      credits={profile?.credits_remaining ?? 0}
      maxVideoSeconds={maxVideoSeconds(profile?.plan ?? "free")}
      presets={availablePresets(falEnabled(), false).map((p) => p.id)}
      characters={characters ?? []}
    />
  );
}
