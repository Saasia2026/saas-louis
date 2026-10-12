-- 1. Crédits 4 fois plus petits, comme sur le marché (un crédit valait
--    ~0,11 €) : soldes, coûts enregistrés, achats et barèmes multipliés par 4.
--    Une vidéo coûte exactement le même prix en euros.
-- 2. Crédits d'abonnement valables jusqu'à la fin de la période payée (le
--    mois, ou l'année) ; ceux des packs, de l'inscription et des
--    remboursements n'expirent pas. credits_remaining reste le solde total
--    dépensable ; subscription_credits en est la part qui expire, dépensée en
--    premier.

update public.profiles set credits_remaining = credits_remaining * 4;
update public.generations set credits_cost = credits_cost * 4;
update public.credit_purchases set credits = credits * 4;
update public.viral_messages set credits_cost = credits_cost * 4 where credits_cost > 0;
alter table public.profiles alter column credits_remaining set default 12;

alter table public.profiles drop constraint if exists profiles_auto_recharge_threshold_check;
update public.profiles set auto_recharge_threshold = auto_recharge_threshold * 4;
alter table public.profiles alter column auto_recharge_threshold set default 80;
alter table public.profiles
  add constraint profiles_auto_recharge_threshold_check check (auto_recharge_threshold between 20 and 2000);

alter table public.profiles
  add column if not exists subscription_credits integer not null default 0 check (subscription_credits >= 0),
  add column if not exists subscription_credits_expire_at timestamptz;

-- Retire du solde les crédits d'abonnement dont la période est finie (un
-- compte, ou tous). Appelée avant chaque débit et toutes les heures.
create or replace function public.expire_subscription_credits(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.profiles
  set credits_remaining = credits_remaining - least(subscription_credits, credits_remaining),
      subscription_credits = 0,
      subscription_credits_expire_at = null
  where subscription_credits_expire_at is not null
    and subscription_credits_expire_at <= now()
    and (p_user_id is null or id = p_user_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Débit commun : les crédits d'abonnement partent en premier.
create or replace function public.spend_credits(p_user_id uuid, p_cost integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_subscription_credits(p_user_id);
  update public.profiles
  set credits_remaining = credits_remaining - p_cost,
      subscription_credits = greatest(0, subscription_credits - p_cost)
  where id = p_user_id and credits_remaining >= p_cost;
  return found;
end;
$$;

-- Facture d'abonnement payée : les crédits restants de la période précédente
-- expirent, ceux de la nouvelle période les remplacent. Idempotent.
create or replace function public.apply_subscription_credits(
  p_invoice_id text,
  p_user_id uuid,
  p_plan_id text,
  p_credits integer,
  p_amount_total integer,
  p_currency text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_purchases
    (stripe_session_id, user_id, pack_id, credits, amount_total, currency)
  values (p_invoice_id, p_user_id, p_plan_id, p_credits, p_amount_total, p_currency)
  on conflict (stripe_session_id) do nothing;

  if not found then
    return false;
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - least(subscription_credits, credits_remaining) + p_credits,
      subscription_credits = p_credits,
      subscription_credits_expire_at = p_expires_at
  where id = p_user_id;

  return true;
end;
$$;

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
  v_sheet integer := 12;
  -- Passe visage, par seconde facturée.
  v_face_rate numeric := 4;
  v_seconds numeric;
  v_cost integer;
  v_generation_id uuid;
begin
  if p_engine = 'genjutsu' then
    v_rate := case when coalesce(p_hd, false) then 68 else 28 end;
    v_max_seconds := 90;
  elsif p_engine = 'kling' then
    if coalesce(p_hd, false) or coalesce(p_vessel, false) then
      raise exception 'invalid_engine' using errcode = 'P0001';
    end if;
    v_rate := 10;
    v_max_seconds := 15;
  elsif p_engine = 'magichour' then
    if coalesce(p_hd, false) or coalesce(p_face, false) or coalesce(p_vessel, false) then
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
$$;

create or replace function public.start_swap_redo(p_user_id uuid, p_generation_id uuid, p_credits integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_credits is null or p_credits <= 0 or p_credits > 1000 then
    raise exception 'invalid_credits' using errcode = 'P0001';
  end if;

  if not public.spend_credits(p_user_id, p_credits) then
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

create or replace function public.start_viral_question(p_user_id uuid, p_content text, p_credits integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_credits < 0 or p_credits > 80 then
    raise exception 'invalid_cost' using errcode = 'P0001';
  end if;

  if not public.spend_credits(p_user_id, p_credits) then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.viral_messages (user_id, role, content, credits_cost)
  values (p_user_id, 'user', p_content, p_credits)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.expire_subscription_credits(uuid) from public, anon, authenticated;
grant execute on function public.expire_subscription_credits(uuid) to service_role;
revoke all on function public.spend_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer) to service_role;
revoke all on function public.apply_subscription_credits(text, uuid, text, integer, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_subscription_credits(text, uuid, text, integer, integer, text, timestamptz)
  to service_role;

-- Toutes les heures : les crédits d'abonnement d'une période finie quittent
-- le solde, même sans nouveau débit.
select cron.schedule(
  'expire-subscription-credits',
  '7 * * * *',
  $$select public.expire_subscription_credits()$$
);
