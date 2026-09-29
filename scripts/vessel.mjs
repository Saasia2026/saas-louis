// Mannequin (« vessel ») : rend un clip de référence avec un mannequin neutre
// à la place de la personne filmée, via Genjutsu, et dépose le résultat comme
// plan prêt dans swap-inputs/presets/ (voir src/lib/presets.ts). La vraie
// personne n'apparaît jamais dans le produit, et les rendus des créateurs
// partent d'une base sans traits ni tenue à combattre. À lancer une fois par
// plan, depuis la racine du projet, avec .env.local rempli :
//
//   node scripts/vessel.mjs <reference.mp4> <nom> [--figure homme|femme] [--start 0]
//        [--seconds 12] [--target "the man at the microphone"] [--hd] [--out <dossier>]
//   node scripts/vessel.mjs --sheet-only [--figure homme|femme] [--out <dossier>]
//
// --figure : mannequin homme (défaut) ou femme. Un personnage féminin posé sur
// un mannequin masculin garde des épaules et des proportions d'homme ; chaque
// plan se rend donc avec le mannequin du genre attendu (presets/<nom>.mp4 en
// homme, à re-rendre en femme sous un autre nom si le plan doit exister en
// deux versions). Les animaux n'ont pas de mannequin à eux : la fiche
// personnage les met debout en posture humaine, la base humaine convient.
//
// Coût : une image fal la première fois (la planche du mannequin est ensuite
// gardée dans le bucket), puis Genjutsu à la seconde entamée : 0,681 $ en
// 720p, 1,632 $ en 1080p (--hd). Le nom devient le fichier presets/<nom>.mp4.
import { createFalClient } from "@fal-ai/client";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const log = (message) => console.error(`[vessel] ${message}`);

const BUCKET = "swap-inputs";
// Une planche par genre de mannequin. L'ancienne clé sans suffixe
// (presets/_mannequin-sheet.png) est celle du mannequin homme d'origine.
const SHEET_KEYS = {
  homme: "presets/_mannequin-sheet-m.png",
  femme: "presets/_mannequin-sheet-f.png",
};
const HF_BASE = "https://api.higgsfield.ai";
const HF_SWAP_ENDPOINT = "higgsfiled/genjutsu/object-swap/v1.0";
const GENJUTSU_MIN_SECONDS = 4;
const GENJUTSU_MAX_SECONDS = 30;
const FPS = 30;
const ASPECT_RATIOS = ["9:16", "16:9", "1:1"];

// --- Arguments ---------------------------------------------------------------
const VALUE_FLAGS = new Set(["start", "seconds", "target", "out", "figure"]);
const opts = {};
const positional = [];
for (let i = 0; i < process.argv.slice(2).length; i++) {
  const arg = process.argv[i + 2];
  if (!arg.startsWith("--")) positional.push(arg);
  else if (VALUE_FLAGS.has(arg.slice(2))) opts[arg.slice(2)] = process.argv[++i + 2];
  else opts[arg.slice(2)] = true;
}
const sheetOnly = opts["sheet-only"] === true;
const [reference, name] = positional;
if (!sheetOnly && (!reference || !name || !/^[a-z0-9-]+$/.test(name))) {
  console.error(
    "usage : node scripts/vessel.mjs <reference.mp4> <nom en minuscules-tirets> [--start s] [--seconds n] [--target \"…\"] [--hd] [--out dossier]",
  );
  process.exit(1);
}
if (!sheetOnly && !existsSync(reference)) {
  console.error(
    `clip introuvable : ${reference}\nDonne le chemin complet de ton fichier vidéo (glisse le fichier dans le terminal pour l'obtenir).`,
  );
  process.exit(1);
}
const start = Number(opts.start ?? 0);
const seconds = Number(opts.seconds ?? 12);
if (!sheetOnly && (!(seconds >= GENJUTSU_MIN_SECONDS) || seconds > GENJUTSU_MAX_SECONDS)) {
  console.error(`--seconds : entre ${GENJUTSU_MIN_SECONDS} et ${GENJUTSU_MAX_SECONDS}`);
  process.exit(1);
}
const hd = opts.hd === true;
const figure = String(opts.figure ?? "homme").toLowerCase().startsWith("f") ? "femme" : "homme";
const SHEET_KEY = SHEET_KEYS[figure];
const outDir = opts.out ?? path.join(tmpdir(), "twinpost-vessel", name ?? "sheet");

