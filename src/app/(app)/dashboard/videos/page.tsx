import { Download, Plus } from "lucide-react";
import Image from "next/image";
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

export default async function VideosPage() {
  const t = await getDictionary();
  const V = t.videos;
  const S = t.studio;
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
      />

      {shown.length === 0 ? (
        <div className="panel mt-8 flex animate-fade-up flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="max-w-sm text-sm text-muted">{V.empty}</p>
          <Link href="/dashboard/generate" className="btn btn-secondary">
            {V.goStudio}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {shown.map((video, i) => {
            const engine = video.settings.model === "max" ? S.modelMax : S.modelStandard;
            return (
              <li
                key={video.id}
                className="animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <div className="flex flex-col md:flex-row">
                  {/* Video */}
                  <div
                    className="relative flex shrink-0 items-center justify-center bg-black md:w-[55%]"
                    style={{ aspectRatio: video.aspectRatio.replace(":", " / ") }}
                  >
                    <DeleteButton id={video.id} confirm={V.deleteConfirm} />
                    {video.mediaUrl ? (
                      <video
                        src={video.mediaUrl}
                        controls
                        preload="metadata"
                        playsInline
                        webkit-playsinline=""
                        className="size-full object-contain"
                      />
                    ) : (
                      <span className="flex flex-col items-center gap-3 text-sm text-muted">
                        <span className="size-7 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                        {V.running}
                      </span>
                    )}
                  </div>

                  {/* Panel */}
                  <div className="flex flex-1 flex-col gap-5 p-5 md:p-6">
                    {/* Engine badge */}
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line-strong px-3 py-1 text-xs font-medium">
                      {engine}
                    </span>

                    {/* Prompt */}
                    {video.prompt && (
                      <p className="line-clamp-4 text-sm leading-relaxed text-secondary">
                        {video.prompt}
                      </p>
                    )}

                    {/* Thumbnails */}
                    {video.thumbs.length > 0 && (
                      <div className="flex gap-2">
                        {video.thumbs.map((url, k) => (
                          <div
                            key={k}
                            className="size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-black"
                          >
                            <Image
                              src={url}
                              alt=""
                              width={48}
                              height={48}
                              className="size-full object-cover"
                              unoptimized
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Metadata chips */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5">
                        {video.settings.quality}
                      </span>
                      {video.seconds != null && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5">
                          {video.seconds} s
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5">
                        {video.aspectRatio}
                      </span>
                      {video.fidelity && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5">
                          HD
                        </span>
                      )}
                    </div>

                    {video.incomplete && (
                      <p className="text-xs text-amber-300">{video.incomplete}</p>
                    )}

                    {/* Date + actions */}
                    <div className="mt-auto flex items-center justify-between gap-3">
                      <p className="text-xs text-muted">{video.date}</p>
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
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
