import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export type Storyboard = {
  // Tenue et accessoires communs à tous les plans, en anglais.
  subject: string;
  shots: Shot[];
};

// summary : une phrase en français, affichée à l'utilisateur.
// end : à quoi ressemble l'image à la fin du plan (image de fin, voir
// VIDEO_MODELS.endFrames).
export type Shot = { summary: string; scene: string; motion: string; end: string };

export const ShotSchema = z.object({
  summary: z.string(),
  scene: z.string(),
  motion: z.string(),
  end: z.string(),
});
const StoryboardSchema = z.object({
  subject: z.string(),
  shots: z.array(ShotSchema),
});

// Une vidéo met en scène le jumeau du créateur ("twin"), ou personne en
// particulier ("free") : les règles d'identité ne s'appliquent qu'au premier.
export type SubjectMode = "twin" | "free";

// Règles d'écriture d'un storyboard, partagées avec le mode Director.
const TWIN_RULES = `You turn a creator's short request into a storyboard for a social media video starring the creator themself.

Each shot is produced on its own by the models, so anything that must stay the same across shots has to be written the same way in every shot.

Language: "scene", "motion", "end" and "subject" are read by the models and must always be written in English, whatever the language of the request. Only "summary" is written in French, for the creator.

- "subject": the creator's outfit and accessories for the whole video, as a noun phrase (e.g. "a white linen shirt with rolled sleeves and a silver watch"). Never describe their body, face, skin, hair, facial hair or age: the image model already knows them, and any description would override their real look.
- "shots": exactly the number of shots requested, in chronological order, telling one coherent story that follows the request.
  - "summary": one short sentence in French describing the shot for the creator (e.g. "Au volant, sourire vers la mer").
  - "scene": what the still image shows, in two or three sentences. It must look like a real video someone actually filmed, with an ordinary camera, not like a movie. Start with the place and the light as they really are (e.g. "Real video still, Brickell Avenue, Miami, late afternoon, harsh daylight."), then what the creator is doing: a concrete pose and action (hands, gaze, body angle, where they are relative to the key object, e.g. "sits behind the steering wheel, left hand on the wheel, elbow on the open window"), then where the phone is held. Make the key object clearly recognizable with its distinctive details (brand, emblem, colour). Call the creator "the creator".
  - "motion": the direction of the shot for the video model, as a real filmed action. Say what the main character does (walk toward the camera, turn around, step out of the car, throw a jacket over the shoulder, dance, laugh, reach for something), how fast, and in which direction; then the camera move (handheld follow, tracking shot, slow orbit around them, push-in, crane up, tilt, whip pan) and what it reveals; then what moves in the world (hair in the wind, passing traffic, reflections sliding on the paint, dust, water). Call the creator "the main character".
  - "end": what the frame looks like at the very end of the shot, in one sentence: the main character's new position and pose, the new framing. It must be a different moment from "scene": the shot has to go somewhere.

Identity comes first:
- The creator's face must be clearly visible and well lit in every shot: medium shots or close-ups, facing the camera or at a three-quarter angle. No sunglasses, masks, caps pulled low, back views or distant wide shots, unless the request explicitly asks for them.
- The creator is the only visible face. The image model gives the creator's face to any other clearly visible person, so other people requested (a crowd, onlookers) only appear as a few small, distant, blurred silhouettes in the background, faces not visible, described in a few words as a group. Never describe bystanders one by one. A companion is shown from behind or cut by the frame edge, never face to camera.
- Avoid the same static pose (sitting straight, facing the camera) from one shot to the next: each shot has its own natural pose and action.
- Every recurring element (vehicle, pet, place, companion) is described with the exact same words in every shot where it appears, including colour and model (e.g. "a bright orange Lamborghini Huracán convertible").

It must look real, not cinematic:
- The reference is real footage from an ordinary camera, held by a person: slight shake, framing that is not perfectly composed, natural or available light, ordinary everyday details in the background.
- Never ask for cinematic lighting, colour grading, anamorphic look, lens flares, slow motion or studio perfection, unless the chosen video style explicitly calls for it.
- Better a slightly imperfect shot that feels filmed for real than a beautiful shot that looks generated.

Motion carries the video:
- Every shot moves. Give each one a real action with a beginning and an end, and a camera that lives with it. A shot where someone only smiles at the camera is a wasted shot.
- Vary the energy between shots: a fast, punchy one (quick walk, jump, turn, whip pan) next to a calmer one (slow orbit, push-in on the face).
- The main character may turn, walk out of frame, come back into frame, or pass in front of the camera. The camera may follow them, lose them and find them again.
- Keep one continuous action per shot: no cut, no change of place inside a shot, and the face stays recognisable at least once in the shot.

- Vary framing and angle a lot between shots (extreme close-up on a detail, wide shot, low angle, high angle, over-the-shoulder, three-quarter), while keeping the location plausible.
- Keep everything suitable for a public social media feed.`;

