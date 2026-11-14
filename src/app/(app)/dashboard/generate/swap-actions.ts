"use server";

import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import {
  SWAP_ENGINES,
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_CHARACTERS,
  GENJUTSU_MAX_IMAGES,
  GENJUTSU_MIN_SECONDS,
  DEFAULT_GENJUTSU_MODEL,
  DEFAULT_SWAP_QUALITY,
  GENJUTSU_LIGHT_MAX_SECONDS,
  genjutsuSettingsOf,
  isGenjutsuModel,
  isSwapQuality,
  type GenjutsuModel,
  type SwapQuality,
  photosPerCharacter,
  swapCredits,
  swapShotCredits,
  type AspectRatio,
  type SwapEngine,
} from "@/lib/generation";
import {
  MANNEQUIN_COLORS,
  mannequinSheetPath,
  higgsfieldEnabled,
  uploadToHiggsfield,
  type MannequinFigure,
} from "@/lib/higgsfield";
import { presetById } from "@/lib/presets";
import {
  errorMessage,
  isContentRefused,
  isOutOfCredit,
  isRateLimited,
} from "@/lib/predictions";
import { payShortfall } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  advanceSwap,
  cancelSwap as cancelSwapGeneration,
  probeVideo,
  type SwapMetadata,
  type SwapPart,
} from "@/lib/swap";

// Le clip déposé, envoyé chez Higgsfield tel quel : ni découpe ni
// réencodage, Genjutsu lit lui-même les vidéos de téléphone (2026-11-08).
// Le dépôt Higgsfield n'accepte que le type video/mp4 (422 sur
// video/quicktime, 2026-11-08) : toute vidéo est déclarée ainsi, le fichier
// restant intact. Un .mov d'iPhone a le même conteneur qu'un .mp4, et
// Genjutsu lit le fichier d'après son contenu.
async function uploadOriginal(url: string) {
  const file = await fetch(url);
  if (!file.ok) throw new Error(`Clip déposé : ${file.status}`);
  return uploadToHiggsfield(await file.arrayBuffer(), "video/mp4");
}

// `needCredits` : refus faute de crédits, avec le prix de ce qui était demandé.
type Result<T> = { data: T; error?: never } | { data?: never; error: string; needCredits?: number };

const INPUT_URL_TTL_SECONDS = 60 * 60;



// Photos déposées par le créateur (URL signées), envoyées chez Higgsfield
// telles quelles.
async function uploadPhotos(urls: string[]) {
  return Promise.all(
    urls.map(async (url) => {
      const file = await fetch(url);
      if (!file.ok) throw new Error(`Photo du personnage : ${file.status}`);
      return uploadToHiggsfield(
        await file.arrayBuffer(),
        file.headers.get("content-type")?.split(";")[0] ?? "image/png",
      );
    }),
  );
}

// Planche d'un mannequin (voir mannequinSheetPath), envoyée chez Higgsfield.
// Introuvable : le remplacement échoue et tout est rendu, plutôt que de
// facturer une passe qui n'aurait pas lieu.
async function uploadMannequinSheet(admin: ReturnType<typeof createAdminClient>, path: string) {
  const { data, error } = await admin.storage.from(SWAP_INPUTS_BUCKET).download(path);
  if (!data) throw new Error(`Planche du mannequin ${path} : ${error?.message ?? "introuvable"}`);
  return uploadToHiggsfield(await data.arrayBuffer(), "image/png");
}

