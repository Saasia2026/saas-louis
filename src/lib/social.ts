import "server-only";
import { DEFAULT_PLAN, sameSlot, upcomingSlots, type PostingPlan } from "@/lib/posting-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createProfile, listAccounts, zernioEnabled, type SocialAccount } from "@/lib/zernio";

// Profil Zernio de l'utilisateur, créé à sa première connexion d'un réseau.
export async function zernioProfileId(userId: string, create: boolean) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("zernio_profile_id, email")
    .eq("id", userId)
    .single();
  if (profile?.zernio_profile_id || !create) return profile?.zernio_profile_id ?? null;
  const id = await createProfile(`TwinPost ${profile?.email ?? userId}`);
  // Deux créations simultanées : la première écrite gagne.
  const { data: saved } = await admin
    .from("profiles")
    .update({ zernio_profile_id: id })
    .eq("id", userId)
    .is("zernio_profile_id", null)
    .select("zernio_profile_id");
  if (saved?.length) return id;
  return zernioProfileId(userId, false);
}

// Comptes connectés ; vide sans profil ou sans clé Zernio.
export async function userAccounts(userId: string): Promise<SocialAccount[]> {
  if (!zernioEnabled()) return [];
  const profileId = await zernioProfileId(userId, false);
  return profileId ? listAccounts(profileId) : [];
}

export async function userPlan(userId: string): Promise<PostingPlan & { saved: boolean }> {
  const { data } = await createAdminClient()
    .from("posting_plans")
    .select("weekdays, times, timezone, account_ids, alert_days, alert_email")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_PLAN, saved: false };
  return {
    weekdays: data.weekdays,
    times: data.times,
    timezone: data.timezone,
    accountIds: data.account_ids,
    alertDays: data.alert_days,
    alertEmail: data.alert_email,
    saved: true,
  };
}

// Publications encore actives (ni annulées ni ratées) sur la période.
export async function activePosts(userId: string, from: Date, to: Date) {
  const { data } = await createAdminClient()
    .from("scheduled_posts")
    .select("id, generation_id, scheduled_for, caption, account_ids, status, results, error")
    .eq("user_id", userId)
    .gte("scheduled_for", new Date(from.getTime() - 60_000).toISOString())
    .lte("scheduled_for", to.toISOString())
    .order("scheduled_for", { ascending: true });
  return data ?? [];
}

// Créneaux des `days` prochains jours sans vidéo programmée.
export async function missingSlots(userId: string, plan: PostingPlan, days: number) {
  const now = new Date();
  const slots = upcomingSlots(plan, days, now);
  if (!slots.length) return [];
  const posts = await activePosts(userId, now, slots[slots.length - 1]);
  const taken = posts.filter((p) => p.status !== "cancelled" && p.status !== "failed");
  return slots.filter((slot) => !taken.some((p) => sameSlot(p.scheduled_for, slot)));
}
