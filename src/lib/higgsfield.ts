import "server-only";
import { RESTYLE_MAX_IMAGES, type GenjutsuModel, type SwapQuality } from "@/lib/generation";
import type { PredictionState } from "@/lib/predictions";

// Higgsfield : Genjutsu, le moteur « qualité maximale » du remplacement de
// personnage (voir swap.ts). API REST appelée directement : le SDK officiel
// retente tout seul la création d'une requête, au risque de la payer deux fois.
const BASE_URL = "https://api.higgsfield.ai";

// Les deux modes de Genjutsu, comme sur Higgsfield (vérifiés le 2026-11-08 :
// les quatre identifiants répondent). 0,681 $/s en 720p, 1,632 $/s en 1080p
// (Genjutsu Max) ; 0,10 $/s en 720p (Genjutsu Light, affiché « B-Effect »,
// 15 s lues au plus). Vidéo source 4–30 s.
// — Object Swap (onglet « Remplacer ») : remplace ce que dit le prompt et
//   garde le reste du clip (décor, caméra, jeu, coupes). Il retouche la vidéo
//   en place : un personnage de forme humaine passe, un animal reste collé
//   sur la personne ou posé à côté (chèvre, 2026-11-14 et 15).
// — Motion Transfer (onglet « Transfert ») : refabrique toute la scène à
//   partir des mouvements et des références, avec ou sans photo de lieu. Le
//   personnage prend tout le corps (animal, créature), mais le décor est
//   redessiné : c'est le mode des rendus du site Higgsfield que le créateur
//   prend pour modèle (« hf_mult_motion_control », 2026-10-15 et 16).
const GENJUTSU_ENDPOINTS = {
  max: {
    swap: "higgsfield/genjutsu/object-swap/v1.0",
    transfer: "higgsfield/genjutsu/motion-transfer/v1.0",
  },
  standard: {
    swap: "higgsfield/genjutsu-light/object-swap/v1.0",
    transfer: "higgsfield/genjutsu-light/motion-transfer/v1.0",
  },
} as const;

function genjutsuEndpoint(model: GenjutsuModel, transfer = false) {
  return GENJUTSU_ENDPOINTS[model === "standard" ? "standard" : "max"][transfer ? "transfer" : "swap"];
}

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
    // Sans copie : une vidéo de téléphone peut peser plusieurs centaines de Mo.
    body: data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength),
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

// Consigne quand les images ne montrent pas que des personnages : un objet,
// une tenue, ou seulement un nouveau lieu. Les personnages gardent leur bloc.
function referencePrompt(
  items: { imageUrls: string[]; target?: string; object?: boolean }[],
  decor: boolean,
  instructions?: string,
) {
  const several = items.length > 1;
  const hasPeople = items.some((c) => !c.object);
  let next = 1;
  const blocks = items.map((c, i) => {
    const first = next;
    next += c.imageUrls.length;
    const images = several
      ? c.imageUrls.length > 1
        ? `reference images ${first} to ${next - 1}`
        : `reference image ${first}`
      : "the reference images";
    return c.object
      ? `ELEMENT ${i + 1} — Replace ${c.target} with what is shown in ${images}. ` +
          `Match its shape, proportions, colours, materials and details exactly as shown in ${images}. ` +
          "Keep the position, scale, movement and timing of what it replaces, and keep every interaction with it: hands, contact points and reactions stay as in the source video."
      : `ELEMENT ${i + 1} — Replace ${describeTarget(c.target)} with the character shown in ${images}. ` +
          `Match that character's face, age, skin or fur, hairstyle and hair colour, body proportions, clothing and accessories exactly as shown in ${images}. ` +
          "Preserve this original person's exact actions, rhythm, posture, head movements, hand gestures, gaze, facial expressions and lip-sync throughout the entire video; do not add a smile or extra mouth movement.";
  });
  return [
    `STRICT REPLACEMENT. Edit the uploaded source video: change only what is listed here.${decor ? " The setting is replaced by the location shown in the FINAL reference image." : ""} Several reference images of one element are different views of that same element.`,
    `SOURCE PRIORITY — The source video controls all movement, performance, lip-sync, facial expressions, gaze, gestures, interactions, body positions, camera movement, framing, editing and timing. The reference images control only the appearance of what they replace.${decor ? " The final reference image controls only the environment." : ""}`,
    ...blocks,
    ...(instructions
      ? [`REQUESTED CHANGES — Also apply these changes asked by the creator: ${instructions} Apply them faithfully; everything they do not cover follows the other rules.`]
      : []),
    ...(hasPeople
      ? ["PERMANENT IDENTITY ASSIGNMENT — Bind each replacement to what it replaces for the full clip, even through turns, overlap, different framing, motion blur and temporary occlusion. Never blend faces, exchange outfits or transfer one person's gestures to another."]
      : []),
    "EXACT SOURCE PERFORMANCE — Reproduce the existing performance moment by moment. Keep every gesture, pause, mouth movement, head turn, body sway and interaction at its original time and speed. Preserve every camera movement and every cut exactly where they occur. Keep the original duration, aspect ratio and playback speed. Do not introduce new choreography, poses, reactions, camera angles, cuts, slow motion or additional people.",
    decor
      ? `ENVIRONMENT AND INTEGRATION — Rebuild the whole scene inside the location shown in the FINAL reference image. Keep the original framing, camera distance, camera movement and cuts, but the walls, ground, furniture and depth of the shot now belong to that location.${items.length ? "" : " Keep every person's appearance and clothing as in the source video."} Light everyone consistently with that location, with accurate contact shadows. Do not copy borders, labels or captions from the reference images into the output.`
      : `ENVIRONMENT AND INTEGRATION — Apart from what is listed here, keep the original background, set, objects, every other person, lighting, shadows, perspective and composition from the source video. Adapt each replacement to the scene's lighting and movement, with accurate contact shadows and consistent positioning. Do not copy backgrounds, borders, labels or captions from the reference images into the output.`,
    `FINAL RESULT — The same ${decor ? "performances and camera work as the source video, played inside the location from the final reference image" : "source video and the same performances"}, with only the listed elements changed according to their reference images.`,
  ].join("\n\n");
}