// --- Environnement (.env.local) ----------------------------------------------
const env = Object.fromEntries(
  (await readFile(path.resolve(".env.local"), "utf8"))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
function need(key) {
  if (!env[key]) throw new Error(`${key} manquant dans .env.local`);
  return env[key];
}
const SUPABASE_URL = need("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const FAL_KEY = need("FAL_KEY");
const HF_CREDENTIALS = sheetOnly ? env.HF_CREDENTIALS : need("HF_CREDENTIALS");

// --- Stockage Supabase (clé service) -----------------------------------------
const storageHeaders = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };
async function storageGet(key) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${key}`, {
    headers: storageHeaders,
  });
  return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
}
async function storagePut(key, data, contentType) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: { ...storageHeaders, "Content-Type": contentType, "x-upsert": "true" },
    body: data,
  });
  if (!res.ok) throw new Error(`stockage ${key} : ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// --- Planche du mannequin (fal, une fois par genre) ---------------------------
// Un adulte quelconque en gris uni, sans rien qui puisse baver dans le rendu
// final : pas de traits marquants, pas de tenue, pas d'accessoire.
const SHEET_LAYOUT =
  "Top row: four head-and-shoulders portraits — front facing camera, three-quarter left, left profile, back of the head. " +
  "Bottom row: four full-body shots in the same outfit — front facing camera, three-quarter left, left profile, rear view. " +
  "Every panel shows the identical figure. Plain white background in every panel, soft even studio lighting, " +
  "thin light-grey lines separating the eight panels, no text, no labels, no captions.";
const SHEET_PROMPTS = {
  homme:
    "Professional character reference sheet of one neutral stand-in figure: an adult man of average build, " +
    "plain matte mid-grey fitted crew-neck t-shirt, plain mid-grey straight trousers, plain grey sneakers, " +
    "very short dark buzz-cut hair, clean-shaven, neutral medium skin tone, calm neutral expression, " +
    "no accessories, no logo, no jewellery, no glasses, no tattoos. " + SHEET_LAYOUT,
  femme:
    "Professional character reference sheet of one neutral stand-in figure: an adult woman of average build, " +
    "plain matte mid-grey fitted crew-neck t-shirt, plain mid-grey straight trousers, plain grey sneakers, " +
    "dark hair tied back in a simple low bun, no makeup, neutral medium skin tone, calm neutral expression, " +
    "no accessories, no logo, no jewellery, no glasses, no tattoos. " + SHEET_LAYOUT,
};
const FIGURE_DESCRIPTIONS = {
  homme:
    "a plain adult man in a matte mid-grey fitted t-shirt, grey trousers and grey sneakers, very short hair, no accessories",
  femme:
    "a plain adult woman in a matte mid-grey fitted t-shirt, grey trousers and grey sneakers, dark hair tied back in a low bun, no accessories",
};

async function mannequinSheet() {
  let png = await storageGet(SHEET_KEY);
  if (png) log(`planche du mannequin (${figure}) : reprise du bucket`);
  else {
    log(`planche du mannequin (${figure}) : génération (fal)…`);
    const fal = createFalClient({ credentials: FAL_KEY });
    const { data } = await fal.subscribe("fal-ai/nano-banana-pro", {
      input: { prompt: SHEET_PROMPTS[figure], aspect_ratio: "16:9", output_format: "png" },
    });
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("fal : pas d'image rendue");
    png = Buffer.from(await (await fetch(url)).arrayBuffer());
    await storagePut(SHEET_KEY, png, "image/png");
    log(`planche gardée dans ${BUCKET}/${SHEET_KEY}`);
  }
  const local = path.join(outDir, "mannequin-sheet.png");
  await writeFile(local, png);
  log(`planche : ${local}`);
  return png;
}

// --- Clip de référence, encodé comme le pipeline (voir preparePart) ----------
async function prepareReference() {
  const side = hd ? 1080 : 720;
  const format =
    `scale='if(lt(iw,ih),trunc(min(iw,${side})/2)*2,-2)':'if(lt(iw,ih),-2,trunc(min(ih,${side})/2)*2)',` +
    `setsar=1,fps=${FPS},format=yuv420p`;
  const output = path.join(outDir, "reference.mp4");
  await execFileAsync(
    ffmpegPath,
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", start.toFixed(3), "-t", seconds.toFixed(3), "-i", reference,
      "-vf", format, "-af", "apad", "-frames:v", String(Math.round(seconds * FPS)), "-shortest",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-movflags", "+faststart",
      output,
    ],
    { timeout: 300_000 },
  );
  const info = await execFileAsync(ffmpegPath, ["-hide_banner", "-i", output]).catch((e) => e);
  const size = /(\d{2,5})x(\d{2,5})/.exec(String(info.stderr ?? ""));
  if (!size) throw new Error("taille du clip illisible");
  const ratio = Number(size[1]) / Number(size[2]);
  const aspectRatio = ASPECT_RATIOS.reduce((best, r) => {
    const value = (s) => s.split(":").map(Number).reduce((w, h) => w / h);
    return Math.abs(Math.log(value(r) / ratio)) < Math.abs(Math.log(value(best) / ratio)) ? r : best;
  });
  log(`référence : ${output} (${size[1]}×${size[2]}, ${seconds} s)`);
  return { output, aspectRatio };
}

