"use server";

import Anthropic from "@anthropic-ai/sdk";
import { fmt, type Locale } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { DIRECTOR_DAILY_LIMIT } from "@/lib/director";
import { SWAP_INPUTS_BUCKET } from "@/lib/generation";
import { errorMessage } from "@/lib/predictions";
import {
  REFERENCE_MIN_SECONDS,
  analyzeReferenceVideo,
  type StyleReference,
} from "@/lib/reference";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const LANGUAGES: Record<Locale, string> = { fr: "French", en: "English", es: "Spanish" };

// Analyse la vidéo de référence déposée par le navigateur (bucket
// swap-inputs, qui reçoit tous les fichiers du studio). Compte comme un
// message du Director : c'est un appel à Claude non payé en crédits.
export async function analyzeReference(input: {
  videoPath: string;
}): Promise<Result<StyleReference & { referencePath: string }>> {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const errors = t.generateErrors;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: t.common.sessionExpired };

  const path = input.videoPath;
  if (typeof path !== "string" || !path.startsWith(`${userId}/`) || path.includes("..")) {
    return { error: errors.swapFiles };
  }

  const { error: limitError } = await supabase.rpc("use_director_message");
  if (limitError) {
    return {
      error: limitError.message.includes("director_limit")
        ? fmt(errors.directorLimit, { limit: DIRECTOR_DAILY_LIMIT })
        : errors.directorDown,
    };
  }

  const bucket = createAdminClient().storage.from(SWAP_INPUTS_BUCKET);
  const { data: signed } = await bucket.createSignedUrl(path, 60 * 60);
  if (!signed) return { error: errors.swapFiles };

  try {
    const style = await analyzeReferenceVideo({
      videoUrl: signed.signedUrl,
      language: LANGUAGES[locale],
    });
    if (style === "too_short") {
      return { error: fmt(errors.referenceTooShort, { min: REFERENCE_MIN_SECONDS }) };
    }
    if (!style) return { error: errors.referenceFailed };

    // Clip préparé pour Kling O1, que chaque plan recevra (voir fal.ts).
    const { clip, ...rest } = style;
    const referencePath = `${userId}/ref-${crypto.randomUUID()}-kling.mp4`;
    const { error: uploadError } = await bucket.upload(referencePath, clip, {
      contentType: "video/mp4",
    });
    if (uploadError) throw uploadError;
    return { data: { ...rest, referencePath } };
  } catch (e) {
    console.error("analyzeReference", errorMessage(e));
    return {
      error:
        e instanceof Anthropic.AuthenticationError ? errors.directorKey : errors.referenceFailed,
    };
  }
}
