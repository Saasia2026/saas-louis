import "server-only";
import type { PredictionState, PredictionStatus } from "@/lib/predictions";

// Magic Hour : moteur « visage seul » du remplacement (voir swap.ts). Le
// visage du personnage remplace tous les visages du passage, image par image ;
// gestes, décor, vêtements et son restent ceux du clip. Facturé à l'image
// rendue (1 crédit Magic Hour par image, soit ~0,03 $ la seconde à 30 images/s
// avec le forfait Pro). Magic Hour lit le clip sur son URL signée et découpe
// le passage lui-même (start_seconds/end_seconds) : rien n'est réencodé ni
// déposé chez lui.
//
// Les identifiants sont préfixés "mh:swap:<id>" : le préfixe dit comment les
// suivre (voir advanceParts). Magic Hour n'a pas de webhook par requête : le
// suivi passe par /api/swap/tick.
const BASE_URL = "https://api.magichour.ai/v1";

// MAGIC_HOUR_API_KEY : clé créée sur magichour.ai/developer.
export function magichourEnabled() {
  return Boolean(process.env.MAGIC_HOUR_API_KEY);
}

function headers() {
  const key = process.env.MAGIC_HOUR_API_KEY;
  if (!key) throw new Error("MAGIC_HOUR_API_KEY manquant");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// Statut et début de la réponse seulement : la requête porte la clé.
async function failure(step: string, response: Response) {
  const body = await response.text().catch(() => "");
  return Object.assign(new Error(`Magic Hour ${step} : ${response.status} ${body.slice(0, 300)}`), {
    status: response.status,
  });
}

export async function createMagicHourSwap(input: {
  videoUrl: string;
  faceUrl: string;
  startSeconds: number;
  endSeconds: number;
  name?: string;
}): Promise<string> {
  const response = await fetch(`${BASE_URL}/face-swap`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: input.name,
      start_seconds: Number(input.startSeconds.toFixed(3)),
      end_seconds: Number(input.endSeconds.toFixed(3)),
      style: { version: "default" },
      assets: {
        face_swap_mode: "all-faces",
        image_file_path: input.faceUrl,
        video_source: "file",
        video_file_path: input.videoUrl,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw await failure("création", response);
  const data = (await response.json()) as { id: string };
  return `mh:swap:${data.id}`;
}

const STATUS: Record<string, PredictionStatus> = {
  draft: "starting",
  queued: "starting",
  rendering: "processing",
  complete: "succeeded",
  error: "failed",
  canceled: "canceled",
};

export async function getMagicHourPrediction(id: string): Promise<PredictionState> {
  const projectId = id.replace(/^mh:swap:/, "");
  const response = await fetch(`${BASE_URL}/video-projects/${encodeURIComponent(projectId)}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw await failure("suivi", response);
  const data = (await response.json()) as {
    status: string;
    downloads?: { url: string; expires_at: string }[];
    error?: { code?: string; message?: string } | null;
  };
  const status = STATUS[data.status] ?? "processing";
  return {
    id,
    status,
    output: status === "succeeded" ? (data.downloads?.[0]?.url ?? null) : null,
    error: data.error
      ? [data.error.code, data.error.message].filter(Boolean).join(" · ").slice(0, 200)
      : undefined,
  };
}
