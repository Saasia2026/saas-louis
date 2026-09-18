"use server";

import Anthropic from "@anthropic-ai/sdk";
import {
  DIRECTOR_DAILY_LIMIT,
  MAX_DIRECTOR_MESSAGES,
  MAX_DIRECTOR_MESSAGE_LENGTH,
  createDraftToken,
  directorTurn,
  readDraftToken,
  type DirectorDraft,
  type DirectorMessage,
} from "@/lib/director";
import { fmt, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { falEnabled } from "@/lib/fal";
import {
  DEFAULT_PACE,
  DEFAULT_PRESET,
  GENERATIONS_BUCKET,
  keptSeconds,
  MAX_PROMPT_LENGTH,
  availablePresets,
  findPreset,
  isAspectRatio,
  shotSecondsOf,
  isGenerationKind,
  isPace,
  maxVideoSeconds,
  type AspectRatio,
  type GenerationKind,
  type GenerationStatus,
  type Pace,
  type Preset,
} from "@/lib/generation";
import {
  applyImagePredictionResult,
  errorMessage,
  isOutOfCredit,
  isRateLimited,
} from "@/lib/predictions";
import { getPrediction, imagePrompt, startTwinImage } from "@/lib/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Storyboard } from "@/lib/storyboard";
import { createClient } from "@/lib/supabase/server";
import { findTemplate, type VideoTemplate } from "@/lib/templates";
import {
  OUT_OF_CREDIT_ERROR,
  advanceVideoGeneration,
  cancelFrames,
  startVideoGeneration,
} from "@/lib/video-pipeline";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Erreurs levées par public.start_generation, traduites.
function rpcErrors(t: Dictionary): Record<string, string> {
  return {
    insufficient_credits: t.generateErrors.insufficientCredits,
    duration_exceeds_plan: t.generateErrors.durationExceedsPlan,
    invalid_duration: t.generateErrors.invalidDuration,
    invalid_preset: t.generateErrors.invalidPreset,
    invalid_pace: t.generateErrors.invalidPace,
    not_authenticated: t.common.sessionExpired,
  };
}

const LANGUAGES: Record<Locale, string> = { fr: "French", en: "English", es: "Spanish" };

// Messages d'erreur enregistrés en base (en français) : traduits à l'affichage.
function translateStoredError(error: string | null, t: Dictionary) {
  if (!error) return undefined;
  if (error === OUT_OF_CREDIT_ERROR) return t.generateErrors.outOfCredit;
  return error;
}

// Débite les crédits puis lance la génération : une image, ou le storyboard
// et les plans d'une vidéo.
export async function generate(input: {
  // Sans jumeau : la vidéo est générée à partir du texte seul.
  twinId?: string;
  prompt: string;
  aspectRatio: string;
  kind: string;
  durationSeconds: number;
  templateId?: string;
  preset?: string;
  pace?: string;
  // Personnage Sora réutilisé dans la vidéo.
  characterId?: string;
}): Promise<Result<{ generationId: string }>> {
  const t = await getDictionary();
  const errors = t.generateErrors;
  const prompt = input.prompt.trim();
  if (!prompt) return { error: errors.emptyPrompt };
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { error: fmt(t.common.maxChars, { max: MAX_PROMPT_LENGTH }) };
  }
  if (!isAspectRatio(input.aspectRatio)) return { error: errors.invalidFormat };
  if (!isGenerationKind(input.kind)) return { error: errors.invalidKind };
  const kind: GenerationKind = input.kind;
  const template = kind === "video" ? findTemplate(input.templateId) : undefined;
  if (kind === "video" && input.templateId && !template) {
    return { error: errors.invalidTemplate };
  }
  const preset = findPreset(input.preset ?? DEFAULT_PRESET);
  // Une photo n'utilise que le modèle d'image du préréglage.
  if (!preset || (kind === "video" && !availablePresets(falEnabled(), Boolean(input.twinId)).includes(preset))) {
    return { error: errors.invalidPreset };
  }
  const pace = input.pace ?? DEFAULT_PACE;
  if (!isPace(pace)) return { error: errors.invalidPace };
  // La durée doit tomber juste sur la longueur de plan du préréglage.
  const step = keptSeconds(preset.id, pace);
  const durationSeconds = Math.max(step, Math.round(input.durationSeconds / step) * step);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: t.common.sessionExpired };

  return startGeneration(supabase, auth.claims.sub, t, {
    twinId: input.twinId,
    prompt,
    kind,
    aspectRatio: input.aspectRatio,
    durationSeconds,
    preset,
    pace,
    template,
    characterId: input.characterId,
  });
}

