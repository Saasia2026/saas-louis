import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  DEFAULT_PACE,
  DEFAULT_PRESET,
  FORMATS,
  PACES,
  PRESETS,
  VIDEO_STEP_SECONDS,
  isPace,
  keptSeconds,
  shotCount,
  type Pace,
  type PresetId,
} from "@/lib/generation";
import { ShotSchema, storyboardRules, type SubjectMode } from "@/lib/storyboard";
import { FREE_TEMPLATE_ID, VIDEO_TEMPLATES } from "@/lib/templates";

// Mode Director : le créateur construit sa vidéo en discutant avec Claude,
// qui tient à jour un brouillon (réglages + storyboard). Le brouillon est
// renvoyé au navigateur avec un jeton signé : au lancement, seul un brouillon
// écrit ici, pour cet utilisateur, est accepté (voir readDraftToken).

export const MAX_DIRECTOR_MESSAGES = 40;
export const MAX_DIRECTOR_MESSAGE_LENGTH = 2000;
const TOKEN_TTL_MS = 24 * 60 * 60_000;

const DraftSchema = z.object({
  title: z.string(),
  brief: z.string(),
  aspectRatio: z.enum(FORMATS.map((f) => f.value) as [string, ...string[]]),
  preset: z.enum(PRESETS.map((p) => p.id) as [string, ...string[]]),
  pace: z.enum(PACES.map((p) => p.id) as [string, ...string[]]),
  templateId: z.enum(VIDEO_TEMPLATES.map((t) => t.id) as [string, ...string[]]),
  subject: z.string(),
  shots: z.array(ShotSchema),
});

const TurnSchema = z.object({
  reply: z.string(),
  draft: DraftSchema.nullable(),
});

export type DirectorDraft = z.infer<typeof DraftSchema> & {
  aspectRatio: (typeof FORMATS)[number]["value"];
  preset: PresetId;
  pace: Pace;
};

export type DirectorMessage = { role: "user" | "assistant"; content: string };

const systemPrompt = (mode: SubjectMode) => `You are the Director of TwinPost, an app where creators make social media videos. ${mode === "twin" ? "This video stars the creator's own AI twin." : "This video has no fixed character: it shows whatever the creator describes."} You chat with the creator in French, in a warm, concise and practical tone, to shape their video, and you keep an up-to-date draft of it.

What these videos must look like: a real video someone actually filmed with an ordinary camera, the kind that gets posted on Instagram or TikTok. Natural, lively movement and scenes that hold together matter far more than polish: never aim for a cinematic look unless the creator explicitly asks for one.

How a video is made: the video is a sequence of shots, each generated on its own by a video model and then edited together. The length of a shot depends on the chosen preset (see the context). Once launched, the whole video is produced without further input.

On every turn:
- "reply": your message to the creator, in French, a few short sentences. Briefly say what you changed in the draft, and ask at most one question when something important is missing (the idea, the product, the place, the mood). Do not repeat the whole storyboard: the app displays it next to the chat.
- "draft": the complete updated draft, or null only while there is not yet enough to propose a first version. As soon as the idea is clear enough, propose a full draft rather than asking more questions; the creator will refine it.

Draft fields:
- "title": a short French title for the video.
- "brief": the creator's idea in one or two French sentences.
- "aspectRatio": "9:16" (Story, default for social media), "1:1" (square) or "16:9" (landscape).
- "preset": the quality preset, only among the available ones listed in the context. Default to "balanced". Use "fast" when the creator wants it quicker or cheaper. Keep the current one unless the creator asks for another.
- "pace": "fast" cuts every shot in half for a punchy social media edit (twice as many shots for the same length, twice the cost), "normal" keeps whole shots. Some presets ignore it (see the context). Default to "fast" for ads, teasers and energetic videos, "normal" for calm or intimate ones.
- "templateId": the video style that best fits the idea, among: ${VIDEO_TEMPLATES.map((t) => `"${t.id}" (${t.label}: ${t.direction || "free style"})`).join("; ")}. Follow the chosen style's direction when writing the shots.
- "subject" and "shots": the storyboard, following the rules below. The number of shots sets the length of the video (one shot lasts ${VIDEO_STEP_SECONDS} s at pace "normal", 2.5 s at pace "fast"): aim for a 15-second video by default, and never exceed the maximum number of shots given in the context. When the creator asks for a duration, use the matching number of shots for the chosen pace.

Storyboard rules:
${storyboardRules(mode)}

Do not explain the storyboard rules or the image model's limits to the creator unless they ask why something looks the way it does.

Only change what the creator asks for, and keep everything else exactly as in the current draft (same wording, same shots). Never write anything that breaks the storyboard rules, even when asked: explain kindly what you can do instead.`;

