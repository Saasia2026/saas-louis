import { BellRing, CircleAlert, Clapperboard, Plus, Unlink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import {
  ALERT_DAY_OPTIONS,
  MAX_PLAN_TIMES,
  PLAN_HORIZON_DAYS,
  PLAN_TIMEZONES,
  sameSlot,
  upcomingSlots,
} from "@/lib/posting-plan";
import { activePosts, userAccounts, userPlan } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";
import { SOCIAL_PLATFORMS, zernioEnabled, type SocialAccount } from "@/lib/zernio";
import { PageHeader } from "../../page-header";
import { listSwapHistory } from "../swap-history";
import { connectAccount, disconnectAccount, savePlan } from "./actions";
import { ConfirmButton } from "./confirm-button";
import { PlanningCalendar, type CalendarEntry, type CalendarPost } from "./planning-calendar";
import { PlatformBadge } from "./platform-badge";

// Envoi d'une vidéo à Zernio pendant la programmation.
export const maxDuration = 120;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.planning} — TwinPost` };
}

// Lundi d'abord.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

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

  const toPost = (p: (typeof posts)[number]): CalendarPost => ({
    id: p.id,
    status: p.status as CalendarPost["status"],
    caption: p.caption,
    accountIds: p.account_ids,
    generationId: p.generation_id,
    links: Array.isArray(p.results)
      ? (p.results as { platform?: string; url?: string | null }[])
          .filter((r): r is { platform: string; url: string } => Boolean(r.platform && r.url))
      : [],
  });
  // Créneaux du rythme, plus les publications hors rythme (rythme changé depuis).
  const entries: CalendarEntry[] = [
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
        params.error === "plan" ? P.errors.plan : params.error === "connect" ? P.errors.connect : fmt(P.connectFailed, { platform }),
    };
  }

  const timezones = PLAN_TIMEZONES.includes(plan.timezone as (typeof PLAN_TIMEZONES)[number])
    ? PLAN_TIMEZONES
    : [plan.timezone, ...PLAN_TIMEZONES];
  const timeInputs = Array.from({ length: MAX_PLAN_TIMES }, (_, i) => plan.times[i] ?? "");
  const pill =
    "flex cursor-pointer items-center justify-center rounded-lg border border-line bg-surface-2/60 px-2.5 py-1.5 text-sm font-medium text-muted transition-colors has-[:checked]:border-accent/60 has-[:checked]:bg-accent-soft has-[:checked]:text-text";

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

      {missingSoon > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <BellRing className="size-4 shrink-0" />
            {fmt(missingSoon === 1 ? P.missingBannerOne : P.missingBanner, { n: missingSoon, days: plan.alertDays })}
          </p>
          <Link href="/dashboard/generate" className="btn btn-hot">
            <Clapperboard />
            {P.createVideo}
          </Link>
        </div>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <h2 className="text-lg font-semibold">{P.calendarTitle}</h2>
          <div className="mt-4">
            <PlanningCalendar
              entries={entries}
              videos={videos}
              accounts={accounts.map((a) => ({
                id: a.id,
                platform: a.platform,
                username: a.username,
                needsReconnection: a.needsReconnection,
              }))}
              defaultAccountIds={plan.accountIds}
              timezone={plan.timezone}
              enabled={enabled}
            />
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="font-semibold">{P.accountsTitle}</h2>
            {!enabled ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {P.notReady}
              </p>
            ) : (
              <>
                {accounts.length ? (
                  <ul className="mt-3 space-y-2">
                    {accounts.map((a) => (
                      <li key={a.id} className="flex items-center gap-3">
                        {a.avatar ? (
                          // Photo du compte hébergée par le réseau : pas d'optimisation Next.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.avatar} alt="" className="size-8 rounded-full object-cover" />
                        ) : (
                          <PlatformBadge platform={a.platform} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{a.displayName || a.username}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted">
                            <PlatformBadge platform={a.platform} className="size-3.5" />
                            {a.needsReconnection ? (
                              <span className="text-amber-300">{P.reconnect}</span>
                            ) : a.followers !== null ? (
                              fmt(P.followers, { n: a.followers.toLocaleString() })
                            ) : (
                              `@${a.username}`
                            )}
                          </p>
                        </div>
                        <form action={disconnectAccount}>
                          <input type="hidden" name="accountId" value={a.id} />
                          <ConfirmButton confirm={P.disconnectConfirm} className="btn btn-ghost p-2">
                            <Unlink />
                            <span className="sr-only">{P.disconnect}</span>
                          </ConfirmButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted">{P.noAccounts}</p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <form key={platform} action={connectAccount}>
                      <input type="hidden" name="platform" value={platform} />
                      <button type="submit" className="btn btn-secondary w-full justify-start px-2.5 text-xs">
                        <PlatformBadge platform={platform} className="size-5" />
                        {P.platforms[platform]}
                        <Plus className="ml-auto" />
                      </button>
                    </form>
                  ))}
                </div>
              </>
            )}
          </section>

          <form action={savePlan} className="panel space-y-5 p-5">
            <h2 className="font-semibold">{P.rhythmTitle}</h2>
            <fieldset>
              <legend className="label">{P.days}</legend>
              <div className="mt-1.5 grid grid-cols-7 gap-1">
                {WEEK.map((d) => (
                  <label key={d} className={`${pill} px-0`}>
                    <input
                      type="checkbox"
                      name="weekday"
                      value={d}
                      defaultChecked={plan.weekdays.includes(d)}
                      className="sr-only"
                    />
                    {P.weekdays[d]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">{P.times}</legend>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {timeInputs.map((time, i) => (
                  <input key={i} type="time" name="time" defaultValue={time} className="field px-2 tabular-nums" />
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="label">{P.timezone}</span>
              <select name="timezone" defaultValue={plan.timezone} className="field mt-1.5">
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            {accounts.length > 0 && (
              <fieldset>
                <legend className="label">{P.defaultAccounts}</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {accounts.map((a) => (
                    <label key={a.id} className={`${pill} gap-2`}>
                      <input
                        type="checkbox"
                        name="account"
                        value={a.id}
                        defaultChecked={plan.accountIds.includes(a.id)}
                        className="sr-only"
                      />
                      <PlatformBadge platform={a.platform} className="size-5" />
                      {a.username}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="space-y-3 border-t border-line pt-4">
              <label className="block">
                <span className="label">{P.alertDays}</span>
                <select name="alertDays" defaultValue={String(plan.alertDays)} className="field mt-1.5">
                  {ALERT_DAY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {fmt(n === 1 ? P.alertDayOne : P.alertDayOption, { n })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium">
                {P.alertEmail}
                <span className="relative inline-flex shrink-0">
                  <input type="checkbox" name="alertEmail" defaultChecked={plan.alertEmail} className="peer sr-only" />
                  <span className="h-6 w-11 rounded-full border border-line-strong bg-surface-3 transition-colors peer-checked:border-transparent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50" />
                  <span className="pointer-events-none absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                </span>
              </label>
            </div>
            <button type="submit" className="btn btn-accent w-full">
              {P.save}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
