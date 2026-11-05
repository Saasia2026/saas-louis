import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Contrôle d'un plan remplacé (voir advanceSwap) : Claude regarde quelques
// images du plan rendu et la fiche personnage, et dit si la bonne personne a
// bien été remplacée par ce personnage sur tout le plan. Un plan refusé est
// refait une fois.

const CheckSchema = z.object({
  replaced: z.boolean(),
  sameCharacter: z.boolean(),
  reason: z.string(),
});

export type SwapCheck = z.infer<typeof CheckSchema>;

export async function checkSwapShot(input: {
  // Images JPEG (base64) réparties sur le plan rendu, dans l'ordre.
  frames: string[];
  // Un personnage, ou plusieurs dans le même clip (moteur genjutsu).
  characters: { url: string; target?: string }[];
}): Promise<SwapCheck> {
  const several = input.characters.length > 1;
  const who = (t?: string) => (t?.trim() ? `"${t.trim().replace(/"/g, "'")}"` : "the main person");
  const target = several
    ? input.characters.map((c, i) => `${who(c.target)} (character ${i + 1})`).join(", ")
    : who(input.characters[0]?.target);
  const response = await new Anthropic().beta.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    output_config: { effort: "low", format: betaZodOutputFormat(CheckSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `You check the output of an AI video tool that replaces a person in a real clip with a character. You receive the character reference ${several ? "images (one per character, in order)" : "image"} first, then frames taken in order across one generated shot.

- "replaced": true only if, in every frame where ${several ? "these people are" : "that person is"} visible, ${target} ${several ? "have each" : "has"} been turned into ${several ? "their own" : "the"} character (not left as the original human, not half-changed). False if any frame still shows the original person in their place.
- "sameCharacter": true if ${several ? "each character" : "the character"} in the frames clearly looks like ${several ? "its" : "the"} reference (same kind of head, face, fur or skin, colours), allowing for pose, angle, clothing and lighting. False if it turned into something else or changes identity between frames.
- "reason": one short sentence explaining a false answer, or "ok".

Ignore image quality, the background, other people and small glitches.`,
    messages: [
      {
        role: "user",
        content: [
          ...input.characters.flatMap((c, i) => [
            { type: "text" as const, text: several ? `Character ${i + 1} reference:` : "Character reference:" },
            { type: "image" as const, source: { type: "url" as const, url: c.url } },
          ]),
          { type: "text", text: "Frames of the generated shot:" },
          ...input.frames.map((data) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
          })),
        ],
      },
    ],
  });
  // Sans réponse exploitable, le plan est gardé : mieux vaut un plan imparfait
  // qu'une vidéo bloquée.
  return response.parsed_output ?? { replaced: true, sameCharacter: true, reason: "no check" };
}

const CastSchema = z.object({
  cast: z.array(z.object({ photos: z.array(z.number().int()), target: z.string() })),
  objects: z.array(z.object({ photos: z.array(z.number().int()), target: z.string() })),
  location: z.number().int(),
  instructions: z.string(),
});

export type SwapCast = z.infer<typeof CastSchema>;

