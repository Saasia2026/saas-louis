-- Apparence physique du jumeau (cheveux, peau, pilosité...), décrite une fois
-- par Claude à partir des photos d'entraînement et ajoutée à chaque prompt
-- d'image : sans elle, le texte du prompt peut contredire le visage appris.

alter table public.twins add column appearance text;
