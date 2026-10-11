import { fmt, INTL_LOCALES, isLocale } from "@/i18n/config";
import { dictionaryFor } from "@/i18n/dictionaries";
import { cronAuthorized } from "@/lib/cron-auth";
import { emailEnabled, escapeHtml, sendEmail } from "@/lib/email";
import { missingSlots } from "@/lib/social";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPost, zernioEnabled } from "@/lib/zernio";

// Appelée toutes les 15 min par pg_cron (voir la migration social_planning) :
// 1. relit chez Zernio le statut des publications dont l'heure est passée ;
// 2. prévient par email les créateurs dont le planning manque de vidéos sur
//    les prochains jours, une fois par jour au plus.
export const maxDuration = 120;

const SYNC_BATCH = 50;
const ALERT_EVERY_MS = 20 * 3_600_000;
const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://twinpost.video";

const FINAL = new Set(["published", "partial", "failed", "cancelled"]);

async function syncStatuses() {
  if (!zernioEnabled()) return 0;
  const admin = createAdminClient();
  const { data: due } = await admin
    .from("scheduled_posts")
    .select("id, zernio_post_id")
    .in("status", ["scheduled", "publishing"])
    .lt("scheduled_for", new Date(Date.now() - 2 * 60_000).toISOString())
    .not("zernio_post_id", "is", null)
    .order("scheduled_for", { ascending: true })
    .limit(SYNC_BATCH);
  let updated = 0;
  for (const post of due ?? []) {
    try {
      const state = await getPost(post.zernio_post_id!);
      const status = FINAL.has(state.status) || state.status === "publishing" ? state.status : "scheduled";
      const failed = state.platforms.filter((p) => p.error);
      await admin
        .from("scheduled_posts")
        .update({
          status,
          results: state.platforms,
          error: failed.length ? failed.map((p) => `${p.platform}: ${p.error}`).join(" · ").slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);
      updated++;
    } catch (e) {
      console.error("social tick: statut", post.id, e instanceof Error ? e.message : e);
    }
  }
  return updated;
}

async function sendAlerts() {
  if (!emailEnabled()) return 0;
  const admin = createAdminClient();
  const { data: plans } = await admin
    .from("posting_plans")
    .select("user_id, weekdays, times, timezone, account_ids, alert_days, alert_email, last_alert_at, locale")
    .eq("alert_email", true)
    .or(`last_alert_at.is.null,last_alert_at.lt.${new Date(Date.now() - ALERT_EVERY_MS).toISOString()}`);
  let sent = 0;
  for (const plan of plans ?? []) {
    try {
      const missing = await missingSlots(
        plan.user_id,
        {
          weekdays: plan.weekdays,
          times: plan.times,
          timezone: plan.timezone,
          accountIds: plan.account_ids,
          alertDays: plan.alert_days,
          alertEmail: plan.alert_email,
        },
        plan.alert_days,
      );
      if (!missing.length) continue;
      const { data: profile } = await admin.from("profiles").select("email").eq("id", plan.user_id).single();
      if (!profile?.email) continue;

      const locale = isLocale(plan.locale) ? plan.locale : "fr";
      const P = dictionaryFor(locale).planning;
      const when = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
        timeZone: plan.timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      const vars = { n: missing.length, days: plan.alert_days };
      const lines = missing.map((slot) => when.format(slot));
      const intro = fmt(P.alertEmailBody, vars);
      await sendEmail({
        to: profile.email,
        subject: fmt(P.alertEmailSubject, vars),
        text: `${intro}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n${P.alertEmailCta} : ${SITE}/dashboard/generate\n${P.alertEmailPlanning} : ${SITE}/dashboard/planning`,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#18181b">
<p>${escapeHtml(intro)}</p>
<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
<p><a href="${SITE}/dashboard/generate" style="display:inline-block;background:#5e6cf2;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(P.alertEmailCta)}</a></p>
<p><a href="${SITE}/dashboard/planning" style="color:#5e6cf2">${escapeHtml(P.alertEmailPlanning)}</a></p>
</div>`,
      });
      await admin
        .from("posting_plans")
        .update({ last_alert_at: new Date().toISOString() })
        .eq("user_id", plan.user_id);
      sent++;
    } catch (e) {
      console.error("social tick: alerte", plan.user_id, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return new Response("forbidden", { status: 403 });
  const [synced, alerts] = await Promise.all([syncStatuses(), sendAlerts()]);
  return Response.json({ synced, alerts });
}
