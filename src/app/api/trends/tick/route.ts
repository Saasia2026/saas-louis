import { after } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { refreshTrendPicks } from "@/lib/trends";

// Appelée chaque matin par pg_cron (voir la migration studio_bots) : répond
// tout de suite, puis récolte et trie la sélection du jour (environ une
// minute : Apify puis Claude).
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return new Response("forbidden", { status: 403 });
  after(async () => {
    try {
      console.info("trends: sélection du jour", JSON.stringify(await refreshTrendPicks()));
    } catch (e) {
      console.error("trends: échec", e instanceof Error ? e.message : e);
    }
  });
  return Response.json({ started: true }, { status: 202 });
}