// Lance la vidéo d'un brouillon du mode Director, avec son storyboard.
export async function launchDirectorVideo(input: {
  twinId?: string;
  characterId?: string;
  draftToken: string;
}): Promise<Result<{ generationId: string }>> {
  const t = await getDictionary();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: t.common.sessionExpired };

  const draft = readDraftToken(input.draftToken, auth.claims.sub);
  if (!draft) return { error: t.generateErrors.draftExpired };
  const preset = findPreset(draft.preset);
  if (!preset || !availablePresets(falEnabled(), Boolean(input.twinId)).includes(preset)) {
    return { error: t.generateErrors.invalidPreset };
  }

  return startGeneration(supabase, auth.claims.sub, t, {
    twinId: input.twinId,
    prompt: `${draft.title} : ${draft.brief}`.slice(0, MAX_PROMPT_LENGTH),
    kind: "video",
    aspectRatio: draft.aspectRatio,
    durationSeconds: draft.shots.length * keptSeconds(draft.preset, draft.pace),
    preset,
    pace: draft.pace,
    template: findTemplate(draft.templateId),
    storyboard: { subject: draft.subject, shots: draft.shots },
    characterId: input.characterId,
  });
}

// Débite les crédits puis démarre la génération (paramètres déjà validés).
async function startGeneration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  t: Dictionary,
  input: {
    twinId?: string;
    prompt: string;
    kind: GenerationKind;
    aspectRatio: AspectRatio;
    durationSeconds: number;
    preset: Preset;
    pace: Pace;
    template?: VideoTemplate;
    storyboard?: Storyboard;
    characterId?: string;
  },
): Promise<Result<{ generationId: string }>> {
  const { prompt, kind, template, durationSeconds, pace, preset, twinId } = input;

  // Une photo exige un jumeau ; une vidéo peut s'en passer.
  if (twinId) {
    const { data: twin } = await supabase
      .from("twins")
      .select("id")
      .eq("id", twinId)
      .eq("status", "ready")
      .not("consent_confirmed_at", "is", null)
      .maybeSingle();
    if (!twin) {
      return { error: t.generateErrors.twinNotReady };
    }
  } else if (kind === "image") {
    return { error: t.generateErrors.twinRequired };
  }

  // Personnage Sora : son identifiant est vérifié côté serveur.
  let character: { id: string; name: string } | null = null;
  if (input.characterId) {
    const { data } = await supabase
      .from("characters")
      .select("name, sora_character_id")
      .eq("id", input.characterId)
      .eq("status", "ready")
      .maybeSingle();
    if (!data?.sora_character_id) {
      return { error: t.generateErrors.characterNotReady };
    }
    character = { id: data.sora_character_id, name: data.name };
  }

  const { data: generationId, error: rpcError } = await supabase.rpc(
    "start_generation",
    {
      p_twin_id: twinId ?? null,
      p_prompt: prompt,
      p_kind: kind,
      p_duration_seconds: kind === "video" ? durationSeconds : undefined,
      p_metadata: {
        aspect_ratio: input.aspectRatio,
        ...(template && { template: template.id }),
        ...(kind === "video" && {
          preset: preset.id,
          pace,
          // Lus par la tarification en base (start_generation).
          video_model: preset.videoModel,
          end_frames: preset.endFrames,
          shot_seconds: shotSecondsOf(preset.videoModel),
          ...(character && {
            character_id: input.characterId,
            sora_character_id: character.id,
            character_name: character.name,
          }),
        }),
        ...(input.storyboard && { director: true }),
      },
    },
  );
  if (rpcError) {
    const known = rpcErrors(t);
    const code = Object.keys(known).find((c) => rpcError.message.includes(c));
    return { error: code ? known[code] : t.generateErrors.twinNotReady };
  }

  const admin = createAdminClient();
  try {
    if (kind === "video") {
      await startVideoGeneration({
        generationId,
        userId,
        twinId: twinId ?? null,
        prompt,
        aspectRatio: input.aspectRatio,
        durationSeconds,
        preset,
        pace,
        soraCharacterId: character?.id,
        characterName: character?.name,
        direction: template?.direction,
        storyboard: input.storyboard,
      });
    } else {
      const predictionId = await startTwinImage({
        preset,
        twinId: twinId!,
        prompt: imagePrompt({ scene: prompt }),
        aspectRatio: input.aspectRatio,
      });
      await admin
        .from("generations")
        .update({ status: "processing", replicate_prediction_id: predictionId })
        .eq("id", generationId);
    }
  } catch (e) {
    console.error("generate", errorMessage(e));
    await admin.rpc("fail_generation", { p_generation_id: generationId });
    return {
      error: isOutOfCredit(e)
        ? t.generateErrors.outOfCredit
        : isRateLimited(e)
          ? t.generateErrors.rateLimited
          : t.generateErrors.startFailed,
    };
  }

  return { data: { generationId } };
}

export type GenerationView = {
  kind: GenerationKind;
  status: GenerationStatus;
  stage: "image" | "frames" | "shots" | "assembling";
  shotsTotal: number;
  // Images prêtes, puis plans animés.
  framesDone: number;
  shotsDone: number;
  mediaUrl?: string;
  posterUrl?: string;
  downloadUrl?: string;
  // Raison de l'échec, quand elle est connue.
  error?: string;
};

