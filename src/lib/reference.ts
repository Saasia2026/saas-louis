import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import ffmpegPath from "ffmpeg-static";
import { z } from "zod";
import { PACES } from "@/lib/generation";

// Vidéo de référence : le créateur montre une vidéo dont il aime la direction
// artistique (caméra, vitesse des mouvements, montage, lumière, couleurs).
// ffmpeg en mesure le rythme de montage et en extrait des images, Claude en
// tire une direction écrite pour que le Director écrive les plans dans ce
// style (voir directorTurn). Surtout, le début de la vidéo est préparé pour
// Kling O1 (préréglage Référence) : chaque plan reçoit la vraie vidéo, et
// pas seulement sa description.

// Au-delà, seul le début est analysé.
const ANALYZED_SECONDS = 60;
const FRAMES = 12;
// Clip envoyé à Kling O1 : 3 à 10 s, 720 à 2160 px, 24 à 60 images/s.
export const REFERENCE_MIN_SECONDS = 3;
const CLIP_MAX_SECONDS = 10;
// Seuil de détection d'une coupe (changement de plan) par ffmpeg.
const SCENE_THRESHOLD = 0.3;

const execFileAsync = promisify(execFile);

const StyleSchema = z.object({
  summary: z.string(),
  direction: z.string(),
  pace: z.enum(PACES.map((p) => p.id) as [string, ...string[]]),
});

export type StyleReference = {
  // Pour le créateur, dans sa langue.
  summary: string;
  // Pour le Director, en anglais.
  direction: string;
  pace: (typeof PACES)[number]["id"];
};

// Analyse la vidéo et prépare le clip que Kling O1 recevra à chaque plan.
// null : vidéo illisible ou refusée par Claude ; "too_short" : sous 3 s.
export async function analyzeReferenceVideo(input: {
  videoUrl: string;
  language: string;
}): Promise<(StyleReference & { clip: Buffer }) | "too_short" | null> {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  const dir = await mkdtemp(path.join(tmpdir(), "twinpost-ref-"));
  try {
    const { seconds, cuts } = await measureCuts(input.videoUrl);
    if (!seconds) return null;
    if (seconds < REFERENCE_MIN_SECONDS) return "too_short";
    const clip = await prepareClip(input.videoUrl, Math.min(seconds, CLIP_MAX_SECONDS), dir);
    const frames = await extractFrames(input.videoUrl, Math.min(seconds, ANALYZED_SECONDS), dir);
    if (!frames.length) return null;

    const analyzed = Math.min(seconds, ANALYZED_SECONDS);
    const shots = cuts + 1;
    const rhythm = `The reference video lasts ${seconds.toFixed(1)} s. In the first ${analyzed.toFixed(1)} s, ffmpeg detected ${cuts} cuts, so about ${shots} shots of ${(analyzed / shots).toFixed(1)} s on average.`;

    const response = await new Anthropic().beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: betaZodOutputFormat(StyleSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `You analyse a reference video for TwinPost, an app that generates social media videos shot by shot with video models. The creator wants new videos, on any subject or story, made in the same art direction as this reference. You receive ${frames.length} frames taken at regular intervals, in order, and measurements of its editing rhythm.

Describe the style, never the content: ignore who or what is shown, the brands, the place and the story, so the direction can be applied to a completely different subject.

- "direction": in English, a precise art direction a storyboard writer will apply to every shot, in 6 to 10 short sentences: camera (handheld, gimbal, tripod, drone, phone selfie; its moves and how fast they are), speed and energy of movements in frame, framing and angles, shot length and editing rhythm (use the measurements), lighting, colour palette and grading, texture (grain, sharpness, motion blur, broadcast overlay look…), overall mood. Concrete and visual, no vague adjectives.
- "summary": one sentence in ${input.language} for the creator, saying what style was captured (e.g. "Caméra à l'épaule nerveuse, coupes toutes les 1-2 s, lumière néon froide").
- "pace": "fast" when the reference cuts every 3 s or less on average, otherwise "normal".`,
      messages: [
        {
          role: "user",
          content: [
            ...frames.map((data) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
            })),
            { type: "text" as const, text: rhythm },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.error("analyzeReferenceVideo: pas de réponse", response.stop_reason);
      return null;
    }
    const { summary, direction, pace } = response.parsed_output;
    return { summary, direction, pace: pace as StyleReference["pace"], clip };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Début de la vidéo réencodé aux contraintes de Kling O1 : petit côté entre
// 720 et 1080 px, 30 images/s, sans son.
async function prepareClip(url: string, seconds: number, dir: string) {
  const output = path.join(dir, "clip.mp4");
  await execFileAsync(
    ffmpegPath!,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-t", seconds.toFixed(3),
      "-i", url,
      "-an",
      "-vf",
      "scale='if(lt(iw,ih),max(720,min(iw,1080)),-2)':'if(lt(iw,ih),-2,max(720,min(ih,1080)))',fps=30,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-movflags", "+faststart",
      output,
    ],
    { timeout: 120_000 },
  );
  return readFile(output);
}

// Durée totale et nombre de coupes détectées dans le début de la vidéo.
async function measureCuts(url: string) {
  const { stderr } = await execFileAsync(
    ffmpegPath!,
    [
      "-hide_banner",
      "-t", String(ANALYZED_SECONDS),
      "-i", url,
      "-an",
      "-vf", `scale=320:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      "-f", "null",
      "-",
    ],
    { timeout: 90_000, maxBuffer: 16 * 1024 * 1024 },
  );
  const duration = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const seconds = duration
    ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
    : 0;
  const cuts = stderr.match(/\] n:\s*\d+ pts:/g)?.length ?? 0;
  return { seconds, cuts };
}

// Images JPEG (base64) réparties sur la durée analysée.
async function extractFrames(url: string, seconds: number, dir: string) {
  await execFileAsync(
    ffmpegPath!,
    [
      "-hide_banner",
      "-loglevel", "error",
      "-t", String(seconds),
      "-i", url,
      "-vf", `fps=${FRAMES}/${seconds.toFixed(3)},scale=640:-2`,
      "-frames:v", String(FRAMES),
      "-q:v", "4",
      path.join(dir, "f%02d.jpg"),
    ],
    { timeout: 90_000 },
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
  return Promise.all(files.map(async (f) => (await readFile(path.join(dir, f))).toString("base64")));
}
