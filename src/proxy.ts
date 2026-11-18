import { NextResponse, type NextRequest } from "next/server";
import { normalizeRefCode, REF_COOKIE, refCookieOptions } from "@/lib/referral-code";
import { updateSession } from "@/lib/supabase/proxy";

const IN_APP_BROWSER_RE =
  /Musical_ly|BytedanceWebview|TikTok|Instagram|FBAN|FBAV|Snapchat|Twitter|Line\//i;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ua = request.headers.get("user-agent") ?? "";

  // Navigateur in-app (TikTok, Instagram…) : on redirige vers /open pour
  // laisser l'utilisateur ouvrir dans son vrai navigateur.
  if (
    IN_APP_BROWSER_RE.test(ua) &&
    pathname !== "/open" &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/")
  ) {
    const url = request.nextUrl.clone();
    const next = pathname + request.nextUrl.search;
    url.pathname = "/open";
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

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
