-- Remplacement de personnage : choix du moteur. Aligné avec SWAP_ENGINES et
-- swapCredits (generation.ts).
-- - kling (Kling O3 Pro Edit, par défaut) : 2,5 crédits la seconde, 15 s au plus ;
-- - genjutsu (Higgsfield Genjutsu, 0,681 $ la seconde en 720p) : 7 crédits la
--   seconde, 30 s au plus.
-- Plus 3 crédits de fiche personnage dans les deux cas.
--
-- Le nouveau paramètre change la signature : l'ancienne fonction est retirée
-- pour ne pas laisser deux surcharges ambiguës. `p_engine` a une valeur par
-- défaut, l'appel sans moteur reste valable.

drop function if exists public.start_swap_generation(uuid, integer, numeric, jsonb);

create function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_frames_per_second numeric,
  p_metadata jsonb default '{}',
  p_engine text default 'kling'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate numeric;
  v_max_seconds integer;
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
  v_cost := ceil(p_duration_seconds * v_rate) + 3;

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

revoke all on function public.start_swap_generation(uuid, integer, numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.start_swap_generation(uuid, integer, numeric, jsonb, text) to service_role;
