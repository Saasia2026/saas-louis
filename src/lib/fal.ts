import "server-only";
import { ApiError, createFalClient } from "@fal-ai/client";
import {
  DEFAULT_VIDEO_MODEL,
  findVideoModel,
  type AspectRatio,
  type ImageModelId,
  type VideoModelId,
} from "@/lib/generation";
import {
  isContentRefused,
  type PredictionState,
  type PredictionStatus,
} from "@/lib/predictions";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRAINING_PHOTOS_BUCKET } from "@/lib/twin";

// fal.ai génère les images du jumeau et les plans vidéo. Les identifiants de
// requête sont stockés préfixés ("fal:ref:<modèle>:<id>",
// "fal:video:<modèle>:<id>"…) : le préfixe dit comment les suivre.
// fal n'a pas de webhook ici : ses requêtes avancent par le polling du
// dashboard (getGeneration).

export function falEnabled() {
  return Boolean(process.env.FAL_KEY);
}

export function isFalId(id: string) {
  return id.startsWith("fal:");
}

function createFal() {
  const credentials = process.env.FAL_KEY;
  if (!credentials) throw new Error("FAL_KEY manquant");
  return createFalClient({ credentials });
}

// ---------------------------------------------------------------------------
// Images à photos de référence
// ---------------------------------------------------------------------------

// Un modèle d'édition reçoit des photos du jumeau (visage) et, pour les plans
// suivants d'une vidéo, le premier plan déjà validé (tenue, objets, lieu). Le
// modèle et la définition viennent du
// préréglage de la génération (voir PRESETS).
const FAL_REFERENCE_MODELS: Record<ImageModelId, string> = {
  "seedream-4.5": "fal-ai/bytedance/seedream/v4.5/edit",
  "nano-banana-pro": "fal-ai/nano-banana-pro/edit",
};

type Resolution = "1K" | "2K";

// Seedream prend une taille en pixels, Nano Banana Pro une définition. Le 1K
// suffit à alimenter une vidéo 1080p et va plus vite que le 2K.
const REFERENCE_SIZES: Record<Resolution, Record<AspectRatio, { width: number; height: number }>> =
  {
    "1K": {
      "9:16": { width: 1080, height: 1920 },
      "1:1": { width: 1440, height: 1440 },
      "16:9": { width: 1920, height: 1080 },
    },
    "2K": {
      "9:16": { width: 1440, height: 2560 },
      "1:1": { width: 2048, height: 2048 },
      "16:9": { width: 2560, height: 1440 },
    },
  };
const REFERENCE_PHOTOS = 4;
const REFERENCE_URL_TTL_SECONDS = 60 * 60;

// Photos d'entraînement réparties sur toute la série (face, profils…).
async function twinReferenceUrls(twinId: string) {
  const admin = createAdminClient();
  const { data: photos, error } = await admin
    .from("training_photos")
    .select("storage_path")
    .eq("twin_id", twinId)
    .order("uploaded_at");
  if (error) throw error;
  const step = Math.max(1, Math.floor(photos.length / REFERENCE_PHOTOS));
  const picked = photos.filter((_, i) => i % step === 0).slice(0, REFERENCE_PHOTOS);
  if (!picked.length) return [];
  const { data: signed, error: signError } = await admin.storage
    .from(TRAINING_PHOTOS_BUCKET)
    .createSignedUrls(
      picked.map((p) => p.storage_path),
      REFERENCE_URL_TTL_SECONDS,
    );
  if (signError) throw signError;
  return signed.flatMap((s) => (s.signedUrl ? [s.signedUrl] : []));
}

// La dernière image de référence est soit un plan précédent de la vidéo
// ("shot"), soit la première image du plan en cours ("end"), auquel cas il
// faut au contraire un autre moment de l'action.
export type ContinuityKind = "shot" | "end";

const CONTINUITY_RULES: Record<ContinuityKind, string> = {
  shot: "The last reference image is an earlier shot of the same video: the main character wears exactly the same clothes and accessories as in it (same jewelry, with the same size, style and placement), and recurring objects (vehicle, props) and the place look exactly the same, same model, colour and details.",
  end: "The last reference image is the first frame of this very shot. Keep the same place, outfit, accessories, objects and light, but this is a later moment of the same action: the pose, the position in the frame and the framing must be the ones described below and clearly different from that reference. Do not reproduce the reference pose.",
};