// Images en vrac du studio, avec un prompt : rien ne dit ce que chaque image
// remplace, sinon le prompt du créateur (« @image1 », « @image2 »…). Une
// image n'est donc pas forcément un personnage (un objet, des billets) : le
// prompt du créateur commande, les blocs autour assurent l'intégration.
// Un personnage peut être un animal : sans le bloc COMPLETE REPLACEMENT,
// Genjutsu garde le corps de la personne et colle l'animal dessus (chèvre à
// côté du visage d'origine, vu le 2026-11-14).
function guidedPrompt(images: number, decor: boolean, instructions: string) {
  return [
    `STRICT REPLACEMENT GUIDED BY THE CREATOR — ${images} REFERENCE IMAGES. Edit the uploaded source video: change only what the creator's instructions ask for.${decor ? " The setting is also replaced by the location shown in the FINAL reference image." : ""} In the instructions, "@image1" is reference image 1, "@image2" is reference image 2, and so on, in the order the images are given. A reference image can show a character (a person, an animal or a creature), an outfit or an object.`,
    `CREATOR'S INSTRUCTIONS — ${instructions}`,
    `SOURCE PRIORITY — The source video controls all movement, performance, lip-sync, facial expressions, gaze, gestures, interactions, body positions, camera movement, framing, editing and timing. Each reference image controls only the appearance of what it replaces.${decor ? " The final reference image controls only the environment." : ""}`,
    "REFERENCE FIDELITY — Match each reference image exactly: a character's face, age, skin or fur, hairstyle and hair colour, body proportions, clothing and accessories; an object's shape, proportions, colours, materials and details. A human character keeps the replaced person's exact actions, rhythm, posture, head movements, hand gestures, gaze, facial expressions and lip-sync; do not add a smile or extra mouth movement. An animal or a creature follows the replaced person's position, timing, head movements, gaze and mouth movement as far as its own body allows. A replaced object keeps the position, scale, movement and timing of what it replaces, and every interaction with it.",
    "COMPLETE REPLACEMENT — A person replaced by a character disappears entirely: no part of their face, hair, body or clothing stays visible. The character is never added beside that person, placed in front of them or blended with them: one replaced person becomes exactly one character. When the reference image shows an animal or a creature, it takes that person's place, position and scale in the frame with the whole body shown in its reference image, not the person's human body.",
    "PERMANENT IDENTITY ASSIGNMENT — Bind each replacement to what it replaces for the full clip, even through turns, overlap, different framing, motion blur and temporary occlusion. Never blend faces, exchange outfits or transfer one person's gestures to another.",
    "EXACT SOURCE PERFORMANCE — Reproduce the existing performance moment by moment. Keep every gesture, pause, mouth movement, head turn, body sway and interaction at its original time and speed. Preserve every camera movement and every cut exactly where they occur. Keep the original duration, aspect ratio and playback speed. Do not introduce new choreography, poses, reactions, camera angles, cuts, slow motion or additional people.",
    decor
      ? "ENVIRONMENT AND INTEGRATION — Rebuild the whole scene inside the location shown in the FINAL reference image. Keep the original framing, camera distance, camera movement and cuts, but the walls, ground, furniture and depth of the shot now belong to that location. Light everyone consistently with that location, with accurate contact shadows. Do not copy borders, labels or captions from the reference images into the output."
      : "ENVIRONMENT AND INTEGRATION — Apart from what the creator's instructions change, keep the original background, set, objects, every other person, lighting, shadows, perspective and composition from the source video. Adapt each replacement to the scene's lighting and movement, with natural fabric motion, accurate contact shadows and consistent positioning. Do not copy backgrounds, borders, labels or captions from the reference images into the output.",
    `FINAL RESULT — The same ${decor ? "performances and camera work as the source video, played inside the location from the final reference image" : "source video and the same performances"}, with only what the creator's instructions name changed according to the reference images.`,
  ].join("\n\n");
}

