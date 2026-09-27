import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { errorMessage } from "@/lib/predictions";
import { advanceSwap } from "@/lib/swap";
import { createAdminClient } from "@/lib/supabase/admin";

// Relance serveur des remplacements en cours, appelée toutes les 30 s par
// pg_cron (voir la migration swap_background_tick) tant qu'il y en a. Filet
// des webhooks : un webhook perdu, un montage coupé ou une séquence en
// attente avancent sans que personne ait la page ouverte. Le verrou
// d'advanceSwap rend sans danger les appels simultanés (studio, webhook, relance).
export const maxDuration = 300;

// Remplacements relancés par appel, les plus anciens d'abord.
const BATCH = 20;
// Lancement coupé en pleine préparation : resté « pending » après débit.
// Remboursé au-delà de deux fois la durée maximale d'un lancement.
const STALE_PENDING_MS = 10 * 60_000;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response("forbidden", { status: 403 });
  const admin = createAdminClient();

  const { data: stale } = await admin
    .from("generations")
    .select("id")
    .eq("kind", "swap")
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - STALE_PENDING_MS).toISOString());
  for (const g of stale ?? []) await admin.rpc("fail_generation", { p_generation_id: g.id });

  const { data: running } = await admin
    .from("generations")
    .select("id")
    .eq("kind", "swap")
    .eq("status", "processing")
    .order("created_at", { ascending: true })
    .limit(BATCH);
  const ids = (running ?? []).map((g) => g.id);
  after(() =>
    Promise.all(
      ids.map((id) => advanceSwap(id).catch((e) => console.error("swap tick", id, errorMessage(e)))),
    ),
  );
  return Response.json({ advancing: ids.length, refunded: stale?.length ?? 0 });
}
