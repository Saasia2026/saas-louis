"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { DEFAULT_PLAN } from "@/lib/posting-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  analyzeTikTokAccount,
  latestTikTokAnalysis,
  normalizeHandle,
  type TikTokAnalysis,
} from "@/lib/tiktok-analysis";
import { listTrendPicks, type TrendPick } from "@/lib/trends";

export type BotId = "scout" | "hook";
export type BotTurn = { role: "user" | "assistant"; text: string };
export type BotReply = { ok: true; text: string; left: number } | { ok: false; error: "limit" | "failed" | "auth" };

// Environ 2 centimes par question : 20 par utilisateur et par 24 h.
const DAILY_LIMIT = 20;
const MAX_TURNS = 12;
const MAX_CHARS = 800;

const LANGUAGE: Record<Locale, string> = { fr: "French", en: "English", es: "Spanish" };

// Noms affichés sur le site, pour que les bots parlent comme l'interface.
const FEATURE_NAMES: Record<Locale, string> = {
  fr: `"Remplacer", "Transférer le mouvement", "Choisir un style", "Influenceur IA", "Viralité", "Planning", "Mes vidéos"`,
  en: `"Replace", "Motion transfer", "Choose a style", "AI influencer", "Virality", "Schedule", "My videos"`,
  es: `"Reemplazar", "Transferir el movimiento", "Elegir un estilo", "Influencer IA", "Viralidad", "Planificación", "Mis vídeos"`,
};

const APP = `TwinPost is a web app for creators. In the studio, "Replace" swaps a person (or an object, an outfit) in a real clip of 4.5 to 15 seconds with any character from one or more photos, keeping gestures, camera, set and sound. "Motion transfer" rebuilds the whole scene from the clip's movements, so animals and creatures work too. A style picker restyles the whole video (anime, 3D, clay…). The "AI influencer" page creates a character in one image, which the user then sends to the studio. "Virality" reviews a clip before posting, "Schedule" plans posts on TikTok, Instagram, YouTube and Facebook.`;

const PERSONAS: Record<BotId, string> = {
  scout: `You are Scout, the trend advisor inside TwinPost's studio. You know which AI influencer and AI character videos are blowing up on TikTok today (list below) and you help the creator pick what to make next: which format to redo, with which kind of character, which footage to film, which TwinPost mode to use.`,
  hook: `You are Hook, the hook and script advisor inside TwinPost's studio. You write opening lines, on-screen text, captions and short scripts for the creator's next AI influencer or AI character video, built for the first 3 seconds and for comments and shares. Today's viral videos (list below) are your references.`,
};

function system(bot: BotId, locale: Locale, picks: TrendPick[], account: TikTokAnalysis | null) {
  const list = picks.length
    ? picks.map((p, i) => `${i + 1}. @${p.author}, ${p.views} views. Caption: ${p.caption}. Why it works: ${p.why}. Hook idea: ${p.hook}`).join("\n")
    : "No selection today.";
  const own = account
    ? `The creator's own TikTok account, @${account.handle}, reviewed on ${account.createdAt.slice(0, 10)}: ${account.stats.followers} followers, median ${account.stats.medianViews} views, ${account.stats.engagement}% engagement, ${account.stats.postsPerWeek} posts a week. Summary: ${account.report.summary} Keep: ${account.report.keep.join(" / ")} Stop: ${account.report.stop.join(" / ")} Use this to tailor your advice.`
    : "The creator has not had their TikTok account reviewed yet; Scout's \"My account\" tab can do it.";
  return `${PERSONAS[bot]}

${APP}

Today's viral videos:
${list}

${own}

Rules:
- Reply in ${LANGUAGE[locale]}, addressing the creator informally (tu in French and Spanish), like a friendly expert advisor.
- Name TwinPost's modes and pages exactly as the site shows them in ${LANGUAGE[locale]}: ${FEATURE_NAMES[locale]}.
- Keep it short: at most 120 words, plain text, short lines or a few "-" bullets, no headings, no markdown bold.
- Be concrete: give lines they can copy, footage they can film, the TwinPost mode to use.
- Only promise what TwinPost does. Never name or recommend another AI tool or app.
- Refuse politely to help with real people's likeness without consent, sexual content or anything involving minors, and suggest an alternative.
- If the question has nothing to do with making videos, steer back to their next video in one sentence.`;
}

