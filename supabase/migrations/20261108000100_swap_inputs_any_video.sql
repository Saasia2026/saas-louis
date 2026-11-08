-- Dépôts du studio : toute vidéo et toute image, jusqu'à 500 Mo. Le clip part
-- tel quel chez Genjutsu (plus de découpe ni de réencodage) : une vidéo de
-- téléphone de 30 s en 4K doit passer. Les photos que Genjutsu ne lit pas
-- (HEIC…) sont converties en JPEG par le navigateur avant l'envoi.
update storage.buckets
set file_size_limit = 500 * 1024 * 1024,
    allowed_mime_types = array['video/*', 'image/*']
where id = 'swap-inputs';
