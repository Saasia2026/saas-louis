import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
import { HistoryList } from "../generate/history-list";
import { listSwapHistory } from "../swap-history";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.videos} — TwinPost` };
}

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
      />

      {shown.length === 0 ? (
        <div className="video-page relative isolate mt-8 flex min-h-[26rem] animate-fade-up flex-col items-start justify-end gap-5 overflow-hidden rounded-[2rem] border border-white/10 bg-black p-6 sm:p-10">
          <video
            src="/demos/demo-21.mp4"
            poster="/demos/demo-21.jpg"
            muted
            loop
            autoPlay
            playsInline
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-20 size-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ background: "linear-gradient(to bottom, rgb(0 0 0 / 0.2), rgb(8 8 12 / 0.88) 80%)" }}
          />
          <p className="max-w-md font-headline text-3xl leading-tight sm:text-4xl">{V.empty}</p>
          <Link href="/dashboard/generate" className="btn btn-accent px-6 py-3 text-base">
            {V.goStudio}
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <HistoryList items={shown} />
        </div>
      )}
    </div>
  );
}
