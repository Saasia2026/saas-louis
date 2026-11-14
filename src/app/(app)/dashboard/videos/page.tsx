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
        <div className="panel mt-8 flex animate-fade-up flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="max-w-sm text-sm text-muted">{V.empty}</p>
          <Link href="/dashboard/generate" className="btn btn-secondary">
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
