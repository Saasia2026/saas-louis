import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createFalClient } from "@fal-ai/client";
import ffmpegPath from "ffmpeg-static";
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { detectCuts, probeVideo } from "@/lib/swap";
import { VIRALITY_CRITERIA, type ViralityFacts, type ViralityReport } from "@/lib/virality";

// Analyse de viralité d'un clip (voir lib/virality.ts) : ffmpeg en tire des
// images (serrées sur les 3 premières secondes, où se joue l'accroche), les
// changements de plan et le son ; fal transcrit la parole ; Claude relit le
// tout comme un monteur de vidéos courtes et rend un rapport structuré.

const execFileAsync = promisify(execFile);

// Images envoyées à Claude : 2 par seconde sur l'accroche, puis réparties
// sur le reste, 40 au plus. Petit côté à 480 px (~550 jetons l'image).
const HOOK_SECONDS = 3;
const HOOK_FPS = 2;
const MAX_FRAMES = 40;
const FRAME_SCALE = "scale='if(gt(iw,ih),-2,480)':'if(gt(iw,ih),480,-2)'";

const LANGUAGE: Record<Locale, string> = { fr: "French", en: "English", es: "Spanish" };

const ReportSchema = z.object({
  score: z.number(),
  verdict: z.string(),
  hookAt: z.number(),
  criteria: z.array(z.object({ key: z.enum(VIRALITY_CRITERIA), score: z.number(), note: z.string() })),
  moments: z.array(z.object({ at: z.number(), kind: z.enum(["strong", "risk"]), note: z.string() })),
  fixes: z.array(z.object({ title: z.string(), detail: z.string() })),
  keep: z.object({ start: z.number(), end: z.number(), reason: z.string() }).nullable(),
  caption: z.string(),
  hashtags: z.array(z.string()),
});

function run(args: string[], timeout = 120_000) {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  return execFileAsync(ffmpegPath, ["-hide_banner", ...args], { timeout, maxBuffer: 64 * 1024 * 1024 }).catch((e) => {
    // Jamais la commande (elle peut porter une URL signée) : la raison seule.
    const err = e as { code?: unknown; stderr?: unknown };
    const stderr = typeof err.stderr === "string" ? err.stderr.trim().slice(-300) : "";
    throw new Error(`ffmpeg (analyse) : code ${String(err.code)}${stderr ? ` · ${stderr}` : ""}`);
  });
}

// Images du clip, avec la seconde où chacune est prise.
async function extractFrames(file: string, dir: string, seconds: number) {
  const hookEnd = Math.min(HOOK_SECONDS, seconds);
  const rest = seconds - hookEnd;
  const restCount = Math.min(MAX_FRAMES - Math.ceil(hookEnd * HOOK_FPS), Math.floor(rest));
  const step = restCount > 0 ? rest / restCount : 0;
  await run(["-loglevel", "error", "-t", hookEnd.toFixed(3), "-i", file, "-vf", `fps=${HOOK_FPS},${FRAME_SCALE}`, "-q:v", "5", path.join(dir, "h%03d.jpg")]);
  if (restCount > 0) {
    await run([
      "-loglevel", "error",
      "-ss", (hookEnd + step / 2).toFixed(3),
      "-i", file,
      "-vf", `fps=1/${step.toFixed(4)},${FRAME_SCALE}`,
      "-frames:v", String(restCount),
      "-q:v", "5",
      path.join(dir, "r%03d.jpg"),
    ]);
  }
  const names = (await readdir(dir)).filter((f) => /^[hr]\d+\.jpg$/.test(f)).sort();
  return Promise.all(
    names.map(async (name) => {
      const index = Number(name.slice(1, -4)) - 1;
      const at = name.startsWith("h") ? index / HOOK_FPS : hookEnd + step / 2 + index * step;
      return { at: Math.round(at * 10) / 10, data: (await readFile(path.join(dir, name))).toString("base64") };
    }),
  );
}

