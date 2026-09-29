import "server-only";
import type { PredictionState } from "@/lib/predictions";

// Higgsfield : Genjutsu, le moteur « qualité maximale » du remplacement de
// personnage (voir swap.ts). API REST appelée directement : le SDK officiel
// retente tout seul la création d'une requête, au risque de la payer deux fois.
const BASE_URL = "https://api.higgsfield.ai";

// Genjutsu Object Swap remplace un élément du clip et garde le reste : jeu,
// caméra, coupes et mouvements de bouche sont repris du clip. 0,681 $ la
// seconde en 720p, 1,632 $ en 1080p (vérifié le 2026-09-26), durée du clip
// arrondie à la seconde supérieure. L'identifiant officiel s'écrit bien
// « higgsfiled ».
const GENJUTSU_SWAP_ENDPOINT = "higgsfiled/genjutsu/object-swap/v1.0";
// Motion Transfer : même schéma, même prix, mais la scène entière est
// refabriquée à partir des références — c'est ce qui permet de poser le clip
// dans un autre décor (photo du lieu en dernière référence). Utilisé
// seulement quand un décor est demandé : sans décor, Object Swap préserve
// mieux le clip d'origine. Testé le 2026-09-28.
const GENJUTSU_TRANSFER_ENDPOINT = "higgsfiled/genjutsu/motion-transfer/v1.0";

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

// Méthode du mannequin, la seule du site : une première passe remplace
// chaque personne visée par un mannequin neutre, puis la passe des
// personnages remplace ces mannequins. Rien des personnes d'origine (traits,
// tenue) ne bave dans le rendu final. Chaque personne reçoit un mannequin
// d'une couleur à elle, pour que la seconde passe sache lequel devient quel
// personnage ; sa silhouette (homme, femme) suit celle du personnage.
// Planches dans swap-inputs, générées par scripts/vessel.mjs --sheet-only.
export type MannequinFigure = "homme" | "femme";
export type MannequinColor = "grey" | "navy" | "sand";
// Couleur du mannequin de chaque personnage, dans l'ordre.
export const MANNEQUIN_COLORS: MannequinColor[] = ["grey", "navy", "sand"];
const MANNEQUIN_CLOTH: Record<MannequinColor, { cloth: string; word: string; suffix: string }> = {
  grey: { cloth: "matte mid-grey", word: "grey", suffix: "" },
  navy: { cloth: "matte deep navy-blue", word: "navy-blue", suffix: "-navy" },
  sand: { cloth: "matte light sand-beige", word: "sand-beige", suffix: "-sand" },
};

export function mannequinSheetPath(figure: MannequinFigure, color: MannequinColor) {
  return `presets/_mannequin-sheet-${figure === "femme" ? "f" : "m"}${MANNEQUIN_CLOTH[color].suffix}.png`;
}

// Qui la passe des personnages remplace, une fois le mannequin posé.
export function mannequinTarget(color: MannequinColor) {
  const { word } = MANNEQUIN_CLOTH[color];
  return `the person in the plain ${word} t-shirt and ${word} trousers`;
}

function mannequinDescription(figure: MannequinFigure, color: MannequinColor) {
  const { cloth, word } = MANNEQUIN_CLOTH[color];
  return figure === "femme"
    ? `a plain adult woman in a ${cloth} fitted t-shirt, ${word} trousers and ${word} sneakers, dark hair tied back in a low bun, no accessories`
    : `a plain adult man in a ${cloth} fitted t-shirt, ${word} trousers and ${word} sneakers, very short hair, no accessories`;
}

