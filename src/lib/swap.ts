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
  GENJUTSU_BLOCK_MAX_SECONDS,
  GENJUTSU_BLOCK_SECONDS,
  GENJUTSU_BLOCK_WHOLE_SECONDS,
  GENJUTSU_MIN_SECONDS,
  KLING_MIN_PART_SECONDS,
  genjutsuFrames,
  swapShotCredits,
  SWAP_INPUTS_BUCKET,
  type AspectRatio,
  type SwapEngine,
} from "@/lib/generation";
import { createGenjutsuSwap, getHiggsfieldPrediction } from "@/lib/higgsfield";
import {
  CONTENT_REFUSED_ERROR,
  GENJUTSU_UNAVAILABLE_ERROR,
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
// tout seul. Le passage est découpé en séquences de quelques secondes (voir
// groupIntoBlocks), rendues toutes en même temps à partir de la fiche
// personnage, sans image clé. Un rendu raté n'est pas facturé par Higgsfield
// et se retente ; un rendu réussi coûte trop cher pour être refait d'office :
// le contrôle le signale, et le créateur peut refaire la séquence seule.

const execFileAsync = promisify(execFile);

// Contraintes de Kling Edit sur la vidéo reçue.
export const SWAP_PART_MIN_SECONDS = 3;
const PART_MAX_SECONDS = 10;
// Durée envoyée à Kling pour un plan trop court (aller-retour).
const PART_SEND_MIN_SECONDS = KLING_MIN_PART_SECONDS;
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
const CHECKS_PER_CALL = 6;
const CHECK_FRAMES = 4;
// Verrou d'advanceSwap, au-delà duquel un appel bloqué est ignoré.
const LOCK_SECONDS = 150;
// Suivis en erreur d'affilée (404, clé révoquée…) avant d'abandonner un plan,
// soit environ 2 min. La requête n'est jamais relancée : elle serait payée
// deux fois.
const MAX_STATUS_ERRORS = 24;
// Compte Higgsfield saturé : essais espacés, abandon au bout de 10 min.
const GENJUTSU_RETRY_MS = 30_000;
// Solde Higgsfield épuisé en cours de vidéo : les séquences refusées (non
// facturées) attendent une recharge du compte, jusqu'à l'échéance.
const GENJUTSU_TOPUP_RETRY_MS = 5 * 60_000;
// Montage : essais avant d'abandonner, et délai au-delà duquel un montage
// interrompu (fonction coupée) est repris. Plus long que maxDuration (300 s).
const ASSEMBLE_ATTEMPTS = 3;
const ASSEMBLE_STALE_MS = 6 * 60_000;
// Marge sous la limite de taille d'un fichier dans Supabase Storage (50 Mo).
const MAX_VIDEO_MB = 40;
const GENJUTSU_WAIT_MAX_MS = 10 * 60_000;
// Une séquence Genjutsu se rend en quelques minutes, file d'attente en plus.
// Au-delà de ce délai, le remplacement est abandonné et remboursé.
const GENJUTSU_DEADLINE_MS = 60 * 60_000;
// Séquences Genjutsu rendues en même temps pour une vidéo (Higgsfield en
// accepte 20 par clé, tous utilisateurs confondus). Les envois d'un passage
// d'advanceSwap s'arrêtent au bout d'une minute : chacun peut en prendre une,
// et le verrou en dure deux et demie.
const GENJUTSU_IN_FLIGHT = 16;
const GENJUTSU_POST_WINDOW_MS = 60_000;

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
  // Genjutsu : envoi en cours. Resté vrai au suivi suivant, son résultat n'a
  // jamais été connu : la séquence n'est pas renvoyée (elle serait payée deux fois).
  posting?: boolean;
  // Genjutsu : séquence non rendue, livrée avec ses images d'origine (prix rendu).
  original?: boolean;
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
  // Plusieurs personnages (moteur genjutsu seulement) : chacun avec qui il
  // remplace et sa fiche. Le premier est aussi dans target, sheet et
  // character_urls.
  characters?: { target: string; image_path: string; front_url: string; urls: string[] }[];
  // Image clé du premier plan, modèle des suivantes.
  anchor_url?: string;
  // Début du remplacement, ou du dernier plan refait (échéance, voir advanceSwap).
  started_at?: string;
  assemble_attempts?: number;
  assembling_since?: string | null;
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

// Découpe le passage [start, start + seconds]. Kling : plan par plan, un plan
// de plus de 10 s coupé en parts égales. Genjutsu : en séquences (voir
// groupIntoBlocks).
export async function splitIntoParts(
  url: string,
  start: number,
  seconds: number,
  engine: SwapEngine = "kling",
) {
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
    { timeout: 150_000, maxBuffer: 64 * 1024 * 1024 },
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
  if (engine === "genjutsu") return groupIntoBlocks(bounds);
  return bounds.slice(1).flatMap((end, i): SwapPart[] => {
    const length = end - bounds[i];
    const count = Math.ceil(length / PART_MAX_SECONDS);
    return Array.from({ length: count }, (_, k) => ({
      start: bounds[i] + (k * length) / count,
      seconds: length / count,
    }));
  });
}

// Séquences Genjutsu d'au plus GENJUTSU_BLOCK_SECONDS, coupées aux changements
// de plan : Genjutsu suit les coupes à l'intérieur d'une séquence, et une
// jonction qui tombe sur une vraie coupe ne se voit pas. Un plan plus long est
// coupé en parts égales (la jonction peut alors se voir). Une séquence de
// moins de GENJUTSU_MIN_SECONDS rejoint sa voisine la plus courte, dans la
// limite de GENJUTSU_BLOCK_MAX_SECONDS. Une coupe manquée par la détection ne
// gêne pas : Genjutsu la suit ; une coupe imaginée ne fait que finir une
// séquence plus tôt.
export function groupIntoBlocks(bounds: number[]): SwapPart[] {
  // Plans, les plus longs coupés en parts égales.
  const pieces = bounds.slice(1).flatMap((end, i) => {
    const length = end - bounds[i];
    const count =
      length <= GENJUTSU_BLOCK_WHOLE_SECONDS
        ? 1
        : Math.ceil(length / GENJUTSU_BLOCK_SECONDS - 1e-9);
    return Array.from({ length: count }, (_, k) => ({
      start: bounds[i] + (k * length) / count,
      seconds: length / count,
    }));
  });
  // Plans consécutifs regroupés tant que la séquence reste courte.
  const blocks: SwapPart[] = [];
  for (const piece of pieces) {
    const last = blocks.at(-1);
    if (last && last.seconds + piece.seconds <= GENJUTSU_BLOCK_SECONDS + 1e-9) {
      last.seconds += piece.seconds;
    } else {
      blocks.push({ ...piece });
    }
  }
  // Séquences trop courtes fusionnées avec leur voisine la plus courte.
  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i];
    const fits = (b?: SwapPart) =>
      b !== undefined && b.seconds + block.seconds <= GENJUTSU_BLOCK_MAX_SECONDS + 1e-9;
    const before = fits(blocks[i - 1]) ? blocks[i - 1] : undefined;
    const after = fits(blocks[i + 1]) ? blocks[i + 1] : undefined;
    if (block.seconds >= GENJUTSU_MIN_SECONDS || (!before && !after)) {
      i++;
      continue;
    }
    if (before && (!after || before.seconds <= after.seconds)) {
      before.seconds += block.seconds;
    } else {
      after!.start = block.start;
      after!.seconds += block.seconds;
    }
    blocks.splice(i, 1);
  }
  return blocks;
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
          ? // apad : sans lui, un passage au-delà de la fin du son serait tronqué.
            ["-af", "apad", "-frames:v", String(genjutsuFrames(seconds)), "-shortest"]
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
  if (!generation) return;
  if (generation.stage === "assembling") {
    // Montage interrompu (fonction coupée) : repris au bout de quelques minutes.
    const since = (generation.metadata as SwapMetadata | null)?.assembling_since;
    if (since && Date.now() - Date.parse(since) < ASSEMBLE_STALE_MS) return;
    await admin
      .from("generations")
      .update({ stage: "image" })
      .eq("id", generation.id)
      .eq("stage", "assembling")
      .eq("status", "processing");
    return;
  }
  if (generation.stage !== "image") return;

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
        // Annulée en route (voir cancelSwap) : plus rien n'est envoyé.
        .eq("status", "processing")
        .eq("metadata->>rev", String(rev + 1))
        .select("id");
      if (!error) return Boolean(data?.length);
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
    return false;
  };

  // Échéance Genjutsu : elle ne vise que les séquences encore en attente de
  // rendu (voir advanceParts). Un rendu fini reste récupéré par qui revient tard.
  const expired =
    metadata.engine === "genjutsu" &&
    Date.now() - Date.parse(metadata.started_at ?? generation.created_at) > GENJUTSU_DEADLINE_MS;

  let outcome: "continue" | "failed" | "assemble" = "continue";
  try {
    outcome = await advanceParts(generation, metadata, persist, expired);
  } catch (e) {
    console.error("advanceSwap", errorMessage(e));
    // Compte fal bloqué à l'envoi d'une image clé ou d'un plan : sans cela,
    // le remplacement réessaierait à chaque suivi, sans fin. Plan refait à la
    // demande : l'ancien reprend sa place, la vidéo reste entière.
    if (isOutOfCredit(e)) {
      const redone = metadata.swap_parts!.filter((p) => p.redo && p.stage !== "done");
      for (const part of redone) await abandonRedo(generation.id, part);
      outcome = redone.length ? "assemble" : await fail(generation.id, OUT_OF_CREDIT_ERROR);
    }
  }

  // Libère le verrou et enregistre l'avancement.
  await persist({ busy_until: null });

  if (outcome === "failed") {
    await removeParts(generation);
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
    return;
  }
  if (outcome === "assemble") await assembleSwap(generation, metadata);
}