// Son du clip : présent ou non, et la parole transcrite avec ses temps
// (vide sans parole, ou si la transcription échoue : l'analyse continue).
async function listenTo(file: string, dir: string) {
  const { stderr } = await run(["-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"]).catch(() => ({ stderr: "" }));
  const mean = Number(stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? NaN);
  const hasAudio = /Stream #.*Audio:/.test(stderr) && Number.isFinite(mean) && mean > -60;
  if (!hasAudio || !process.env.FAL_KEY) return { hasAudio, segments: [] as { at: number; text: string }[] };

  try {
    const audio = path.join(dir, "audio.mp3");
    await run(["-loglevel", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio]);
    const fal = createFalClient({ credentials: process.env.FAL_KEY });
    const url = await fal.storage.upload(new Blob([new Uint8Array(await readFile(audio))], { type: "audio/mpeg" }));
    const { data } = await fal.subscribe("fal-ai/wizper", {
      input: { audio_url: url, task: "transcribe", chunk_level: "segment" },
    });
    const segments = (data.chunks ?? [])
      .map((c) => ({ at: Math.round(Number(c.timestamp?.[0] ?? 0) * 10) / 10, text: (c.text ?? "").trim() }))
      .filter((s) => s.text);
    return { hasAudio, segments };
  } catch (e) {
    console.error("virality: transcription", e instanceof Error ? e.message : e);
    return { hasAudio, segments: [] };
  }
}

const SYSTEM = `You are a senior short-form video editor (TikTok, Instagram Reels, YouTube Shorts). A creator shows you a clip before posting it and wants an honest, useful review. Many clips come from an AI tool that puts a character (an animal, a creature, a celebrity look-alike, an unusual person) in place of the person filmed, but any clip can come in.

You receive: measurements from ffmpeg (duration, format, cut times, sound), the speech transcript with timestamps, then frames in order, each preceded by its timestamp. The first 3 seconds are sampled twice per second because that is where viewers decide to stay or scroll.

Rules:
- Judge only what you can see and hear in this material. Never predict views, likes or a probability of going viral, and never claim to know the algorithm. You review the craft.
- Be calibrated: most clips land between 40 and 75. Above 85 only for a clip that is genuinely excellent on every criterion. Below 30 for a clip with no hook and nothing happening.
- Be concrete and specific to this clip: name the moment (in seconds), what is on screen, what to change. No generic advice ("add trending music", "post at the right time", "engage with your audience").
- Fixes must be doable by the creator with this clip: cut, reorder, trim dead time, add on-screen text in the first second, change the ending so it loops, reshoot one shot, etc.

Output fields:
- score: 0-100 overall.
- verdict: one sentence, the main takeaway.
- hookAt: the second at which the hook lands (the first moment that gives a reason to keep watching); if there is no real hook, the second where one should be.
- criteria: exactly one entry for each key, in this order: hook (first 3 s: does something surprising, funny or intriguing happen immediately?), pacing (dead time, length, rhythm of cuts), clarity (is it understood with the sound off, in one viewing? is the subject readable on a phone?), sound (voice, music, sound effects serving the clip; "no sound" is a weakness unless the clip clearly works silent), ending (payoff, punchline, loop back to the start), shareability (would someone send it to a friend or comment?). score 0-10, note one or two sentences.
- moments: 2 to 6 markers in time order, kind "strong" for what works, "risk" for where viewers are likely to scroll away; note one short sentence.
- fixes: 1 to 3 fixes, most impactful first; title a few words, detail one or two sentences.
- keep: the part to keep when trimming the start or the end would clearly help (start and end in seconds, within the clip, at least 2 s long, with a one-sentence reason); null when the clip should stay whole.
- caption: a short post caption that fits the clip, in the creator's language, no hashtags inside.
- hashtags: 3 to 5 relevant hashtags, each starting with #, no generic tags like #fyp or #viral.`;