// --- Higgsfield ----------------------------------------------------------------
const hfHeaders = () => ({ Authorization: `Key ${HF_CREDENTIALS}`, "Content-Type": "application/json" });
async function hfUpload(data, contentType) {
  const res = await fetch(`${HF_BASE}/files/generate-upload-url`, {
    method: "POST",
    headers: hfHeaders(),
    body: JSON.stringify({ content_type: contentType }),
  });
  if (!res.ok) throw new Error(`Higgsfield envoi : ${res.status} ${(await res.text()).slice(0, 200)}`);
  const target = await res.json();
  const put = await fetch(target.upload_url, {
    method: "PUT",
    headers: target.upload_headers ?? { "Content-Type": contentType },
    body: data,
  });
  if (!put.ok) throw new Error(`Higgsfield dépôt : ${put.status}`);
  return target.public_url;
}

function describeTarget(target) {
  const text = target?.trim().replace(/"/g, "'");
  return text ? `the person described as "${text}"` : "the main person";
}

// Même structure que la consigne du site (voir genjutsuPrompt), pour le
// mannequin : le clip commande tout, la planche ne donne que l'apparence.
function swapPrompt(target) {
  return [
    `STRICT CHARACTER AND WARDROBE REPLACEMENT. Edit the uploaded source video: one person is replaced by the neutral stand-in figure shown in the reference image (${FIGURE_DESCRIPTIONS[figure]}). The reference image shows multiple views of ONE figure, not multiple figures.`,
    "SOURCE PRIORITY — The source video controls all movement, performance, lip-sync, facial expressions, gaze, gestures, interactions, body positions, camera movement, framing, editing and timing. The reference image controls only the figure's identity: face, hair, skin, body proportions and clothing.",
    `CHARACTER — Replace ${describeTarget(target)} with this neutral figure. Match its plain grey clothing, hairstyle, neutral face and skin exactly as shown. Preserve this original person's exact actions, rhythm, posture, head movements, hand gestures, gaze, facial expressions and lip-sync throughout the entire video; do not add a smile or extra mouth movement.`,
    "PERMANENT IDENTITY ASSIGNMENT — Bind the figure to that original person for the full clip, through turns, profile views, back views, motion blur and temporary occlusion. Never blend faces or transfer gestures to another person.",
    "ENVIRONMENT AND INTEGRATION — Keep the original background, set, objects, every other person, lighting, shadows, perspective and composition exactly unchanged. Keep the original duration, aspect ratio, cuts and playback speed. Do not copy the reference image's background, panel layout, borders, labels or static poses into the output.",
    "FINAL RESULT — The same source video and the same performance, with only this person's identity, hair and clothing replaced by the neutral grey figure.",
  ].join("\n\n");
}

async function hfWait(requestId) {
  const deadline = Date.now() + 40 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const res = await fetch(`${HF_BASE}/requests/${requestId}/status`, { headers: hfHeaders() });
    if (res.ok) {
      const body = await res.json();
      if (body.status === "completed" && body.video?.url) return body.video.url;
      if (["failed", "nsfw", "canceled"].includes(body.status)) {
        throw new Error(`Genjutsu ${body.status} ${JSON.stringify(body.error ?? "").slice(0, 300)}`);
      }
      if (body.status !== last) log(`Genjutsu : ${body.status}`);
      last = body.status;
    } else if (res.status < 500 && res.status !== 429) {
      throw new Error(`Higgsfield suivi : ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Genjutsu : délai dépassé");
}

// --- Déroulé -------------------------------------------------------------------
await mkdir(outDir, { recursive: true });
const sheet = await mannequinSheet();
if (sheetOnly) process.exit(0);

const { output: prepared, aspectRatio } = await prepareReference();
log("envoi chez Higgsfield…");
const [videoUrl, sheetUrl] = await Promise.all([
  hfUpload(await readFile(prepared), "video/mp4"),
  hfUpload(sheet, "image/png"),
]);
const create = await fetch(`${HF_BASE}/${HF_SWAP_ENDPOINT}`, {
  method: "POST",
  headers: hfHeaders(),
  body: JSON.stringify({
    prompt: swapPrompt(opts.target),
    video_url: videoUrl,
    image_urls: [sheetUrl],
    resolution: hd ? "1080p" : "720p",
  }),
});
if (!create.ok) throw new Error(`Higgsfield création : ${create.status} ${(await create.text()).slice(0, 300)}`);
const { request_id: requestId } = await create.json();
log(`Genjutsu lancé (${requestId}), ${seconds} s en ${hd ? "1080p" : "720p"}…`);
const renderedUrl = await hfWait(requestId);

const rendered = path.join(outDir, "rendered.mp4");
await writeFile(rendered, Buffer.from(await (await fetch(renderedUrl)).arrayBuffer()));
// Son d'origine remis sur le rendu, comme le montage du site.
const final = path.join(outDir, `${name}.mp4`);
await execFileAsync(
  ffmpegPath,
  [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", rendered, "-i", prepared,
    "-map", "0:v:0", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart",
    final,
  ],
  { timeout: 300_000 },
);
await storagePut(`presets/${name}.mp4`, await readFile(final), "video/mp4");
log(`plan déposé : ${BUCKET}/presets/${name}.mp4 (copie locale : ${final})`);

console.log("\nÀ ajouter dans SWAP_PRESETS (src/lib/presets.ts), titres et libellés à traduire :\n");
console.log(
  JSON.stringify(
    {
      id: name,
      path: `presets/${name}.mp4`,
      seconds,
      aspectRatio,
      title: { fr: name, en: name, es: name },
      people: [
        {
          target: "the person in the plain grey t-shirt and grey trousers",
          label: { fr: "la personne en gris", en: "the person in grey", es: "la persona de gris" },
        },
      ],
    },
    null,
    2,
  ),
);