// Distribution des images avant le lancement : comme sur Higgsfield, une image
// peut montrer un personnage, un objet, une tenue ou un lieu, et le prompt dit
// ce qu'elle remplace. Le créateur écrit souvent tout
// dans un seul champ (« remplace le chauve par le blond et le barbu par
// l'homme en costume ») et range la photo d'un second personnage parmi les
// autres photos du premier. Claude relit ses textes, ses photos et quelques
// images du clip, et rend la vraie distribution : un personnage par
// personne remplacée, ses photos, et qui il remplace (description visuelle
// en anglais), de même pour chaque objet, et la photo du lieu s'il y en a une.
// Les demandes sans image ressortent en consignes anglaises. Numéros de photo
// à partir de 1, dans l'ordre reçu.
export async function planSwapCast(input: {
  // Images JPEG (base64) réparties sur le passage choisi.
  frames: string[];
  // Toutes les photos déposées, personnage par personnage, dans l'ordre.
  photoUrls: string[];
  // Regroupement fait par le créateur : numéros de photo et texte « qui il
  // remplace » de chaque personnage. Vide : photos en vrac, regroupées par
  // Claude d'après le prompt.
  groups: { photos: number[]; target: string }[];
  // Prompt du créateur, dans sa langue (photos citées @image1…).
  instructions: string;
}): Promise<SwapCast | null> {
  const response = await new Anthropic().beta.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 1200,
    output_config: { effort: "medium", format: betaZodOutputFormat(CastSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `You set up an AI video edit that replaces people, objects, outfits or the setting in a filmed clip, using reference photos. You receive frames from the clip, the photos the creator uploaded (numbered), how the creator grouped those photos, the creator's text for each group and optional free instructions. Work out what each photo is for.

- "cast": one entry per distinct character to put into the clip, 0 to 3 entries. People, animals, creatures and mascots are characters. "photos": the numbers of every photo showing that same character, the best full-body photo first. A photo that shows a different person or character than the rest of its group is a separate entry, even if the creator put it in the same group. "target": a short English visual description of the ONE person in the clip this character replaces, as they appear in the frames (hair, clothing, position), e.g. "the bald fighter in green shorts". Use the creator's texts to decide who replaces whom; if the creator did not say, pick the most prominent person. Two entries never replace the same person.
- "objects": one entry per distinct object, product, vehicle, prop or outfit shown in the photos to put into the clip, 0 to 3 entries. "photos": the numbers of every photo showing that same thing. "target": a short English visual description of what it replaces in the clip, as it appears in the frames, e.g. "the wooden chair" or "the black suit the man wears". If the creator says an object replaces a person, the target is that person.
- "location": the number of the photo of a place the scene should move to, 0 if there is none. Use it only when the creator asks for that place, or when a photo clearly shows a place and nothing else in it can be used.
- "instructions": the creator's other requested changes that no photo covers, as short English imperative sentences; "" if none. A transformation with no photo (e.g. "turn the referee into a robot", "the chair becomes a sports car") belongs here.
- Every photo number appears in at most one entry. Do not name real people; describe them visually.
- The creator's text may cite photos as @image1, @image2… (also @img1, @photo1 or "image 1", in any language): @imageN is Photo N. @video or @clip is the clip itself. In "instructions", never cite photo numbers or @tags: describe things visually.
- When the creator did not group the photos, group them yourself: photos showing the same character or object go in one entry. Without text, put each distinct character on the most prominent people of the clip, the most prominent first, and each object on the most similar thing visible in the frames.
- Leave a photo out when you cannot tell what it should replace: an object photo with no text and nothing similar in the frames goes nowhere.`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Clip frames, in order:" },
          ...input.frames.map((data) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
          })),
          ...input.photoUrls.flatMap((url, i) => [
            { type: "text" as const, text: `Photo ${i + 1}:` },
            { type: "image" as const, source: { type: "url" as const, url } },
          ]),
          {
            type: "text",
            text: [
              ...(input.groups.length
                ? [
                    "Creator's grouping:",
                    ...input.groups.map(
                      (g, i) =>
                        `- Character ${i + 1}: photos ${g.photos.join(", ")}; who they replace: ${g.target ? JSON.stringify(g.target) : "(not given)"}`,
                    ),
                  ]
                : ["Creator's grouping: none, the photos were uploaded without grouping."]),
              `Creator's text: ${input.instructions ? JSON.stringify(input.instructions) : "(none)"}`,
            ].join("\n"),
          },
        ],
      },
    ],
  });
  return response.parsed_output ?? null;
}

const InstructionsSchema = z.object({ instructions: z.string() });

