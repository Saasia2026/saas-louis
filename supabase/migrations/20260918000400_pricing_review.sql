-- Révision des prix d'après les tarifs fal (septembre 2026). Objectif : le
-- coût fal d'un crédit reste sous ~0,10 $, soit moins de la moitié de ce
-- que rapporte un crédit du plus gros pack (~0,20 € net de TVA et Stripe).
--
-- - Sora 2 (0,10 $/s) passe de 5 à 1 crédit la seconde : il était facturé
--   cinq fois son coût.
-- - Wan 2.7 en 1080p (0,15 $/s) passe de 1 à 2 crédits la seconde : il
--   coûtait plus que les deux tiers de ce qu'il rapportait.
-- - Remplacement (Wan Animate) : fal facture (images ÷ 16) × 0,08 $, donc
--   selon la cadence du clip. 0,8 crédit par seconde facturée par fal
--   (1,5 crédit/s pour un clip à 30 images/s).
--
-- Aligné avec VIDEO_MODELS et swapCredits (generation.ts).

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
    when 'wan-2.7' then 2
    when 'kling-3' then 2
    when 'sora-2' then 1
    when 'kling-o1-ref' then 2
  end;
$$;

drop function public.start_swap_generation(uuid, integer, jsonb);

create function public.start_swap_generation(
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
  if p_frames_per_second is null or p_frames_per_second <= 0 or p_frames_per_second > 240 then
    raise exception 'invalid_frame_rate' using errcode = 'P0001';
  end if;
  -- Secondes facturées par fal : images ÷ 16, jamais moins que la durée.
  v_cost := ceil(p_duration_seconds * greatest(p_frames_per_second, 16) / 16 * 0.8);

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

revoke all on function public.start_swap_generation(uuid, integer, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.start_swap_generation(uuid, integer, numeric, jsonb)
  to service_role;