// État d'une génération. Sans webhook joignable (dev local), c'est aussi ici
// que la génération avance.
export async function getGeneration(
  generationId: string,
): Promise<Result<GenerationView>> {
  const supabase = await createClient();
  const select = () =>
    supabase
      .from("generations")
      .select(
        "kind, stage, status, storage_path, poster_path, replicate_prediction_id, error, generation_shots(position, stage)",
      )
      .eq("id", generationId)
      .maybeSingle();

  const { data: initial } = await select();
  if (!initial) return { error: (await getDictionary()).generateErrors.notFound };
  let generation = initial;

  if (generation.status === "processing") {
    try {
      if (generation.kind === "video") {
        await advanceVideoGeneration(generationId);
      } else if (generation.replicate_prediction_id) {
        await applyImagePredictionResult(
          await getPrediction(generation.replicate_prediction_id),
        );
      }
      const { data: fresh } = await select();
      if (fresh) generation = fresh;
    } catch (e) {
      console.error("getGeneration", errorMessage(e));
    }
  }

  const shots = [...(generation.generation_shots ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const bucket = supabase.storage.from(GENERATIONS_BUCKET);

  const view: GenerationView = {
    kind: generation.kind as GenerationKind,
    status: generation.status as GenerationStatus,
    stage: generation.stage as GenerationView["stage"],
    shotsTotal: shots.length,
    framesDone: shots.filter((s) => ["framed", "video", "done"].includes(s.stage)).length,
    shotsDone: shots.filter((s) => s.stage === "done").length,
    error: translateStoredError(generation.error, await getDictionary()),
  };

  if (generation.poster_path) {
    const { data } = await bucket.createSignedUrl(
      generation.poster_path,
      SIGNED_URL_TTL_SECONDS,
    );
    view.posterUrl = data?.signedUrl;
  }

  if (view.status === "completed" && generation.storage_path) {
    const ext = generation.storage_path.split(".").pop();
    const [media, download] = await Promise.all([
      bucket.createSignedUrl(generation.storage_path, SIGNED_URL_TTL_SECONDS),
      bucket.createSignedUrl(generation.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: `twinpost-${generationId.slice(0, 8)}.${ext}`,
      }),
    ]);
    view.mediaUrl = media.data?.signedUrl;
    view.downloadUrl = download.data?.signedUrl;
  }

  return { data: view };
}

async function currentUserId() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  return auth?.claims?.sub ?? null;
}

const toResult = ({ error }: { error?: string }): Result<null> =>
  error ? { error } : { data: null };

// Abandonne une vidéo avant l'animation ; les crédits sont rendus.
export async function cancelVideo(generationId: string): Promise<Result<null>> {
  const t = await getDictionary();
  const userId = await currentUserId();
  if (!userId) return { error: t.common.sessionExpired };
  const { error } = await cancelFrames(generationId, userId);
  return toResult({ error: error && t.generateErrors[error] });
}

export type DirectorResult = {
  reply: string;
  draft: DirectorDraft | null;
  // Jeton signé du brouillon, à renvoyer au tour suivant et au lancement.
  draftToken: string | null;
};

// Un tour du mode Director : réponse de Claude et brouillon mis à jour.
export async function directorChat(input: {
  messages: DirectorMessage[];
  draftToken: string | null;
  // Jumeau choisi, ou rien pour une vidéo sans personnage.
  twinId?: string;
}): Promise<Result<DirectorResult>> {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: t.common.sessionExpired };
  const userId = auth.claims.sub;

  const messages = input.messages.slice(-MAX_DIRECTOR_MESSAGES);
  const valid = messages.every(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0 &&
      m.content.length <= MAX_DIRECTOR_MESSAGE_LENGTH,
  );
  if (!valid || messages.at(-1)?.role !== "user") {
    return { error: fmt(t.generateErrors.invalidMessage, { max: MAX_DIRECTOR_MESSAGE_LENGTH }) };
  }

  // Compté avant l'appel à Claude : un message qui échoue compte aussi.
  const { error: limitError } = await supabase.rpc("use_director_message");
  if (limitError) {
    return {
      error: limitError.message.includes("director_limit")
        ? fmt(t.generateErrors.directorLimit, { limit: DIRECTOR_DAILY_LIMIT })
        : t.generateErrors.directorDown,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();
  const presets = availablePresets(falEnabled(), Boolean(input.twinId)).map((p) => p.id);
  const current = input.draftToken ? readDraftToken(input.draftToken, userId) : null;

  try {
    const { reply, draft } = await directorTurn({
      messages,
      current,
      maxVideoSeconds: maxVideoSeconds(profile?.plan ?? "free"),
      presets,
      mode: input.twinId ? "twin" : "free",
      language: LANGUAGES[locale],
      refusal: t.generateErrors.directorRefusal,
    });
    return {
      data: { reply, draft, draftToken: draft ? createDraftToken(userId, draft) : null },
    };
  } catch (e) {
    console.error("directorChat", errorMessage(e));
    return {
      error:
        e instanceof Anthropic.AuthenticationError
          ? t.generateErrors.directorKey
          : t.generateErrors.directorDown,
    };
  }
}
