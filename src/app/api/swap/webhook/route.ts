import { after } from "next/server";
import { errorMessage } from "@/lib/predictions";
import { advanceSwap } from "@/lib/swap";
import { verifySwapWebhook } from "@/lib/swap-webhook";

// Fin d'un rendu chez Higgsfield ou fal : le remplacement avance tout de
// suite, même si le créateur a fermé la page. Le corps n'est pas lu :
// advanceSwap relit l'état de chaque rendu chez le fournisseur. Réponse
// immédiate (Higgsfield exige moins de 10 s), le travail continue ensuite ;
// le montage peut en faire partie.
export const maxDuration = 300;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const generationId = url.searchParams.get("g");
  if (!verifySwapWebhook(generationId, url.searchParams.get("s"))) {
    return new Response("forbidden", { status: 403 });
  }
  after(() => advanceSwap(generationId!).catch((e) => console.error("swap webhook", errorMessage(e))));
  return new Response("ok");
}
