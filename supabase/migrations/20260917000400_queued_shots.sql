-- Plans en file d'attente : Replicate peut limiter la création de prédictions
-- (1 à la fois tant que le compte a moins de 5 $ de crédit). Les plans sont
-- donc lancés au fil des passages (polling/webhook), pas tous d'un coup.

alter table public.generation_shots drop constraint generation_shots_stage_check;
alter table public.generation_shots
  add constraint generation_shots_stage_check
  check (stage in ('queued', 'image', 'video', 'done', 'failed'));
alter table public.generation_shots alter column stage set default 'queued';