// Consigne de la passe mannequin : une personne ou plusieurs, chacune avec
// son mannequin (image de référence n, dans l'ordre).
function mannequinPrompt(people: { figure: MannequinFigure; color: MannequinColor; target?: string }[]) {
  const several = people.length > 1;
  const blocks = people.map((p, i) => {
    const image = several ? `reference image ${i + 1}` : "the reference image";
    return (
      `${several ? `FIGURE ${i + 1}` : "CHARACTER"} — Replace ${describeTarget(p.target)} with the neutral stand-in figure shown in ${image} (${mannequinDescription(p.figure, p.color)}). ` +
      "Match its plain clothing, hairstyle, neutral face and skin exactly as shown. " +
      "Preserve this original person's exact actions, rhythm, posture, head movements, hand gestures, gaze, facial expressions and lip-sync throughout the entire video; do not add a smile or extra mouth movement."
    );
  });
  return [
    several
      ? `STRICT CHARACTER AND WARDROBE REPLACEMENT — ${people.length} REFERENCES. Edit the uploaded source video: ${people.length} different people are each replaced by their own neutral stand-in figure, each in a different plain colour. Each reference image shows multiple views of ONE figure, not multiple figures.`
      : "STRICT CHARACTER AND WARDROBE REPLACEMENT. Edit the uploaded source video: one person is replaced by the neutral stand-in figure shown in the reference image. The reference image shows multiple views of ONE figure, not multiple figures.",
    "SOURCE PRIORITY — The source video controls all movement, performance, lip-sync, facial expressions, gaze, gestures, interactions, body positions, camera movement, framing, editing and timing. The reference images control only the figures' identity: face, hair, skin, body proportions and clothing.",
    ...blocks,
    several
      ? "PERMANENT IDENTITY ASSIGNMENT — Bind each figure to its original person for the full clip, through turns, profile views, back views, motion blur, overlap and temporary occlusion. Never swap figures between people, never blend faces and never transfer gestures to another person."
      : "PERMANENT IDENTITY ASSIGNMENT — Bind the figure to that original person for the full clip, through turns, profile views, back views, motion blur and temporary occlusion. Never blend faces or transfer gestures to another person.",
    "ENVIRONMENT AND INTEGRATION — Keep the original background, set, objects, every other person, lighting, shadows, perspective and composition exactly unchanged. Keep the original duration, aspect ratio, cuts and playback speed. Do not copy the reference images' backgrounds, panel layouts, borders, labels or static poses into the output.",
    `FINAL RESULT — The same source video and the same performance${several ? "s" : ""}, with only ${several ? "these people's" : "this person's"} identity, hair and clothing replaced by ${several ? "their" : "the"} neutral stand-in figure${several ? "s" : ""}.`,
  ].join("\n\n");
}

// Consigne Genjutsu, en blocs titrés : la vidéo source commande tout le jeu,
// les références commandent l'identité ; chaque personne remplacée est liée à
// son personnage pour tout le clip ; la scène reste intacte ; la planche de
// référence (fond, cases, légendes) ne doit jamais entrer dans l'image.
// Plusieurs personnages : les images de référence sont envoyées à la suite,
// personnage par personnage ; la consigne dit lesquelles montrent qui.
function genjutsuPrompt(
  characters: { imageUrls: string[]; target?: string }[],
  decor = false,
  // Consignes libres du créateur, déjà en anglais impératif (voir
  // polishSwapInstructions) : changements en plus du remplacement.
  instructions?: string,
) {
  const several = characters.length > 1;
  let next = 1;
  const blocks = characters.map((c, i) => {
    const first = next;
    next += c.imageUrls.length;
    const images = several
      ? c.imageUrls.length > 1
        ? `reference images ${first} to ${next - 1}`
        : `reference image ${first}`
      : "the reference images";
    const title = several ? `CHARACTER ${i + 1}` : "CHARACTER";
    return (
      `${title} — Replace ${describeTarget(c.target)} with the character shown in ${images}. ` +
      `Match that character's face, age, skin or fur, hairstyle and hair colour, body proportions, clothing and accessories exactly as shown in ${images}. ` +
      "Preserve this original person's exact actions, rhythm, posture, head movements, hand gestures, gaze, facial expressions and lip-sync throughout the entire video; do not add a smile or extra mouth movement."
    );
  });
  // Décor : la dernière image de référence est une photo du lieu, la scène
  // est reconstruite dedans (endpoint Motion Transfer) au lieu d'être gardée.
  const setting = decor ? " The setting is also replaced by the location shown in the FINAL reference image." : "";
  return [
    several
      ? `STRICT CHARACTER AND WARDROBE REPLACEMENT — ${characters.length} REFERENCES. Edit the uploaded source video: ${characters.length} different people are each replaced by their own character.${setting} Each group of reference images shows multiple views of ONE character, not multiple characters.`
      : `STRICT CHARACTER AND WARDROBE REPLACEMENT. Edit the uploaded source video: one person is replaced by the character shown in the reference images.${setting} The reference images show multiple views of ONE character, not multiple characters.`,
    `SOURCE PRIORITY — The source video controls all movement, performance, lip-sync, facial expressions, gaze, gestures, interactions, body positions, camera movement, framing, editing and timing. The reference images control only the replacement character's identity: face, hairstyle, skin or fur, body proportions, clothing and accessories.${decor ? " The final reference image controls only the environment." : ""}`,
    ...blocks,
    ...(instructions
      ? [
          `REQUESTED CHANGES — Also apply these changes asked by the creator: ${instructions} Apply them faithfully; everything they do not cover follows the other rules.`,
        ]
      : []),
    several
      ? "PERMANENT IDENTITY ASSIGNMENT — Bind each replacement to its original person for the full clip, even when they turn, move, overlap or appear in different framing. Never swap identities, blend faces, exchange outfits or transfer one person's gestures to another. Maintain each identity through profile views, back views, motion blur and temporary occlusion."
      : "PERMANENT IDENTITY ASSIGNMENT — Bind the replacement to that original person for the full clip, even when they turn, move, overlap with others or appear in different framing. Never blend faces or transfer gestures to another person. Maintain the identity through profile views, back views, motion blur and temporary occlusion.",
    "EXACT SOURCE PERFORMANCE — Reproduce the existing performance moment by moment. Keep every gesture, pause, mouth movement, head turn, body sway and interaction at its original time and speed. Preserve every camera movement and every cut exactly where they occur. Keep the original duration, aspect ratio and playback speed. Do not introduce new choreography, poses, reactions, camera angles, cuts, slow motion or additional people.",
    decor
      ? "ENVIRONMENT AND INTEGRATION — Rebuild the whole scene inside the location shown in the FINAL reference image. Keep the original framing, camera distance, camera movement and cuts, but the walls, ground, furniture, objects and depth of the shot now belong to that location; do not keep any element of the original set. Light the characters consistently with that location's lighting, with natural fabric motion, accurate contact shadows and consistent positioning. Do not copy the reference images' panel layouts, borders, labels, captions or static poses into the output."
      : `ENVIRONMENT AND INTEGRATION — ${instructions ? "Apart from the REQUESTED CHANGES, keep" : "Keep"} the original background, set, objects, every other person, lighting, shadows, perspective and composition from the source video. Adapt the replacement character and clothing to the original scene's lighting and movement, with natural fabric motion, accurate contact shadows and consistent positioning. Do not copy the reference images' backgrounds, panel layouts, borders, labels, captions or static poses into the output.`,
    several
      ? `FINAL RESULT — The same ${decor ? "performances and camera work as the source video, played inside the location from the final reference image" : "source video and the same performances"}, with only the replaced people's identities, hairstyles, clothing and accessories changed according to their assigned reference images.`
      : `FINAL RESULT — The same ${decor ? "performance and camera work as the source video, played inside the location from the final reference image" : "source video and the same performance"}, with only this person's identity, hairstyle, clothing and accessories replaced according to the reference images.`,
  ].join("\n\n");
}

