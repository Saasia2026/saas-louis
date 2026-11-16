"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FeedCategory } from "./feed-items";

// Ce que le fil retient des goûts, par catégorie : secondes regardées,
// revisionnages, j'aime, clics sur « Recréer ».
export type Tally = { watch: number; rewatch: number; like: number; recreate: number };
export type Tallies = Partial<Record<FeedCategory, Tally>>;
export type TrackKind = keyof Tally;

const CATEGORIES: FeedCategory[] = ["shinka", "personas", "trending"];
// Sans compte : les goûts restent dans ce navigateur. Avec un compte : copie
// locale des totaux de feed_scores, pour ordonner « Pour toi » dès l'ouverture.
const GUEST_KEY = "feed:scores:guest";
const USER_KEY = "feed:scores:user";
// Envoi groupé vers la base, pour ne pas écrire à chaque seconde regardée.
const FLUSH_MS = 20_000;

const empty = (): Tally => ({ watch: 0, rewatch: 0, like: 0, recreate: 0 });

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function add(into: Tallies, from: Tallies) {
  for (const category of CATEGORIES) {
    const extra = from[category];
    if (!extra) continue;
    const tally = (into[category] ??= empty());
    tally.watch += extra.watch;
    tally.rewatch += extra.rewatch;
    tally.like += extra.like;
    tally.recreate += extra.recreate;
  }
  return into;
}

// Poids d'une catégorie dans « Pour toi » : 1 sans historique, puis il monte
// doucement (logarithme) avec l'intérêt montré. Une recréation pèse plus
// qu'un j'aime, qui pèse plus qu'une seconde regardée.
export function categoryWeights(tallies: Tallies): Record<FeedCategory, number> {
  const weights = {} as Record<FeedCategory, number>;
  for (const category of CATEGORIES) {
    const t = tallies[category];
    const score = t ? t.watch / 20 + t.rewatch * 2 + t.like * 3 + t.recreate * 6 : 0;
    weights[category] = 1 + Math.log1p(score);
  }
  return weights;
}

type UserCache = { uid: string; tallies: Tallies };

export function useFeedScores() {
  const supabase = useMemo(() => createClient(), []);
  // Goûts connus à l'ouverture du fil (figés : l'ordre ne bouge pas en cours
  // de visite).
  const [atOpen] = useState<Tallies>(() =>
    add(add({}, readJson<UserCache>(USER_KEY)?.tallies ?? {}), readJson<Tallies>(GUEST_KEY) ?? {}),
  );
  const uid = useRef<string | null>(null);
  // Reste à envoyer à la base (compte connecté).
  const pending = useRef<Tallies>({});

  const flush = useCallback(async () => {
    if (!uid.current) return;
    const batch = pending.current;
    pending.current = {};
    for (const category of CATEGORIES) {
      const t = batch[category];
      if (!t || !(t.watch || t.rewatch || t.like || t.recreate)) continue;
      const { error } = await supabase.rpc("feed_track", {
        p_category: category,
        p_watch: Math.round(t.watch),
        p_rewatches: t.rewatch,
        p_likes: t.like,
        p_recreates: t.recreate,
      });
      // Échec (réseau, table absente) : gardé pour le prochain envoi.
      if (error) add(pending.current, { [category]: t });
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user.id;
      if (!id || cancelled) return;
      const { data: rows, error } = await supabase
        .from("feed_scores")
        .select("category, watch_seconds, rewatches, likes, recreates");
      if (cancelled || error) return;
      uid.current = id;
      // L'historique sans compte de ce navigateur rejoint le compte, une fois.
      const guest = readJson<Tallies>(GUEST_KEY) ?? {};
      forget(GUEST_KEY);
      add(pending.current, guest);
      const remote: Tallies = {};
      for (const row of rows ?? []) {
        remote[row.category as FeedCategory] = {
          watch: row.watch_seconds,
          rewatch: row.rewatches,
          like: row.likes,
          recreate: row.recreates,
        };
      }
      writeJson(USER_KEY, { uid: id, tallies: add(remote, pending.current) } satisfies UserCache);
      void flush();
    })();

    const timer = setInterval(() => void flush(), FLUSH_MS);
    const onHide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [supabase, flush]);

  const track = useCallback((category: FeedCategory, kind: TrackKind, amount = 1) => {
    const delta: Tallies = { [category]: { ...empty(), [kind]: amount } };
    if (uid.current) {
      add(pending.current, delta);
      const cache = readJson<UserCache>(USER_KEY);
      if (cache?.uid === uid.current) writeJson(USER_KEY, { ...cache, tallies: add(cache.tallies, delta) });
    } else {
      writeJson(GUEST_KEY, add(readJson<Tallies>(GUEST_KEY) ?? {}, delta));
    }
  }, []);

  const weights = useMemo(() => categoryWeights(atOpen), [atOpen]);
  return { weights, track };
}