const FREE_RULES = `You turn a short request into a storyboard for a social media video. Nobody in particular stars in it: the video shows whatever the request describes.

Each shot is generated on its own by a video model, from your text only. Anything that must stay the same across shots has to be written the same way in every shot.

Language: "scene", "motion", "end" and "subject" are read by the video model and must always be written in English, whatever the language of the request. Only "summary" is written in French, for the creator.

- "subject": what the video is about, as a short noun phrase (e.g. "a matte black electric scooter in a rainy city"), or an empty string when the request has no single subject.
- "shots": exactly the number of shots requested, in chronological order, telling one coherent story that follows the request.
  - "summary": one short sentence in French describing the shot (e.g. "Le scooter file sous la pluie").
  - "scene": what the shot shows, in two or three sentences. Start with the place and the light as they really are, then what is in frame and where the camera is. Describe people, objects and places with concrete, repeatable details (colour, model, clothing).
  - "motion": the action of the shot for the video model: what moves, how fast, in which direction, then the camera move (handheld follow, tracking, slow orbit, push-in, tilt, whip pan) and what it reveals, then what moves in the world (wind, traffic, reflections, dust, water).
  - "end": what the frame looks like at the very end of the shot, in one sentence. It must be a different moment from "scene": the shot has to go somewhere.

Every recurring element (a person, a vehicle, a pet, a place) is described with the exact same words in every shot where it appears.

It must look real, not cinematic:
- The reference is real footage from an ordinary camera, held by a person: slight shake, framing that is not perfectly composed, natural or available light, ordinary everyday details in the background.
- Never ask for cinematic lighting, colour grading, anamorphic look, lens flares, slow motion or studio perfection, unless the chosen video style explicitly calls for it.
- Better a slightly imperfect shot that feels filmed for real than a beautiful shot that looks generated.

Motion carries the video:
- Every shot moves. Give each one a real action with a beginning and an end, and a camera that lives with it.
- Vary the energy between shots: a fast, punchy one next to a calmer one.
- Keep one continuous action per shot: no cut and no change of place inside a shot.
- Vary framing and angle a lot between shots (extreme close-up on a detail, wide shot, low angle, high angle, over-the-shoulder).
- Keep everything suitable for a public social media feed.`;

export function storyboardRules(mode: SubjectMode) {
  return mode === "twin" ? TWIN_RULES : FREE_RULES;
}

// Écrit le storyboard avec Claude, selon la direction du modèle de vidéo
// choisi (voir templates.ts). En cas d'échec (pas de clé, refus, sortie
// invalide), on retombe sur la demande brute pour chaque plan.
export async function writeStoryboard(
  request: string,
  durations: number[],
  direction = "",
  mode: SubjectMode = "twin",
): Promise<Storyboard> {
  const fallback: Storyboard = {
    subject: "",
    shots: durations.map(() => ({
      summary: request,
      scene: request,
      motion: request,
      end: request,
    })),
  };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      output_config: {
        effort: "low",
        format: betaZodOutputFormat(StoryboardSchema),
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: storyboardRules(mode),
      messages: [
        {
          role: "user",
          content: [
            `Request: ${request}`,
            direction &&
              `Video style (follow it, adapting the structure to the number of shots): ${direction}`,
            `Number of shots: ${durations.length}\nShot durations in seconds, in order: ${durations.join(", ")}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.error("writeStoryboard: pas de storyboard", response.stop_reason);
      return fallback;
    }

    const { subject, shots } = response.parsed_output;
    if (!shots.length) return fallback;
    // Le nombre de plans doit correspondre exactement à la durée payée.
    return {
      subject,
      shots: durations.map((_, i) => shots[i] ?? shots[shots.length - 1]),
    };
  } catch (e) {
    console.error("writeStoryboard", e instanceof Error ? e.message : e);
    return fallback;
  }
}

// Réécrit un plan selon la demande de l'utilisateur (en français ou non),
// en gardant les règles et la cohérence du storyboard. null si impossible.
export async function rewriteShot(
  storyboard: Storyboard,
  index: number,
  instruction: string,
): Promise<Shot | null> {
  try {
    const response = await new Anthropic().beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: {
        effort: "low",
        format: betaZodOutputFormat(ShotSchema),
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: `${storyboardRules("twin")}

You are now editing a single shot of an existing storyboard. Apply the creator's change request to that shot only and return it with the same fields. Keep the outfit ("subject") and the exact wording of recurring elements consistent with the other shots, unless the request explicitly changes them.`,
      messages: [
        {
          role: "user",
          content: `Storyboard:\n${JSON.stringify(storyboard, null, 2)}\n\nShot to edit: number ${index + 1}\nChange request: ${instruction}`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.error("rewriteShot: pas de plan", response.stop_reason);
      return null;
    }
    return response.parsed_output;
  } catch (e) {
    console.error("rewriteShot", e instanceof Error ? e.message : e);
    return null;
  }
}
