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
  advanceVideoGeneration,
  cancelFrames,
  startVideoGeneration,
} from "@/lib/video-pipeline";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

const RPC_ERRORS: Record<string, string> = {
  insufficient_credits: "Pas assez de crédits.",
  duration_exceeds_plan: "Cette durée dépasse la limite de ton abonnement.",
  invalid_duration: "Durée invalide.",
  invalid_preset: "Qualité indisponible.",
  invalid_pace: "Rythme invalide.",
  not_authenticated: "Session expirée, reconnecte-toi.",
};

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
  const prompt = input.prompt.trim();
  if (!prompt) return { error: "Décris la scène à générer." };
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { error: `${MAX_PROMPT_LENGTH} caractères maximum.` };
  }
  if (!isAspectRatio(input.aspectRatio)) return { error: "Format invalide." };
  if (!isGenerationKind(input.kind)) return { error: "Type invalide." };
  const kind: GenerationKind = input.kind;
  const template = kind === "video" ? findTemplate(input.templateId) : undefined;
  if (kind === "video" && input.templateId && !template) {
    return { error: "Modèle de vidéo invalide." };
  }
  const preset = findPreset(input.preset ?? DEFAULT_PRESET);
  // Une photo n'utilise que le modèle d'image du préréglage.
  if (!preset || (kind === "video" && !availablePresets(falEnabled(), Boolean(input.twinId)).includes(preset))) {
    return { error: RPC_ERRORS.invalid_preset };
  }
  const pace = input.pace ?? DEFAULT_PACE;
  if (!isPace(pace)) return { error: "Rythme invalide." };
  // La durée doit tomber juste sur la longueur de plan du préréglage.
  const step = keptSeconds(preset.id, pace);
  const durationSeconds = Math.max(step, Math.round(input.durationSeconds / step) * step);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: RPC_ERRORS.not_authenticated };

  return startGeneration(supabase, auth.claims.sub, {
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
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: RPC_ERRORS.not_authenticated };

  const draft = readDraftToken(input.draftToken, auth.claims.sub);
  if (!draft) return { error: "Brouillon expiré. Envoie un message au Director pour le rafraîchir." };
  const preset = findPreset(draft.preset);
  if (!preset || !availablePresets(falEnabled(), Boolean(input.twinId)).includes(preset)) {
    return { error: RPC_ERRORS.invalid_preset };
  }

  return startGeneration(supabase, auth.claims.sub, {
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
      return { error: "Ton jumeau n'est pas encore prêt." };
    }
  } else if (kind === "image") {
    return { error: "Choisis un jumeau pour générer une photo." };
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
      return { error: "Ce personnage n'est pas prêt." };
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
    const code = Object.keys(RPC_ERRORS).find((c) => rpcError.message.includes(c));
    return { error: code ? RPC_ERRORS[code] : "Ton jumeau n'est pas encore prêt." };
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
        ? "Le compte du service de génération n'a plus de crédit. Tes crédits ont été rendus."
        : isRateLimited(e)
          ? "Le service de génération est saturé, réessaie dans quelques secondes. Tes crédits ont été rendus."
          : "La génération n'a pas pu démarrer. Tes crédits ont été rendus.",
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
  if (!initial) return { error: "Génération introuvable." };
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
    error: generation.error ?? undefined,
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
  const userId = await currentUserId();
  if (!userId) return { error: RPC_ERRORS.not_authenticated };
  return toResult(await cancelFrames(generationId, userId));
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
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return { error: RPC_ERRORS.not_authenticated };
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
    return { error: `Message invalide (${MAX_DIRECTOR_MESSAGE_LENGTH} caractères maximum).` };
  }

  // Compté avant l'appel à Claude : un message qui échoue compte aussi.
  const { error: limitError } = await supabase.rpc("use_director_message");
  if (limitError) {
    return {
      error: limitError.message.includes("director_limit")
        ? `Tu as atteint la limite de ${DIRECTOR_DAILY_LIMIT} messages au Director pour aujourd'hui. Reviens demain, ou lance ta vidéo avec le formulaire.`
        : "Le Director ne répond pas. Réessaie dans un instant.",
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
    });
    return {
      data: { reply, draft, draftToken: draft ? createDraftToken(userId, draft) : null },
    };
  } catch (e) {
    console.error("directorChat", errorMessage(e));
    return {
      error:
        e instanceof Anthropic.AuthenticationError
          ? "Le Director est indisponible : la clé du service IA est invalide."
          : "Le Director ne répond pas. Réessaie dans un instant.",
    };
  }
}
