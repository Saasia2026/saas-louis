import { createClient } from "@/lib/supabase/server";
import { isTikTokImage } from "@/lib/trend-cover";

// Relais des couvertures de vidéos TikTok montrées dans Viralité : réservé aux
// comptes connectés et aux serveurs d'images de TikTok (pas un relais ouvert),
// gardé 6 h par le CDN de Vercel.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("unauthorized", { status: 401 });

  let target: URL;
  try {
    target = new URL(new URL(request.url).searchParams.get("u") ?? "");
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!isTikTokImage(target)) return new Response("bad url", { status: 400 });

  const upstream = await fetch(target, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      Referer: "https://www.tiktok.com/",
    },
    cache: "no-store",
  }).catch(() => null);
  const type = upstream?.headers.get("content-type") ?? "";
  if (!upstream?.ok || !type.startsWith("image/")) return new Response("unavailable", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=21600",
    },
  });
}
