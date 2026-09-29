-- Option « base neutre » (p_vessel, méthode du mannequin) : chaque séquence
-- passe deux fois par Genjutsu — d'abord la personne du clip devient un
-- mannequin neutre en gris, puis le mannequin devient le personnage (voir
-- advanceParts dans swap.ts). La première passe coûte chez Higgsfield
-- exactement le prix de la seconde : elle est facturée au même tarif
-- (7 crédits la seconde, 17 en 1080p). Genjutsu seulement, un seul
-- personnage. Aligné avec swapCredits (generation.ts).

drop function if exists public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer, boolean, boolean);

create or replace function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_frames_per_second numeric,
  p_metadata jsonb default '{}',
  p_engine text default 'kling',
  p_billed_seconds numeric default null,
  p_characters integer default 1,
  p_hd boolean default false,
  p_face boolean default false,
  p_vessel boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate numeric;
  v_max_seconds integer;
  -- Fiche personnage, par personnage.
  v_sheet integer := 3;
  -- Passe visage, par seconde facturée.
  v_face_rate numeric := 1;
  v_seconds numeric;
  v_cost integer;
  v_generation_id uuid;
begin
  if p_engine = 'genjutsu' then
    v_rate := case when coalesce(p_hd, false) then 17 else 7 end;
    v_max_seconds := 90;
  elsif p_engine = 'kling' then
    if coalesce(p_hd, false) or coalesce(p_vessel, false) then
      raise exception 'invalid_engine' using errcode = 'P0001';
    end if;
    v_rate := 2.5;
    v_max_seconds := 15;
  elsif p_engine = 'magichour' then
    if coalesce(p_hd, false) or coalesce(p_face, false) or coalesce(p_vessel, false) then
      raise exception 'invalid_engine' using errcode = 'P0001';
    end if;
    v_rate := 1;
    v_max_seconds := 90;
    v_sheet := 0;
  else
    raise exception 'invalid_engine' using errcode = 'P0001';
  end if;

  -- Kling et Magic Hour ne remplacent qu'un personnage ; la passe visage
  -- pose un seul visage ; le mannequin remplace une seule personne.
  if p_characters is null or p_characters < 1 or p_characters > 3
     or (p_engine in ('kling', 'magichour') and p_characters > 1)
     or (coalesce(p_face, false) and p_characters > 1)
     or (coalesce(p_vessel, false) and p_characters > 1) then
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
  v_cost := ceil(v_seconds * v_rate) * case when coalesce(p_vessel, false) then 2 else 1 end
    + v_sheet * p_characters
    + case when coalesce(p_face, false) then greatest(1, ceil(v_seconds * v_face_rate)) else 0 end;

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

revoke all on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer, boolean, boolean, boolean) to service_role;