export async function askBot(bot: BotId, turns: BotTurn[]): Promise<BotReply> {
  if (bot !== "scout" && bot !== "hook") return { ok: false, error: "failed" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { ok: false, error: "auth" };

  const clean = (Array.isArray(turns) ? turns : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string" && t.text.trim())
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.text.trim().slice(0, MAX_CHARS) }));
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== "user") return { ok: false, error: "failed" };

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count } = await admin
    .from("bot_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) return { ok: false, error: "limit" };

  const locale = await getLocale();
  try {
    const [picks, account] = await Promise.all([listTrendPicks(locale), latestTikTokAnalysis().catch(() => null)]);
    const response = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: system(bot, locale, picks, account),
      messages: clean,
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "failed" };
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) return { ok: false, error: "failed" };
    await admin.from("bot_messages").insert({ user_id: userId, bot });
    return { ok: true, text, left: DAILY_LIMIT - used - 1 };
  } catch (e) {
    console.error("askBot", bot, e instanceof Error ? e.message : e);
    return { ok: false, error: "failed" };
  }
}

// --- Analyse du compte TikTok (onglet « Mon compte » de Scout) ----------

export type AnalyzeResult =
  | { ok: true; analysis: TikTokAnalysis }
  | { ok: false; error: "auth" | "handle" | "limit" | "notFound" | "failed"; nextAt?: string };

// Environ 0,12 $ d'Apify et quelques centimes de Claude : une analyse
// réussie par utilisateur et par 24 h.
const ANALYSIS_EVERY_MS = 24 * 3_600_000;

export async function analyzeTikTok(input: string): Promise<AnalyzeResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { ok: false, error: "auth" };
  const handle = normalizeHandle(typeof input === "string" ? input : "");
  if (!handle) return { ok: false, error: "handle" };

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("tiktok_analyses")
    .select("created_at")
    .eq("user_id", userId)
    .eq("status", "ready")
    .gte("created_at", new Date(Date.now() - ANALYSIS_EVERY_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) {
    return { ok: false, error: "limit", nextAt: new Date(Date.parse(last.created_at) + ANALYSIS_EVERY_MS).toISOString() };
  }

  const { data: plan } = await admin.from("posting_plans").select("timezone").eq("user_id", userId).maybeSingle();
  const timezone = plan?.timezone ?? DEFAULT_PLAN.timezone;
  try {
    const result = await analyzeTikTokAccount(handle, timezone, await getLocale());
    if (!result) return { ok: false, error: "notFound" };
    const { data: row, error } = await admin
      .from("tiktok_analyses")
      .insert({ user_id: userId, handle, status: "ready", stats: result.stats, report: result.report })
      .select("id, created_at")
      .single();
    if (error) throw error;
    return { ok: true, analysis: { id: row.id, handle, createdAt: row.created_at, ...result } };
  } catch (e) {
    console.error("analyzeTikTok", handle, e instanceof Error ? e.message : e);
    await admin.from("tiktok_analyses").insert({ user_id: userId, handle, status: "failed" });
    return { ok: false, error: "failed" };
  }
}

// Reporte le rythme conseillé dans le Planning, sans toucher aux comptes
// choisis, au fuseau ni aux alertes déjà réglés.
export async function applyRhythm(analysisId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId || typeof analysisId !== "string") return { ok: false };
  const { data: analysis } = await supabase.from("tiktok_analyses").select("report").eq("id", analysisId).maybeSingle();
  const rhythm = (analysis?.report as { rhythm?: { weekdays?: number[]; times?: string[] } } | null)?.rhythm;
  if (!rhythm?.weekdays?.length || !rhythm.times?.length) return { ok: false };

  const admin = createAdminClient();
  const { data: plan } = await admin
    .from("posting_plans")
    .select("timezone, account_ids, alert_days, alert_email")
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await admin.from("posting_plans").upsert({
    user_id: userId,
    weekdays: rhythm.weekdays,
    times: rhythm.times,
    timezone: plan?.timezone ?? DEFAULT_PLAN.timezone,
    account_ids: plan?.account_ids ?? [],
    alert_days: plan?.alert_days ?? DEFAULT_PLAN.alertDays,
    alert_email: plan?.alert_email ?? DEFAULT_PLAN.alertEmail,
    locale: await getLocale(),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("applyRhythm", error.message);
    return { ok: false };
  }
  revalidatePath("/dashboard/planning");
  return { ok: true };
}