function referencePrompt(scene: string, photos: number, continuity?: ContinuityKind) {
  return [
    // Rendu « image tirée d'une vraie vidéo » plutôt que photo de studio.
    "A real still frame from ordinary video footage: handheld camera, natural available light, true-to-life skin texture and colours, no studio lighting, no colour grading, no beauty retouching.",
    `The person shown in the first ${photos} reference images is the main character: keep their face, skin tone, hair and build exactly as in those references, ignoring the background and clothing of those photos.`,
    continuity && CONTINUITY_RULES[continuity],
    scene,
    "The main character is the only person whose face is clearly visible.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function createFalReferenceImage(input: {
  twinId: string;
  imageModel: ImageModelId;
  resolution: Resolution;
  prompt: string;
  aspectRatio: AspectRatio;
  seed?: number;
  // Image d'un plan précédent, ou image de départ du plan en cours.
  continuityUrl?: string;
  continuityKind?: ContinuityKind;
}) {
  const references = await twinReferenceUrls(input.twinId);
  if (!references.length) throw new Error("Aucune photo de référence pour ce jumeau");
  const prompt = referencePrompt(
    input.prompt,
    references.length,
    input.continuityUrl ? (input.continuityKind ?? "shot") : undefined,
  );
  const image_urls = input.continuityUrl ? [...references, input.continuityUrl] : references;
  const seed = input.seed !== undefined ? { seed: input.seed } : {};
  const model = input.imageModel;
  const fal = createFal();

  const { request_id } =
    model === "nano-banana-pro"
      ? await fal.queue.submit(FAL_REFERENCE_MODELS[model], {
          input: {
            prompt,
            image_urls,
            aspect_ratio: input.aspectRatio,
            resolution: input.resolution,
            output_format: "jpeg",
            ...seed,
          },
        })
      : await fal.queue.submit(FAL_REFERENCE_MODELS[model], {
          input: {
            prompt,
            image_urls,
            image_size: REFERENCE_SIZES[input.resolution][input.aspectRatio],
            num_images: 1,
            ...seed,
          },
        });
  return `fal:ref:${model}:${request_id}`;
}

// ---------------------------------------------------------------------------
// Vidéo
// ---------------------------------------------------------------------------

// Modèles « références → vidéo » : le plan est rendu directement à partir des
// photos du jumeau et de la scène, sans image intermédiaire.
const FAL_DIRECT_VIDEO_ENDPOINTS = {
  // Sora 2 avec photos : passe par une image de départ, pas de références.
  "sora-2": "fal-ai/sora-2/image-to-video",
  "wan-2.7": "fal-ai/wan/v2.7/reference-to-video",
  "seedance-lite": "fal-ai/bytedance/seedance/v1/lite/reference-to-video",
} as const;

type DirectVideoModel = keyof typeof FAL_DIRECT_VIDEO_ENDPOINTS;

function directPrompt(scene: string, photos: number) {
  return [
    `The person shown in the ${photos} reference images is the main character: keep their face, skin tone, hair and build exactly as in those references, ignoring the background and clothing of those photos.`,
    scene,
    "Real footage: handheld camera with slight natural shake, natural available light, lifelike speed and weight of movement, no slow motion, no cinematic colour grading. The main character is the only person whose face is clearly visible.",
  ].join(" ");
}