// Transfert sans photo de lieu : le prompt du créateur part tel qu'il l'a
// écrit, comme sur le site Higgsfield (aucun prompt enrichi n'y est enregistré
// pour ce mode). « @image1 » devient « image 1 », la forme de ses prompts qui
// y ont marché (« la chevre de l image 1 »).
function transferPrompt(instructions: string) {
  return instructions.trim().replace(/@(?:image|img|photo)\s*(\d+)/gi, "image $1");
}

// Consigne Genjutsu, en blocs titrés : la vidéo source commande tout le jeu,
// les références commandent l'identité ; chaque personne remplacée est liée à
// son personnage pour tout le clip ; la scène reste intacte ; la planche de
// référence (fond, cases, légendes) ne doit jamais entrer dans l'image.
// Plusieurs personnages : les images de référence sont envoyées à la suite,
// personnage par personnage ; la consigne dit lesquelles montrent qui.
function genjutsuPrompt(
  characters: { imageUrls: string[]; target?: string; object?: boolean }[],
  decor = false,
  // Consignes libres du créateur, déjà en anglais impératif (voir
  // polishSwapInstructions) : changements en plus du remplacement.
  instructions?: string,
) {
  if (!characters.length || characters.some((c) => c.object)) {
    return referencePrompt(characters, decor, instructions);
  }
  if (instructions && characters.length > 1 && characters.every((c) => !c.target)) {
    return guidedPrompt(characters.length, decor, instructions);
  }
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
  // Ce qui change : personnages et objets, chacun avec ce qu'il remplace.
  // Vide : seul le lieu change.
  characters: { imageUrls: string[]; target?: string; object?: boolean }[];
  // Photo du lieu (déjà chez Higgsfield) : la scène est reconstruite dans ce
  // décor, via Motion Transfer.
  decorUrl?: string;
  // Onglet « Transfert » : Motion Transfer, même sans photo de lieu. Sans
  // lui ni photo de lieu : Object Swap, le clip est gardé.
  transfer?: boolean;
  // Consignes libres du créateur (dans sa langue).
  instructions?: string;
  // Studio : le prompt du créateur part mot pour mot, comme sur l'interface
  // Higgsfield ; vide, le rendu part avec un prompt vide. Sans cela (plans
  // prêts), le site écrit le prompt.
  directPrompt?: boolean;
  // Passe mannequin : chaque personne visée devient le mannequin dont la
  // planche est dans `characters` (même ordre) ; décor et consignes
  // attendent la passe des personnages.
  mannequins?: { figure: MannequinFigure; color: MannequinColor }[];
  // Genjutsu (Light chez Higgsfield) ou Genjutsu Max ; Max par défaut.
  model?: GenjutsuModel;
  quality?: SwapQuality;
  webhookUrl?: string;
}) {
  const hook = input.webhookUrl ? `?hf_webhook=${encodeURIComponent(input.webhookUrl)}` : "";
  const model = input.model ?? "max";
  const resolution = input.quality ?? "720p";
  if (input.mannequins) {
    const response = await fetch(`${BASE_URL}/${genjutsuEndpoint(model)}${hook}`, {
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
        resolution,
      }),
    });
    if (!response.ok) throw await failure("création", response);
    const { request_id } = (await response.json()) as { request_id?: string };
    if (!request_id) throw new Error("Higgsfield création : réponse sans identifiant");
    return `hf:swap:${request_id}`;
  }
  // Onglet « Transfert » ou photo de lieu : Motion Transfer ; sinon Object Swap.
  const endpoint = genjutsuEndpoint(model, Boolean(input.transfer || input.decorUrl));
  const raw = input.transfer && !input.decorUrl && input.directPrompt && input.instructions?.trim();
  // 8 images au plus ; le décor prend la dernière place (le prompt le désigne
  // comme la dernière image).
  const characterUrls = input.characters
    .flatMap((c) => c.imageUrls)
    .slice(0, input.decorUrl ? 7 : 8);
  // Object Swap : prompt structuré, toujours. Le site Higgsfield y enrichit
  // chaque prompt avant de l'envoyer à Genjutsu (enhanced_prompt) ; sans ça,
  // un prompt vide ou trop court donne un personnage « détouré » au lieu
  // d'être intégré dans la scène. Les consignes du créateur passent en
  // REQUESTED CHANGES. Transfert sans lieu : voir transferPrompt.
  const response = await fetch(`${BASE_URL}/${endpoint}${hook}`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      prompt: raw
        ? transferPrompt(raw)
        : genjutsuPrompt(input.characters, Boolean(input.decorUrl), input.instructions),
      video_url: input.videoUrl,
      image_urls: input.decorUrl ? [...characterUrls, input.decorUrl] : characterUrls,
      resolution,
    }),
  });
  if (!response.ok) throw await failure("création", response);
  const { request_id } = (await response.json()) as { request_id?: string };
  if (!request_id) throw new Error("Higgsfield création : réponse sans identifiant");
  return `hf:swap:${request_id}`;
}

