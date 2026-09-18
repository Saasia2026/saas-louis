import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRAINING_PHOTOS_BUCKET } from "@/lib/twin";

const PHOTOS_TO_DESCRIBE = 4;
const SIGNED_URL_TTL_SECONDS = 10 * 60;

const AppearanceSchema = z.object({ appearance: z.string() });

const SYSTEM_PROMPT = `You describe a person's stable physical appearance for an image generation prompt. The photos all show the same person, who asked for this description to generate pictures of themself.

Return one short English noun phrase covering only what is clearly visible: apparent gender, approximate age range, skin tone, hair (length, texture, style, colour) and facial hair. Example: "a man in his twenties with dark brown skin, long black dreadlocks and a thin mustache".

Ignore clothing, accessories, backgrounds, text overlays and any other people in the photos. Do not guess identity, nationality or ethnicity.`;

// Apparence du jumeau, décrite une fois par Claude à partir de quelques
// photos d'entraînement puis gardée en base. Chaîne vide si indisponible
// (pas de clé, refus) : les prompts s'en passent.
export async function getTwinAppearance(twinId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: twin } = await admin
    .from("twins")
    .select("appearance")
    .eq("id", twinId)
    .maybeSingle();
  if (twin?.appearance) return twin.appearance;

  try {
    const { data: photos, error } = await admin
      .from("training_photos")
      .select("storage_path")
      .eq("twin_id", twinId)
      .order("uploaded_at");
    if (error) throw error;
    if (!photos.length) return "";

    // Photos réparties sur toute la série, pas seulement les premières.
    const step = Math.max(1, Math.floor(photos.length / PHOTOS_TO_DESCRIBE));
    const picked = photos.filter((_, i) => i % step === 0).slice(0, PHOTOS_TO_DESCRIBE);
    const { data: signed, error: signError } = await admin.storage
      .from(TRAINING_PHOTOS_BUCKET)
      .createSignedUrls(
        picked.map((p) => p.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );
    if (signError) throw signError;
    const urls = signed.flatMap((s) => (s.signedUrl ? [s.signedUrl] : []));

    const response = await new Anthropic().beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: {
        effort: "low",
        format: betaZodOutputFormat(AppearanceSchema),
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...urls.map((url) => ({
              type: "image" as const,
              source: { type: "url" as const, url },
            })),
            { type: "text" as const, text: "Describe this person." },
          ],
        },
      ],
    });

    const appearance = response.parsed_output?.appearance.trim();
    if (response.stop_reason === "refusal" || !appearance) {
      console.error("getTwinAppearance: pas de description", response.stop_reason);
      return "";
    }

    await admin.from("twins").update({ appearance }).eq("id", twinId);
    return appearance;
  } catch (e) {
    console.error("getTwinAppearance", e instanceof Error ? e.message : e);
    return "";
  }
}
