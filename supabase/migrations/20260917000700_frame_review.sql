-- Validation des images avant l'animation (storyboard).
-- - generations.stage 'frames' : les images des plans sont générées puis
--   attendent la validation de l'utilisateur ; 'shots' ne sert plus qu'à
--   l'animation.
-- - generation_shots.stage 'framed' : image prête, copiée dans Storage
--   (image_path), car la validation peut prendre plus d'une heure et les
--   URLs Replicate expirent.
-- - summary : description courte du plan, en français, pour l'affichage.
-- - video_attempts : essais d'animation, séparés des essais d'image.

alter table public.generations drop constraint generations_stage_check;
alter table public.generations
  add constraint generations_stage_check
  check (stage in ('image', 'frames', 'shots', 'assembling'));

alter table public.generation_shots drop constraint generation_shots_stage_check;
alter table public.generation_shots
  add constraint generation_shots_stage_check
  check (stage in ('queued', 'image', 'framed', 'video', 'done', 'failed'));

alter table public.generation_shots
  add column image_path text,
  add column summary text not null default '',
  add column video_attempts integer not null default 0;
