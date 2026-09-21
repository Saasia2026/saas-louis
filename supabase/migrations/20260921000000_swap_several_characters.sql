-- Plusieurs personnages dans un même remplacement (moteur genjutsu) : chaque
-- personnage a sa fiche (2 images Nano Banana Pro), payée 3 crédits comme
-- celle d'un remplacement simple. p_characters : 1 à 3, 1 par défaut.
-- Aligné avec swapCredits et SWAP_MAX_CHARACTERS (generation.ts).
--
-- L'ancienne signature est retirée : deux versions avec paramètres par
-- défaut rendraient les appels ambigus.

drop function if exists public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric);

create or replace function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_frames_per_second numeric,
  p_metadata jsonb default '{}',
  p_engine text default 'kling',
  p_billed_seconds numeric default null,
  p_characters integer default 1
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
    v_max_seconds := 90;
  elsif p_engine = 'kling' then
    v_rate := 2.5;
    v_max_seconds := 15;
  else
    raise exception 'invalid_engine' using errcode = 'P0001';
  end if;

  -- Kling ne remplace qu'un personnage.
  if p_characters is null or p_characters < 1 or p_characters > 3
     or (p_engine = 'kling' and p_characters > 1) then
    raise exception 'invalid_characters' using errcode = 'P0001';
  end if;

  if p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > v_max_seconds then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;

  v_seconds := p_duration_seconds;
  if p_billed_seconds is not null then
    -- Garde-fou : jamais plus du double de la durée, à une marge près.
    if p_billed_seconds > 2 * v_max_seconds + 30 then
      raise exception 'invalid_duration' using errcode = 'P0001';
    end if;
    v_seconds := greatest(p_billed_seconds, p_duration_seconds);
  end if;
  v_cost := ceil(v_seconds * v_rate) + 3 * p_characters;

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

-- Réservée au serveur (clé de service), comme la version précédente.
revoke all on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer) from public, anon, authenticated;
grant execute on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer) to service_role;