// Un passage de 4 à 30 s, coupes comprises. Les images sont les photos du
// personnage déposées par le créateur (8 au plus, tous personnages confondus).
// `webhookUrl` : Higgsfield y signale la fin du rendu (paramètre
// hf_webhook), pour que la vidéo avance sans page ouverte (voir
// /api/swap/webhook). `target` : qui remplacer quand
// plusieurs personnes sont à l'image. Un seul envoi, jamais retenté ici, et
// borné bien en dessous du verrou d'advanceSwap : un envoi qui traîne échoue
// dans le verrou au lieu d'être doublé par le suivi suivant.
export async function createGenjutsuSwap(input: {
  videoUrl: string;
  // Un personnage, ou plusieurs (chacun avec qui il remplace).
  characters: { imageUrls: string[]; target?: string }[];
  // Photo du lieu (déjà chez Higgsfield) : la scène est reconstruite dans ce
  // décor, via Motion Transfer. Absente : Object Swap, décor du clip gardé.
  decorUrl?: string;
  // Consignes libres du créateur, en anglais (voir polishSwapInstructions).
  instructions?: string;
  // Passe mannequin : chaque personne visée devient le mannequin dont la
  // planche est dans `characters` (même ordre) ; décor et consignes
  // attendent la passe des personnages.
  mannequins?: { figure: MannequinFigure; color: MannequinColor }[];
  hd?: boolean;
  webhookUrl?: string;
}) {
  const hook = input.webhookUrl ? `?hf_webhook=${encodeURIComponent(input.webhookUrl)}` : "";
  if (input.mannequins) {
    const response = await fetch(`${BASE_URL}/${GENJUTSU_SWAP_ENDPOINT}${hook}`, {
      method: "POST",
      headers: headers(),
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        prompt: mannequinPrompt(
          input.mannequins.map((m, i) => ({ ...m, target: input.characters[i]?.target })),
        ),
        // Une planche par mannequin, dans l'ordre des personnes.
        image_urls: input.characters.map((c) => c.imageUrls[0]).filter(Boolean),
        video_url: input.videoUrl,
        resolution: input.hd ? "1080p" : "720p",
      }),
    });
    if (!response.ok) throw await failure("création", response);
    const { request_id } = (await response.json()) as { request_id?: string };
    if (!request_id) throw new Error("Higgsfield création : réponse sans identifiant");
    return `hf:swap:${request_id}`;
  }
  const endpoint = input.decorUrl ? GENJUTSU_TRANSFER_ENDPOINT : GENJUTSU_SWAP_ENDPOINT;
  // 8 images au plus ; le décor prend la dernière place (le prompt le désigne
  // comme la dernière image).
  const characterUrls = input.characters
    .flatMap((c) => c.imageUrls)
    .slice(0, input.decorUrl ? 7 : 8);
  const response = await fetch(`${BASE_URL}/${endpoint}${hook}`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      prompt: genjutsuPrompt(input.characters, Boolean(input.decorUrl), input.instructions),
      video_url: input.videoUrl,
      image_urls: input.decorUrl ? [...characterUrls, input.decorUrl] : characterUrls,
      resolution: input.hd ? "1080p" : "720p",
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
