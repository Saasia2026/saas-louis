"use server";

import { after } from "next/server";
import { fmt } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";
import { createFalCharacterPlanche, falEnabled } from "@/lib/fal";
import {
  SWAP_ENGINES,
  SWAP_INPUTS_BUCKET,
  SWAP_MAX_CHARACTERS,
  GENJUTSU_MIN_SECONDS,
  genjutsuBilledSeconds,
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
import { autoRecharge } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { polishSwapInstructions, precheckSwapInputs } from "@/lib/swap-check";
import {
  advanceSwap,
  cancelSwap as cancelSwapGeneration,
  preparePart,
  probeVideo,
  sampleFrames,
  splitIntoParts,
  type SwapMetadata,
  type SwapPart,
} from "@/lib/swap";

// Morceaux préparés (ffmpeg, envoi) en même temps, au plus.
const PREPARE_BATCH = 4;

async function mapInBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

const INPUT_URL_TTL_SECONDS = 60 * 60;

// Images du passage montrées au contrôle d'avant paiement.
const PRECHECK_FRAMES = 6;

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

// Remplacement de personnage, par la méthode du mannequin — la seule du
// site. Le clip et les photos sont déjà déposés dans swap-inputs par le
// navigateur. On mesure le clip, on le contrôle et on le découpe en
// séquences (rien n'est débité si le contrôle le refuse), on débite, puis
// chaque séquence passe deux fois par Genjutsu : les personnes deviennent des
// mannequins neutres, puis les mannequins deviennent les personnages (voir
// advanceParts dans swap.ts). Un à trois personnages.
export async function startSwap(input: {
  videoPath: string;
  // Chaque personnage, ses autres photos (visage, profil…) et qui il
  // remplace (facultatif s'il est seul).
  characters: { imagePath: string; extraPaths?: string[]; target?: string }[];
  // Plan prêt (voir presets.ts) : son clip tient lieu de videoPath, et qui
  // chaque personnage remplace vient de lui.
  presetId?: string;
  // Rendu en 1080p.
  hd?: boolean;
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
  const hd = input.hd === true;

  // Chemins sous le dossier de l'utilisateur uniquement.
  const own = (p: unknown) =>
    typeof p === "string" && p.startsWith(`${userId}/`) && !p.includes("..");
  const preset = input.presetId !== undefined ? presetById(input.presetId) : undefined;
  if (input.presetId !== undefined && !preset) return { error: errors.swapFiles };
  const videoPath = preset ? preset.path : input.videoPath;
  const list = Array.isArray(input.characters) ? input.characters : [];
  // Photos par personnage : 8 au plus en tout chez Higgsfield.
  const perCharacter = photosPerCharacter(list.length);
  const characters = list.map((c, i) => ({
    imagePath: c?.imagePath,
    extraPaths: (Array.isArray(c?.extraPaths) ? c.extraPaths : []).slice(0, perCharacter - 1),
    // Plan prêt : qui remplacer est fixé par le plan, personne par personne.
    target: preset
      ? (preset.people[i]?.target ?? "")
      : typeof c?.target === "string"
        ? c.target.trim().slice(0, 200)
        : "",
  }));
  if (!characters.length || characters.length > SWAP_MAX_CHARACTERS) return { error: errors.swapFiles };
  if (preset && characters.length > preset.people.length) return { error: errors.swapFiles };
  const decorImagePath = typeof input.decorImagePath === "string" ? input.decorImagePath : undefined;
  const rawInstructions =
    typeof input.instructions === "string" ? input.instructions.trim().slice(0, 500) : "";
  if (
    (!preset && !own(input.videoPath)) ||
    !characters.every((c) => own(c.imagePath) && c.extraPaths.every(own)) ||
    (decorImagePath !== undefined && !own(decorImagePath))
  ) {
    return { error: errors.swapFiles };
  }
  const several = characters.length > 1;
  // Plusieurs personnages : il faut savoir qui chacun remplace.
  if (several && characters.some((c) => !c.target)) return { error: errors.swapTargets };

  const admin = createAdminClient();
  // Le clip, puis chaque personnage (sa photo principale et ses autres
  // photos), puis le lieu.
  const photoPaths = characters.map((c) => [c.imagePath as string, ...c.extraPaths]);
  const extraPaths = decorImagePath ? [decorImagePath] : [];
  const { data: signed } = await admin.storage
    .from(SWAP_INPUTS_BUCKET)
    .createSignedUrls([videoPath, ...photoPaths.flat(), ...extraPaths], INPUT_URL_TTL_SECONDS);
  const [sourceUrl, ...rest] = (signed ?? []).map((s) => s.signedUrl);
  const flatUrls = rest.slice(0, photoPaths.flat().length);
  const decorSignedUrl = decorImagePath ? rest[photoPaths.flat().length] : undefined;
  if (
    !sourceUrl ||
    rest.length !== photoPaths.flat().length + extraPaths.length ||
    rest.some((u) => !u)
  ) {
    return { error: errors.swapFiles };
  }
  let next = 0;
  const photoUrls = photoPaths.map((paths) => paths.map(() => flatUrls[next++]!));
  const imageUrls = photoUrls.map((urls) => urls[0]);

  const probe = await probeVideo(sourceUrl).catch((e) => {
    console.error("probeVideo", errorMessage(e));
    return null;
  });
  if (!probe) return { error: errors.swapUnreadable };

  // Passage gardé : au plus la durée du moteur à partir de `start`. Une
  // fraction de seconde au-delà de la limite est tolérée (arrondi).
  const start =
    typeof input.start === "number" && Number.isFinite(input.start)
      ? Math.min(Math.max(0, input.start), Math.max(0, probe.seconds - 1))
      : 0;
  const clipSeconds = Math.min(
    probe.seconds - start,
    SWAP_ENGINES[engine].maxSeconds,
    // Plan prêt : sa durée annoncée, donc son prix.
    preset?.seconds ?? Infinity,
    typeof input.seconds === "number" && Number.isFinite(input.seconds)
      ? Math.max(GENJUTSU_MIN_SECONDS, input.seconds)
      : Infinity,
  );
  // Genjutsu refuse une vidéo de moins de 4 s.
  if (clipSeconds < GENJUTSU_MIN_SECONDS) {
    return { error: fmt(errors.swapTooShort, { min: Math.ceil(GENJUTSU_MIN_SECONDS) }) };
  }
  const durationSeconds = Math.max(1, Math.round(clipSeconds));
  const target = characters[0].target || undefined;

  // Avant de faire payer, en même temps : le découpage en séquences, qui
  // fixe le prix, et le contrôle du clip et des photos. Le filtre du moteur
  // refuse les enfants et la nudité : le créateur le sait tout de suite, sans
  // rien débiter. Contrôle indisponible : le clip passe.
  const [shots, precheck, instructions] = await Promise.all([
    splitIntoParts(sourceUrl, start, clipSeconds, engine).catch((e) => {
      console.error("startSwap: découpage", errorMessage(e));
      return null;
    }),
    sampleFrames(sourceUrl, start, clipSeconds, PRECHECK_FRAMES)
      .then((frames) =>
        precheckSwapInputs({
          frames,
          photoUrls: [...imageUrls, ...(decorSignedUrl ? [decorSignedUrl] : [])],
          characterCount: characters.length,
        }),
      )
      .catch((e) => {
        console.error("startSwap: contrôle", errorMessage(e));
        return null;
      }),
    // Consignes libres reformulées en anglais ; en panne, le texte brut sert.
    rawInstructions
      ? polishSwapInstructions(rawInstructions)
          .catch((e) => {
            console.error("polishSwapInstructions", errorMessage(e));
            return null;
          })
          .then((polished) => polished ?? rawInstructions)
      : undefined,
  ]);
  if (precheck?.blocked) {
    return {
      error: fmt(precheck.cause === "minor" ? errors.precheckMinor : errors.precheckNudity, {
        reason: precheck.reason,
      }),
    };
  }
  if (!shots?.length) return { error: errors.swapUnreadable };
  // Mannequin de chaque personnage : sa silhouette (contrôle indisponible :
  // homme) et une couleur à lui, qui le distingue à la seconde passe.
  const feminine = precheck && !precheck.blocked ? precheck.feminine : undefined;
  const mannequins = characters.map((_, i) => ({
    figure: (feminine?.[i] ? "femme" : "homme") as MannequinFigure,
    color: MANNEQUIN_COLORS[i],
  }));

  const metadata = {
    engine,
    ...(hd && { hd: true }),
    ...(decorImagePath && { decor_image_path: decorImagePath }),
    ...(instructions && { instructions }),
    vessel: true,
    photos: true,
    aspect_ratio: probe.aspectRatio,
    source_video_path: videoPath,
    ...(preset && { preset: preset.id }),
    source_start: start,
    character_image_path: characters[0].imagePath,
    started_at: new Date().toISOString(),
    ...(target && { target }),
  };
  // Secondes réellement facturées par passe, une fois le clip découpé.
  const billedSeconds = genjutsuBilledSeconds(shots.map((s) => s.seconds));
  const debit = () =>
    admin.rpc("start_swap_generation", {
      p_user_id: userId,
      p_duration_seconds: durationSeconds,
      // Les séquences sont réencodées à 30 images/s.
      p_frames_per_second: 30,
      p_metadata: metadata,
      p_engine: engine,
      p_billed_seconds: billedSeconds,
      // Une fiche par personnage.
      p_characters: characters.length,
      p_hd: hd,
      // La passe mannequin, au tarif de la passe des personnages.
      p_vessel: true,
    });
  let { data: generationId, error: rpcError } = await debit();
  // Solde trop bas et recharge automatique activée : la carte est débitée,
  // puis on réessaie une fois.
  if (
    rpcError?.message.includes("insufficient_credits") &&
    (await autoRecharge(
      userId,
      swapCredits(durationSeconds, engine, billedSeconds, characters.length, hd, false, true),
    ))
  ) {
    ({ data: generationId, error: rpcError } = await debit());
  }
  if (rpcError || !generationId) {
    if (rpcError?.message.includes("insufficient_credits")) {
      return { error: errors.insufficientCredits };
    }
    console.error("start_swap_generation", errorMessage(rpcError));
    return { error: errors.startFailed };
  }

  try {
    // En même temps, pour ne pas faire attendre : les séquences du clip, les
    // références de chaque personnage (planche IA et photos), la photo du
    // lieu s'il y en a une et la planche de chaque mannequin.
    const [parts, prepared, decorUrl, sheetUrls] = await Promise.all([
      mapInBatches(shots, PREPARE_BATCH, async (shot): Promise<SwapPart> => {
        const clip = await preparePart(sourceUrl, start + shot.start, shot.seconds, "genjutsu", hd);
        return { ...shot, videoUrl: await uploadToHiggsfield(clip, "video/mp4"), stage: "video" };
      }),
      Promise.all(
        photoUrls.map(async (urls) => {
          const planche = falEnabled()
            ? await createFalCharacterPlanche(urls[0]).catch((e) => {
                if (isOutOfCredit(e)) throw e;
                console.error("createFalCharacterPlanche", errorMessage(e));
                return null;
              })
            : null;
          const toUpload = planche ? [planche, ...urls] : urls;
          return {
            sheet: { frontUrl: planche ?? urls[0] },
            urls: await uploadPhotos(toUpload),
          };
        }),
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
          sheet: prepared[0].sheet,
          character_urls: prepared[0].urls,
          ...(decorUrl && { decor_url: decorUrl }),
          vessel_mannequins: mannequins.map((m, i) => ({ ...m, sheet_url: sheetUrls[i] })),
          ...(several && {
            characters: characters.map((c, i) => ({
              target: c.target,
              image_path: c.imagePath,
              front_url: prepared[i].sheet.frontUrl,
              urls: prepared[i].urls,
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
    // Solde passé sous le seuil : recharge automatique, une fois la réponse
    // partie.
    after(() => autoRecharge(userId).catch(() => {}));
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
    metadata.hd,
    Boolean(metadata.face),
  );
  const debit = () =>
    admin.rpc("start_swap_redo", {
      p_user_id: userId,
      p_generation_id: generation.id,
      p_credits: credits,
    });
  let { error: rpcError } = await debit();
  if (rpcError?.message.includes("insufficient_credits") && (await autoRecharge(userId, credits))) {
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
