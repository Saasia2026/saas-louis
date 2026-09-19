-- Moteur kling : prix au nombre de plans. Kling refuse un plan de moins de
-- 3 s : chaque plan plus court lui est envoyé prolongé à 3,2 s, et payé comme
-- tel. Le serveur passe donc les secondes réellement envoyées
-- (p_billed_seconds, voir klingBilledSeconds dans generation.ts) ; le prix se
-- calcule sur elles, jamais sous la durée du clip. Au-delà de 60 s envoyées
-- (clip découpé en une vingtaine de plans ou plus), le remplacement est refusé.
--
-- Nouveau paramètre = nouvelle signature : l'ancienne fonction est retirée
-- pour ne pas laisser deux surcharges ambiguës.

drop function if exists public.start_swap_generation(uuid, integer, numeric, jsonb, text);

create function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_frames_per_second numeric,
  p_metadata jsonb default '{}',
  p_engine text default 'kling',
  p_billed_seconds numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate numeric;
  v_max_seconds integer;
  v_seconds numeric;
  v_cost integer;
  v_generation_id uuid;
begin
  if p_engine = 'genjutsu' then
    v_rate := 7;
    v_max_seconds := 30;
  elsif p_engine = 'kling' then
    v_rate := 2.5;
    v_max_seconds := 15;
  else
    raise exception 'invalid_engine' using errcode = 'P0001';
  end if;

  if p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > v_max_seconds then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;

  v_seconds := p_duration_seconds;
  if p_engine = 'kling' and p_billed_seconds is not null then
    if p_billed_seconds > 60 then
      raise exception 'invalid_duration' using errcode = 'P0001';
    end if;
    v_seconds := greatest(p_billed_seconds, p_duration_seconds);
  end if;
  v_cost := ceil(v_seconds * v_rate) + 3;

  update public.profiles
  set credits_remaining = credits_remaining - v_cost
  where id = p_user_id and credits_remaining >= v_cost;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.generations
    (user_id, prompt, metadata, kind, stage, credits_cost, duration_seconds)
  values
    (p_user_id, 'Remplacement de personnage', coalesce(p_metadata, '{}'), 'swap', 'image',
     v_cost, p_duration_seconds)
  returning id into v_generation_id;

  return v_generation_id;
end;
$$;

revoke all on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric) from public, anon, authenticated;
grant execute on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric) to service_role;
