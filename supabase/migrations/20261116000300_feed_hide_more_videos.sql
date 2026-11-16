-- 4 vidéos retirées du fil d'exemples à la demande : g-92 (selfie miroir),
-- g-93 (fille en voiture), g-97 (Versailles) et ours (l'ours au micro).
-- Masquées (active = false), pas supprimées : repasser active à true les fait
-- revenir.

update public.feed_items
set active = false
where slug in ('g-92', 'g-93', 'g-97', 'ours');
