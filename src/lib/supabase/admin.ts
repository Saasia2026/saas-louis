import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Client service_role : contourne la RLS. Réservé aux route handlers
// (webhooks Replicate, mises à jour de statut, remboursement de crédits).
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
