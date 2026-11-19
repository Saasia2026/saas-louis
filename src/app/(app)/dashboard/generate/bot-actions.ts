"use server";

import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listTrendPicks, type TrendPick } from "@/lib/trends";

export type BotId = "scout" | "hook";
export type BotTurn = { role: "user" | "assistant"; text: string };
export type BotReply = { ok: true; text: string; left: number } | { ok: false; error: "limit" | "failed" | "auth" };

// Environ 2 centimes par question : 20 par utilisateur et par 24 h.
const DAILY_LIMIT = 20;
const MAX_TURNS = 12;
const MAX_CHARS = 800;

const LANGUAGE: Record<Locale, string> = { fr: "French", en: "English", es: "Spanish" };

const APP = `TwinPost is a web app for creators. In the studio, "Replace" swaps a person (or an object, an outfit) in a real clip of 4.5 to 15 seconds with any character from one or more photos, keeping gestures, camera, set and sound. "Motion transfer" rebuilds the whole scene from the clip's movements, so animals and creatures work too. A style picker restyles the whole video (anime, 3D, clay…). The "AI influencer" page creates a character in one image, which the user then sends to the studio. "Virality" reviews a clip before posting, "Schedule" plans posts on TikTok, Instagram, YouTube and Facebook.`;

const PERSONAS: Record<BotId, string> = {
  scout: `You are Scout, the trend advisor inside TwinPost's studio. You know which AI influencer and AI character videos are blowing up on TikTok today (list below) and you help the creator pick what to make next: which format to redo, with which kind of character, which footage to film, which TwinPost mode to use.`,
  hook: `You are Hook, the hook and script advisor inside TwinPost's studio. You write opening lines, on-screen text, captions and short scripts for the creator's next AI influencer or AI character video, built for the first 3 seconds and for comments and shares. Today's viral videos (list below) are your references.`,
};

function system(bot: BotId, locale: Locale, picks: TrendPick[]) {
  const list = picks.length
    ? picks.map((p, i) => `${i + 1}. @${p.author}, ${p.views} views. Caption: ${p.caption}. Why it works: ${p.why}. Hook idea: ${p.hook}`).join("\n")
    : "No selection today.";
  return `${PERSONAS[bot]}

${APP}

Today's viral videos:
${list}

Rules:
- Reply in ${LANGUAGE[locale]}, addressing the creator informally (tu in French and Spanish), like a friendly expert advisor.
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
    const picks = await listTrendPicks(locale);
    const response = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: system(bot, locale, picks),
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
