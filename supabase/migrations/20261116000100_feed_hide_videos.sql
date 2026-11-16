-- Vidéos retirées du fil d'exemples à la demande : 15 vidéos, et les copies
-- muettes de trois d'entre elles (g-08 = g-44, g-10 = g-34, g-14 = g-30).
-- Elles sont masquées (active = false), pas supprimées : repasser active à
-- true les fait revenir.

update public.feed_items
set active = false
where slug in (
  'g-25', 'g-30', 'g-31', 'g-34', 'g-35', 'g-38', 'g-44', 'g-45', 'g-53',
  'g-62', 'g-64', 'g-73', 'g-76', 'g-78', 'g-88',
  'g-08', 'g-10', 'g-14'
);
