-- Huit vidéos ajoutées au fil d'exemples, aux emplacements de vidéos retirées
-- (voir 20261116000100_feed_hide_videos.sql). À appliquer une fois les
-- fichiers de public/examples/gallery en ligne.

insert into public.feed_items
  (slug, source, video_url, poster_url, ratio, has_sound, rights_note, position)
values
  ('g-99', 'own', '/examples/gallery/g-99.mp4', '/examples/gallery/g-99.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (téléchargée de TikTok) ; créateur à identifier', 50),
  ('g-100', 'own', '/examples/gallery/g-100.mp4', '/examples/gallery/g-100.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (fichier « generation (87) »)', 100),
  ('g-101', 'own', '/examples/gallery/g-101.mp4', '/examples/gallery/g-101.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (téléchargée de TikTok) ; créateur à identifier', 110),
  ('g-102', 'own', '/examples/gallery/g-102.mp4', '/examples/gallery/g-102.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (téléchargée de TikTok) ; créateur à identifier', 140),
  ('g-103', 'own', '/examples/gallery/g-103.mp4', '/examples/gallery/g-103.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (téléchargée de TikTok) ; créateur à identifier', 150),
  ('g-104', 'own', '/examples/gallery/g-104.mp4', '/examples/gallery/g-104.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (téléchargée de TikTok) ; créateur à identifier', 180),
  ('g-105', 'own', '/examples/gallery/g-105.mp4', '/examples/gallery/g-105.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (téléchargée de TikTok) ; créateur à identifier', 240),
  ('g-106', 'own', '/examples/gallery/g-106.mp4', '/examples/gallery/g-106.jpg', '9/16', true, 'Fournie par Louis le 2026-11-16 (téléchargée de TikTok) ; créateur à identifier', 250);