export async function createFalDirectVideo(input: {
  videoModel: VideoModelId;
  twinId: string;
  aspectRatio: AspectRatio;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  seed?: number;
}) {
  const endpoint = FAL_DIRECT_VIDEO_ENDPOINTS[input.videoModel as DirectVideoModel];
  if (!endpoint || input.videoModel === "sora-2") {
    throw new Error(`Modèle sans mode « photos → vidéo » : ${input.videoModel}`);
  }
  const references = await twinReferenceUrls(input.twinId);
  if (!references.length) throw new Error("Aucune photo de référence pour ce jumeau");

  const fal = createFal();
  const duration = String(input.durationSeconds) as "5" | "10";
  const prompt = directPrompt(input.prompt, references.length);
  const seed = input.seed !== undefined ? { seed: input.seed } : {};

  const { request_id } =
    input.videoModel === "wan-2.7"
      ? await fal.queue.submit(FAL_DIRECT_VIDEO_ENDPOINTS["wan-2.7"], {
          input: {
            prompt,
            negative_prompt: input.negativePrompt,
            reference_image_urls: references,
            aspect_ratio: input.aspectRatio,
            duration,
            resolution: "1080p",
            ...seed,
          },
        })
      : await fal.queue.submit(FAL_DIRECT_VIDEO_ENDPOINTS["seedance-lite"], {
          input: {
            prompt,
            reference_image_urls: references,
            aspect_ratio: input.aspectRatio,
            duration,
            resolution: "720p",
            ...seed,
          },
        });
  return `fal:video:${input.videoModel}:${request_id}`;
}

// Texte → vidéo : aucun jumeau, aucune image de départ.
const FAL_TEXT_VIDEO_ENDPOINTS: Record<VideoModelId, string> = {
  "sora-2": "fal-ai/sora-2/text-to-video",
  "wan-2.7": "fal-ai/wan-25-preview/text-to-video",
  "seedance-lite": "fal-ai/bytedance/seedance/v1/lite/text-to-video",
  "kling-2.5": "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
  "seedance-1.5": "fal-ai/bytedance/seedance/v1.5/pro/text-to-video",
  "kling-3": "fal-ai/kling-video/v3/pro/text-to-video",
  "kling-o1-ref": "fal-ai/kling-video/o1/video-to-video/reference",
};

// Crée un personnage Sora à partir d'une courte vidéo et renvoie son
// identifiant (format char_...), à réutiliser dans chaque plan.
export async function createFalCharacter(input: { name: string; videoUrl: string }) {
  const fal = createFal();
  const endpoint = "fal-ai/sora-2/characters";
  const { request_id } = await fal.queue.submit(endpoint, {
    input: { name: input.name, video_url: input.videoUrl },
  });
  // Sous le maxDuration de la page (120 s), pour que l'échec soit noté
  // plutôt que de laisser le personnage en 'pending'.
  const deadline = Date.now() + 100_000;
  for (;;) {
    const { status } = await fal.queue.status(endpoint, { requestId: request_id });
    if (status === "COMPLETED") break;
    if (Date.now() > deadline) throw new Error("Sora n'a pas répondu à temps");
    await new Promise((r) => setTimeout(r, 4000));
  }
  const { data } = await fal.queue.result(endpoint, { requestId: request_id });
  if (!data.id) throw new Error("Sora n'a pas renvoyé d'identifiant de personnage");
  return data.id;
}

