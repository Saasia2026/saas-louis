import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  DEFAULT_PACE,
  DEFAULT_PRESET,
  FORMATS,
  MAX_PROMPT_LENGTH,
  PACES,
  PRESETS,
  SWAP_ENGINES,
  isPace,
  keptSeconds,
  type Pace,
  type PresetId,
} from "@/lib/generation";
import { higgsfieldEnabled } from "@/lib/higgsfield";
import type { SubjectMode } from "@/lib/storyboard";
import { FREE_TEMPLATE_ID, VIDEO_TEMPLATES } from "@/lib/templates";

// Mode Director : un coéquipier, pas un producteur. Il discute avec le
// créateur pour cerner ce qu'il veut vraiment, propose des idées, et prépare
// un brief (prompt + réglages) que le créateur envoie lui-même au mode
// Direct ou Remplacer. Il ne lance jamais rien : tout ce qu'il écrit repasse
// par generate() ou startSwap(), qui valident à nouveau.

export const MAX_DIRECTOR_MESSAGES = 40;
export const MAX_DIRECTOR_MESSAGE_LENGTH = 2000;
// Messages par jour et par compte : chaque message appelle Claude sans être
// payé en crédits. Aligné avec public.use_director_message.
export const DIRECTOR_DAILY_LIMIT = 20;
// Direction artistique tirée d'une vidéo de référence (voir reference.ts).
export const MAX_STYLE_REFERENCE_LENGTH = 4000;
const MAX_IDEAS = 4;

export const HandoffSchema = z.object({
  mode: z.enum(["direct", "swap"]),
  title: z.string(),
  why: z.string(),
  prompt: z.string(),
  aspectRatio: z.enum(FORMATS.map((f) => f.value) as [string, ...string[]]),
  preset: z.enum(PRESETS.map((p) => p.id) as [string, ...string[]]),
  pace: z.enum(PACES.map((p) => p.id) as [string, ...string[]]),
  templateId: z.enum(VIDEO_TEMPLATES.map((t) => t.id) as [string, ...string[]]),
  durationSeconds: z.number(),
});

const TurnSchema = z.object({
  reply: z.string(),
  ideas: z.array(z.string()),
  handoff: HandoffSchema.nullable(),
});

// Brief prêt à passer à un autre mode. Pour "swap", `prompt` dit quoi
// filmer et quelle image de personnage choisir ; les réglages sont ignorés.
export type DirectorHandoff = z.infer<typeof HandoffSchema> & {
  aspectRatio: (typeof FORMATS)[number]["value"];
  preset: PresetId;
  pace: Pace;
};

export type DirectorMessage = { role: "user" | "assistant"; content: string };

// Durée d'un clip à remplacer, selon les moteurs disponibles (SWAP_ENGINES).
const swapLimit = () =>
  higgsfieldEnabled()
    ? `at most ${SWAP_ENGINES.kling.maxSeconds} s with the budget engine (about ${SWAP_ENGINES.kling.creditsPerSecond} credits per second) or ${SWAP_ENGINES.genjutsu.maxSeconds} s with the max-quality engine (about ${SWAP_ENGINES.genjutsu.creditsPerSecond} credits per second); keep swap briefs within ${SWAP_ENGINES.kling.maxSeconds} s unless the creator asks for a longer clip, and tell them it then needs the max-quality engine`
    : `at most ${SWAP_ENGINES.kling.maxSeconds} s`;

