import "server-only";
import { ApiError, createFalClient } from "@fal-ai/client";
import { describeTarget } from "@/lib/higgsfield";
import {
  isContentRefused,
  isOutOfCredit,
  type PredictionState,
  type PredictionStatus,
} from "@/lib/predictions";

// fal.ai : fiche du personnage et images clés (Nano Banana Pro), et moteur
// kling du remplacement (Kling O3 Pro Edit). Les identifiants de requête sont
// stockés préfixés ("fal:ref:nano-banana-pro:<id>", "fal:swap:<id>") : le
// préfixe dit comment les suivre. fal n'a pas de webhook ici : ses requêtes
// avancent par le suivi du studio (getGeneration).

export function falEnabled() {
  return Boolean(process.env.FAL_KEY);
}

function createFal() {
  const credentials = process.env.FAL_KEY;
  if (!credentials) throw new Error("FAL_KEY manquant");
  return createFalClient({ credentials });
}

const FAL_IMAGE_ENDPOINT = "fal-ai/nano-banana-pro/edit";

// La personne du clip est rendue sous les traits du personnage, avec ses
// mouvements, le décor et la lumière du clip : les coups, chutes, etc.
// viennent du clip filmé, rien à décrire au modèle. Kling O3 Pro Edit : meilleur que O1 et que Wan Animate au même prix
// (0,168 $ la seconde), comparés sur le même clip le 2026-09-18.
const FAL_SWAP_ENDPOINT = "fal-ai/kling-video/o3/pro/video-to-video/edit";

// Kling (O1, O3) ne sait pas télécharger les URLs signées de Supabase
// ("Failed to load video") : les fichiers qu'il reçoit passent par le
// stockage de fal.
export async function uploadToFal(data: Buffer | ArrayBuffer, contentType: string) {
  return createFal().storage.upload(new Blob([new Uint8Array(data as ArrayBuffer)], { type: contentType }));
}

// Fiche personnage : à partir de l'image déposée, le personnage debout en
// posture humaine, de face puis de trois quarts. Un animal à quatre pattes
// recopié tel quel reste planté sur ses pattes au lieu de suivre les gestes
// de la personne remplacée ; debout, il les reprend (tête d'animal sur un
// corps qui bouge comme celui d'un humain). Deux angles gardent cette
// silhouette stable d'un plan à l'autre.
export async function createFalCharacterSheet(imageUrl: string) {
  const fal = createFal();
  const { data: front } = await fal.subscribe(FAL_IMAGE_ENDPOINT, {
    input: {
      prompt:
        "Photorealistic full-body picture of this exact same character, same head, face, colours and skin, fur or surface. If it is an animal or a creature, it now stands upright on its hind legs with a human posture: straight back, two arms hanging at its sides with paws or hands, like an anthropomorphic athlete, keeping its natural animal head and fur. If it is a person, keep them as they are. Facing the camera, neutral pose, plain light grey background, soft even light.",
      image_urls: [imageUrl],
      aspect_ratio: "3:4",
    },
  });
  const frontUrl = front.images[0]?.url;
  if (!frontUrl) return null;
  const { data: side } = await fal.subscribe(FAL_IMAGE_ENDPOINT, {
    input: {
      prompt:
        "The same character, identical head, face, fur or skin, body and clothing, in the same upright posture, now seen from a three-quarter angle, full body, same plain light grey background and lighting.",
      image_urls: [frontUrl],
      aspect_ratio: "3:4",
    },
  });
  return { frontUrl, sideUrl: side.images[0]?.url };
}

// Formats d'image acceptés par Nano Banana Pro.
const KEYFRAME_RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;

function nearestKeyframeRatio(width: number, height: number) {
  const value = (r: string) => {
    const [w, h] = r.split(":").map(Number);
    return w / h;
  };
  return KEYFRAME_RATIOS.reduce((best, r) =>
    Math.abs(Math.log(value(r) / (width / height))) < Math.abs(Math.log(value(best) / (width / height)))
      ? r
      : best,
  );
}

