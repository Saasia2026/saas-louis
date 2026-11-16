import type { FeedCategory, FeedItem } from "./feed-items";

// Créateur d'une vidéo pour l'alternance ; nos vidéos sans créateur comptent
// chacune pour elle-même.
const creatorOf = (item: FeedItem) => item.creator?.handle.toLowerCase() ?? `#${item.slug}`;

// Ordre du fil : chaque catégorie reçoit une part proportionnelle à son
// poids (« Pour toi » : les catégories préférées pèsent plus), on alterne
// les catégories dès que leurs parts le permettent, et jamais deux fois le
// même créateur ni la même vidéo d'affilée. Dans une catégorie, l'ordre de
// la table (position) est gardé. `after` : la vidéo qui précède la liste.
export function interleave(
  items: FeedItem[],
  weights: Partial<Record<FeedCategory, number>> = {},
  after: FeedItem | null = null,
): FeedItem[] {
  const seen = new Set<string>(after ? [after.slug] : []);
  const queues = new Map<FeedCategory, FeedItem[]>();
  for (const item of items) {
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    const queue = queues.get(item.category);
    if (queue) queue.push(item);
    else queues.set(item.category, [item]);
  }
  const total = [...queues.values()].reduce((n, q) => n + q.length, 0);
  const picked = new Map<FeedCategory, number>();
  const out: FeedItem[] = [];
  let prev = after;

  while (out.length < total) {
    const live = [...queues].filter(([, queue]) => queue.length > 0);
    const weightSum = live.reduce((sum, [category]) => sum + (weights[category] ?? 1), 0);
    const ranked = live
      .map(([category, queue]) => ({
        category,
        queue,
        // Retard sur la part qui lui revient : le plus en retard passe.
        lag: ((weights[category] ?? 1) / weightSum) * (out.length + 1) - (picked.get(category) ?? 0),
      }))
      .sort((a, b) => b.lag - a.lag);
    // Même catégorie que la précédente : une autre presque aussi en retard passe devant.
    if (prev && ranked[0].category === prev.category) {
      const other = ranked.findIndex((r) => r.category !== prev!.category && r.lag > ranked[0].lag - 1);
      if (other > 0) ranked.unshift(...ranked.splice(other, 1));
    }
    let choice: { category: FeedCategory; queue: FeedItem[]; at: number } | null = null;
    for (const r of ranked) {
      // Jusqu'à quelques vidéos plus loin pour éviter le même créateur.
      const at = r.queue.slice(0, 8).findIndex((item) => !prev || creatorOf(item) !== creatorOf(prev));
      if (at >= 0) {
        choice = { ...r, at };
        break;
      }
    }
    choice ??= { ...ranked[0], at: 0 };
    const [item] = choice.queue.splice(choice.at, 1);
    picked.set(choice.category, (picked.get(choice.category) ?? 0) + 1);
    out.push(item);
    prev = item;
  }
  return out;
}
