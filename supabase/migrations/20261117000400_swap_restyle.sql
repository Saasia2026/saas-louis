-- Restyle (troisième mode de Genjutsu, Shinka Max seulement) : un rendu dont
-- les métadonnées portent "restyle": true est facturé au barème RESTYLE_RATES
-- de generation.ts, 19 / 40 / 96 crédits la seconde en 480p / 720p / 1080p
-- (API : 0,318 / 0,681 / 1,632 $ la seconde, le double des deux autres
-- modes). Une seule passe : ni mannequin, ni Shinka (Light), ni passe visage.
-- La signature ne change pas (la fonction n'est appelable que par
-- service_role, qui écrit ces métadonnées côté serveur). Le reste de la
-- fonction est identique (Shinka 5 / 9 / 18, Shinka Max 10 / 21 / 50).

create or replace function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_frames_per_second numeric,
  p_metadata jsonb default '{}'::jsonb,
  p_engine text default 'kling'::text,
  p_billed_seconds numeric default null::numeric,
  p_characters integer default 1,
  p_hd boolean default false,
  p_face boolean default false,
  p_vessel boolean default false,
  p_light boolean default false,
  p_quality text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rate numeric;
  v_max_seconds integer;
  -- Plus de fiche facturée : les images partent telles quelles.
  v_sheet integer := 0;
  -- Passe visage, par seconde facturée.
  v_face_rate numeric := 4;
  v_quality text := coalesce(p_quality, case when coalesce(p_hd, false) then '1080p' else '720p' end);
  -- Mode Restyle, lu dans les métadonnées du rendu.
  v_restyle boolean := coalesce(p_metadata->>'restyle', '') = 'true';
  v_seconds numeric;
  v_cost integer;
  v_generation_id uuid;
begin
  if v_quality not in ('480p', '720p', '1080p') then
    raise exception 'invalid_engine' using errcode = 'P0001';
  end if;

  if v_restyle then
    -- Restyle : Genjutsu seul, en une passe.
    if p_engine <> 'genjutsu' or coalesce(p_light, false) or coalesce(p_vessel, false) or coalesce(p_face, false) then
      raise exception 'invalid_engine' using errcode = 'P0001';
    end if;
    v_rate := case v_quality when '480p' then 19 when '720p' then 40 else 96 end;
    v_max_seconds := 90;
  elsif p_engine = 'genjutsu' then
    if coalesce(p_light, false) then
      v_rate := case v_quality when '480p' then 5 when '720p' then 9 else 18 end;
    else
      v_rate := case v_quality when '480p' then 10 when '720p' then 21 else 50 end;
    end if;
    v_max_seconds := 90;
  elsif p_engine = 'kling' then
    if coalesce(p_hd, false) or coalesce(p_vessel, false) or coalesce(p_light, false) or p_quality is not null then
      raise exception 'invalid_engine' using errcode = 'P0001';
    end if;
    v_rate := 10;
    v_max_seconds := 15;
  elsif p_engine = 'magichour' then
    if coalesce(p_hd, false) or coalesce(p_face, false) or coalesce(p_vessel, false)
       or coalesce(p_light, false) or p_quality is not null then
      raise exception 'invalid_engine' using errcode = 'P0001';
    end if;
    v_rate := 4;
    v_max_seconds := 90;
    v_sheet := 0;
  else
    raise exception 'invalid_engine' using errcode = 'P0001';
  end if;

  -- Kling et Magic Hour ne remplacent qu'un personnage ; la passe visage
  -- pose un seul visage.
  if p_characters is null or p_characters < 1 or p_characters > 3
     or (p_engine in ('kling', 'magichour') and p_characters > 1)
     or (coalesce(p_face, false) and p_characters > 1) then
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

  if not public.spend_credits(p_user_id, v_cost) then
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
$function$;