export async function createFalTextVideo(input: {
  videoModel: VideoModelId;
  aspectRatio: AspectRatio;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  seed?: number;
  // Personnage Sora réutilisé d'un plan à l'autre.
  soraCharacterId?: string;
  // Vidéo de référence du créateur (Kling O1 Référence).
  referenceVideoUrl?: string;
}) {
  const fal = createFal();
  const duration = String(input.durationSeconds);

  // La vidéo de référence porte la direction visuelle : pas de consigne de
  // rendu « caméra ordinaire » ici, elle la contredirait.
  if (input.videoModel === "kling-o1-ref") {
    if (!input.referenceVideoUrl) throw new Error("Vidéo de référence manquante");
    const { request_id } = await fal.queue.submit(
      "fal-ai/kling-video/o1/video-to-video/reference",
      {
        input: {
          prompt: `Use @Video1 only as the reference for the visual style: reproduce its camera work and camera speed, the speed and energy of movement, the framing, the lighting, the colour grading and the image texture, as if the new shot was filmed by the same crew. Do not copy the people, objects, place, text or story of @Video1. No readable text, logos or brand names anywhere in the frame. New shot: ${input.prompt}`,
          video_url: input.referenceVideoUrl,
          aspect_ratio: input.aspectRatio,
          duration: duration as "5",
          keep_audio: false,
        },
      },
    );
    return `fal:text:${input.videoModel}:${request_id}`;
  }

  const prompt = [
    input.prompt,
    "Real footage: handheld camera with slight natural shake, natural available light, lifelike speed and weight of movement, no slow motion, no cinematic colour grading.",
  ].join(" ");
  const seed = input.seed !== undefined ? { seed: input.seed } : {};

  // Chaque modèle a ses propres champs : Seedance ne prend pas de prompt
  // négatif, Kling ne prend pas de définition.
  let request_id: string;
  switch (input.videoModel) {
    // Sora 2 génère aussi le son, et prend la durée en nombre.
    case "sora-2":
      ({ request_id } = await fal.queue.submit(FAL_TEXT_VIDEO_ENDPOINTS["sora-2"] as "fal-ai/sora-2/text-to-video", {
        input: {
          prompt,
          aspect_ratio: input.aspectRatio === "16:9" ? "16:9" : "9:16",
          duration: input.durationSeconds as unknown as "8",
          // L'API attend characters[].id, pas character_ids.
          ...(input.soraCharacterId && {
            characters: [{ id: input.soraCharacterId }],
          }),
        } as unknown as Parameters<typeof fal.queue.submit<"fal-ai/sora-2/text-to-video">>[1]["input"],
      }));
      break;
    case "seedance-lite":
    case "seedance-1.5":
      ({ request_id } = await fal.queue.submit(
        FAL_TEXT_VIDEO_ENDPOINTS[input.videoModel] as "fal-ai/bytedance/seedance/v1/lite/text-to-video",
        {
          input: {
            prompt,
            aspect_ratio: input.aspectRatio,
            duration: duration as "5",
            resolution: input.videoModel === "seedance-lite" ? "720p" : "1080p",
            ...seed,
          },
        },
      ));
      break;
    case "wan-2.7":
      ({ request_id } = await fal.queue.submit(FAL_TEXT_VIDEO_ENDPOINTS["wan-2.7"] as "fal-ai/wan-25-preview/text-to-video", {
        input: {
          prompt,
          negative_prompt: input.negativePrompt,
          aspect_ratio: input.aspectRatio,
          duration: duration as "5",
          ...seed,
        },
      }));
      break;
    default:
      ({ request_id } = await fal.queue.submit(
        FAL_TEXT_VIDEO_ENDPOINTS[input.videoModel] as "fal-ai/kling-video/v3/pro/text-to-video",
        {
          input: {
            prompt,
            negative_prompt: input.negativePrompt,
            aspect_ratio: input.aspectRatio === "1:1" ? "1:1" : input.aspectRatio,
            duration: duration as "5",
          },
        },
      ));
  }
  return `fal:text:${input.videoModel}:${request_id}`;
}

// Endpoint fal de chaque modèle vidéo (voir VIDEO_MODELS).
const FAL_VIDEO_ENDPOINTS = {
  ...FAL_DIRECT_VIDEO_ENDPOINTS,
  "kling-2.5": "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
  "seedance-1.5": "fal-ai/bytedance/seedance/v1.5/pro/image-to-video",
  "kling-3": "fal-ai/kling-video/v3/pro/image-to-video",
  "kling-o1-ref": "fal-ai/kling-video/o1/video-to-video/reference",
} as const satisfies Record<VideoModelId, string>;

// Plans muets : le son sera ajouté au montage. `endImageUrl` (image de fin,
// Kling 3 et Seedance) garantit un mouvement ample sur toute la durée.
export async function createFalShotVideo(input: {
  videoModel: VideoModelId;
  aspectRatio: AspectRatio;
  imageUrl: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  endImageUrl?: string;
}) {
  const fal = createFal();
  const duration = input.durationSeconds === 10 ? "10" : "5";
  let request_id: string;
  switch (input.videoModel) {
    case "kling-2.5":
      ({ request_id } = await fal.queue.submit(FAL_VIDEO_ENDPOINTS["kling-2.5"], {
        input: {
          image_url: input.imageUrl,
          prompt: input.prompt,
          negative_prompt: input.negativePrompt,
          duration,
        },
      }));
      break;
    case "kling-3":
      ({ request_id } = await fal.queue.submit(FAL_VIDEO_ENDPOINTS["kling-3"], {
        input: {
          start_image_url: input.imageUrl,
          prompt: input.prompt,
          negative_prompt: input.negativePrompt,
          duration,
          generate_audio: false,
          ...(input.endImageUrl && { end_image_url: input.endImageUrl }),
        },
      }));
      break;
    case "seedance-1.5":
      ({ request_id } = await fal.queue.submit(FAL_VIDEO_ENDPOINTS["seedance-1.5"], {
        input: {
          image_url: input.imageUrl,
          prompt: input.prompt,
          duration,
          // Sans format explicite, Seedance rend en 16:9 quelle que soit l'image.
          aspect_ratio: input.aspectRatio,
          resolution: "1080p",
          generate_audio: false,
          ...(input.endImageUrl && { end_image_url: input.endImageUrl }),
        },
      }));
      break;
    default:
      // Les modèles en vidéo directe passent par createFalDirectVideo.
      throw new Error(`Modèle vidéo sans image de départ : ${input.videoModel}`);
  }
  return `fal:video:${input.videoModel}:${request_id}`;
}

