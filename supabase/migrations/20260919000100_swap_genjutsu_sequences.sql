-- Moteur genjutsu : le passage est rendu en séquences de quelques secondes,
-- toutes en même temps (voir groupIntoBlocks dans swap.ts). La durée passe de
-- 30 à 90 s, et le prix se calcule, comme pour kling, sur les secondes
-- réellement facturées par le fournisseur (p_billed_seconds : chaque séquence
-- arrondie à la seconde supérieure, voir genjutsuBilledSeconds), jamais sous la
-- durée du clip. Aligné avec SWAP_ENGINES et swapCredits (generation.ts).
--
-- Une séquence genjutsu se refait seule, comme un plan kling : le plafond de
-- start_swap_redo passe de 40 à 250 crédits (30 s à 7 crédits la seconde).

create or replace function public.start_swap_generation(
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
    v_max_seconds := 90;
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
  if p_billed_seconds is not null then
    -- Garde-fou : jamais plus du double de la durée, à une marge près.
    if p_billed_seconds > 2 * v_max_seconds + 30 then
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

create or replace function public.start_swap_redo(
  p_user_id uuid,
  p_generation_id uuid,
  p_credits integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_credits is null or p_credits <= 0 or p_credits > 250 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - p_credits
  where id = p_user_id and credits_remaining >= p_credits;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  update public.generations
  set status = 'processing', stage = 'image', credits_cost = credits_cost + p_credits
  where id = p_generation_id and user_id = p_user_id and kind = 'swap' and status = 'completed';

  if not found then
    raise exception 'not_redoable' using errcode = 'P0001';
  end if;
end;
$$;