// Remplacement abandonné et remboursé : ses morceaux rendus ne restent pas
// téléchargeables.
async function removeParts(generation: { id: string; user_id: string }) {
  try {
    const bucket = createAdminClient().storage.from(GENERATIONS_BUCKET);
    const folder = `${generation.user_id}/${generation.id}`;
    const { data: files } = await bucket.list(folder, { limit: 1000 });
    if (files?.length) await bucket.remove(files.map((f) => `${folder}/${f.name}`));
  } catch (e) {
    console.error("removeParts", errorMessage(e));
  }
}

async function advanceParts(
  generation: { id: string; user_id: string },
  metadata: SwapMetadata,
  persist: () => Promise<boolean>,
  // Échéance Genjutsu dépassée : les séquences encore en attente sont abandonnées.
  expired: boolean,
): Promise<"continue" | "failed" | "assemble"> {
  const parts = metadata.swap_parts!;
  const sheet = metadata.sheet!;
  const target = metadata.target;
  const genjutsu = metadata.engine === "genjutsu";
  const calledAt = Date.now();
  // Séquences Genjutsu en cours de rendu.
  let inFlight = parts.filter((p) => p.stage === "video" && p.predictionId).length;
  // Séquences refusées faute de solde chez Higgsfield (refus non facturé).
  const starved: SwapPart[] = [];
  // Rendus finis, copiés dans le stockage tous en même temps.
  const copies: Promise<void>[] = [];

  // Abandon d'un plan.
  // - Refait à la demande : l'ancien reprend sa place, la vidéo reste entière.
  // - Genjutsu, quand d'autres séquences sont déjà envoyées (donc payées) :
  //   celle-ci garde ses images d'origine, son prix est rendu, la vidéo est
  //   livrée ; elle reste signalée et peut être refaite seule.
  // - Sinon tout le remplacement échoue, crédits rendus.
  const giveUp = async (part: SwapPart, i: number, error?: string) => {
    if (part.redo) {
      await abandonRedo(generation.id, part);
      return null;
    }
    const othersPaid = parts.some(
      (p) => p !== part && (p.predictionId || (p.clipPath && !p.original)),
    );
    if (genjutsu && othersPaid && part.videoUrl) {
      try {
        part.clipPath = await copyOutputToStorage(
          part.videoUrl,
          `${generation.user_id}/${generation.id}/part-${String(i).padStart(2, "0")}-source`,
        );
      } catch (e) {
        console.error("swap: séquence d'origine", errorMessage(e));
        return error ? fail(generation.id, error) : ("failed" as const);
      }
      part.predictionId = undefined;
      part.posting = false;
      part.original = true;
      part.check = error ?? "non rendue";
      part.stage = "done";
      // Enregistré avant de rendre son prix : jamais deux fois.
      if (!(await persist())) return "continue" as const;
      await createAdminClient().rpc("refund_swap_redo", {
        p_generation_id: generation.id,
        p_credits: swapShotCredits(part.seconds, "genjutsu"),
      });
      return null;
    }
    return error ? fail(generation.id, error) : ("failed" as const);
  };

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
        if (prediction.outOfCredit) {
          const out = await giveUp(part, i, OUT_OF_CREDIT_ERROR);
          if (out) return out;
          continue;
        }
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
          // Envoi précédent au résultat inconnu (fonction coupée en plein
          // envoi), ou échéance dépassée : on n'envoie plus.
          if (part.posting || expired) {
            const out = await giveUp(part, i);
            if (out) return out;
            continue;
          }
          if (part.retryAt && Date.now() < part.retryAt) continue;
          if (inFlight >= GENJUTSU_IN_FLIGHT) continue;
          if (Date.now() - calledAt > GENJUTSU_POST_WINDOW_MS) continue;
          if ((part.attempts ?? 0) >= MAX_ATTEMPTS) {
            const out = await giveUp(part, i);
            if (out) return out;
            continue;
          }
          // L'essai est compté et enregistré avant l'envoi : si l'appel meurt
          // pendant l'envoi, le suivi suivant ne renvoie rien. Sans cette
          // écriture (verrou perdu), rien n'est envoyé.
          part.attempts = (part.attempts ?? 0) + 1;
          part.posting = true;
          if (!(await persist())) {
            part.attempts -= 1;
            part.posting = false;
            return "continue";
          }
          try {
            part.predictionId = await createGenjutsuSwap({
              videoUrl: part.videoUrl!,
              characters: metadata.characters?.map((c) => ({ imageUrls: c.urls, target: c.target })) ?? [
                { imageUrls: metadata.character_urls ?? [sheet.frontUrl], target },
              ],
            });
          } catch (e) {
            console.error("createGenjutsuSwap", errorMessage(e));
            const status = (e as { status?: unknown } | null)?.status;
            const rejected = typeof status === "number" && status >= 400 && status < 500;
            // Refus net : rien n'a été créé ni facturé.
            if (rejected || higgsfieldBusy(e)) part.posting = false;
            if (higgsfieldBusy(e)) {
              // Compte saturé : on attend une place.
              part.attempts -= 1;
              part.waitingSince ??= Date.now();
              if (Date.now() - part.waitingSince > GENJUTSU_WAIT_MAX_MS) {
                const out = await giveUp(part, i);
                if (out) return out;
                continue;
              }
              part.retryAt = Date.now() + GENJUTSU_RETRY_MS;
              // Inutile d'envoyer les séquences suivantes pendant ce passage.
              inFlight = GENJUTSU_IN_FLIGHT;
              continue;
            }
            // Solde Higgsfield épuisé (403 dès la création).
            if (isOutOfCredit(e) && !part.redo) {
              part.attempts -= 1;
              starved.push(part);
              inFlight = GENJUTSU_IN_FLIGHT;
              continue;
            }
            // Seul un refus net (4xx) se retente : après une coupure, un délai
            // dépassé ou un 5xx, la requête a pu être acceptée, et un second
            // envoi serait payé deux fois.
            if (isOutOfCredit(e) || !rejected || part.attempts >= MAX_ATTEMPTS) {
              const out = await giveUp(part, i, isOutOfCredit(e) ? GENJUTSU_UNAVAILABLE_ERROR : undefined);
              if (out) return out;
            }
            continue;
          }
          part.posting = false;
          part.retryAt = undefined;
          inFlight++;
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
        if (part.statusErrors < MAX_STATUS_ERRORS && !expired) continue;
        const out = await giveUp(part, i);
        if (out) return out;
        continue;
      }
      if (!isTerminal(prediction.status)) {
        if (!expired) continue;
        // Rendu jamais revenu avant l'échéance.
        const out = await giveUp(part, i);
        if (out) return out;
        continue;
      }
      if (genjutsu) inFlight--;
      const url = outputUrlOf(prediction);
      if (prediction.status !== "succeeded" || !url) {
        if (prediction.outOfCredit) {
          // Genjutsu : refus non facturé, l'essai ne compte pas. La séquence
          // attend une recharge du compte si d'autres sont déjà payées.
          if (genjutsu && !part.redo) {
            part.predictionId = undefined;
            part.attempts = Math.max((part.attempts ?? 1) - 1, 0);
            starved.push(part);
            inFlight = GENJUTSU_IN_FLIGHT;
            continue;
          }
          const out = await giveUp(part, i, genjutsu ? GENJUTSU_UNAVAILABLE_ERROR : OUT_OF_CREDIT_ERROR);
          if (out) return out;
          continue;
        }
        if (prediction.refused || (part.attempts ?? 1) >= MAX_ATTEMPTS) {
          const out = await giveUp(part, i, prediction.refused ? CONTENT_REFUSED_ERROR : undefined);
          if (out) return out;
          continue;
        }
        part.predictionId = undefined;
        continue;
      }
      // Un plan refait ne prend pas le fichier de l'ancien, gardé en secours.
      const name = `part-${String(i).padStart(2, "0")}-${part.attempts ?? 1}${part.redo ? `-${Date.now()}` : ""}`;
      copies.push(
        copyOutputToStorage(url, `${generation.user_id}/${generation.id}/${name}`).then(
          (clipPath) => {
            part.clipPath = clipPath;
            part.stage = "check";
          },
          // Copie ratée : le plan reste à l'étape vidéo, le suivi suivant la
          // retente sans rien renvoyer au fournisseur.
          (e) => console.error("swap: copie", errorMessage(e)),
        ),
      );
    }
  }
  await Promise.all(copies);

  // Échéance dépassée et rendu fini impossible à copier : séquence abandonnée.
  if (expired) {
    for (const [i, part] of parts.entries()) {
      if (part.stage !== "video" || !part.predictionId) continue;
      const out = await giveUp(part, i);
      if (out) return out;
    }
  }

  if (starved.length) {
    // Rien de payé ni en cours : échec immédiat, sans frais.
    if (!parts.some((p) => p.predictionId || (p.clipPath && !p.original))) {
      return fail(generation.id, GENJUTSU_UNAVAILABLE_ERROR);
    }
    // Des séquences sont déjà payées : on attend une recharge du compte
    // plutôt que de les perdre (jusqu'à l'échéance).
    console.error(
      "ALERTE : solde Higgsfield épuisé, remplacement en attente de recharge",
      generation.id,
      `${starved.length} séquence(s)`,
    );
    for (const part of starved) part.retryAt = Date.now() + GENJUTSU_TOPUP_RETRY_MS;
  }

  // Contrôles menés de front : des séquences lancées ensemble finissent
  // ensemble. Genjutsu : toutes d'un coup, un contrôle raté ne fait que signaler.
  await Promise.all(
    parts
      .filter((p) => p.stage === "check")
      .slice(0, genjutsu ? GENJUTSU_IN_FLIGHT : CHECKS_PER_CALL)
      .map(async (part) => {
        const result = await checkFrames(part.clipPath!)
          .then((frames) =>
            checkSwapShot({
              frames,
              characters: metadata.characters?.map((c) => ({ url: c.front_url, target: c.target })) ?? [
                { url: sheet.frontUrl, target },
              ],
            }),
          )
          .catch((e) => {
            console.error("checkSwapShot", errorMessage(e));
            return null;
          });
        const ok = !result || (result.replaced && result.sameCharacter);
        // Kling : nouvel essai de la vidéo, à partir de la même image clé.
        // Genjutsu : une séquence rendue est payée, elle est seulement signalée.
        if (!ok && !genjutsu && (part.attempts ?? 1) < MAX_ATTEMPTS) {
          part.check = result?.reason;
          part.predictionId = undefined;
          part.stage = "video";
          return;
        }
        part.check = ok ? undefined : result?.reason;
        // `redo` est gardé jusqu'au montage réussi (voir assembleSwap).
        part.stage = "done";
      }),
  );

  if (!parts.every((p) => p.stage === "done" && p.clipPath)) return "continue";
  // Aucune séquence rendue : rien à livrer, tout est rendu.
  if (genjutsu && parts.every((p) => p.original)) return "failed";
  return "assemble";
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

