-- Les plans Sora 2 durent 8 s (l'API accepte 4, 8 ou 12 s) : la contrainte
-- d'origine (5 ou 10 s, Kling) refusait leur insertion et toute vidéo Sora
-- échouait au lancement. L'étape 'end_image' (image de fin d'un plan) est
-- aussi utilisée par le pipeline sans avoir été déclarée.

alter table public.generation_shots
  drop constraint generation_shots_duration_seconds_check;
alter table public.generation_shots
  add constraint generation_shots_duration_seconds_check
  check (duration_seconds in (4, 5, 8, 10, 12));

alter table public.generation_shots
  drop constraint generation_shots_stage_check;
alter table public.generation_shots
  add constraint generation_shots_stage_check
  check (stage in ('queued', 'image', 'end_image', 'framed', 'video', 'done', 'failed'));
