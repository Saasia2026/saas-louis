"use server";

import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { createFalSwap, falEnabled } from "@/lib/fal";
import {
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_SECONDS,
  type AspectRatio,
} from "@/lib/generation";
import {
  errorMessage,
  isContentRefused,
  isOutOfCredit,
  isRateLimited,
} from "@/lib/predictions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { probeVideo } from "@/lib/swap";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const INPUT_URL_TTL_SECONDS = 60 * 60;

// Remplacement de personnage : le clip et l'image sont déjà déposés dans
// swap-inputs par le navigateur. On mesure le clip, on débite, puis fal
// remplace la personne du clip par le personnage. La suite (copie du
// résultat, remboursement) passe par getGeneration, comme une photo.
export async function startSwap(input: {
  videoPath: string;
  imagePath: string;
}): Promise<Result<{ generationId: string; aspectRatio: AspectRatio; durationSeconds: number }>> {
  const t = await getDictionary();
  const errors = t.generateErrors;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: t.common.sessionExpired };
  if (!falEnabled()) return { error: errors.startFailed };

  // Chemins sous le dossier de l'utilisateur uniquement.
  const own = (p: unknown) =>
    typeof p === "string" && p.startsWith(`${userId}/`) && !p.includes("..");
  if (!own(input.videoPath) || !own(input.imagePath)) return { error: errors.swapFiles };

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from(SWAP_INPUTS_BUCKET)
    .createSignedUrls([input.videoPath, input.imagePath], INPUT_URL_TTL_SECONDS);
  const [videoUrl, imageUrl] = (signed ?? []).map((s) => s.signedUrl);
  if (!videoUrl || !imageUrl) return { error: errors.swapFiles };

  const probe = await probeVideo(videoUrl).catch((e) => {
    console.error("probeVideo", errorMessage(e));
    return null;
  });
  if (!probe) return { error: errors.swapUnreadable };
  // Une fraction de seconde au-delà de la limite est tolérée (arrondi).
  const durationSeconds = Math.max(1, Math.round(probe.seconds));
  if (durationSeconds > SWAP_MAX_SECONDS) {
    return { error: fmt(errors.swapTooLong, { max: SWAP_MAX_SECONDS }) };
  }

  const { data: generationId, error: rpcError } = await admin.rpc("start_swap_generation", {
    p_user_id: userId,
    p_duration_seconds: durationSeconds,
    p_metadata: {
      aspect_ratio: probe.aspectRatio,
      source_video_path: input.videoPath,
      character_image_path: input.imagePath,
    },
  });
  if (rpcError || !generationId) {
    if (rpcError?.message.includes("insufficient_credits")) {
      return { error: errors.insufficientCredits };
    }
    console.error("start_swap_generation", errorMessage(rpcError));
    return { error: errors.startFailed };
  }

  try {
    const predictionId = await createFalSwap({ videoUrl, imageUrl });
    await admin
      .from("generations")
      .update({ status: "processing", replicate_prediction_id: predictionId })
      .eq("id", generationId);
  } catch (e) {
    console.error("startSwap", errorMessage(e));
    await admin.rpc("fail_generation", { p_generation_id: generationId });
    return {
      error: isOutOfCredit(e)
        ? errors.outOfCredit
        : isContentRefused(e)
          ? errors.contentRefused
          : isRateLimited(e)
            ? errors.rateLimited
            : errors.startFailed,
    };
  }

  return { data: { generationId, aspectRatio: probe.aspectRatio, durationSeconds } };
}
