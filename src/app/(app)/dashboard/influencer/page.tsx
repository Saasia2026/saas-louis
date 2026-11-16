import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VideoWall } from "@/app/video-wall";
import { getDictionary } from "@/i18n/server";
import { SWAP_INPUTS_BUCKET } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";
import { InfluencerHero } from "./hero";
import { InfluencerWorkspace } from "./workspace";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.influencer} — TwinPost` };
}

// La création attend l'image : 15 à 25 s chez fal, ~40 s à partir d'une photo.
export const maxDuration = 120;

export default async function InfluencerPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/influencer");
  const t = await getDictionary();

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("credits_remaining").eq("id", auth.claims.sub).single(),
    supabase
      .from("influencers")
      .select("id, image_path")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const ready = (rows ?? []).filter((r): r is { id: string; image_path: string } => Boolean(r.image_path));
  const { data: signed } = ready.length
    ? await supabase.storage.from(SWAP_INPUTS_BUCKET).createSignedUrls(
        ready.map((r) => r.image_path),
        60 * 60,
      )
    : { data: [] };
  const initial = ready.flatMap((r, i) => {
    const url = signed?.[i]?.signedUrl;
    return url ? [{ id: r.id, path: r.image_path, url }] : [];
  });

  return (
    <div>
      {/* Fond animé du site : le mur de démos, très pâle, comme au studio. */}
      <VideoWall />
      <InfluencerHero t={t.influencer} />
      <div className="mt-10">
        <InfluencerWorkspace userId={auth.claims.sub} credits={profile?.credits_remaining ?? 0} initial={initial} />
      </div>
    </div>
  );
}
