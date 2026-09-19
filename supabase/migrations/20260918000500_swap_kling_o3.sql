-- Remplacement de personnage : Kling O3 Pro Edit remplace Wan Animate (bien
-- meilleur sur le même clip, au même ordre de prix). fal facture 0,168 $ la
-- seconde, quelle que soit la cadence : 2 crédits par seconde, plus 2 crédits
-- pour la fiche personnage (vue de trois quarts, Nano Banana Pro).
--
-- La signature ne change pas : p_frames_per_second n'entre plus dans le prix.
-- Aligné avec swapCredits (generation.ts).

create or replace function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_frames_per_second numeric,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost integer;
  v_generation_id uuid;
begin
  if p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 15 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  v_cost := p_duration_seconds * 2 + 2;

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
