import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { createFalSwap, createFalSwapKeyframe, getFalPrediction } from "@/lib/fal";
import {
  FORMATS,
  GENERATIONS_BUCKET,
  SWAP_INPUTS_BUCKET,
  type AspectRatio,
  type SwapEngine,
} from "@/lib/generation";
import { createGenjutsuSwap, getHiggsfieldPrediction } from "@/lib/higgsfield";
import {
  CONTENT_REFUSED_ERROR,
  OUT_OF_CREDIT_ERROR,
  copyOutputToStorage,
  errorMessage,
  isOutOfCredit,
  isTerminal,
  outputUrlOf,
  type PredictionState,
} from "@/lib/predictions";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkSwapShot } from "@/lib/swap-check";

// Remplacement de personnage dans un vrai clip (Kling O3 Pro Edit, voir
// createFalSwap). Kling ne respecte pas les coupes d'un clip monté : il
// invente une suite au premier plan. Le passage choisi est donc découpé à
// chaque changement de plan et chaque plan est remplacé à part. Un plan de
// moins de 3 s (minimum de Kling) est complété par un aller-retour de ses
// propres images, recoupé au montage. Les plans sont remontés dans l'ordre,
// sur le son d'origine du passage.
//
// Chaque plan passe par trois étapes (voir advanceSwap) :
// 1. image clé : sa première image, personne remplacée par le personnage ;
//    celle du premier plan sert de modèle à toutes les autres ;
// 2. vidéo : Kling part de l'image clé et suit les gestes du plan ;
// 3. contrôle : Claude vérifie le plan rendu, refait une fois s'il est raté.
//
// Moteur genjutsu (Higgsfield, voir createGenjutsuSwap) : il suit les coupes
// tout seul. Le passage entier est un seul plan, rendu en une fois à partir
// de la fiche personnage, sans image clé ni contrôle : un rendu raté n'est
// pas facturé par Higgsfield et se retente, un rendu réussi coûte trop cher
// pour être refait d'office.

const execFileAsync = promisify(execFile);

// Contraintes de Kling Edit sur la vidéo reçue.
export const SWAP_PART_MIN_SECONDS = 3;
const PART_MAX_SECONDS = 10;
// Durée envoyée à Kling pour un plan trop court (aller-retour).
const PART_SEND_MIN_SECONDS = 3.2;
// Changement de plan : pic du score de scène de ffmpeg, au-dessus d'un
// plancher et nettement au-dessus du mouvement autour (un fond uni donne des
// coupes à ~0,2 seulement, une caméra rapide un bruit de fond élevé).
const CUT_MIN_SCORE = 0.1;
const CUT_PEAK_RATIO = 3;
const CUT_WINDOW_SECONDS = 0.5;
const FORMAT_FILTER =
  "scale='if(lt(iw,ih),max(720,min(iw,1080)),-2)':'if(lt(iw,ih),-2,max(720,min(ih,1080)))',setsar=1,fps=30,format=yuv420p";
// Genjutsu rend en 720p au plus, à 24 images/s : inutile de lui envoyer plus.
const GENJUTSU_FORMAT_FILTER =
  "scale='if(lt(iw,ih),trunc(min(iw,720)/2)*2,-2)':'if(lt(iw,ih),-2,trunc(min(ih,720)/2)*2)',setsar=1,fps=30,format=yuv420p";
const OUTPUT_FPS: Record<SwapEngine, number> = { kling: 30, genjutsu: 24 };

// Tentatives par plan (image clé comme vidéo) : un nouvel essai en cas
// d'échec ou de contrôle refusé.
const MAX_ATTEMPTS = 2;
// Contrôles par passage d'advanceSwap : chacun appelle Claude (~5-10 s).
const CHECKS_PER_CALL = 2;
const CHECK_FRAMES = 4;
// Verrou d'advanceSwap, au-delà duquel un appel bloqué est ignoré.
const LOCK_SECONDS = 150;
// Suivis en erreur d'affilée (404, clé révoquée…) avant d'abandonner un plan,
// soit environ 2 min. La requête n'est jamais relancée : elle serait payée
// deux fois.
const MAX_STATUS_ERRORS = 24;
// Compte Higgsfield saturé : essais espacés, abandon au bout de 10 min.
const GENJUTSU_RETRY_MS = 30_000;
const GENJUTSU_WAIT_MAX_MS = 10 * 60_000;
// Un rendu Genjutsu de 30 s prend une vingtaine de minutes, file d'attente
// en plus. Au-delà, le remplacement est abandonné et remboursé.
const GENJUTSU_DEADLINE_MS = 90 * 60_000;