const systemPrompt = (mode: SubjectMode, language: string) => `You are the Director of TwinPost, an app where creators make short social media videos with AI. ${mode === "twin" ? "This video stars the creator's own AI twin." : "The video has no fixed character unless the creator picks one."} You chat with the creator in ${language}.

Your role: a creative coworker, like a senior video producer sitting next to the creator. You do not make the video yourself. You help the creator figure out what they really want, bring ideas, point out what will or will not work with AI video, and write the brief they will hand to one of the app's production modes. The creator stays in charge: they decide, you advise and write.

The production modes you prepare briefs for:
- "direct": the creator sends a text prompt (at most ${MAX_PROMPT_LENGTH} characters) with settings. A storyboard writer turns the prompt into shots (one shot per ${keptSeconds(DEFAULT_PRESET, "normal")} s or so, half that at pace "fast"), each shot is generated on its own by a video model, then everything is edited together. Best for anything that can be imagined from scratch: ads, vlogs, teasers, stories, product shots, absurd or impossible ideas. Its weak points: many different faces, precise choreography, dialogue with exact words, text on screen, physical violence (refused by the models), the same person looking exactly identical from shot to shot unless a saved character is used.
- "swap": the creator films a real clip (${swapLimit()}, one person clearly visible) and uploads an image of a character; the character replaces the person, keeping their exact gestures, timing, place and light. Best when the creator can act it out themself: a precise performance, a dance, a sketch, a real place, a real product in hand.

How to work, like a good coworker:
- First understand the goal, not just the idea: who the video is for, where it will be posted, what the viewer should feel or do at the end, and what the creator already has (a product, a place, a character, footage). Ask about what matters most, one or two questions at a time, never a questionnaire. If the creator arrives with a clear idea, do not slow them down: go straight to a brief.
- Bring ideas. When the idea is vague, propose two or three genuinely different angles (a hook, a format, a twist), each in one line, and say which one you would pick and why. Suggest what makes a short video work: a hook in the first second, one clear idea, a payoff or a loop at the end, movement in every shot.
- Be honest: if something is likely to fail or look fake with AI video, say so briefly and offer a way around it (another mode, fewer characters, a simpler action).
- Refine with the creator: when they react to a brief, update it instead of starting over, and keep what they liked.
- Speak simply, in short paragraphs. No jargon unless the creator uses it.

On every turn:
- "reply": your message to the creator, in ${language}. Short and concrete. When you write or update a brief, say in a sentence or two what you went for; do not paste the prompt into the reply, the app shows the brief next to the chat with a button to send it to the right mode.
- "ideas": 0 to ${MAX_IDEAS} short suggestions the creator can click to answer you, in ${language}, written as the creator would say them (e.g. "Plutôt drôle", "Ajoute un plan produit à la fin", "Version 30 s"). They are answers to your question or next steps worth trying. Empty when nothing useful fits.
- "handoff": the complete brief, or null while the idea is still too vague to write one. As soon as you know enough, write one: the creator can always refine it. Keep the previous brief unchanged (copy it back) when the turn does not change it.

Brief fields:
- "mode": "direct" or "swap", whichever fits the idea best (see above).
- "title": a short title, in ${language}.
- "why": one sentence in ${language} on why this approach should work (the hook, the mode, the style).
- "prompt":
  - For "direct": the prompt the creator will send, in ${language}, at most ${MAX_PROMPT_LENGTH} characters. Write it as a clear shot-by-shot story the storyboard writer can follow: the hook, then each moment in order, then the ending. Give the place and light, the people or product with concrete, repeatable details (colours, brand, outfit), the actions, the camera feel and the mood. It must look like a real video filmed with an ordinary camera unless the creator wants another look. Only things a video model can show: no on-screen text, no exact dialogue.
  - For "swap": in ${language}, what the creator should film (place, framing, action beat by beat, duration, phone held how) and what character image to upload (full body, sharp, facing the camera). Keep it under ${MAX_PROMPT_LENGTH} characters.
- "aspectRatio": "9:16" (Story, default for social media), "1:1" or "16:9".
- "preset": the quality preset for "direct", only among the available ones listed in the context.
- "pace": "fast" cuts every shot in half for a punchy edit (twice as many shots, twice the cost), "normal" keeps whole shots. "fast" for ads, teasers and energetic videos, "normal" for calm or intimate ones.
- "templateId": the video style that fits best, among: ${VIDEO_TEMPLATES.map((t) => `"${t.id}" (${t.label}: ${t.direction || "free style"})`).join("; ")}. The style's direction is added to the prompt automatically: do not repeat it.
- "durationSeconds": the length of the video in seconds. 15 by default, never more than the maximum given in the context.

Action and fiction are welcome: fights, chases, duels, battles, heists, horror, as in an action movie or a video game. The video models' filters refuse visible blows, contact between people, blood, gore and weapons aimed at someone, so write these scenes the way action trailers suggest them: the build-up and the stand-off, fast camera moves, dodges and near misses, a cut right before the impact, the reaction and the aftermath (someone landing on the ground, objects flying, dust, debris), sound-free energy through speed and framing. Tell the creator briefly that this is how the scene will pass the filters, and suggest the "swap" mode when they want a real choreographed fight they can film with friends.

Keep everything suitable for a public social media feed. Never write a brief that uses real people's likeness without their consent, sexual content, gore, or violence against real people or animals; explain kindly what you can do instead.`;

