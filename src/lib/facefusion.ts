import "server-only";
import type { PredictionState, PredictionStatus } from "@/lib/predictions";

// Serveur FaceFusion local — face swap open source (InsightFace inswapper_128)
// sans filtre de contenu. Le serveur tourne sur la machine de l'utilisateur
// (GPU) et expose une API REST (voir server/main.py).
//
// Les identifiants de requête sont préfixés "ff:swap:<id>" : le préfixe dit
// comment les suivre (voir advanceParts dans swap.ts).

export function facefusionEnabled() {
  return Boolean(process.env.FACEFUSION_URL);
}

function baseUrl() {
  const url = process.env.FACEFUSION_URL;
  if (!url) throw new Error("FACEFUSION_URL manquant");
  return url.replace(/\/+$/, "");
}

function headers(): Record<string, string> {
  const key = process.env.FACEFUSION_KEY;
  return {
    "Content-Type": "application/json",
    ...(key && { Authorization: `Bearer ${key}` }),
  };
}

export async function createFaceFusionSwap(input: {
  videoUrl: string;
  faceUrl: string;
  webhookUrl?: string;
}): Promise<string> {
  const response = await fetch(`${baseUrl()}/api/swap`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      video_url: input.videoUrl,
      face_url: input.faceUrl,
      webhook_url: input.webhookUrl,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw Object.assign(new Error(`FaceFusion ${response.status}: ${body.slice(0, 300)}`), {
      status: response.status,
    });
  }
  const data = (await response.json()) as { job_id: string };
  return `ff:swap:${data.job_id}`;
}

export async function getFaceFusionPrediction(id: string): Promise<PredictionState> {
  const jobId = id.replace(/^ff:swap:/, "");
  const response = await fetch(`${baseUrl()}/api/jobs/${jobId}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`FaceFusion status ${response.status}`);
  const data = (await response.json()) as {
    status: string;
    progress: number;
    result_url?: string;
    error?: string;
  };

  const STATUS_MAP: Record<string, PredictionStatus> = {
    queued: "starting",
    processing: "processing",
    completed: "succeeded",
    failed: "failed",
  };
  const status = STATUS_MAP[data.status] ?? "processing";
  const output =
    status === "succeeded" && data.result_url ? `${baseUrl()}${data.result_url}` : null;

  return { id, status, output, error: data.error };
}
