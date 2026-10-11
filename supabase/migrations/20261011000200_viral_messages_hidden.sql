-- « Nouvelle conversation » masque le fil au lieu de l'effacer : la limite
-- quotidienne de messages compte aussi les messages masqués.
alter table public.viral_messages add column if not exists hidden boolean not null default false;
