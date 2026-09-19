-- Refaire un seul plan d'un remplacement terminé (voir redoSwapShot) : le
-- plan est débité à part (2,5 crédits la seconde) et la vidéo repasse en
-- cours le temps de le refaire. Si le plan rate, seul son prix est rendu :
-- la vidéo garde l'ancien plan et reste terminée.
--
-- Réservées au service_role : le serveur calcule le prix d'après la durée
-- du plan enregistrée.

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
  if p_credits is null or p_credits <= 0 or p_credits > 40 then
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

create or replace function public.refund_swap_redo(
  p_generation_id uuid,
  p_credits integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  update public.generations
  set credits_cost = credits_cost - p_credits
  where id = p_generation_id and kind = 'swap' and credits_cost > p_credits
  returning user_id into v_user_id;

  if v_user_id is not null then
    update public.profiles
    set credits_remaining = credits_remaining + p_credits
    where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.start_swap_redo(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.start_swap_redo(uuid, uuid, integer) to service_role;
revoke all on function public.refund_swap_redo(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_swap_redo(uuid, integer) to service_role;
