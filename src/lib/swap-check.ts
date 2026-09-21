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