// Annulation demandée par le créateur, avant le montage.
// - Plan refait : l'ancien reprend sa place, son prix est rendu, la vidéo
//   livrée reste.
// - Sinon le remplacement s'arrête, ses morceaux sont effacés et les crédits
//   rendus, sauf ceux des séquences déjà rendues (payées au fournisseur).
// Faux si rien n'a été annulé (déjà fini, en cours de montage, ou inconnu).
export async function cancelSwap(generationId: string, userId: string) {
  const admin = createAdminClient();
  const { data: generation } = await admin
    .from("generations")
    .select("id, user_id, status, stage, storage_path, credits_cost, metadata")
    .eq("id", generationId)
    .eq("user_id", userId)
    .eq("kind", "swap")
    .maybeSingle();
  if (!generation) return false;
  if (generation.status === "pending") {
    // Encore en préparation : startSwap ne la relancera pas (voir son « pending »).
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
    return true;
  }
  if (generation.status !== "processing" || generation.stage !== "image") return false;

  const metadata = (generation.metadata ?? {}) as SwapMetadata;
  const parts = metadata.swap_parts ?? [];

  if (generation.storage_path) {
    const redone = parts.filter((p) => p.redo);
    for (const part of redone) {
      part.clipPath = part.redo!.previousClipPath;
      part.stage = "done";
    }
    const { data: claimed } = await admin
      .from("generations")
      .update({
        status: "completed",
        metadata: {
          ...metadata,
          swap_parts: parts.map((p) => ({ ...p, redo: undefined })),
          busy_until: null,
        },
      })
      .eq("id", generation.id)
      .eq("status", "processing")
      .eq("stage", "image")
      .select("id");
    if (!claimed?.length) return false;
    for (const part of redone) {
      await admin.rpc("refund_swap_redo", {
        p_generation_id: generation.id,
        p_credits: part.redo!.credits,
      });
    }
    return true;
  }

  const engine = metadata.engine ?? "kling";
  const kept = parts
    .filter((p) => p.stage === "done" && !p.original)
    .reduce((sum, p) => sum + swapShotCredits(p.seconds, engine), 0);
  if (!kept) {
    await removeParts(generation);
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
    return true;
  }
  const { data: claimed } = await admin
    .from("generations")
    .update({ status: "failed" })
    .eq("id", generation.id)
    .eq("status", "processing")
    .eq("stage", "image")
    .select("id");
  if (!claimed?.length) return false;
  await removeParts(generation);
  const refund = generation.credits_cost - kept;
  if (refund > 0) {
    await admin.rpc("refund_swap_redo", { p_generation_id: generation.id, p_credits: refund });
  }
  return true;
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
  // Verrou : un seul appelant fait le montage. Les essais sont comptés : un
  // montage coupé en route est repris (voir advanceSwap), pas indéfiniment.
  const attempts = (metadata.assemble_attempts ?? 0) + 1;
  const { data: claimed } = await admin
    .from("generations")
    .update({
      stage: "assembling",
      metadata: {
        ...metadata,
        busy_until: null,
        assemble_attempts: attempts,
        assembling_since: new Date().toISOString(),
      },
    })
    .eq("id", generation.id)
    .eq("stage", "image")
    .eq("status", "processing")
    .select("id, storage_path");
  if (!claimed?.length) return;
  // Vidéo déjà livrée : c'est un plan refait.
  const delivered = claimed[0].storage_path;
  const settled = { busy_until: null, assemble_attempts: 0, assembling_since: null };

  const giveUpAssembly = async () => {
    const parts = metadata.swap_parts ?? [];
    if (delivered) {
      // La vidéo livrée reste en place ; seul le plan refait est rendu.
      for (const part of parts.filter((p) => p.redo)) await abandonRedo(generation.id, part);
      await admin
        .from("generations")
        .update({ status: "completed", metadata: { ...metadata, ...settled } })
        .eq("id", generation.id)
        .eq("status", "processing");
      return;
    }
    // Genjutsu, une seule séquence : le rendu, déjà payé, est livré tel quel
    // plutôt que perdu.
    if (metadata.engine === "genjutsu" && parts.length === 1 && parts[0].clipPath) {
      await admin
        .from("generations")
        .update({ status: "completed", storage_path: parts[0].clipPath })
        .eq("id", generation.id)
        .eq("status", "processing");
      return;
    }
    await removeParts(generation);
    await admin.rpc("fail_generation", { p_generation_id: generation.id });
  };

  if (attempts > ASSEMBLE_ATTEMPTS) return giveUpAssembly();

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
    for (const part of metadata.swap_parts!) part.redo = undefined;
    await admin
      .from("generations")
      .update({
        status: "completed",
        storage_path: storagePath,
        metadata: { ...metadata, ...settled },
      })
      .eq("id", generation.id)
      .eq("status", "processing");
  } catch (e) {
    console.error("advanceSwap: montage", errorMessage(e));
    if (attempts < ASSEMBLE_ATTEMPTS) {
      // Les rendus, payés, sont toujours dans le stockage : le suivi suivant
      // retente le montage.
      await admin
        .from("generations")
        .update({ stage: "image" })
        .eq("id", generation.id)
        .eq("stage", "assembling");
      return;
    }
    await giveUpAssembly();
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
    const maxKbps = Math.floor(Math.min(8000, (MAX_VIDEO_MB * 8192) / Math.max(total, 1)));

    // Chaque morceau occupe exactement ses images dans la vidéo finale,
    // comptées d'après ses bornes dans le passage : les arrondis ne
    // s'additionnent pas d'une jonction à l'autre, l'image reste calée sur le
    // son. Un rendu plus court que son morceau (Genjutsu rend un nombre
    // d'images imposé) est complété par sa dernière image.
    const frameAt = (seconds: number) => Math.round(seconds * input.fps);
    const filter =
      files
        .map((_, i) => {
          const part = input.parts[i];
          const frames = Math.max(1, frameAt(part.start + part.seconds) - frameAt(part.start));
          return (
            `[${i}:v]fps=${input.fps},tpad=stop_mode=clone:stop_duration=3,` +
            `trim=end_frame=${frames},setpts=PTS-STARTPTS,` +
            `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}];`
          );
        })
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
        // apad : la vidéo fixe la durée, même si le son du clip s'arrête avant.
        ...(input.sourceUrl
          ? ["-map", `${files.length}:a?`, "-c:a", "aac", "-af", "apad", "-shortest"]
          : []),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-maxrate", `${maxKbps}k`,
        "-bufsize", `${maxKbps * 2}k`,
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