// Plan du passage : début relatif au passage et durée, puis son avancement.
// Les fichiers envoyés à fal (vidéo du plan, première image) sont chez fal :
// Kling ne lit pas les URLs signées de Supabase.
export type SwapPart = {
  start: number;
  seconds: number;
  videoUrl?: string;
  firstFrameUrl?: string;
  width?: number;
  height?: number;
  stage?: "keyframe" | "video" | "check" | "done";
  keyframeRequest?: string;
  keyframeUrl?: string;
  keyframeAttempts?: number;
  predictionId?: string;
  attempts?: number;
  statusErrors?: number;
  // Genjutsu : compte Higgsfield saturé, en attente d'une place.
  waitingSince?: number;
  retryAt?: number;
  clipPath?: string;
  // Raison du dernier contrôle refusé.
  check?: string;
  // Plan refait à la demande (voir redoSwapShot) : l'ancien plan est gardé
  // si le nouveau rate, et son prix rendu.
  redo?: { previousClipPath: string; credits: number };
};

export type SwapMetadata = {
  // Absent : remplacement lancé avant le choix du moteur (kling).
  engine?: SwapEngine;
  swap_parts?: SwapPart[];
  source_video_path?: string;
  source_start?: number;
  target?: string;
  // Fiche personnage (voir createFalCharacterSheet).
  sheet?: { frontUrl: string; sideUrl?: string };
  // Images de la fiche déposées chez Higgsfield (moteur genjutsu).
  character_urls?: string[];
  // Image clé du premier plan, modèle des suivantes.
  anchor_url?: string;
  rev?: number;
  busy_until?: string | null;
};