// Analyse un clip déjà mesuré (URL signée). Renvoie le rapport et les
// mesures ; lève une erreur si quoi que ce soit échoue (crédits rendus par
// l'appelant).
export async function analyzeClip(input: { url: string; locale: Locale }): Promise<{
  report: ViralityReport;
  facts: ViralityFacts;
}> {
  const dir = await mkdtemp(path.join(tmpdir(), "twinpost-viral-"));
  try {
    // Le clip est téléchargé une fois : ffmpeg le relit plusieurs fois.
    const res = await fetch(input.url);
    if (!res.ok) throw new Error(`téléchargement du clip : ${res.status}`);
    const file = path.join(dir, "clip");
    await writeFile(file, new Uint8Array(await res.arrayBuffer()));

    const probe = await probeVideo(file);
    if (!probe) throw new Error("clip illisible");
    const { seconds, aspectRatio } = probe;
    const [frames, cuts, sound] = await Promise.all([
      extractFrames(file, dir, seconds),
      detectCuts(file, 0, seconds).catch(() => [] as number[]),
      listenTo(file, dir),
    ]);
    if (frames.length === 0) throw new Error("aucune image tirée du clip");

    const facts: ViralityFacts = {
      seconds: Math.round(seconds * 10) / 10,
      aspectRatio,
      cuts: cuts.map((c) => Math.round(c * 10) / 10),
      hasAudio: sound.hasAudio,
      speech: sound.segments.length > 0,
    };
    const measurements = [
      `Duration: ${facts.seconds} s. Format: ${aspectRatio}${aspectRatio === "9:16" ? " (vertical)" : " (not vertical: it will be letterboxed or cropped on TikTok and Reels)"}.`,
      facts.cuts.length
        ? `Cuts at: ${facts.cuts.join(", ")} s (${facts.cuts.length + 1} shots).`
        : "No cut: a single continuous shot.",
      sound.hasAudio ? "Sound: yes." : "Sound: none (silent clip).",
      sound.segments.length
        ? `Speech transcript:\n${sound.segments.map((s) => `[${s.at} s] ${s.text}`).join("\n")}`
        : sound.hasAudio
          ? "Speech: none detected (music or ambient sound only)."
          : "",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await new Anthropic().beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: measurements },
            ...frames.flatMap((f) => [
              { type: "text" as const, text: `${f.at} s` },
              {
                type: "image" as const,
                source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.data },
              },
            ]),
            {
              type: "text",
              text: `Write every text field (verdict, notes, fixes, reason, caption) in ${LANGUAGE[input.locale]}, addressing the creator informally (tu in French and Spanish).`,
            },
          ],
        },
      ],
    });
    console.info("virality: usage", JSON.stringify(response.usage));
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`rapport vide (${response.stop_reason})`);
    return { report: tidy(parsed, seconds), facts };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Bornes que le schéma ne peut pas imposer : notes, temps dans le clip,
// un critère par clé, dans l'ordre.
function tidy(r: z.infer<typeof ReportSchema>, seconds: number): ViralityReport {
  const clampTime = (t: number) => Math.round(Math.min(Math.max(t, 0), seconds) * 10) / 10;
  const clamp = (n: number, max: number) => Math.round(Math.min(Math.max(n, 0), max));
  const criteria = VIRALITY_CRITERIA.flatMap((key) => {
    const c = r.criteria.find((x) => x.key === key);
    return c ? [{ key, score: clamp(c.score, 10), note: c.note }] : [];
  });
  const keep =
    r.keep && r.keep.end - r.keep.start >= 2 && (r.keep.start > 0.2 || r.keep.end < seconds - 0.2)
      ? { start: clampTime(r.keep.start), end: clampTime(r.keep.end), reason: r.keep.reason }
      : null;
  return {
    score: clamp(r.score, 100),
    verdict: r.verdict,
    hookAt: clampTime(r.hookAt),
    criteria,
    moments: r.moments
      .map((m) => ({ ...m, at: clampTime(m.at) }))
      .sort((a, b) => a.at - b.at)
      .slice(0, 6),
    fixes: r.fixes.slice(0, 3),
    keep,
    caption: r.caption,
    hashtags: r.hashtags
      .map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, ""))
      .slice(0, 5),
  };
}
