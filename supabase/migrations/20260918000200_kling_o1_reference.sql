-- Préréglage Référence : Kling O1 reçoit la vidéo de référence du créateur à
-- chaque plan (0,168 $ la seconde chez fal). Aligné avec VIDEO_MODELS
-- (generation.ts).

create or replace function public.video_model_credits_per_second(p_video_model text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_video_model, 'kling-2.5')
    when 'kling-2.5' then 1
    when 'seedance-1.5' then 1
    when 'seedance-lite' then 1
    when 'wan-2.7' then 1
    when 'kling-3' then 2
    when 'sora-2' then 5
    when 'kling-o1-ref' then 2
  end;
$$;
