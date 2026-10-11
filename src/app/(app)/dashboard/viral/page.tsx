import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
import { ViralChat, type ChatMessage } from "./chat";
import { TrendsAside, TrendsAsideSkeleton } from "./trends-aside";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.viral} — TwinPost` };
}

export default async function ViralPage() {
  const t = await getDictionary();
  const V = t.viral;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/viral");

  const { data: rows } = await supabase
    .from("viral_messages")
    .select("role, content")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(40);
  const initial: ChatMessage[] = (rows ?? []).reverse().map((row) => {
    if (row.role === "user") return { role: "user", text: row.content };
    try {
      const saved = JSON.parse(row.content) as Omit<ChatMessage, "role">;
      return {
        role: "assistant",
        text: saved.text ?? "",
        videos: saved.videos,
        hashtags: saved.hashtags,
        tiktokVideos: saved.tiktokVideos,
        sources: saved.sources,
      };
    } catch {
      return { role: "assistant", text: row.content };
    }
  });

  return (
    <div>
      <PageHeader eyebrow={V.eyebrow} title={V.title} />
      <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ViralChat initial={initial} />
        {/* Tendances chargées à part : un appel lent aux fournisseurs ne
            retarde pas le chat. */}
        <Suspense fallback={<TrendsAsideSkeleton />}>
          <TrendsAside />
        </Suspense>
      </div>
    </div>
  );
}
