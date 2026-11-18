import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { GENERATIONS_BUCKET, SWAP_INPUTS_BUCKET } from "@/lib/generation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ViralityAnalysis, ViralityFacts, ViralityReport } from "@/lib/virality";
import { PageHeader } from "../../page-header";
import { listSwapHistory } from "../swap-history";
import { ViralWorkspace } from "./workspace";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.viral} — TwinPost` };
}

// L'analyse attend le rapport : 30 à 90 s (images, transcription, Claude).
export const maxDuration = 300;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function ViralPage(props: PageProps<"/dashboard/viral">) {
  const { video } = await props.searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/viral");
  const userId = auth.claims.sub;
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);

  const [{ data: profile }, history, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("credits_remaining").eq("id", userId).single(),
    listSwapHistory(),
    supabase
      .from("virality_analyses")
      .select("id, generation_id, video_path, report, facts, created_at")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  // Rendus terminés, à choisir comme clip.
  const renders = history.flatMap((item) =>
    !item.running && item.mediaUrl
      ? [{ id: item.id, url: item.mediaUrl, aspectRatio: item.aspectRatio, seconds: item.seconds }]
      : [],
  );

  // Analyses précédentes, avec leur clip (rendu ou fichier déposé).
  const admin = createAdminClient();
  const generationIds = [...new Set((rows ?? []).flatMap((r) => (r.generation_id ? [r.generation_id] : [])))];
  const { data: gens } = generationIds.length
    ? await admin.from("generations").select("id, storage_path").in("id", generationIds).eq("user_id", userId)
    : { data: [] };
  const genPath = new Map((gens ?? []).flatMap((g) => (g.storage_path ? [[g.id, g.storage_path]] : [])));
  const sign = async (bucket: string, paths: string[]) => {
    if (!paths.length) return new Map<string, string>();
    const { data } = await admin.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    return new Map((data ?? []).flatMap((s) => (s.path && s.signedUrl && !s.error ? [[s.path, s.signedUrl]] : [])));
  };
  const [renderUrls, uploadUrls] = await Promise.all([
    sign(GENERATIONS_BUCKET, [...genPath.values()]),
    sign(SWAP_INPUTS_BUCKET, (rows ?? []).flatMap((r) => (r.video_path ? [r.video_path] : []))),
  ]);
  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" });
  const analyses: ViralityAnalysis[] = (rows ?? []).flatMap((r) => {
    const storage = r.generation_id ? genPath.get(r.generation_id) : undefined;
    const videoUrl = storage ? renderUrls.get(storage) : r.video_path ? uploadUrls.get(r.video_path) : undefined;
    if (!videoUrl || !r.report || !r.facts) return [];
    return [
      {
        id: r.id,
        report: r.report as ViralityReport,
        facts: r.facts as ViralityFacts,
        videoUrl,
        date: dateFormat.format(new Date(r.created_at)),
      },
    ];
  });

  return (
    <div>
      <PageHeader eyebrow={t.viral.eyebrow} title={t.viral.title} />
      <div className="mt-8">
        <ViralWorkspace
          userId={userId}
          credits={profile?.credits_remaining ?? 0}
          renders={renders}
          analyses={analyses}
          initialVideo={typeof video === "string" ? video : undefined}
        />
      </div>
    </div>
  );
}
