import "server-only";
import type { PredictionState } from "@/lib/predictions";

// Higgsfield : Genjutsu, le moteur « qualité maximale » du remplacement de
// personnage (voir swap.ts). API REST appelée directement : le SDK officiel
// retente tout seul la création d'une requête, au risque de la payer deux fois.
const BASE_URL = "https://api.higgsfield.ai";

// Genjutsu Object Swap remplace un élément du clip et garde le reste : jeu,
// caméra, coupes et mouvements de bouche sont repris du clip. 0,681 $ la
// seconde en 720p (maximum par l'API), durée du clip arrondie à la seconde
// supérieure. L'identifiant officiel s'écrit bien « higgsfiled ».
const GENJUTSU_SWAP_ENDPOINT = "higgsfiled/genjutsu/object-swap/v1.0";

// HF_CREDENTIALS : "identifiant:secret" de la clé (console.higgsfield.ai).
export function higgsfieldEnabled() {
  return Boolean(process.env.HF_CREDENTIALS);
}

function headers() {
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials) throw new Error("HF_CREDENTIALS manquant");
  return { Authorization: `Key ${credentials}`, "Content-Type": "application/json" };
}

// Les erreurs ne reprennent que le statut et le début de la réponse, jamais
// la requête (elle porte la clé).
async function failure(step: string, response: Response) {
  const body = await response.text().catch(() => "");
  return Object.assign(new Error(`Higgsfield ${step} : ${response.status} ${body.slice(0, 300)}`), {
    status: response.status,
  });
}

// Dépose un fichier dans le stockage temporaire de Higgsfield et renvoie son
// URL publique, à passer à un modèle.
export async function uploadToHiggsfield(data: Buffer | ArrayBuffer, contentType: string) {
  const response = await fetch(`${BASE_URL}/files/generate-upload-url`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ content_type: contentType }),
  });
  if (!response.ok) throw await failure("envoi", response);
  const target = (await response.json()) as {
    public_url: string;
    upload_url: string;
    upload_headers?: Record<string, string>;
  };
  const put = await fetch(target.upload_url, {
    method: "PUT",
    headers: target.upload_headers ?? { "Content-Type": contentType },
    body: new Blob([new Uint8Array(data as ArrayBuffer)], { type: contentType }),
  });
  if (!put.ok) throw await failure("dépôt", put);
  return target.public_url;
}

// Qui remplacer, tel que le créateur l'a écrit (souvent en français, parfois
// sous forme d'ordre : « remplace l'homme torse nu ») : cité tel quel plutôt
// que glissé dans la phrase, pour que le modèle le lise comme une description.
export function describeTarget(target?: string) {
  const text = target?.trim().replace(/"/g, "'");
  return text ? `the person described as "${text}"` : "the main person";
}

// Consigne Genjutsu. Plusieurs personnages : les images de référence sont
// envoyées à la suite, personnage par personnage ; la consigne dit lesquelles
// montrent qui, et qui chacun remplace.
function genjutsuPrompt(characters: { imageUrls: string[]; target?: string }[]) {
  const rest =
    "Keep every other person, the place, the objects, the camera framing and its moves, the cuts and the lighting exactly unchanged. Add nothing to the scene.";
  if (characters.length <= 1) {
    return (
      `Replace ${describeTarget(characters[0]?.target)} with the character shown in the reference images (every reference image shows the same character): same head, face, fur or skin and body. ` +
      "It reproduces exactly the movements, gestures, head turns, facial expressions and mouth movements of the replaced person, with the same timing, posture, contact and weight, in every shot. " +
      rest
    );
  }
  let next = 1;
  const lines = characters.map((c, i) => {
    const first = next;
    next += c.imageUrls.length;
    const images =
      c.imageUrls.length > 1 ? `reference images ${first} to ${next - 1}` : `reference image ${first}`;
    return `Character ${i + 1}, shown in ${images}, replaces ${describeTarget(c.target)}.`;
  });
  return (
    `Replace ${characters.length} different people in this video, each with their own character. ` +
    lines.join(" ") +
    " Each character keeps its own head, face, fur or skin and body exactly as in its reference images, never mixed with another character. " +
    "Each one reproduces exactly the movements, gestures, head turns, facial expressions and mouth movements of the person it replaces, with the same timing, posture, contact and weight, in every shot. " +
    rest
  );
}

// Un passage de 3 à 30 s, coupes comprises. Les images montrent toutes le
// même personnage, sur fond uni et sans accessoire : tout objet d'une image
// de référence se retrouve dans la scène. `target` : qui remplacer quand
// plusieurs personnes sont à l'image. Un seul envoi, jamais retenté ici, et
// borné bien en dessous du verrou d'advanceSwap : un envoi qui traîne échoue
// dans le verrou au lieu d'être doublé par le suivi suivant.
export async function createGenjutsuSwap(input: {
  videoUrl: string;
  // Un personnage, ou plusieurs (chacun avec qui il remplace).
  characters: { imageUrls: string[]; target?: string }[];
}) {
  const response = await fetch(`${BASE_URL}/${GENJUTSU_SWAP_ENDPOINT}`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      prompt: genjutsuPrompt(input.characters),
      video_url: input.videoUrl,
      image_urls: input.characters.flatMap((c) => c.imageUrls),
      resolution: "720p",
    }),
  });
  if (!response.ok) throw await failure("création", response);
  const { request_id } = (await response.json()) as { request_id?: string };
  if (!request_id) throw new Error("Higgsfield création : réponse sans identifiant");
  return `hf:swap:${request_id}`;
}

// État d'une requête Higgsfield ("hf:swap:<id>"). Une requête « failed » ou
// « nsfw » n'est pas facturée par Higgsfield.
export async function getHiggsfieldPrediction(id: string): Promise<PredictionState> {
  const requestId = id.split(":")[2];
  const response = await fetch(`${BASE_URL}/requests/${requestId}/status`, { headers: headers() });
  if (!response.ok) {
    // Panne passagère : on redemandera au prochain suivi.
    if (response.status >= 500 || response.status === 429) {
      return { id, status: "processing", output: null };
    }
    throw await failure("suivi", response);
  }
  const body = (await response.json()) as {
    status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";
    video?: { url?: string };
    error?: unknown;
  };
  if (body.status === "queued") return { id, status: "starting", output: null };
  if (body.status === "in_progress") return { id, status: "processing", output: null };
  if (body.status === "completed" && body.video?.url) {
    return { id, status: "succeeded", output: body.video.url };
  }
  const error =
    typeof body.error === "string" ? body.error : body.error ? JSON.stringify(body.error) : "";
  if (error) console.error("higgsfield", requestId, body.status, error.slice(0, 300));
  return {
    id,
    status: "failed",
    output: null,
    refused: body.status === "nsfw",
    // Solde du compte Higgsfield épuisé : le refus arrive ici, ou en 403 dès
    // la création (voir swap.ts).
    outOfCredit: /credit balance/i.test(error),
    error: error.slice(0, 200) || undefined,
  };
}
