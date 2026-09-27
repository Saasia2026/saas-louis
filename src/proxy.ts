import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images et les appels serveur à
    // serveur (webhooks Stripe et fournisseurs, relance des remplacements).
    "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|api/swap/|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
