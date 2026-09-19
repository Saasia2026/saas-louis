-- Fiche personnage en deux images (debout de face, puis de trois quarts),
-- ~0,30 $ chez fal : 3 crédits au lieu de 2. Aligné avec swapCredits
-- (generation.ts).

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
  v_cost := p_duration_seconds * 2 + 3;

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
