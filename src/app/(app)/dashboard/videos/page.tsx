import { Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
import { listSwapHistory } from "../swap-history";
import { DeleteButton } from "./delete-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.videos} — TwinPost` };
}

// Remplacements terminés ou en cours. Un rendu prend plusieurs minutes : on
// revient le chercher ici.
export default async function VideosPage() {
  const t = await getDictionary();
  const V = t.videos;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/videos");

  const shown = await listSwapHistory();

  return (
    <div>
      <PageHeader
        eyebrow={V.eyebrow}
        title={V.title}
        actions={
          <Link href="/dashboard/generate" className="btn btn-hot">
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
                className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-black bg-clip-padding"
                style={{ aspectRatio: video.aspectRatio.replace(":", " / ") }}
              >
                <DeleteButton id={video.id} confirm={V.deleteConfirm} />
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
