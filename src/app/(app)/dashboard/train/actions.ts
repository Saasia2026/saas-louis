"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MIN_PHOTOS } from "@/lib/twin";

type Result<T> = { data: T; error?: never } | { data?: never; error: string };

// Renvoie le jumeau en attente de l'utilisateur, ou en crée un.
// Appelée juste avant le premier upload, pour ne pas créer de jumeau vide.
export async function ensurePendingTwin(): Promise<Result<{ twinId: string }>> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  const { data: existing } = await supabase
    .from("twins")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { data: { twinId: existing.id } };
  }

  const { count } = await supabase
    .from("twins")
    .select("id", { count: "exact", head: true });
  const { data: created, error } = await supabase
    .from("twins")
    .insert({ name: `Jumeau ${(count ?? 0) + 1}` })
    .select("id")
    .single();
  if (error) {
    return { error: "Impossible de créer ton jumeau. Réessaie." };
  }
  return { data: { twinId: created.id } };
}

// Valide le jumeau : ses photos servent directement de références aux
// modèles d'image et de vidéo, sans entraînement.
export async function activateTwin(
  twinId: string,
  consentConfirmed: boolean,
): Promise<Result<null>> {
  if (consentConfirmed !== true) {
    return { error: "Confirme que les photos sont bien de toi." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  // Lecture via la session : la RLS garantit que le jumeau et les photos
  // appartiennent bien à l'utilisateur.
  const { count } = await supabase
    .from("training_photos")
    .select("id", { count: "exact", head: true })
    .eq("twin_id", twinId);
  if ((count ?? 0) < MIN_PHOTOS) {
    return { error: `Il faut au moins ${MIN_PHOTOS} photos.` };
  }

  const now = new Date().toISOString();
  const { data: activated } = await createAdminClient()
    .from("twins")
    .update({ status: "ready", consent_confirmed_at: now, training_completed_at: now })
    .eq("id", twinId)
    .eq("user_id", auth.claims.sub)
    .eq("status", "pending")
    .select("id");
  if (!activated?.length) {
    return { error: "Ce jumeau est déjà prêt." };
  }

  redirect(`/dashboard/twins/${twinId}`);
}