// Remplacement de personnage. Le clip et les photos sont déjà déposés dans
// swap-inputs par le navigateur. On mesure le clip, on le contrôle et on le
// découpe en séquences (rien n'est débité si le contrôle le refuse), on
// débite, puis chaque séquence passe par Genjutsu : une fois par défaut, ou
// deux en haute fidélité, où les personnes deviennent d'abord des mannequins
// neutres, puis les mannequins les personnages (voir advanceParts dans
// swap.ts). Un à trois personnages.
export async function startSwap(input: {
  videoPath: string;
  // Chaque personnage, ses autres photos (visage, profil…) et qui il
  // remplace (facultatif s'il est seul).
  characters: { imagePath: string; extraPaths?: string[]; target?: string }[];
  // Images en vrac du prompt unique (@image1 = la première…), à la place de
  // `characters` : les photos sont groupées par le créateur.
  photos?: string[];
  // Plan prêt (voir presets.ts) : son clip tient lieu de videoPath, et qui
  // chaque personnage remplace vient de lui.
  presetId?: string;
  // Rendu en 1080p (ancien réglage, remplacé par `quality`).
  hd?: boolean;
  // Genjutsu (Light chez Higgsfield) ou Genjutsu Max, et qualité du rendu.
  model?: GenjutsuModel;
  quality?: SwapQuality;
  // Haute fidélité : méthode du mannequin, deux passes, au double du prix.
  vessel?: boolean;
  // Changement de décor : photo du lieu déposée par le créateur. La scène est
  // reconstruite dans ce décor (Motion Transfer). Absente : le décor du clip
  // est gardé, seuls les personnages changent.
  decorImagePath?: string;
  // Consignes libres, facultatives : demandes en plus du remplacement
  // (« transforme la chaise en voiture de sport »), dans la langue du
  // créateur. Vides : seuls les références et les champs remplis comptent.
  instructions?: string;
  // Début du passage gardé, en secondes, pour un clip trop long.
  start?: number;
  // Durée du passage voulue, en secondes (au plus celle du moteur).
  seconds?: number;
}): Promise<Result<{ generationId: string; aspectRatio: AspectRatio; durationSeconds: number }>> {
  const t = await getDictionary();
  const errors = t.generateErrors;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: t.common.sessionExpired };
  if (!higgsfieldEnabled()) return { error: errors.startFailed };
  const engine: SwapEngine = "genjutsu";
  const model = isGenjutsuModel(input.model) ? input.model : DEFAULT_GENJUTSU_MODEL;
  const quality = isSwapQuality(input.quality)
    ? input.quality
    : input.hd === true
      ? "1080p"
      : DEFAULT_SWAP_QUALITY;
  const hd = quality === "1080p";
  const settings = { model, quality };
  let vessel = input.vessel === true;

  // Chemins sous le dossier de l'utilisateur uniquement.
  const own = (p: unknown) =>
    typeof p === "string" && p.startsWith(`${userId}/`) && !p.includes("..");
  const preset = input.presetId !== undefined ? presetById(input.presetId) : undefined;
  if (input.presetId !== undefined && !preset) return { error: errors.swapFiles };
  const videoPath = preset ? preset.path : input.videoPath;
  const list = Array.isArray(input.characters) ? input.characters : [];
  // Images par personnage : 8 au plus en tout chez Higgsfield.
  const perCharacter = photosPerCharacter(list.length);
  let characters = list.map((c, i) => ({
    imagePath: c?.imagePath,
    extraPaths: (Array.isArray(c?.extraPaths) ? c.extraPaths : []).slice(0, perCharacter - 1),
    object: false,
    // Plan prêt : qui remplacer est fixé par le plan, personne par personne.
    target: preset
      ? (preset.people[i]?.target ?? "")
      : typeof c?.target === "string"
        ? c.target.trim().slice(0, 200)
        : "",
  }));
  // Le prompt du créateur, tel qu'il l'a écrit (vide s'il n'a rien écrit).
  const rawInstructions =
    typeof input.instructions === "string" && input.instructions.trim() ? input.instructions : "";
  // Images en vrac (mode « photos »). Deux cas :
  // — avec consignes + plusieurs photos : chaque photo = une image de
  //   référence distincte ; les consignes disent qui remplacer par quelle
  //   image, exactement comme l'interface Higgsfield.
  // — sans consignes ou une seule photo : toutes les photos sont des vues
  //   du même personnage.
  const flatPhotos =
    !preset && Array.isArray(input.photos)
      ? input.photos.filter((p): p is string => typeof p === "string").slice(0, GENJUTSU_MAX_IMAGES)
      : [];
  const flat = flatPhotos.length > 0;
  // Studio : la vidéo et les images partent dans l'ordre du dépôt (8 au plus).
  // Le prompt du créateur, s'il en a écrit un, est intégré dans le prompt
  // structuré comme REQUESTED CHANGES. Sans consignes, le prompt structuré
  // assure l'intégration du personnage (sinon Genjutsu le « détoure »).
  const directMode = flat;
  if (flat) {
    if (rawInstructions && flatPhotos.length > 1) {
      characters = flatPhotos.map((p) => ({ imagePath: p, extraPaths: [] as string[], target: "", object: false }));
    } else {
      characters = [{ imagePath: flatPhotos[0], extraPaths: flatPhotos.slice(1), target: "", object: false }];
    }
  }
  const decorImagePath = typeof input.decorImagePath === "string" ? input.decorImagePath : undefined;
  // Sans image dans la case principale, seul le lieu change.
  if (!characters.length && !decorImagePath) return { error: errors.swapFiles };
  if (characters.length > (directMode ? GENJUTSU_MAX_IMAGES : SWAP_MAX_CHARACTERS)) {
    return { error: fmt(errors.swapTooManyCharacters, { max: SWAP_MAX_CHARACTERS }) };
  }
  if (preset && characters.length > preset.people.length) return { error: errors.swapFiles };
  if (
    (!preset && !own(input.videoPath)) ||
    !characters.every((c) => own(c.imagePath) && c.extraPaths.every(own)) ||
    (decorImagePath !== undefined && !own(decorImagePath))
  ) {
    return { error: errors.swapFiles };
  }

  const admin = createAdminClient();
  // Le clip, puis toutes les photos (personnage par personnage), puis le lieu.
  const allPhotoPaths = characters.flatMap((c) => [c.imagePath as string, ...c.extraPaths]);
  const extraPaths = decorImagePath ? [decorImagePath] : [];
  const { data: signed } = await admin.storage
    .from(SWAP_INPUTS_BUCKET)
    .createSignedUrls([videoPath, ...allPhotoPaths, ...extraPaths], INPUT_URL_TTL_SECONDS);
  const [sourceUrl, ...rest] = (signed ?? []).map((s) => s.signedUrl);
  // Toutes non nulles, vérifié juste après.
  const allPhotoUrls = rest.slice(0, allPhotoPaths.length) as string[];
  const decorSignedUrl = decorImagePath ? rest[allPhotoPaths.length] : undefined;
  if (!sourceUrl || rest.length !== allPhotoPaths.length + extraPaths.length || rest.some((u) => !u)) {
    return { error: errors.swapFiles };
  }

  const probe = await probeVideo(sourceUrl).catch((e) => {
    console.error("probeVideo", errorMessage(e));
    return null;
  });
  if (!probe) return { error: errors.swapUnreadable };

  // Le clip part tel quel, en un seul envoi : pas de découpe ni de
  // réencodage. Seules comptent les règles de Genjutsu : 4 s au moins, et il
  // ne lit que les 30 premières secondes (15 pour Shinka), seules facturées.
  const start = 0;
  const clipSeconds = Math.min(
    probe.seconds,
    model === "standard" ? GENJUTSU_LIGHT_MAX_SECONDS : SWAP_ENGINES[engine].maxSeconds,
    // Plan prêt : sa durée annoncée, donc son prix.
    preset?.seconds ?? Infinity,
  );
  if (probe.seconds < GENJUTSU_MIN_SECONDS - 0.5) {
    return { error: fmt(errors.swapTooShort, { min: Math.ceil(GENJUTSU_MIN_SECONDS - 0.5) }) };
  }
  const durationSeconds = Math.max(1, Math.round(clipSeconds));
  const shots: SwapPart[] = [{ start: 0, seconds: clipSeconds, stage: "video" }];

  // Consignes du créateur, passées au prompt structuré (REQUESTED CHANGES).
  const instructions: string | undefined = rawInstructions || undefined;
  const directPrompt = directMode;
  const several = characters.length > 1;
  const people = characters.filter((c) => !c.object);
  // La haute fidélité passe par des mannequins de personnes.
  if (!people.length) vessel = false;
  // Toutes les images comptent comme personnages seulement si c'est le cas.
  const listed = several || people.length !== characters.length;
  // Plusieurs éléments : il faut savoir ce que chacun remplace (sauf en
  // mode vrac, où les consignes du créateur font le ciblage).
  if (several && !flat && characters.some((c) => !c.target)) return { error: errors.swapTargets };
  // Photos de chaque personnage, dans la distribution retenue.
  const urlOfPath = new Map(allPhotoPaths.map((p, i) => [p, allPhotoUrls[i]!]));
  const photoUrls = characters.map((c) => [c.imagePath as string, ...c.extraPaths].map((p) => urlOfPath.get(p)!));
  const imageUrls = photoUrls.map((urls) => urls[0]);
  const target = characters[0]?.target || undefined;

  // Haute fidélité, mannequin de chaque personnage : homme par défaut (plus de
  // détection automatique sans Claude).
  const mannequins = vessel
    ? people.map((_, i) => ({
        figure: "homme" as MannequinFigure,
        color: MANNEQUIN_COLORS[i],
      }))
    : [];

  const metadata = {
    engine,
    ...(hd && { hd: true }),
    model,
    quality,
    ...(decorImagePath && { decor_image_path: decorImagePath }),
    ...(instructions && { instructions }),
    ...(directPrompt && { direct_prompt: true }),
    ...(vessel && { vessel: true }),
    photos: true,
    aspect_ratio: probe.aspectRatio,
    source_video_path: videoPath,
    ...(preset && { preset: preset.id }),
    source_start: start,
    character_image_path: characters[0]?.imagePath,
    started_at: new Date().toISOString(),
    ...(target && { target }),
  };
  // Secondes facturées par Higgsfield : la durée lue, à la seconde entamée.
  const billedSeconds = Math.ceil(clipSeconds - 0.01);
  const debit = () =>
    admin.rpc("start_swap_generation", {
      p_user_id: userId,
      p_duration_seconds: durationSeconds,
      p_frames_per_second: 30,
      p_metadata: metadata,
      p_engine: engine,
      p_billed_seconds: billedSeconds,
      // Le prix ne dépend pas du nombre de personnages ; la base le borne à 3.
      p_characters: Math.min(3, Math.max(1, people.length)),
      p_hd: hd,
      // Haute fidélité : la passe mannequin, au tarif de celle des personnages.
      p_vessel: vessel,
      // Absents pour Genjutsu Max en 720p ou 1080p : la fonction reste
      // appelable tant que la migration swap_genjutsu_models n'est pas passée.
      ...(model === "standard" && { p_light: true }),
      ...(quality === "480p" && { p_quality: quality }),
    });
  let { data: generationId, error: rpcError } = await debit();
  // Solde trop bas et paiement à l'usage accepté : la carte paie ce qui manque,
  // puis on réessaie une fois.
  if (
    rpcError?.message.includes("insufficient_credits") &&
    (await payShortfall(
      userId,
      swapCredits(durationSeconds, engine, billedSeconds, characters.length, settings, false, vessel),
    ))
  ) {
    ({ data: generationId, error: rpcError } = await debit());
  }
  if (rpcError || !generationId) {
    if (rpcError?.message.includes("insufficient_credits")) {
      return {
        error: errors.insufficientCredits,
        needCredits: swapCredits(durationSeconds, engine, billedSeconds, characters.length, settings, false, vessel),
      };
    }
    console.error("start_swap_generation", errorMessage(rpcError));
    return { error: errors.startFailed };
  }

  try {
    // En même temps, pour ne pas faire attendre : le clip et les images de
    // chaque élément, tels que déposés, la photo du lieu s'il y en a une et la
    // planche de chaque mannequin, tous transférés chez Higgsfield.
    const [parts, prepared, decorUrl, sheetUrls] = await Promise.all([
      uploadOriginal(sourceUrl).then((videoUrl) => shots.map((shot) => ({ ...shot, videoUrl }))),
      Promise.all(
        photoUrls.map(async (urls) => ({
          sheet: { frontUrl: urls[0] },
          urls: await uploadPhotos(urls),
        })),
      ),
      decorSignedUrl ? uploadPhotos([decorSignedUrl]).then((urls) => urls[0]) : undefined,
      Promise.all(mannequins.map((m) => uploadMannequinSheet(admin, mannequinSheetPath(m.figure, m.color)))),
    ]);
    // Gardé sur « pending » : une génération déjà remboursée (préparation
    // trop longue, voir GeneratePage) n'est pas relancée.
    const { data: updated, error: updateError } = await admin
      .from("generations")
      .update({
        status: "processing",
        metadata: {
          ...metadata,
          // Lieu seul : sa photo sert de repère au suivi.
          sheet: prepared[0]?.sheet ?? { frontUrl: decorSignedUrl },
          character_urls: prepared[0]?.urls ?? [],
          ...(decorUrl && { decor_url: decorUrl }),
          ...(vessel && {
            vessel_mannequins: mannequins.map((m, i) => ({ ...m, sheet_url: sheetUrls[i] })),
          }),
          ...((listed || !characters.length) && {
            characters: characters.map((c, i) => ({
              target: c.target,
              image_path: c.imagePath,
              front_url: prepared[i].sheet.frontUrl,
              urls: prepared[i].urls,
              ...(c.object && { object: true }),
            })),
          }),
          swap_parts: parts,
          rev: 0,
        },
      })
      .eq("id", generationId)
      .eq("status", "pending")
      .select("id");
    if (updateError || !updated?.length) {
      throw new Error(`generations.update : ${updateError?.message ?? "génération déjà close"}`);
    }
    // Lance tout de suite les premiers rendus ; le suivi fait le reste.
    await advanceSwap(generationId);
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

// Refait un seul plan d'un remplacement terminé : avec kling, une nouvelle
// image clé (fidèle à celle du premier plan) ; avec genjutsu, la séquence. Le plan est débité à part ; s'il rate,
// la vidéo garde l'ancien plan et son prix est rendu (voir abandonRedo).
export async function redoSwapShot(input: {
  generationId: string;
  index: number;
}): Promise<Result<{ aspectRatio: AspectRatio; durationSeconds: number }>> {
  const t = await getDictionary();
  const errors = t.generateErrors;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: t.common.sessionExpired };

  const admin = createAdminClient();
  const { data: generation } = await admin
    .from("generations")
    .select("id, status, duration_seconds, metadata")
    .eq("id", input.generationId)
    .eq("user_id", userId)
    .eq("kind", "swap")
    .maybeSingle();
  const metadata = (generation?.metadata ?? {}) as SwapMetadata & { aspect_ratio?: AspectRatio };
  const parts = metadata.swap_parts ?? [];
  const part = parts[input.index];
  if (!generation || generation.status !== "completed" || !part?.clipPath || !part.videoUrl) {
    return { error: errors.swapRedoUnavailable };
  }
  const genjutsu = metadata.engine === "genjutsu";

  const credits = swapShotCredits(
    part.seconds,
    genjutsu ? "genjutsu" : "kling",
    genjutsuSettingsOf(metadata),
    Boolean(metadata.face),
  );
  const debit = () =>
    admin.rpc("start_swap_redo", {
      p_user_id: userId,
      p_generation_id: generation.id,
      p_credits: credits,
    });
  let { error: rpcError } = await debit();
  if (rpcError?.message.includes("insufficient_credits") && (await payShortfall(userId, credits))) {
    ({ error: rpcError } = await debit());
  }
  if (rpcError) {
    if (rpcError.message.includes("insufficient_credits")) {
      return { error: errors.insufficientCredits };
    }
    console.error("start_swap_redo", errorMessage(rpcError));
    return { error: errors.swapRedoUnavailable };
  }

  // L'échec d'un plan refait avant celui-ci n'est plus à signaler.
  for (const p of parts) delete p.redoFailed;
  parts[input.index] = {
    start: part.start,
    seconds: part.seconds,
    videoUrl: part.videoUrl,
    // Base neutre : le mannequin déjà rendu sert de départ, seule la passe
    // du personnage est refaite (et facturée).
    vesselUrl: part.vesselUrl,
    firstFrameUrl: part.firstFrameUrl,
    width: part.width,
    height: part.height,
    // Genjutsu repart de la séquence d'origine, sans image clé.
    stage: genjutsu ? "video" : "keyframe",
    redo: { previousClipPath: part.clipPath, credits, original: part.original, check: part.check },
  };
  const { error: updateError } = await admin
    .from("generations")
    .update({
      metadata: {
        ...metadata,
        swap_parts: parts,
        started_at: new Date().toISOString(),
        busy_until: null,
      },
    })
    .eq("id", generation.id);
  if (updateError) {
    // Plan non relancé : son prix est rendu, la vidéo reste terminée.
    console.error("redoSwapShot", updateError.message);
    await admin.rpc("refund_swap_redo", { p_generation_id: generation.id, p_credits: credits });
    await admin
      .from("generations")
      .update({ status: "completed" })
      .eq("id", generation.id)
      .eq("status", "processing");
    return { error: errors.swapRedoUnavailable };
  }
  await advanceSwap(generation.id).catch((e) => console.error("redoSwapShot", errorMessage(e)));

  return {
    data: {
      aspectRatio: metadata.aspect_ratio ?? "9:16",
      durationSeconds: generation.duration_seconds ?? 15,
    },
  };
}

// Arrête un remplacement en cours (voir cancelSwap dans swap.ts).
export async function cancelSwap(generationId: string): Promise<Result<null>> {
  const t = await getDictionary();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: t.common.sessionExpired };
  const cancelled = await cancelSwapGeneration(generationId, userId).catch((e) => {
    console.error("cancelSwap", errorMessage(e));
    return false;
  });
  return cancelled ? { data: null } : { error: t.generateErrors.cancelUnavailable };
}
