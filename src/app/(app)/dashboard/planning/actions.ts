"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { GENERATIONS_BUCKET } from "@/lib/generation";
import {
  ALERT_DAY_OPTIONS,
  MAX_PLAN_TIMES,
  PLAN_HORIZON_DAYS,
  isTime,
  isTimezone,
  sameSlot,
  upcomingSlots,
} from "@/lib/posting-plan";
import { activePosts, userAccounts, userPlan, zernioProfileId } from "@/lib/social";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  connectUrl,
  createScheduledPost,
  deletePost,
  disconnectAccount as zernioDisconnect,
  isSocialPlatform,
  uploadVideo,
  zernioEnabled,
} from "@/lib/zernio";

const PAGE = "/dashboard/planning";

async function currentUser() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect(`/login?next=${PAGE}`);
  return auth.claims.sub;
}

async function origin() {
  return (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// Ouvre la connexion OAuth du réseau, via Zernio, qui revient sur le planning.
export async function connectAccount(formData: FormData) {
  const platform = formData.get("platform");
  if (!isSocialPlatform(platform) || !zernioEnabled()) redirect(`${PAGE}?error=connect`);
  const userId = await currentUser();
  let url: string | null = null;
  try {
    const profileId = await zernioProfileId(userId, true);
    if (profileId) url = await connectUrl(platform, profileId, `${await origin()}${PAGE}`);
  } catch (e) {
    console.error("connectAccount", errorMessage(e));
  }
  redirect(url ?? `${PAGE}?error=connect`);
}

export async function disconnectAccount(formData: FormData) {
  const userId = await currentUser();
  const accountId = String(formData.get("accountId") ?? "");
  // Seulement un compte de son propre profil.
  const accounts = await userAccounts(userId);
  if (!accounts.some((a) => a.id === accountId)) return;
  try {
    await zernioDisconnect(accountId);
  } catch (e) {
    console.error("disconnectAccount", errorMessage(e));
  }
  revalidatePath(PAGE);
}

export async function savePlan(formData: FormData) {
  const userId = await currentUser();
  const weekdays = [...new Set(formData.getAll("weekday").map(Number))].filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6,
  );
  const times = [...new Set(formData.getAll("time").filter(isTime))].sort().slice(0, MAX_PLAN_TIMES);
  const timezone = formData.get("timezone");
  const alertDays = Number(formData.get("alertDays"));
  if (!weekdays.length || !times.length || !isTimezone(timezone)) redirect(`${PAGE}?error=plan`);

  const accounts = await userAccounts(userId);
  const accountIds = formData
    .getAll("account")
    .map(String)
    .filter((id) => accounts.some((a) => a.id === id));

  const { error } = await createAdminClient()
    .from("posting_plans")
    .upsert({
      user_id: userId,
      weekdays,
      times,
      timezone,
      account_ids: accountIds,
      alert_days: ALERT_DAY_OPTIONS.includes(alertDays as (typeof ALERT_DAY_OPTIONS)[number]) ? alertDays : 3,
      alert_email: formData.get("alertEmail") === "on",
      locale: await getLocale(),
      updated_at: new Date().toISOString(),
    });
  if (error) {
    console.error("savePlan", error.message);
    redirect(`${PAGE}?error=plan`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=1`);
}

export type ScheduleState = { error?: string; ok?: boolean };

// Programme une vidéo terminée sur un créneau libre du rythme : la vidéo est
// déposée chez Zernio, qui la publie à l'heure dite sur les comptes choisis.
export async function schedulePost(_prev: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const userId = await currentUser();
  const P = (await getDictionary()).planning;
  if (!zernioEnabled()) return { error: P.notReady };

  const slot = new Date(String(formData.get("slot") ?? ""));
  const generationId = String(formData.get("generationId") ?? "");
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 2200);
  if (formData.get("consent") !== "on") return { error: P.errors.consent };
  if (!generationId) return { error: P.errors.noVideo };

  const plan = await userPlan(userId);
  const slots = upcomingSlots(plan, PLAN_HORIZON_DAYS);
  if (Number.isNaN(slot.getTime()) || !slots.some((s) => sameSlot(s, slot))) return { error: P.errors.slot };
  const taken = await activePosts(userId, slot, slot);
  if (taken.some((p) => p.status !== "cancelled" && p.status !== "failed")) return { error: P.errors.slot };

  const accounts = await userAccounts(userId);
  const chosen = accounts.filter((a) => formData.getAll("account").includes(a.id) && !a.needsReconnection);
  if (!chosen.length) return { error: P.errors.noAccount };

  const admin = createAdminClient();
  const { data: generation } = await admin
    .from("generations")
    .select("storage_path")
    .eq("id", generationId)
    .eq("user_id", userId)
    .eq("status", "completed")
    .maybeSingle();
  if (!generation?.storage_path) return { error: P.errors.noVideo };

  const { data: row, error: insertError } = await admin
    .from("scheduled_posts")
    .insert({
      user_id: userId,
      generation_id: generationId,
      scheduled_for: slot.toISOString(),
      caption,
      account_ids: chosen.map((a) => a.id),
    })
    .select("id")
    .single();
  if (insertError || !row) return { error: P.errors.failed };

  try {
    const { data: video, error } = await admin.storage.from(GENERATIONS_BUCKET).download(generation.storage_path);
    if (error || !video) throw new Error(error?.message ?? "vidéo introuvable");
    const videoUrl = await uploadVideo(video, `twinpost-${row.id}.mp4`);
    const postId = await createScheduledPost({
      caption,
      videoUrl,
      scheduledFor: slot,
      timezone: plan.timezone,
      accounts: chosen,
      postId: row.id,
    });
    await admin.from("scheduled_posts").update({ zernio_post_id: postId }).eq("id", row.id);
  } catch (e) {
    console.error("schedulePost", errorMessage(e));
    await admin.from("scheduled_posts").delete().eq("id", row.id);
    return { error: P.errors.failed };
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function cancelPost(formData: FormData) {
  const userId = await currentUser();
  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { data: post } = await admin
    .from("scheduled_posts")
    .select("id, status, zernio_post_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!post || post.status !== "scheduled") return;
  try {
    if (post.zernio_post_id) await deletePost(post.zernio_post_id);
  } catch (e) {
    console.error("cancelPost", errorMessage(e));
    return;
  }
  await admin
    .from("scheduled_posts")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", post.id);
  revalidatePath(PAGE);
}
