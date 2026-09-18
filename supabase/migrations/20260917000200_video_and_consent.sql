-- Vidéo + attestation d'accord.
-- - twins.consent_confirmed_at : l'utilisateur certifie que les photos sont de lui.
--   Sans elle, aucune génération n'est possible.
-- - generations.kind / stage / credits_cost / poster_path : une vidéo passe par
--   une image (stage 'image', gardée comme poster) puis par l'animation (stage 'video').
-- - 10 crédits offerts ; une vidéo coûte 5 crédits, une image 1.

alter table public.twins add column consent_confirmed_at timestamptz;

alter table public.generations
  add column kind text not null default 'image' check (kind in ('image', 'video')),
  add column stage text not null default 'image' check (stage in ('image', 'video')),
  add column credits_cost integer not null default 1 check (credits_cost > 0),
  add column poster_path text;

alter table public.profiles alter column credits_remaining set default 10;

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg', 'video/mp4']
where id = 'generations';

drop function public.start_generation(uuid, text, text, jsonb);

create function public.start_generation(
  p_twin_id uuid,
  p_prompt text,
  p_kind text default 'image',
  p_negative_prompt text default null,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost integer;
  v_generation_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_cost := case p_kind when 'image' then 1 when 'video' then 5 end;
  if v_cost is null then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.twins
    where id = p_twin_id
      and user_id = v_user_id
      and status = 'ready'
      and consent_confirmed_at is not null
  ) then
    raise exception 'twin_not_ready' using errcode = 'P0001';
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - v_cost
  where id = v_user_id and credits_remaining >= v_cost;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.generations
    (user_id, twin_id, prompt, negative_prompt, metadata, kind, credits_cost)
  values
    (v_user_id, p_twin_id, p_prompt, p_negative_prompt, coalesce(p_metadata, '{}'), p_kind, v_cost)
  returning id into v_generation_id;

  return v_generation_id;
end;
$$;

revoke execute on function public.start_generation(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.start_generation(uuid, text, text, text, jsonb) to authenticated;

-- Rembourse le coût réel de la génération (1 ou 5), une seule fois.
create or replace function public.fail_generation(p_generation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_cost integer;
begin
  update public.generations
  set status = 'failed'
  where id = p_generation_id and status in ('pending', 'processing')
  returning user_id, credits_cost into v_user_id, v_cost;

  if v_user_id is not null then
    update public.profiles
    set credits_remaining = credits_remaining + v_cost
    where id = v_user_id;
  end if;
end;
$$;

-- Les images de poster sont écrites par le serveur, comme les rendus finaux :
-- les policies existantes du bucket generations couvrent déjà la lecture.