// Image clé d'un plan : sa première image, la personne remplacée par le
// personnage de la fiche. Une image fixe se contrôle et se garde cohérente
// bien plus facilement qu'une vidéo : Kling part ensuite de cette image
// (voir createFalSwap). `anchorUrl` : image clé du premier plan, pour que le
// personnage soit le même dans toute la vidéo.
export async function createFalSwapKeyframe(input: {
  firstFrameUrl: string;
  width: number;
  height: number;
  frontUrl: string;
  sideUrl?: string;
  anchorUrl?: string;
  target?: string;
}) {
  const target = describeTarget(input.target);
  const references = [input.frontUrl, input.sideUrl, input.anchorUrl].filter(
    (u): u is string => Boolean(u),
  );
  const { request_id } = await createFal().queue.submit(FAL_IMAGE_ENDPOINT, {
    input: {
      prompt: [
        `Edit the first image only: replace ${target} with the character shown in the next reference images (same head, face, fur or skin and body shape).`,
        input.anchorUrl
          ? "The last reference image shows this character in an earlier shot of the same video: it must look exactly the same."
          : "",
        "Keep exactly the same pose, gestures, position and size in the frame, facing direction and clothing as the replaced person. Keep the camera framing, crop, background, every other person, objects and lighting of the first image strictly unchanged. Photorealistic, same image quality as the first image.",
      ]
        .filter(Boolean)
        .join(" "),
      image_urls: [input.firstFrameUrl, ...references],
      aspect_ratio: nearestKeyframeRatio(input.width, input.height),
      output_format: "png",
    },
  });
  return `fal:ref:nano-banana-pro:${request_id}`;
}

// Un plan de 3 à 10 s (voir swap.ts), rendu à partir de son image clé.
// `target` : qui remplacer quand plusieurs personnes sont à l'image.
export async function createFalSwap(input: {
  videoUrl: string;
  frontUrl: string;
  sideUrl?: string;
  keyframeUrl: string;
  anchorUrl?: string;
  target?: string;
}) {
  const target = describeTarget(input.target);
  const anchor = input.anchorUrl && input.anchorUrl !== input.keyframeUrl;
  const { request_id } = await createFal().queue.submit(FAL_SWAP_ENDPOINT, {
    input: {
      prompt: [
        `Replace ${target} with @Element1, exactly as it appears in @Image1, which is the first frame of the result: same head, face, fur or skin, body and clothing.`,
        anchor ? "@Image2 shows the same character in another shot of this video: it must look identical." : "",
        "It performs exactly the same movements, gestures and head turns as the replaced person, with the same timing, posture, contact and weight, through the whole shot. Its hands or paws keep the same natural look as in @Image1. Keep every other person, the place, the camera and its moves, the lighting, the framing and everything else exactly unchanged.",
      ]
        .filter(Boolean)
        .join(" "),
      video_url: input.videoUrl,
      elements: [
        {
          frontal_image_url: input.frontUrl,
          reference_image_urls: [input.sideUrl ?? input.frontUrl],
        },
      ],
      image_urls: anchor ? [input.keyframeUrl, input.anchorUrl!] : [input.keyframeUrl],
      keep_audio: true,
    },
  });
  return `fal:swap:${request_id}`;
}

// "fal:ref:nano-banana-pro:<id>" (image) ou "fal:swap:<id>" (vidéo).
function parseFalId(id: string) {
  const parts = id.split(":");
  if (parts[1] === "swap") {
    return { endpoint: FAL_SWAP_ENDPOINT, kind: "video", requestId: parts[2] };
  }
  if (parts[1] === "ref") {
    return { endpoint: FAL_IMAGE_ENDPOINT, kind: "image", requestId: parts[3] };
  }
  throw new Error(`Requête fal inconnue : ${id}`);
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
  let outOfCredit = false;
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
    // Compte fal bloqué (« User is locked. Reason: TOP_UP ») : même un rendu
    // terminé ne se récupère plus.
    outOfCredit = isOutOfCredit(e);
  }
  const done: PredictionStatus = url ? "succeeded" : "failed";
  return { id, status: done, output: url ?? null, refused, outOfCredit };
}
