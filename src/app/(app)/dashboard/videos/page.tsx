import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fmt, INTL_LOCALES } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { GENERATIONS_BUCKET, isAspectRatio } from "@/lib/generation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.videos} — TwinPost` };
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_VIDEOS = 24;

// Remplacements terminés ou en cours. Un rendu prend plusieurs minutes : on
// revient le chercher ici.
export default async function VideosPage() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const V = t.videos;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/videos");

  const { data: generations } = await supabase
    .from("generations")
    .select("id, status, storage_path, duration_seconds, metadata, created_at")
    .eq("kind", "swap")
    .in("status", ["completed", "processing"])
    .order("created_at", { ascending: false })
    .limit(MAX_VIDEOS);

  const bucket = supabase.storage.from(GENERATIONS_BUCKET);
  const videos = await Promise.all(
    (generations ?? []).map(async (g) => {
      const path = g.status === "completed" ? g.storage_path : null;
      const [media, download] = path
        ? await Promise.all([
            bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS),
            bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
              download: `twinpost-${g.id.slice(0, 8)}.${path.split(".").pop()}`,
            }),
          ])
        : [null, null];
      const aspectRatio = (g.metadata as { aspect_ratio?: unknown } | null)?.aspect_ratio;
      // Séquences livrées avec leurs images d'origine : vidéo incomplète.
      const parts = (g.metadata as { swap_parts?: { original?: boolean }[] } | null)?.swap_parts ?? [];
      const unreplaced = parts.filter((p) => p.original).length;
      return {
        id: g.id,
        running: g.status === "processing",
        mediaUrl: media?.data?.signedUrl,
        downloadUrl: download?.data?.signedUrl,
        seconds: g.duration_seconds,
        incomplete:
          g.status === "completed" && unreplaced > 0
            ? fmt(V.incomplete, { done: parts.length - unreplaced, total: parts.length })
            : undefined,
        aspectRatio: isAspectRatio(aspectRatio) ? aspectRatio : "9:16",
        date: new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" }).format(
          new Date(g.created_at),
        ),
      };
    }),
  );
  const shown = videos.filter((v) => v.running || v.mediaUrl);

  return (
    <div>
      <PageHeader
        eyebrow={V.eyebrow}
        title={V.title}
        actions={
          <Link href="/dashboard/generate" className="btn btn-accent">
            <Plus />
            {t.shell.newVideo}
          </Link>
        }
      >
        {V.intro}
      </PageHeader>

      {shown.length === 0 ? (
        <div className="panel mt-8 flex animate-fade-up flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="max-w-sm text-sm text-muted">{V.empty}</p>
          <Link href="/dashboard/generate" className="btn btn-secondary">
            {V.goStudio}
          </Link>
        </div>
      ) : (
        // Galerie sans cadre, comme les exemples du landing : la vidéo est la
        // carte, la légende reste en retrait.
        <ul className="mt-8 grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((video, i) => (
            <li
              key={video.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
            >
              <div
                className="flex w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-black"
                style={{ aspectRatio: video.aspectRatio.replace(":", " / ") }}
              >
                {video.mediaUrl ? (
                  <video
                    src={video.mediaUrl}
                    controls
                    preload="metadata"
                    playsInline
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-3 text-sm text-muted">
                    <span className="size-7 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                    {V.running}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 px-0.5">
                <p className="text-xs text-muted tabular-nums">
                  {video.date}
                  {video.seconds ? ` · ${fmt(V.seconds, { seconds: video.seconds })}` : ""}
                  {video.incomplete && (
                    <span className="mt-1 block text-amber-300">{video.incomplete}</span>
                  )}
                </p>
                {video.running ? (
                  <Link href={`/dashboard/generate?v=${video.id}`} className="btn btn-secondary">
                    {V.resume}
                  </Link>
                ) : (
                  <a href={video.downloadUrl ?? video.mediaUrl} className="btn btn-ghost">
                    <Download />
                    {V.download}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
