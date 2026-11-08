import type { NextRequest } from "next/server";
import { normalizeRefCode, REF_COOKIE, refCookieOptions } from "@/lib/referral-code";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  // Lien partenaire (twinpost.video/?ref=archie) : on garde le code jusqu'à
  // l'inscription, qui rattache le nouveau compte au partenaire.
  const ref = normalizeRefCode(request.nextUrl.searchParams.get("ref"));
  if (ref) {
    response.cookies.set(REF_COOKIE, ref, refCookieOptions);
  }
  return response;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images et les appels serveur à
    // serveur (webhooks Stripe et fournisseurs, relance des remplacements).
    "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|api/swap/|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
