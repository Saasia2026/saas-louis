-- Choix du modèle vidéo : p_metadata->>'video_model' (Kling 2.5 par défaut).
-- Le prix par seconde dépend du modèle et se calcule ici, jamais côté
-- client. Aligné avec VIDEO_MODELS (src/lib/generation.ts).

create function public.video_model_credits_per_second(p_video_model text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_video_model, 'kling-2.5')
    when 'kling-2.5' then 1
    when 'seedance-1.5' then 1
    when 'kling-3' then 2
  end;
$$;

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
  v_generation_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select plan into v_plan from public.profiles where id = v_user_id;

  if p_kind = 'image' then
    v_cost := 1;
  elsif p_kind = 'video' then
    if p_duration_seconds is null or p_duration_seconds < 5 or p_duration_seconds % 5 <> 0 then
      raise exception 'invalid_duration' using errcode = 'P0001';
    end if;
    if p_duration_seconds > public.max_video_seconds(v_plan) then
      raise exception 'duration_exceeds_plan' using errcode = 'P0001';
    end if;
    if v_rate is null then
      raise exception 'invalid_video_model' using errcode = 'P0001';
    end if;
    v_cost := p_duration_seconds * v_rate;
  else
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  if not exists (
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


revoke execute on function public.video_model_credits_per_second(text) from public, anon;
