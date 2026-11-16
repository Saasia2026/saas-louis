// Influenceurs IA, partagé client/serveur : les types de personnage, le prix
// et le texte envoyé au générateur d'images (Seedream chez fal).
import presets from "./influencer-presets.json";

export const INFLUENCER_KINDS = ["natural", "bold", "extreme", "animal", "creature", "senior"] as const;
export const INFLUENCER_GENDERS = ["woman", "man", "any"] as const;

export type InfluencerKind = (typeof INFLUENCER_KINDS)[number];
export type InfluencerGender = (typeof INFLUENCER_GENDERS)[number];

// Seedream 5.5 : 0,03 $ l'image en 1200 × 1600 (≈ 1,25 crédit) ; Seedream
// 5.0 Pro Edit, à partir d'une photo : 0,0675 $ (≈ 2,8 crédits), au coût
// par crédit du barème (0,0243 $, voir generation.ts).
export const INFLUENCER_CREDITS = 2;
export const INFLUENCER_PHOTO_CREDITS = 3;
export const INFLUENCER_DESCRIPTION_MAX = 300;

export function influencerCredits(fromPhoto: boolean) {
  return fromPhoto ? INFLUENCER_PHOTO_CREDITS : INFLUENCER_CREDITS;
}

// Aperçu de chaque type, dans public/influencers.
export function kindPreview(kind: InfluencerKind) {
  return `/influencers/${kind}.webp`;
}

export function isInfluencerKind(value: unknown): value is InfluencerKind {
  return INFLUENCER_KINDS.includes(value as InfluencerKind);
}

export function isInfluencerGender(value: unknown): value is InfluencerGender {
  return INFLUENCER_GENDERS.includes(value as InfluencerGender);
}

const ANIMALS = ["frog", "cat", "fox", "dog", "monkey", "owl", "raccoon", "bear", "lizard", "penguin", "goat", "pug"];

const PERSON: Record<InfluencerGender, string> = { woman: "woman", man: "man", any: "person" };
const ELDER: Record<InfluencerGender, string> = { woman: "grandmother", man: "grandfather", any: "grandparent" };
const STYLE: Record<InfluencerGender, string> = { woman: "feminine ", man: "masculine ", any: "" };

function kindPrompt(kind: InfluencerKind, gender: InfluencerGender) {
  const who = PERSON[gender];
  switch (kind) {
    case "natural":
      return `A natural, everyday-looking ${who} in their twenties, next-door feel, light or no makeup, casual everyday outfit, warm friendly expression, real skin texture with pores and small imperfections, shot on an iPhone, candid social media influencer vibe.`;
    case "bold":
      return `A striking, confident ${who} with a bold personal style: statement hair, strong expressive face, eye-catching fashionable outfit, charismatic attitude, magazine-cover energy with real skin texture.`;
    case "extreme":
      return `An outrageously exaggerated, funny ${who}: wild colorful hair, huge expressive eyes, exaggerated facial features and proportions, loud clashing outfit, cartoonish yet photorealistic, meme-worthy viral character.`;
    case "animal": {
      const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
      return `An anthropomorphic ${animal} influencer standing upright like a human, photorealistic ${animal} head, fur or skin and expressive eyes, wearing trendy ${STYLE[gender]}streetwear, confident funny attitude, viral character.`;
    }
    case "creature":
      return `An original, funny fantasy creature influencer with a humanlike body: a clearly non-human being such as a furry colorful alien, a friendly little monster or a dragon-like being, big expressive eyes, photorealistic skin, scales or fur, trendy ${STYLE[gender]}outfit, viral character, never a known franchise character.`;
    case "senior":
      return `A funny, charismatic ${ELDER[gender]} in their seventies with lots of personality, expressive wrinkled face, trendy youthful outfit, playful attitude, grandparent influencer vibe, real skin texture.`;
  }
}

// Cadrage commun : un seul personnage, de face, sur fond uni. C'est aussi
// l'image que le studio met ensuite dans les vidéos.
const FRAMING =
  "Vertical photo of one single character, waist-up, facing the camera and looking into the lens, centered, plain soft light grey studio background, soft even light, photorealistic, sharp details, no text, no watermark, no logo.";

// Exemples prêts (style mode avant-garde, fond blanc) : un personnage décrit
// en entier, en buste ou en pied. Images dans public/influencers/examples.
export type InfluencerPreset = (typeof INFLUENCER_PRESETS)[number];
export const INFLUENCER_PRESETS = presets as {
  id: string;
  kind: InfluencerKind;
  framing: "bust" | "full";
  prompt: string;
}[];

export function findPreset(id: unknown) {
  return INFLUENCER_PRESETS.find((p) => p.id === id);
}

export function presetImage(id: string) {
  return `/influencers/examples/${id}.webp`;
}

const EDITORIAL =
  "High-fashion editorial studio photo, seamless pure white background, soft diffused light, surreal exaggerated proportions, photorealistic, sharp details, no text, no logo, no watermark.";
const EDITORIAL_FRAMING = {
  bust: "Vertical photo of this one single character, head and upper body, centered, facing the camera.",
  full: "Vertical photo of this one single character, full body from head to shoes, centered, facing the camera.",
};

export function presetPrompt(preset: InfluencerPreset) {
  return `${preset.prompt} ${EDITORIAL_FRAMING[preset.framing]} ${EDITORIAL}`;
}

export function influencerPrompt(input: {
  kind: InfluencerKind;
  gender: InfluencerGender;
  description?: string;
  fromPhoto: boolean;
  preset?: InfluencerPreset;
}) {
  const details = input.description?.trim().slice(0, INFLUENCER_DESCRIPTION_MAX);
  return [
    input.fromPhoto
      ? "Use the person or character in the reference image as the base: keep their face, features and identity clearly recognizable, and turn them into this influencer:"
      : "",
    input.preset ? input.preset.prompt : kindPrompt(input.kind, input.gender),
    details ? `Details requested by the creator: ${details}.` : "",
    input.preset ? `${EDITORIAL_FRAMING[input.preset.framing]} ${EDITORIAL}` : FRAMING,
  ]
    .filter(Boolean)
    .join(" ");
}
