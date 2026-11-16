"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { clipId, DEMO_CLIPS, type DemoClip } from "../demo-clips";

export type FeedSource = "own" | "partner";
export type FeedCategory = "shinka" | "personas" | "trending";

export type FeedItem = {
  // uuid de feed_items ; null pour la liste de secours du code (pas de réactions).
  id: string | null;
  slug: string;
  source: FeedSource;
  videoUrl: string;
  posterUrl: string | null;
  beforeUrl: string | null;
  revealAt: number | null;
  ratio: string;
  hasSound: boolean;
  creator: { handle: string; name: string | null; url: string | null; avatarUrl: string | null } | null;
  caption: string | null;
  category: FeedCategory;
  likeCount: number;
  recreateCount: number;
};

function fromClip(clip: DemoClip): FeedItem {
  const slug = clipId(clip);
  const pair = slug.endsWith("-apres");
  return {
    id: null,
    slug,
    source: "own",
    videoUrl: `${clip.base}.mp4`,
    posterUrl: `${clip.base}.jpg`,
    beforeUrl: pair ? `${clip.base.replace(/-apres$/, "-avant")}.mp4` : null,
    revealAt: pair ? 1.5 : null,
    ratio: clip.ratio,
    hasSound: Boolean(clip.sound),
    creator: null,
    caption: null,
    category: "shinka",
    likeCount: 0,
    recreateCount: 0,
  };
}

// Repli : les démos écrites dans le code, identiques aux lignes de départ de
// la table. Affichées tout de suite, et gardées si la base ne répond pas.
export const STATIC_FEED: FeedItem[] = DEMO_CLIPS.map(fromClip);

const COLUMNS =
  "id, slug, source, video_url, poster_url, before_url, reveal_at, ratio, has_sound, creator_handle, creator_name, creator_url, creator_avatar_url, caption, category, like_count, recreate_count";

type Row = Pick<
  Database["public"]["Tables"]["feed_items"]["Row"],
  | "id"
  | "slug"
  | "source"
  | "video_url"
  | "poster_url"
  | "before_url"
  | "reveal_at"
  | "ratio"
  | "has_sound"
  | "creator_handle"
  | "creator_name"
  | "creator_url"
  | "creator_avatar_url"
  | "caption"
  | "category"
  | "like_count"
  | "recreate_count"
>;

function fromRow(row: Row): FeedItem {
  return {
    id: row.id,
    slug: row.slug,
    source: row.source as FeedSource,
    videoUrl: row.video_url ?? "",
    posterUrl: row.poster_url,
    beforeUrl: row.before_url,
    revealAt: row.reveal_at === null ? null : Number(row.reveal_at),
    ratio: row.ratio,
    hasSound: row.has_sound,
    creator: row.creator_handle
      ? { handle: row.creator_handle, name: row.creator_name, url: row.creator_url, avatarUrl: row.creator_avatar_url }
      : null,
    caption: row.caption,
    category: row.category as FeedCategory,
    likeCount: row.like_count,
    recreateCount: row.recreate_count,
  };
}

// Les vidéos du fil : la liste du code d'abord, puis la table feed_items.
// `ready` : la base a répondu (ou échoué), la liste ne bougera plus.
export function useFeedItems() {
  const [feed, setFeed] = useState({ items: STATIC_FEED, ready: false });
  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("feed_items")
      .select(COLUMNS)
      .eq("active", true)
      // Le fil ne montre que des vidéos hébergées chez nous.
      .not("video_url", "is", null)
      .order("position")
      .then(({ data, error }) => {
        if (cancelled) return;
        setFeed((current) => ({
          items: error || !data?.length ? current.items : (data as Row[]).map(fromRow),
          ready: true,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return feed;
}

// Réactions d'un compte connecté : ses j'aime enregistrés (rendus par slug à
// `onLikesLoaded`), et l'écriture des j'aime et des recréations. Sans compte,
// rien n'est envoyé : les j'aime restent dans le navigateur.
export function useFeedReactions(items: FeedItem[], onLikesLoaded: (slugs: string[]) => void) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [likedAtLoad, setLikedAtLoad] = useState<Set<string>>(() => new Set());
  const loaded = useEffectEvent(onLikesLoaded);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid || cancelled) return;
      setUserId(uid);
      const { data: rows } = await supabase.from("feed_reactions").select("item_id").eq("kind", "like");
      if (cancelled || !rows) return;
      const slugOf = new Map(items.filter((i) => i.id).map((i) => [i.id as string, i.slug]));
      const slugs = rows.map((r) => slugOf.get(r.item_id)).filter((s): s is string => Boolean(s));
      setLikedAtLoad(new Set(slugs));
      loaded(slugs);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, items]);

  const saveLike = useCallback(
    async (item: FeedItem, on: boolean) => {
      if (!userId || !item.id) return;
      if (on) await supabase.from("feed_reactions").insert({ user_id: userId, item_id: item.id, kind: "like" });
      else await supabase.from("feed_reactions").delete().match({ user_id: userId, item_id: item.id, kind: "like" });
    },
    [supabase, userId],
  );

  // Déjà comptée (doublon refusé par la clé primaire) : sans effet.
  const saveRecreate = useCallback(
    async (item: FeedItem) => {
      if (!userId || !item.id) return;
      await supabase.from("feed_reactions").insert({ user_id: userId, item_id: item.id, kind: "recreate" });
    },
    [supabase, userId],
  );

  return { userId, likedAtLoad, saveLike, saveRecreate };
}