// Durée et format d'un clip, lus par ffmpeg sur son URL signée : le débit des
// crédits se fonde sur cette mesure, pas sur celle annoncée par le navigateur.
export async function probeVideo(url: string) {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  // Sans fichier de sortie, ffmpeg décrit l'entrée puis sort en erreur : la
  // description est dans stderr dans les deux cas.
  const stderr = await execFileAsync(ffmpegPath, ["-hide_banner", "-i", url], {
    timeout: 30_000,
  }).then(
    (r) => r.stderr,
    (e: { stderr?: string }) => e.stderr ?? "",
  );

  const duration = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const size = stderr.match(/Stream #.*Video:.*?, (\d{2,5})x(\d{2,5})[ ,[]/);
  if (!duration || !size) return null;

  const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  let width = Number(size[1]);
  let height = Number(size[2]);
  // Vidéos de téléphone : l'image est stockée couchée, avec une rotation.
  if (/rotation of -?90|rotate\s*:\s*-?(90|270)/.test(stderr)) {
    [width, height] = [height, width];
  }
  return { seconds, aspectRatio: nearestFormat(width / height) };
}

function nearestFormat(ratio: number): AspectRatio {
  const value = (f: AspectRatio) => {
    const [w, h] = f.split(":").map(Number);
    return w / h;
  };
  return FORMATS.map((f) => f.value).reduce((best, f) =>
    Math.abs(Math.log(value(f) / ratio)) < Math.abs(Math.log(value(best) / ratio)) ? f : best,
  );
}

// Découpe le passage [start, start + seconds] plan par plan. Un plan de plus
// de 10 s est coupé en parts égales.
export async function splitIntoParts(url: string, start: number, seconds: number) {
  const { stderr } = await execFileAsync(
    ffmpegPath!,
    [
      "-hide_banner",
      "-ss", start.toFixed(3),
      "-t", seconds.toFixed(3),
      "-i", url,
      "-an",
      "-vf", "scale=320:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score",
      "-f", "null",
      "-",
    ],
    { timeout: 90_000, maxBuffer: 32 * 1024 * 1024 },
  );
  const scores: { time: number; score: number }[] = [];
  let time = 0;
  for (const line of stderr.split("\n")) {
    const t = line.match(/pts_time:([\d.]+)/);
    if (t) time = Number(t[1]);
    const score = line.match(/lavfi\.scene_score=([\d.]+)/);
    if (score) scores.push({ time, score: Number(score[1]) });
  }
  const cuts = scores
    .filter(({ time: t, score }) => {
      if (score < CUT_MIN_SCORE || t < 0.3 || t > seconds - 0.3) return false;
      const around = scores.filter((o) => o.time !== t && Math.abs(o.time - t) <= CUT_WINDOW_SECONDS);
      const mean = around.reduce((sum, o) => sum + o.score, 0) / Math.max(1, around.length);
      return score >= CUT_PEAK_RATIO * mean && around.every((o) => o.score <= score);
    })
    .map((c) => c.time);

  const bounds = [0, ...cuts, seconds];
  return bounds.slice(1).flatMap((end, i): SwapPart[] => {
    const length = end - bounds[i];
    const count = Math.ceil(length / PART_MAX_SECONDS);
    return Array.from({ length: count }, (_, k) => ({
      start: bounds[i] + (k * length) / count,
      seconds: length / count,
    }));
  });
}

// Un plan du passage, réencodé aux contraintes du moteur. Kling : petit côté
// entre 720 et 1080 px, 30 images/s ; sous 3 s, le plan est prolongé par un
// aller-retour de ses propres images (sans coupe, contrairement au plan
// voisin). Genjutsu : le passage entier, petit côté de 720 px au plus.
export async function preparePart(
  url: string,
  start: number,
  seconds: number,
  engine: SwapEngine = "kling",
) {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  const dir = await mkdtemp(path.join(tmpdir(), "twinpost-swap-"));
  const format = engine === "genjutsu" ? GENJUTSU_FORMAT_FILTER : FORMAT_FILTER;
  const pad = engine === "kling" && seconds < PART_SEND_MIN_SECONDS;
  const pingPong =
    `[0:v]${format},split[f][b];[b]reverse[r];[f][r]concat=n=2:v=1:a=0,` +
    `loop=loop=-1:size=32767,trim=duration=${PART_SEND_MIN_SECONDS},setpts=PTS-STARTPTS[v]`;
  try {
    const output = path.join(dir, "part.mp4");
    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-ss", start.toFixed(3),
        "-t", seconds.toFixed(3),
        "-i", url,
        ...(pad
          ? [
              "-filter_complex", pingPong,
              "-map", "[v]",
              "-map", "0:a?",
              "-af", "apad",
              "-t", String(PART_SEND_MIN_SECONDS),
            ]
          : ["-vf", format]),
        // Genjutsu se paie à la seconde entamée : la coupe se fait à l'image
        // près, pour ne jamais déborder sur la seconde suivante.
        ...(engine === "genjutsu"
          ? ["-frames:v", String(Math.floor(seconds * 30 + 1e-6)), "-shortest"]
          : []),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-c:a", "aac",
        "-movflags", "+faststart",
        output,
      ],
      { timeout: 180_000 },
    );
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Première image d'un plan préparé (PNG) et sa taille, pour son image clé.
export async function firstFrame(part: Buffer) {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  const dir = await mkdtemp(path.join(tmpdir(), "twinpost-swap-"));
  try {
    const input = path.join(dir, "part.mp4");
    const output = path.join(dir, "first.png");
    await writeFile(input, part);
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ["-hide_banner", "-i", input, "-frames:v", "1", output],
      { timeout: 60_000 },
    );
    const size = stderr.match(/Stream #.*Video:.*?, (\d{2,5})x(\d{2,5})[ ,[]/);
    return {
      png: await readFile(output),
      width: size ? Number(size[1]) : 1080,
      height: size ? Number(size[2]) : 1920,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Images JPEG (base64) réparties sur un plan rendu, pour son contrôle.
async function checkFrames(clipPath: string) {
  const { data, error } = await createAdminClient().storage.from(GENERATIONS_BUCKET).download(clipPath);
  if (error) throw error;
  const dir = await mkdtemp(path.join(tmpdir(), "twinpost-swap-"));
  try {
    const input = path.join(dir, "clip.mp4");
    await writeFile(input, Buffer.from(await data.arrayBuffer()));
    const info = await execFileAsync(ffmpegPath!, ["-hide_banner", "-i", input]).then(
      (r) => r.stderr,
      (e: { stderr?: string }) => e.stderr ?? "",
    );
    const duration = info.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
    const seconds = duration ? Number(duration[3]) + Number(duration[2]) * 60 : 5;
    await execFileAsync(
      ffmpegPath!,
      [
        "-hide_banner",
        "-loglevel", "error",
        "-i", input,
        "-vf", `fps=${CHECK_FRAMES}/${Math.max(seconds, 1).toFixed(3)},scale=512:-2`,
        "-frames:v", String(CHECK_FRAMES),
        "-q:v", "4",
        path.join(dir, "f%02d.jpg"),
      ],
      { timeout: 60_000 },
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
    return Promise.all(files.map(async (f) => (await readFile(path.join(dir, f))).toString("base64")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Fait avancer un remplacement, plan par plan, puis le remonte. Appelé à
// chaque suivi (getGeneration). Un verrou dans les métadonnées garantit
// qu'un seul appel à la fois lance des requêtes pour cette génération.
export async function advanceSwap(generationId: string) {
  const admin = createAdminClient();
  const { data: generation } = await admin
    .from("generations")
    .select("id, user_id, stage, status, metadata, created_at")
    .eq("id", generationId)
    .eq("kind", "swap")
    .eq("status", "processing")
    .maybeSingle();
  if (!generation || generation.stage !== "image") return;

  const current = (generation.metadata ?? {}) as SwapMetadata;
  if (!current.swap_parts?.length) return;
  if (current.busy_until && Date.parse(current.busy_until) > Date.now()) return;
  const rev = current.rev ?? 0;
  const metadata: SwapMetadata = {
    ...current,
    rev: rev + 1,
    busy_until: new Date(Date.now() + LOCK_SECONDS * 1000).toISOString(),
  };
  const { data: claimed } = await admin
    .from("generations")
    .update({ metadata })
    .eq("id", generation.id)
    .eq("status", "processing")
    .eq("metadata->>rev", String(rev))
    .select("id");
  if (!claimed?.length) return;

  // Avancement enregistré sans attendre la fin du passage (même verrou).
  // Faux si l'écriture n'a pas eu lieu (verrou perdu, base injoignable).
  const persist = async (patch: Partial<SwapMetadata> = {}) => {
    for (let i = 0; i < 3; i++) {
      const { data, error } = await admin
        .from("generations")
        .update({ metadata: { ...metadata, ...patch } })
        .eq("id", generation.id)
        .eq("metadata->>rev", String(rev + 1))
        .select("id");
      if (!error) return Boolean(data?.length);
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
    return false;
  };

  let outcome: "continue" | "failed" | "assemble" = "continue";
  try {
    outcome = await advanceParts(generation, metadata, persist);
  } catch (e) {
    console.error("advanceSwap", errorMessage(e));
  }

  // Rendu Genjutsu jamais revenu (suivi ou copie en panne durable) : abandon,
  // crédits rendus. Après advanceParts, pour qu'un rendu fini soit encore
  // récupéré par qui revient tard.
  if (
    outcome === "continue" &&
    metadata.engine === "genjutsu" &&
    Date.now() - Date.parse(generation.created_at) > GENJUTSU_DEADLINE_MS
  ) {
    outcome = "failed";
  }

  // Libère le verrou et enregistre l'avancement.
  await persist({ busy_until: null });

  if (outcome === "failed") {
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
    return;
  }
  if (outcome === "assemble") await assembleSwap(generation, metadata);
}

async function advanceParts(
  generation: { id: string; user_id: string },
  metadata: SwapMetadata,
  persist: () => Promise<boolean>,
): Promise<"continue" | "failed" | "assemble"> {
  const parts = metadata.swap_parts!;
  const sheet = metadata.sheet!;
  const target = metadata.target;
  const genjutsu = metadata.engine === "genjutsu";
  let checks = 0;

  for (const [i, part] of parts.entries()) {
    const stage = part.stage ?? "keyframe";

    if (stage === "keyframe") {
      // Les images clés suivantes attendent celle du premier plan.
      if (i > 0 && !metadata.anchor_url) continue;
      if (!part.keyframeRequest) {
        part.keyframeRequest = await createFalSwapKeyframe({
          firstFrameUrl: part.firstFrameUrl!,
          width: part.width ?? 1080,
          height: part.height ?? 1920,
          frontUrl: sheet.frontUrl,
          sideUrl: sheet.sideUrl,
          anchorUrl: i > 0 || part.redo ? metadata.anchor_url : undefined,
          target,
        });
        part.keyframeAttempts = (part.keyframeAttempts ?? 0) + 1;
        continue;
      }
      const prediction = await getFalPrediction(part.keyframeRequest);
      if (!isTerminal(prediction.status)) continue;
      const url = outputUrlOf(prediction);
      if (prediction.status !== "succeeded" || !url) {
        if (part.redo && (prediction.refused || (part.keyframeAttempts ?? 1) >= MAX_ATTEMPTS)) {
          await abandonRedo(generation.id, part);
          continue;
        }
        if (prediction.refused) return refuse(generation.id);
        if ((part.keyframeAttempts ?? 1) >= MAX_ATTEMPTS) return "failed";
        part.keyframeRequest = undefined;
        continue;
      }
      part.keyframeUrl = url;
      if (i === 0 && !part.redo) metadata.anchor_url = url;
      part.stage = "video";
    }

    if (part.stage === "video") {
      if (!part.predictionId) {
        if (genjutsu) {
          if (part.retryAt && Date.now() < part.retryAt) continue;
          if ((part.attempts ?? 0) >= MAX_ATTEMPTS) return "failed";
          // L'essai est compté et enregistré avant l'envoi : si l'appel meurt
          // pendant l'envoi, le suivi suivant ne repart pas de zéro. Sans
          // cette écriture (verrou perdu), rien n'est envoyé.
          part.attempts = (part.attempts ?? 0) + 1;
          if (!(await persist())) {
            part.attempts -= 1;
            continue;
          }
          try {
            part.predictionId = await createGenjutsuSwap({
              videoUrl: part.videoUrl!,
              imageUrls: metadata.character_urls ?? [sheet.frontUrl],
              target,
            });
          } catch (e) {
            console.error("createGenjutsuSwap", errorMessage(e));
            if (higgsfieldBusy(e)) {
              // Rien n'a été créé ni facturé : on attend une place.
              part.attempts -= 1;
              part.waitingSince ??= Date.now();
              if (Date.now() - part.waitingSince > GENJUTSU_WAIT_MAX_MS) return "failed";
              part.retryAt = Date.now() + GENJUTSU_RETRY_MS;
              continue;
            }
            // Solde Higgsfield épuisé (403 dès la création) : inutile de retenter.
            if (isOutOfCredit(e)) return fail(generation.id, OUT_OF_CREDIT_ERROR);
            // Seul un refus net (4xx) se retente : après une coupure, un délai
            // dépassé ou un 5xx, la requête a pu être acceptée, et un second
            // envoi serait payé deux fois.
            const status = (e as { status?: unknown } | null)?.status;
            const rejected = typeof status === "number" && status >= 400 && status < 500;
            if (!rejected || part.attempts >= MAX_ATTEMPTS) return "failed";
            continue;
          }
          part.retryAt = undefined;
          // Enregistré tout de suite : une requête perdue serait relancée,
          // donc payée deux fois.
          await persist();
          continue;
        }
        part.predictionId = await createFalSwap({
          videoUrl: part.videoUrl!,
          frontUrl: sheet.frontUrl,
          sideUrl: sheet.sideUrl,
          keyframeUrl: part.keyframeUrl!,
          anchorUrl: i > 0 || part.redo ? metadata.anchor_url : undefined,
          target,
        });
        part.attempts = (part.attempts ?? 0) + 1;
        continue;
      }
      let prediction: PredictionState;
      try {
        prediction = part.predictionId.startsWith("hf:")
          ? await getHiggsfieldPrediction(part.predictionId)
          : await getFalPrediction(part.predictionId);
        part.statusErrors = 0;
      } catch (e) {
        console.error("swap: suivi", errorMessage(e));
        part.statusErrors = (part.statusErrors ?? 0) + 1;
        if (part.statusErrors < MAX_STATUS_ERRORS) continue;
        if (part.redo) {
          await abandonRedo(generation.id, part);
          continue;
        }
        return "failed";
      }
      if (!isTerminal(prediction.status)) continue;
      const url = outputUrlOf(prediction);
      if (prediction.status !== "succeeded" || !url) {
        if (prediction.outOfCredit) return fail(generation.id, OUT_OF_CREDIT_ERROR);
        if (part.redo && (prediction.refused || (part.attempts ?? 1) >= MAX_ATTEMPTS)) {
          await abandonRedo(generation.id, part);
          continue;
        }
        if (prediction.refused) return refuse(generation.id);
        if ((part.attempts ?? 1) >= MAX_ATTEMPTS) return "failed";
        part.predictionId = undefined;
        continue;
      }
      part.clipPath = await copyOutputToStorage(
        url,
        `${generation.user_id}/${generation.id}/part-${String(i).padStart(2, "0")}-${part.attempts ?? 1}`,
      );
      part.stage = genjutsu ? "done" : "check";
    }

    if (part.stage === "check") {
      if (checks >= CHECKS_PER_CALL) continue;
      checks++;
      const result = await checkFrames(part.clipPath!)
        .then((frames) => checkSwapShot({ frames, characterUrl: sheet.frontUrl, target }))
        .catch((e) => {
          console.error("checkSwapShot", errorMessage(e));
          return null;
        });
      const ok = !result || (result.replaced && result.sameCharacter);
      if (!ok && (part.attempts ?? 1) < MAX_ATTEMPTS) {
        // Nouvel essai de la vidéo, à partir de la même image clé.
        part.check = result?.reason;
        part.predictionId = undefined;
        part.stage = "video";
        continue;
      }
      if (!ok) part.check = result?.reason;
      else part.check = undefined;
      part.stage = "done";
      part.redo = undefined;
    }
  }

  return parts.every((p) => p.stage === "done" && p.clipPath) ? "assemble" : "continue";
}

// Plan refait qui a raté : l'ancien plan reprend sa place, son prix est rendu.
async function abandonRedo(generationId: string, part: SwapPart) {
  const redo = part.redo!;
  await createAdminClient().rpc("refund_swap_redo", {
    p_generation_id: generationId,
    p_credits: redo.credits,
  });
  part.clipPath = redo.previousClipPath;
  part.stage = "done";
  part.redo = undefined;
}

// Refus du filtre de contenu : message clair, crédits rendus.
function refuse(generationId: string) {
  return fail(generationId, CONTENT_REFUSED_ERROR);
}

// Requête Genjutsu ni créée ni facturée : trop de requêtes en cours sur le
// compte (400), modèle verrouillé (423) ou pas encore prêt (503).
function higgsfieldBusy(e: unknown) {
  const status = (e as { status?: unknown } | null)?.status;
  return status === 423 || status === 503 || (status === 400 && /concurren/i.test(errorMessage(e)));
}

async function fail(generationId: string, error: string): Promise<"failed"> {
  await createAdminClient().from("generations").update({ error }).eq("id", generationId);
  return "failed";
}

async function assembleSwap(generation: { id: string; user_id: string }, metadata: SwapMetadata) {
  const admin = createAdminClient();
  // Verrou : un seul appelant fait le montage.
  const { data: claimed } = await admin
    .from("generations")
    .update({ stage: "assembling" })
    .eq("id", generation.id)
    .eq("stage", "image")
    .select("id");
  if (!claimed?.length) return;

  try {
    // Son d'origine du passage, continu d'un plan à l'autre.
    const { data: source } = metadata.source_video_path
      ? await admin.storage
          .from(SWAP_INPUTS_BUCKET)
          .createSignedUrl(metadata.source_video_path, 60 * 60)
      : { data: null };
    const storagePath = await concatenateParts({
      userId: generation.user_id,
      generationId: generation.id,
      fps: OUTPUT_FPS[metadata.engine ?? "kling"],
      parts: metadata.swap_parts!,
      sourceUrl: source?.signedUrl,
      sourceStart: metadata.source_start ?? 0,
    });
    await admin
      .from("generations")
      .update({ status: "completed", storage_path: storagePath })
      .eq("id", generation.id);
  } catch (e) {
    console.error("advanceSwap: montage", errorMessage(e));
    // Genjutsu : le rendu, déjà payé, est livré tel quel plutôt que perdu.
    const [part] = metadata.swap_parts ?? [];
    if (metadata.engine === "genjutsu" && part?.clipPath) {
      await admin
        .from("generations")
        .update({ status: "completed", storage_path: part.clipPath })
        .eq("id", generation.id)
        .eq("status", "processing");
      return;
    }
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
  }
}

// Remonte les plans rendus à la taille du premier, chacun recoupé à sa durée
// d'origine, sur le son d'origine du passage (muet si le clip source n'a pas
// de son ou est introuvable).
async function concatenateParts(input: {
  userId: string;
  generationId: string;
  fps: number;
  parts: SwapPart[];
  sourceUrl?: string;
  sourceStart: number;
}) {
  if (!ffmpegPath) throw new Error("ffmpeg indisponible sur cette plateforme");
  const bucket = createAdminClient().storage.from(GENERATIONS_BUCKET);
  const dir = await mkdtemp(path.join(tmpdir(), "twinpost-swap-"));
  try {
    const files = await Promise.all(
      input.parts.map(async (part, i) => {
        const { data, error } = await bucket.download(part.clipPath!);
        if (error) throw error;
        const file = path.join(dir, `${String(i).padStart(2, "0")}.mp4`);
        await writeFile(file, Buffer.from(await data.arrayBuffer()));
        return file;
      }),
    );
    const firstInfo = await execFileAsync(ffmpegPath, ["-hide_banner", "-i", files[0]]).then(
      (r) => r.stderr,
      (e: { stderr?: string }) => e.stderr ?? "",
    );
    const size = firstInfo.match(/Stream #.*Video:.*?, (\d{2,5})x(\d{2,5})[ ,[]/);
    const [width, height] = size ? [Number(size[1]), Number(size[2])] : [1080, 1920];
    const total = input.parts.reduce((sum, p) => sum + p.seconds, 0);

    const filter =
      files
        .map(
          (_, i) =>
            `[${i}:v]trim=duration=${input.parts[i].seconds.toFixed(3)},setpts=PTS-STARTPTS,` +
            `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${input.fps}[v${i}];`,
        )
        .join("") +
      files.map((_, i) => `[v${i}]`).join("") +
      `concat=n=${files.length}:v=1:a=0[outv]`;
    const source = input.sourceUrl
      ? ["-ss", input.sourceStart.toFixed(3), "-t", total.toFixed(3), "-i", input.sourceUrl]
      : [];

    const output = path.join(dir, "output.mp4");
    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel", "error",
        ...files.flatMap((f) => ["-i", f]),
        ...source,
        "-filter_complex", filter,
        "-map", "[outv]",
        ...(input.sourceUrl ? ["-map", `${files.length}:a?`, "-c:a", "aac", "-shortest"] : []),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output,
      ],
      { timeout: 240_000 },
    );

    const storagePath = `${input.userId}/${input.generationId}.mp4`;
    const { error } = await bucket.upload(storagePath, await readFile(output), {
      contentType: "video/mp4",
      upsert: true,
    });
    if (error) throw error;
    return storagePath;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