// Un tour de conversation. `messages` se termine par le message du
// créateur ; `current` est le brouillon en cours (déjà vérifié).
export async function directorTurn(input: {
  messages: DirectorMessage[];
  current: DirectorDraft | null;
  maxVideoSeconds: number;
  presets: PresetId[];
  mode: SubjectMode;
}): Promise<{ reply: string; draft: DirectorDraft | null }> {
  const history = input.messages.slice(-MAX_DIRECTOR_MESSAGES);
  const last = history.at(-1);
  if (!last || last.role !== "user") throw new Error("Le dernier message doit venir du créateur");

  const presets = PRESETS.filter((p) => input.presets.includes(p.id));
  const context = [
    `Available quality presets: ${presets
      .map((p) => `"${p.id}" (${p.label}, ${p.hint})`)
      .join("; ")}.`,
    ...presets.map(
      (p) =>
        `With preset "${p.id}": each shot lasts ${keptSeconds(p.id, "normal")} s, at most ${shotCount(input.maxVideoSeconds, p.id, "normal")} shots${
          keptSeconds(p.id, "fast") < keptSeconds(p.id, "normal")
            ? `, or ${shotCount(input.maxVideoSeconds, p.id, "fast")} shots at pace "fast"`
            : ` (pace "fast" has no effect)`
        }.`,
    ),
    `Current draft: ${input.current ? JSON.stringify(input.current) : "none yet"}.`,
  ].join("\n");

  const response = await new Anthropic().beta.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    cache_control: { type: "ephemeral" },
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(TurnSchema),
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt(input.mode),
    messages: [
      ...history.slice(0, -1),
      { role: "user", content: `${context}\n\nCreator's message:\n${last.content}` },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    console.error("directorTurn: pas de réponse", response.stop_reason);
    return {
      reply: "Je ne peux pas t'aider sur cette demande. Essaie une autre idée de vidéo ?",
      draft: input.current,
    };
  }

  const { reply, draft } = response.parsed_output;
  return { reply, draft: draft ? sanitizeDraft(draft, input) : input.current };
}

// Borne le brouillon aux limites de l'utilisateur, quoi qu'ait écrit Claude.
function sanitizeDraft(
  draft: z.infer<typeof DraftSchema>,
  limits: { maxVideoSeconds: number; presets: PresetId[] },
): DirectorDraft | null {
  const pace: Pace = isPace(draft.pace) ? draft.pace : DEFAULT_PACE;
  const preset = limits.presets.find((p) => p === draft.preset) ?? DEFAULT_PRESET;
  const shots = draft.shots.slice(0, shotCount(limits.maxVideoSeconds, preset, pace));
  // En rythme rapide, deux plans coupés font une durée entière : le compte
  // doit rester pair pour que la durée facturée tombe juste.
  if (keptSeconds(preset, pace) < keptSeconds(preset, "normal") && shots.length % 2 === 1) {
    shots.pop();
  }
  if (!shots.length) return null;
  const aspectRatio = FORMATS.find((f) => f.value === draft.aspectRatio)?.value ?? "9:16";
  const templateId = VIDEO_TEMPLATES.some((t) => t.id === draft.templateId)
    ? draft.templateId
    : FREE_TEMPLATE_ID;
  return { ...draft, shots, preset, aspectRatio, templateId, pace };
}

// ---------------------------------------------------------------------------
// Jeton de brouillon
// ---------------------------------------------------------------------------

function signingKey() {
  const key = process.env.DIRECTOR_SIGNING_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Aucune clé de signature pour le mode Director");
  return key;
}

function sign(payload: string) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function createDraftToken(userId: string, draft: DirectorDraft) {
  const payload = Buffer.from(
    JSON.stringify({ userId, issuedAt: Date.now(), draft }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Brouillon d'un jeton valide, émis pour cet utilisateur il y a moins de 24 h.
export function readDraftToken(token: string, userId: string): DirectorDraft | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      userId: string;
      issuedAt: number;
      draft: DirectorDraft;
    };
    if (data.userId !== userId || Date.now() - data.issuedAt > TOKEN_TTL_MS) return null;
    return data.draft;
  } catch {
    return null;
  }
}
