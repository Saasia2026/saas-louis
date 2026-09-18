-- Vidéos longues : une vidéo = N plans (5 ou 10 s) assemblés.
-- - Durée libre par pas de 5 s, plafonnée selon l'abonnement.
-- - Coût : 1 crédit par seconde de vidéo (10 crédits / 10 s), 1 crédit par photo.

alter table public.generations
  add column duration_seconds integer check (duration_seconds > 0 and duration_seconds % 5 = 0),
  add column storyboard jsonb;

-- Étapes d'une vidéo : 'shots' (plans en cours) puis 'assembling' (montage).
-- 'image' reste l'étape unique d'une photo.
alter table public.generations drop constraint generations_stage_check;
update public.generations set stage = 'shots' where kind = 'video';
alter table public.generations
  add constraint generations_stage_check check (stage in ('image', 'shots', 'assembling'));

create table public.generation_shots (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position integer not null,
  duration_seconds integer not null check (duration_seconds in (5, 10)),
  image_prompt text not null,
  motion_prompt text not null,
  stage text not null default 'image' check (stage in ('image', 'video', 'done', 'failed')),
  attempts integer not null default 0,
  image_prediction_id text unique,
  video_prediction_id text unique,
  clip_path text,
  created_at timestamptz not null default now(),
  unique (generation_id, position)
);

create index generation_shots_user_id_idx on public.generation_shots (user_id);

-- Lecture seule pour l'utilisateur (progression) ; écriture réservée au serveur.
revoke all on public.generation_shots from anon, authenticated;
grant select on public.generation_shots to authenticated;
alter table public.generation_shots enable row level security;
create policy "generation_shots: lecture des siens" on public.generation_shots
  for select to authenticated using ((select auth.uid()) = user_id);

-- Durée max d'une vidéo par abonnement (secondes).
create function public.max_video_seconds(p_plan text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan when 'pro' then 300 when 'creator' then 180 else 30 end;
$$;

drop function public.start_generation(uuid, text, text, text, jsonb);

create function public.start_generation(
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
    v_cost := p_duration_seconds;
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

revoke execute on function public.start_generation(uuid, text, text, integer, jsonb) from public, anon;
grant execute on function public.start_generation(uuid, text, text, integer, jsonb) to authenticated;
