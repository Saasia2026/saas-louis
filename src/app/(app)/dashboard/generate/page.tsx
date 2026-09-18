import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { falEnabled } from "@/lib/fal";
import { availablePresets, isAspectRatio, maxVideoSeconds } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";
import { GenerateForm, type Job } from "./generate-form";

export const metadata: Metadata = {
  title: "Générer — TwinPost",
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
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    redirect("/login");
  }

  const [{ twin: requested }, { data: twins }, { data: profile }] = await Promise.all([
    props.searchParams,
    supabase
      .from("twins")
      .select("id, name")
      .eq("status", "ready")
      .not("consent_confirmed_at", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("credits_remaining, plan")
      .eq("id", auth.claims.sub)
      .single(),
  ]);

  const { data: characters } = await supabase
    .from("characters")
    .select("id, name")
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  // Sans jumeau choisi, la vidéo est générée à partir du texte seul.
  const twin = twins?.find((t) => t.id === requested);

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
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl">Crée ton contenu</h1>
      <p className="mt-2 text-sm text-muted">
        {twin
          ? `Décris la scène : ${twin.name} s'occupe du reste.`
          : "Décris ta vidéo : elle est générée telle quelle, sans personnage fixe."}
      </p>

      {Boolean(twins?.length) && (
        <nav aria-label="Jumeau" className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/dashboard/generate"
            aria-current={twin ? undefined : "page"}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              twin
                ? "border-white/15 text-muted hover:border-white/40"
                : "border-neon-purple bg-neon-purple/15 text-text"
            }`}
          >
            Sans jumeau
          </Link>
          {twins!.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/generate?twin=${t.id}`}
              aria-current={t.id === twin?.id ? "page" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                t.id === twin?.id
                  ? "border-neon-purple bg-neon-purple/15 text-text"
                  : "border-white/15 text-muted hover:border-white/40"
              }`}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      )}

      <GenerateForm
        key={twin?.id ?? "none"}
        twinId={twin?.id}
        resume={resume}
        credits={profile?.credits_remaining ?? 0}
        maxVideoSeconds={maxVideoSeconds(profile?.plan ?? "free")}
        presets={availablePresets(falEnabled(), Boolean(twin)).map((p) => p.id)}
        characters={characters ?? []}
      />
    </div>
  );
}