// Instruction libre du créateur (« transforme la chaise en voiture de
// sport »), écrite dans sa langue : reformulée en consignes anglaises
// impératives et précises pour le modèle vidéo. En panne, le texte brut part
// tel quel dans le prompt (Genjutsu lit la plupart des langues).
export async function polishSwapInstructions(text: string): Promise<string | null> {
  const response = await new Anthropic().beta.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 500,
    output_config: { effort: "low", format: betaZodOutputFormat(InstructionsSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `A creator asks an AI video editing model for extra changes to a filmed clip, in their own words and language. Rewrite the request as short, precise English imperative instructions for the video model (for example: "Turn the wooden chair into a black sports car. Keep the green box he holds identical."). Keep every requested change, add nothing, no preamble. Drop anything that is not a video edit (questions, greetings). Tags like @image1 or @video stand for the creator's uploaded photos and clip: write "the character" or "the clip" instead of the tag.`,
    messages: [{ role: "user", content: text }],
  });
  return response.parsed_output?.instructions.trim() || null;
}

// Contrôle du clip et des photos AVANT de faire payer (voir startSwap). Le
// filtre de contenu des moteurs refuse les scènes avec des enfants et la
// nudité, et il juge le clip lui-même : une séquence refusée l'est de nouveau
// quand on la refait (constaté en base le 2026-09-26). Mieux vaut le dire au
// créateur tout de suite, sans rien débiter, que 7 minutes plus tard.
// Seuls les cas nets sont bloqués ; dans le doute, le clip passe.
const PrecheckSchema = z.object({
  minor: z.boolean(),
  nudity: z.boolean(),
  feminine: z.array(z.boolean()),
  reason: z.string(),
});

// feminine : silhouette de chaque personnage, dans l'ordre, pour choisir son
// mannequin (voir mannequinSheetPath).
export type SwapPrecheck =
  | { blocked: false; feminine?: boolean[] }
  | { blocked: true; cause: "minor" | "nudity"; reason: string };

export async function precheckSwapInputs(input: {
  // Images JPEG (base64) réparties sur le passage choisi.
  frames: string[];
  // Photos des personnages (URLs lisibles de l'extérieur) : d'abord la photo
  // principale de chaque personnage, puis les autres (visage, lieu…).
  photoUrls: string[];
  // Nombre de personnages, donc de photos principales en tête de liste.
  characterCount: number;
}): Promise<SwapPrecheck> {
  const response = await new Anthropic().beta.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 800,
    output_config: { effort: "low", format: betaZodOutputFormat(PrecheckSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `You screen inputs for an AI video tool that replaces a person in a real clip with a character from a photo. The video model's content filter refuses scenes with children and nudity. You receive photos of the character(s), then frames taken across the clip.

- "minor": true only if a person who clearly looks like a child or a young teenager (roughly under 16) is visible in the clip frames or in a character photo. Adults, young-looking adults and cartoon or animal characters are not minors. When unsure, false.
- "nudity": true only if there is visible nudity or sexual content (exposed genitals, buttocks or female breasts, sexual acts). Swimwear, sportswear, a shirtless man, dancing or a fight are not nudity. When unsure, false.
- "feminine": one boolean per character, in order (the first photos are the characters' main photos, one each; their count is given below). True if that character shows a woman or a clearly feminine humanoid character (body shape, silhouette); false for men, animals, creatures, objects, or when unsure. Used only to pick a neutral stand-in body of matching build.
- "reason": one short sentence in French saying what you saw, for the creator (for example "Un enfant est visible au premier plan de la troisième image."), or "ok".

Do not identify anyone.`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Character photos (the first ${input.characterCount} are the main photo of each character, in order):`,
          },
          ...input.photoUrls.map((url) => ({
            type: "image" as const,
            source: { type: "url" as const, url },
          })),
          { type: "text", text: "Clip frames:" },
          ...input.frames.map((data) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
          })),
        ],
      },
    ],
  });
  const out = response.parsed_output;
  if (!out) return { blocked: false };
  if (out.minor) return { blocked: true, cause: "minor", reason: out.reason };
  if (out.nudity) return { blocked: true, cause: "nudity", reason: out.reason };
  return { blocked: false, feminine: out.feminine };
}
