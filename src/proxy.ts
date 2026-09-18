import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images et les webhooks Replicate.
    "/((?!_next/static|_next/image|favicon.ico|api/.*/webhook|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
