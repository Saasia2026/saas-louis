-- Fil des exemples : retire trois vidéos marquées par une autre marque.
-- g-06 (le rat) finit sur le logo TikTok, g-101 sur un carton « BarbieBoy »,
-- g-106 est une capture de l'appli TikTok. Le fichier de g-06 est supprimé
-- du site ; les lignes sont désactivées, pas effacées (j'aime conservés).
update public.feed_items
set active = false
where slug in ('g-06', 'g-101', 'g-106');
