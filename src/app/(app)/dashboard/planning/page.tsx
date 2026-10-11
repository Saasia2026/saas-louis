import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { PLAN_HORIZON_DAYS, PLAN_TIMEZONES, sameSlot, upcomingDays, upcomingSlots } from "@/lib/posting-plan";
import { activePosts, userAccounts, userPlan } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { zernioEnabled, type SocialAccount } from "@/lib/zernio";
import { PageHeader } from "../../page-header";
import { listSwapHistory } from "../swap-history";
import { ConnectHero } from "./connect-hero";
import { PlanningBoard, type BoardEntry, type BoardPost } from "./planning-board";

// Envoi d'une vidéo à Zernio pendant la programmation.
export const maxDuration = 120;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.planning} — TwinPost` };
}

export default async function PlanningPage(props: PageProps<"/dashboard/planning">) {
  const params = await props.searchParams;
  const t = await getDictionary();
  const P = t.planning;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/login?next=/dashboard/planning");
  const userId = auth.claims.sub;
  const enabled = zernioEnabled();

  const [plan, accounts, history] = await Promise.all([
    userPlan(userId),
    userAccounts(userId).catch((e): SocialAccount[] => {
      console.error("planning: comptes", e instanceof Error ? e.message : e);
      return [];
    }),
    listSwapHistory(30),
  ]);
  const now = new Date();
  const slots = upcomingSlots(plan, PLAN_HORIZON_DAYS, now);
  const posts = (await activePosts(userId, now, new Date(now.getTime() + PLAN_HORIZON_DAYS * 86_400_000))).filter(
    (p) => p.status !== "cancelled",
  );
  const videos = history
    .filter((v): v is typeof v & { mediaUrl: string } => !v.running && Boolean(v.mediaUrl))
    .map((v) => ({ id: v.id, mediaUrl: v.mediaUrl, date: v.date }));

  const toPost = (p: (typeof posts)[number]): BoardPost => ({
    id: p.id,
    status: p.status as BoardPost["status"],
    caption: p.caption,
    accountIds: p.account_ids,
    generationId: p.generation_id,
    links: Array.isArray(p.results)
      ? (p.results as { platform?: string; url?: string | null }[]).filter(
          (r): r is { platform: string; url: string } => Boolean(r.platform && r.url),
        )
      : [],
  });
  // Créneaux du rythme, plus les publications hors rythme (rythme changé depuis).
  const entries: BoardEntry[] = [
    ...slots.map((slot) => {
      const post = posts.find((p) => p.status !== "failed" && sameSlot(p.scheduled_for, slot));
      return { at: slot.toISOString(), post: post && toPost(post) };
    }),
    ...posts
      .filter((p) => !slots.some((slot) => sameSlot(p.scheduled_for, slot)) || p.status === "failed")
      .map((p) => ({ at: new Date(p.scheduled_for).toISOString(), post: toPost(p) })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const alertEnd = now.getTime() + plan.alertDays * 86_400_000;
  const missingSoon = entries.filter((e) => !e.post && new Date(e.at).getTime() <= alertEnd).length;

  const platformName = (p: string) => P.platforms[p as keyof typeof P.platforms] ?? p;
  let notice: { ok: boolean; text: string } | null = null;
  if (typeof params.connected === "string") {
    notice = { ok: true, text: fmt(P.connected, { platform: platformName(params.connected) }) };
  } else if (params.saved) {
    notice = { ok: true, text: P.saved };
  } else if (typeof params.error === "string") {
    const platform = typeof params.platform === "string" ? platformName(params.platform) : "";
    notice = {
      ok: false,
      text:
        params.error === "plan"
          ? P.errors.plan
          : params.error === "connect"
            ? P.errors.connect
            : fmt(P.connectFailed, { platform }),
    };
  }

  const timezones = PLAN_TIMEZONES.includes(plan.timezone as (typeof PLAN_TIMEZONES)[number])
    ? PLAN_TIMEZONES
    : [plan.timezone, ...PLAN_TIMEZONES];

  return (
    <div>
      <PageHeader eyebrow={P.eyebrow} title={P.title}>
        {P.intro}
      </PageHeader>

      {notice && (
        <p
          role="status"
          className={`mt-8 rounded-xl border px-4 py-3 text-sm ${
            notice.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {notice.text}
        </p>
      )}

      {!enabled ? (
        <p className="panel mt-8 flex items-start gap-2 p-5 text-sm text-muted">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {P.notReady}
        </p>
      ) : (
        accounts.length === 0 && <ConnectHero />
      )}

      <PlanningBoard
        days={upcomingDays(plan.timezone, PLAN_HORIZON_DAYS, now)}
        entries={entries}
        videos={videos}
        accounts={accounts.map((a) => ({
          id: a.id,
          platform: a.platform,
          username: a.username,
          avatar: a.avatar,
          needsReconnection: a.needsReconnection,
        }))}
        plan={{
          weekdays: plan.weekdays,
          times: plan.times,
          timezone: plan.timezone,
          accountIds: plan.accountIds,
          alertDays: plan.alertDays,
          alertEmail: plan.alertEmail,
        }}
        timezones={timezones}
        enabled={enabled}
        missingSoon={missingSoon}
      />
    </div>
  );
}
