import "server-only";
import { timingSafeEqual } from "node:crypto";

// Appels de pg_cron : « Authorization: Bearer CRON_SECRET » (le même secret
// est rangé dans le Vault de Supabase sous swap_tick_secret).
export function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