// Un tour de conversation. `messages` se termine par le message du
// créateur ; `current` est le dernier brief proposé (renvoyé par le
// navigateur, simple contexte : rien n'est lancé à partir de lui).
export async function directorTurn(input: {
  messages: DirectorMessage[];
  current: DirectorHandoff | null;
  maxVideoSeconds: number;
  presets: PresetId[];
  mode: SubjectMode;
  // Langue des réponses ("French", "English"…) et message en cas de refus.
  language: string;
  refusal: string;
  // Personnages enregistrés, utilisables en mode Direct.
  characters: string[];
  // Direction artistique d'une vidéo de référence déposée par le créateur.
  styleReference?: string;
}): Promise<{ reply: string; ideas: string[]; handoff: DirectorHandoff | null }> {
  const history = input.messages.slice(-MAX_DIRECTOR_MESSAGES);
  const last = history.at(-1);
  if (!last || last.role !== "user") throw new Error("Le dernier message doit venir du créateur");

  const presets = PRESETS.filter((p) => input.presets.includes(p.id));
  const context = [
    presets.length
      ? `Available quality presets for "direct": ${presets
          .map((p) => `"${p.id}" (${p.label}, ${p.hint})`)
          .join("; ")}.`
      : `No quality preset is available right now: video generation is down, but you can still prepare the brief.`,
    `Maximum video length for this creator: ${input.maxVideoSeconds} s.`,
    input.characters.length
      ? `Saved characters the creator can pick in "direct" mode (they keep the same look in every shot): ${input.characters.map((c) => `"${c}"`).join(", ")}. Mention one when it fits the idea.`
      : `The creator has no saved character yet.`,
    `Current brief: ${input.current ? JSON.stringify(input.current) : "none yet"}.`,
    ...(input.styleReference
      ? [
          `Reference video: the creator uploaded a video whose art direction they want to copy. In "direct" mode the video model receives it and the only preset is "reference". Write the prompt so the story fits this style (camera, speed, framing, light, colours, editing rhythm) and choose "pace" accordingly. Art direction:\n${input.styleReference}`,
        ]
      : []),
  ].join("\n");

  const response = await new Anthropic().beta.messages.parse({
    model: "claude-opus-5",
    max_tokens: 8000,
    cache_control: { type: "ephemeral" },
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(TurnSchema),
    },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt(input.mode, input.language),
    messages: [
      ...history.slice(0, -1),
      { role: "user", content: `${context}\n\nCreator's message:\n${last.content}` },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    console.error("directorTurn: pas de réponse", response.stop_reason);
    return { reply: input.refusal, ideas: [], handoff: input.current };
  }

  const { reply, ideas, handoff } = response.parsed_output;
  return {
    reply,
    ideas: ideas.map((i) => i.trim()).filter(Boolean).slice(0, MAX_IDEAS),
    handoff: handoff ? sanitizeHandoff(handoff, input) : input.current,
  };
}

// Borne le brief aux limites de l'utilisateur, quoi qu'ait écrit Claude (ou
// renvoyé le navigateur).
export function sanitizeHandoff(
  handoff: z.infer<typeof HandoffSchema>,
  limits: { maxVideoSeconds: number; presets: PresetId[] },
): DirectorHandoff | null {
  const prompt = handoff.prompt.trim().slice(0, MAX_PROMPT_LENGTH);
  if (!prompt) return null;
  const pace: Pace = isPace(handoff.pace) ? handoff.pace : DEFAULT_PACE;
  // Sinon le premier disponible : avec une vidéo de référence, c'est le seul.
  const preset =
    limits.presets.find((p) => p === handoff.preset) ?? limits.presets[0] ?? DEFAULT_PRESET;
  // La durée tombe juste sur la longueur d'un plan.
  const step = keptSeconds(preset, pace);
  const max = Math.max(step, Math.floor(limits.maxVideoSeconds / step) * step);
  const durationSeconds = Math.min(
    max,
    Math.max(step, Math.round((handoff.durationSeconds || 15) / step) * step),
  );
  const aspectRatio = FORMATS.find((f) => f.value === handoff.aspectRatio)?.value ?? "9:16";
  const templateId = VIDEO_TEMPLATES.some((t) => t.id === handoff.templateId)
    ? handoff.templateId
    : FREE_TEMPLATE_ID;
  return {
    mode: handoff.mode === "swap" ? "swap" : "direct",
    title: handoff.title.slice(0, 120),
    why: handoff.why.slice(0, 400),
    prompt,
    aspectRatio,
    preset,
    pace,
    templateId,
    durationSeconds,
  };
}
