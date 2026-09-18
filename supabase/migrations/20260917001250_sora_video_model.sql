-- Sora 2 : plans de 8 s (au lieu de 5) et son généré avec l'image, à un
-- tarif bien plus élevé. La durée d'une vidéo doit être un multiple de la
-- durée de plan du modèle, transmise dans les métadonnées.

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
  end;
$$;

alter table public.generations
  drop constraint generations_duration_seconds_check,
  add constraint generations_duration_seconds_check check (duration_seconds > 0);

create or replace function public.start_generation(
  p_twin_id uuid,
  p_prompt text,
  p_kind text default 'image',
  p_duration_seconds integer default null,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
  v_cost integer;
  v_rate integer := public.video_model_credits_per_second(p_metadata->>'video_model');
  v_pace text := coalesce(p_metadata->>'pace', 'normal');
  v_shot_seconds numeric := coalesce((p_metadata->>'shot_seconds')::numeric, 5);
  v_kept_seconds numeric;
  v_shots integer;
  v_generation_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select plan into v_plan from public.profiles where id = v_user_id;

  if p_kind = 'image' then
    if p_twin_id is null then
      raise exception 'twin_required' using errcode = 'P0001';
    end if;
    v_cost := 1;
  elsif p_kind = 'video' then
    if v_rate is null then
      raise exception 'invalid_video_model' using errcode = 'P0001';
    end if;
    if v_pace not in ('normal', 'fast') then
      raise exception 'invalid_pace' using errcode = 'P0001';
    end if;
    -- Le rythme rapide ne coupe que les plans de 5 s.
    if v_shot_seconds <> 5 then
      v_pace := 'normal';
    end if;
    v_kept_seconds := case v_pace when 'fast' then v_shot_seconds / 2 else v_shot_seconds end;

    if p_duration_seconds is null
      or p_duration_seconds <= 0
      or (p_duration_seconds % v_kept_seconds) <> 0 then
      raise exception 'invalid_duration' using errcode = 'P0001';
    end if;
    if p_duration_seconds > public.max_video_seconds(v_plan) then
      raise exception 'duration_exceeds_plan' using errcode = 'P0001';
    end if;

    v_shots := p_duration_seconds / v_kept_seconds;
    v_cost := ceil(p_duration_seconds * v_rate * (case v_pace when 'fast' then 2 else 1 end))
      + case when coalesce((p_metadata->>'end_frames')::boolean, false) then v_shots else 0 end;
  else
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  if p_twin_id is not null and not exists (
    select 1 from public.twins
    where id = p_twin_id
      and user_id = v_user_id
      and status = 'ready'
      and consent_confirmed_at is not null
  ) then
    raise exception 'twin_not_ready' using errcode = 'P0001';
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - v_cost
  where id = v_user_id and credits_remaining >= v_cost;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.generations
    (user_id, twin_id, prompt, metadata, kind, stage, credits_cost, duration_seconds)
  values
    (v_user_id, p_twin_id, p_prompt, coalesce(p_metadata, '{}'), p_kind,
     case p_kind when 'video' then 'shots' else 'image' end,
     v_cost,
     case p_kind when 'video' then p_duration_seconds end)
  returning id into v_generation_id;

  return v_generation_id;
end;
$$;
