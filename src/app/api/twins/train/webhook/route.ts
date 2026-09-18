import { validateWebhook, type Training } from "replicate";
import { applyTrainingResult, getWebhookSigningSecret } from "@/lib/replicate";

// Appelé par Replicate quand un entraînement se termine.
export async function POST(request: Request) {
  const secret = await getWebhookSigningSecret();
  if (!secret) {
    console.error("Webhook Replicate : secret de signature indisponible");
    return new Response("Webhook not configured", { status: 500 });
  }

  const valid = await validateWebhook(request.clone(), secret).catch(() => false);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const training = (await request.json()) as Training;
  await applyTrainingResult(training);

  return new Response(null, { status: 204 });
}
