-- 1. Genjutsu en 1080p : 17 crédits la seconde (1,632 $ la seconde chez
--    Higgsfield, vérifié le 2026-09-26 ; règle ≤ 0,10 $ par crédit).
--    p_hd : faux par défaut. Aligné avec swapRate (generation.ts).
--
-- 2. Relance serveur des remplacements en cours : toutes les 30 s, tant qu'il
--    y en a, pg_cron appelle /api/swap/tick (voir src/app/api/swap/tick). Le
--    rendu avance ainsi sans page ouverte, même si un webhook se perd.
--    Le secret partagé avec Vercel (CRON_SECRET) est rangé dans Vault sous le
--    nom 'swap_tick_secret' ; il n'est pas dans ce fichier. Sans lui, la
--    relance ne fait rien.

drop function if exists public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer);

create or replace function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_frames_per_second numeric,
  p_metadata jsonb default '{}',
  p_engine text default 'kling',
  p_billed_seconds numeric default null,
  p_characters integer default 1,
  p_hd boolean default false
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
    v_rate := case when coalesce(p_hd, false) then 17 else 7 end;
    v_max_seconds := 90;
  elsif p_engine = 'kling' then
    if coalesce(p_hd, false) then
      raise exception 'invalid_engine' using errcode = 'P0001';
    end if;
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

revoke all on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer, boolean) from public, anon, authenticated;
grant execute on function public.start_swap_generation(uuid, integer, numeric, jsonb, text, numeric, integer, boolean) to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Appel de la relance, seulement s'il y a un remplacement en cours ou en
-- préparation : sinon rien ne part (pas d'appel inutile à Vercel).
create or replace function public.swap_background_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1 from public.generations
    where kind = 'swap' and status in ('processing', 'pending')
  ) then
    return;
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'swap_tick_secret';
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://twinpost.video/api/swap/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.swap_background_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'swap-background-tick';
select cron.schedule('swap-background-tick', '30 seconds', 'select public.swap_background_tick()');