// ---------------------------------------------------------------------------
// Remplacement de personnage
// ---------------------------------------------------------------------------

// Wan Animate Replace : la personne du clip est rendue sous les traits du
// personnage de l'image, avec ses mouvements, le décor et la lumière du clip.
// Les coups, chutes, etc. viennent du clip filmé : rien à décrire au modèle.
const FAL_SWAP_ENDPOINT = "fal-ai/wan/v2.2-14b/animate/replace";

export async function createFalSwap(input: { videoUrl: string; imageUrl: string }) {
  const { request_id } = await createFal().queue.submit(FAL_SWAP_ENDPOINT, {
    input: {
      video_url: input.videoUrl,
      image_url: input.imageUrl,
      resolution: "720p",
      video_quality: "high",
    },
  });
  return `fal:swap:${request_id}`;
}

// "fal:ref:<modèle>:<id>", "fal:text:<modèle>:<id>", "fal:video:<modèle>:<id>",
// "fal:swap:<id>"
// ou, avant le choix du modèle, "fal:video:<id>" (Kling 2.5).
function parseFalId(id: string) {
  const parts = id.split(":");
  if (parts[1] === "swap") {
    return { endpoint: FAL_SWAP_ENDPOINT, kind: "video", requestId: parts[2] };
  }
  if (parts[1] === "text") {
    const endpoint = FAL_TEXT_VIDEO_ENDPOINTS[parts[2] as VideoModelId];
    if (!endpoint) throw new Error(`Modèle vidéo fal inconnu : ${id}`);
    return { endpoint, kind: "video", requestId: parts[3] };
  }
  if (parts[1] === "ref") {
    const endpoint = FAL_REFERENCE_MODELS[parts[2] as ImageModelId];
    if (!endpoint) throw new Error(`Modèle d'image fal inconnu : ${id}`);
    return { endpoint, kind: "image", requestId: parts[3] };
  }
  const model = findVideoModel(parts.length === 4 ? parts[2] : DEFAULT_VIDEO_MODEL);
  if (!model) throw new Error(`Modèle vidéo fal inconnu : ${id}`);
  return { endpoint: FAL_VIDEO_ENDPOINTS[model.id], kind: "video", requestId: parts[parts.length - 1] };
}

// État d'une requête fal.
export async function getFalPrediction(id: string): Promise<PredictionState> {
  const { endpoint, kind, requestId } = parseFalId(id);
  const fal = createFal();

  const { status } = await fal.queue.status(endpoint, { requestId });
  if (status !== "COMPLETED") {
    return { id, status: status === "IN_QUEUE" ? "starting" : "processing", output: null };
  }

  let url: string | undefined;
  let refused = false;
  try {
    const { data } = await fal.queue.result(endpoint, { requestId });
    const output = data as { video?: { url?: string }; images?: { url?: string }[] };
    url = kind === "video" ? output.video?.url : output.images?.[0]?.url;
  } catch (e) {
    // Une requête terminée en erreur répond par une erreur d'API : filtre de
    // contenu, entrée refusée… Le détail aide à comprendre les échecs.
    if (!(e instanceof ApiError)) throw e;
    console.error("fal", endpoint, e.status, JSON.stringify(e.body).slice(0, 500));
    refused = isContentRefused(e);
  }
  const done: PredictionStatus = url ? "succeeded" : "failed";
  return { id, status: done, output: url ?? null, refused };
}