// Styles de Genjutsu Restyle (« presets » chez Higgsfield) : le catalogue du
// moment, gardé dix minutes en mémoire. Chaque style a un identifiant, un nom
// et une image d'aperçu.
export type RestyleStyle = { id: string; name: string; previewUrl: string };
const RESTYLE_MODEL = "higgsfield/genjutsu/restyle/v1.0";
const RESTYLE_STYLES_TTL_MS = 10 * 60_000;
let restyleStyles: { at: number; items: RestyleStyle[] } | null = null;

export async function listRestyleStyles(): Promise<RestyleStyle[]> {
  if (restyleStyles && Date.now() - restyleStyles.at < RESTYLE_STYLES_TTL_MS) return restyleStyles.items;
  const response = await fetch(`${BASE_URL}/models/${RESTYLE_MODEL}/presets`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await failure("styles", response);
  const body = (await response.json()) as {
    items?: { id?: unknown; name?: unknown; preview_url?: unknown }[];
  };
  const items = (body.items ?? []).flatMap((item) =>
    typeof item.id === "string" && typeof item.name === "string" && typeof item.preview_url === "string"
      ? [{ id: item.id, name: item.name, previewUrl: item.preview_url }]
      : [],
  );
  restyleStyles = { at: Date.now(), items };
  return items;
}

// Styles proposés au studio : aucun (le mode Restyle est alors caché) si
// Higgsfield n'est pas configuré ou ne répond pas.
export async function studioRestyleStyles(): Promise<RestyleStyle[]> {
  if (!higgsfieldEnabled()) return [];
  return listRestyleStyles().catch((e) => {
    console.error("listRestyleStyles", e instanceof Error ? e.message : e);
    return [];
  });
}

// Restyle : le clip entier est refait dans le style choisi, mouvements, cadre
// et son gardés. Images facultatives : l'apparence des personnages ; sans
// elles, ceux du clip sont restylés. Le prompt du créateur part tel quel.
// Vidéo source 4–30 s, facturée à la seconde entamée comme les autres modes.
export async function createGenjutsuRestyle(input: {
  videoUrl: string;
  presetId: string;
  imageUrls?: string[];
  prompt?: string;
  quality?: SwapQuality;
  webhookUrl?: string;
}) {
  const hook = input.webhookUrl ? `?hf_webhook=${encodeURIComponent(input.webhookUrl)}` : "";
  const response = await fetch(`${BASE_URL}/${RESTYLE_MODEL}${hook}`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      prompt: input.prompt?.trim() ?? "",
      preset_id: input.presetId,
      video_url: input.videoUrl,
      image_urls: (input.imageUrls ?? []).slice(0, RESTYLE_MAX_IMAGES),
      resolution: input.quality ?? "720p",
    }),
  });
  if (!response.ok) throw await failure("création", response);
  const { request_id } = (await response.json()) as { request_id?: string };
  if (!request_id) throw new Error("Higgsfield création : réponse sans identifiant");
  return `hf:swap:${request_id}`;
}

// Annule une requête Higgsfield encore en file ; refusé une fois le rendu commencé.
export async function cancelHiggsfieldRequest(id: string) {
  const requestId = id.split(":")[2];
  const response = await fetch(`${BASE_URL}/requests/${requestId}/cancel`, {
    method: "POST",
    headers: headers(),
  });
  return response.ok;
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
