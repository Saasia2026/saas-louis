"use server";

import { INTL_LOCALES } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { GENERATIONS_BUCKET, SWAP_INPUTS_BUCKET } from "@/lib/generation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { probeVideo } from "@/lib/swap";
import {
  VIRALITY_CREDITS,
  VIRALITY_MAX_SECONDS,
  VIRALITY_MIN_SECONDS,
  type ViralityAnalysis,
} from "@/lib/virality";
import { analyzeClip } from "@/lib/virality-analysis";

export type AnalyzeResult =
  | { ok: true; analysis: ViralityAnalysis; credits: number }
  | {
      ok: false;
      error: "auth" | "invalid" | "credits" | "tooLong" | "tooShort" | "unreadable" | "failed";
      need?: number;
    };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

// Fichier déposé : seulement dans le dossier de l'utilisateur.
function ownPath(userId: string, value: unknown) {
  return typeof value === "string" && value.startsWith(`${userId}/`) && !value.includes("..") ? value : null;
}

// URL signée du clip à analyser : un rendu terminé de l'utilisateur, ou un
// fichier qu'il a déposé.
async function clipUrl(userId: string, source: { generationId?: unknown; path?: unknown }) {
  const admin = createAdminClient();
  if (typeof source.generationId === "string") {
    const { data: gen } = await admin
      .from("generations")
      .select("storage_path")
      .eq("id", source.generationId)
      .eq("user_id", userId)
      .eq("status", "completed")
      .maybeSingle();
    if (!gen?.storage_path) return null;
    const { data } = await admin.storage.from(GENERATIONS_BUCKET).createSignedUrl(gen.storage_path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ? { url: data.signedUrl, generationId: source.generationId, path: null } : null;
  }
  const path = ownPath(userId, source.path);
  if (!path) return null;
  const { data } = await admin.storage.from(SWAP_INPUTS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ? { url: data.signedUrl, generationId: null, path } : null;
}

// Analyse de viralité d'un clip, demandée aux bots (bouton « + » de la
// discussion, ou « Analyser » d'un rendu) : crédits débités, rapport rangé ;
// en cas d'échec, les crédits sont rendus.
export async function analyzeVideo(source: { generationId?: unknown; path?: unknown }): Promise<AnalyzeResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "auth" };
  const clip = await clipUrl(userId, source);
  if (!clip) return { ok: false, error: "invalid" };

  const probe = await probeVideo(clip.url).catch(() => null);
  if (!probe) return { ok: false, error: "unreadable" };
  if (probe.seconds > VIRALITY_MAX_SECONDS + 0.5) return { ok: false, error: "tooLong" };
  if (probe.seconds < VIRALITY_MIN_SECONDS) return { ok: false, error: "tooShort" };

  const admin = createAdminClient();
  const { data: id, error } = await admin.rpc("start_virality_analysis", {
    p_user_id: userId,
    // Un seul des deux est donné ; la fonction accepte null pour l'autre.
    p_generation_id: clip.generationId as string,
    p_video_path: clip.path as string,
    p_seconds: Math.round(probe.seconds * 10) / 10,
    p_credits: VIRALITY_CREDITS,
  });
  if (error || !id) {
    if (error?.message.includes("insufficient_credits")) {
      const { data: profile } = await admin.from("profiles").select("credits_remaining").eq("id", userId).single();
      return { ok: false, error: "credits", need: Math.max(1, VIRALITY_CREDITS - (profile?.credits_remaining ?? 0)) };
    }
    console.error("analyzeVideo", error?.message);
    return { ok: false, error: "failed" };
  }

  try {
    const locale = await getLocale();
    const { report, facts } = await analyzeClip({ url: clip.url, locale });
    await admin.from("virality_analyses").update({ status: "ready", report, facts }).eq("id", id);
    const { data: profile } = await admin.from("profiles").select("credits_remaining").eq("id", userId).single();
    return {
      ok: true,
      credits: profile?.credits_remaining ?? 0,
      analysis: {
        id,
        report,
        facts,
        videoUrl: clip.url,
        date: new Intl.DateTimeFormat(INTL_LOCALES[locale], { dateStyle: "medium" }).format(new Date()),
      },
    };
  } catch (e) {
    console.error("analyzeVideo", e instanceof Error ? e.message : e);
    await admin.rpc("fail_virality_analysis", { p_id: id });
    return { ok: false, error: "failed" };
  }
}
