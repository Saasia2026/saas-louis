-- Influenceurs IA : personnages créés par image (Seedream chez fal). L'image
-- est rangée dans swap-inputs, sous le dossier de l'utilisateur, pour servir
-- telle quelle de personnage dans le studio.
create table if not exists public.influencers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  kind text not null,
  gender text,
  description text,
  from_photo boolean not null default false,
  image_path text,
  credits_cost integer not null default 0 check (credits_cost >= 0),
  created_at timestamptz not null default now()
);

create index if not exists influencers_user_created_idx on public.influencers (user_id, created_at desc);

alter table public.influencers enable row level security;

create policy "influencers: lecture des siens" on public.influencers
  for select using ((select auth.uid()) = user_id);
create policy "influencers: suppression des siens" on public.influencers
  for delete using ((select auth.uid()) = user_id);

-- Débit puis création, d'un seul bloc : sans crédits, rien n'est créé.
create or replace function public.start_influencer(
  p_user_id uuid,
  p_kind text,
  p_gender text,
  p_description text,
  p_from_photo boolean,
  p_credits integer
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  if p_credits < 0 or p_credits > 20 then
    raise exception 'invalid_cost' using errcode = 'P0001';
  end if;
  if not public.spend_credits(p_user_id, p_credits) then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
  insert into public.influencers (user_id, kind, gender, description, from_photo, credits_cost)
  values (p_user_id, p_kind, p_gender, left(p_description, 400), p_from_photo, p_credits)
  returning id into v_id;
  return v_id;
end;
$$;

-- Échec de la génération : crédits rendus une seule fois.
create or replace function public.fail_influencer(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid;
  v_credits integer;
begin
  select user_id, credits_cost into v_user_id, v_credits
  from public.influencers
  where id = p_id and status = 'pending'
  for update;
  if not found then
    return;
  end if;
  update public.influencers set status = 'failed', credits_cost = 0 where id = p_id;
  if v_credits > 0 then
    update public.profiles set credits_remaining = credits_remaining + v_credits where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.start_influencer(uuid, text, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.start_influencer(uuid, text, text, text, boolean, integer) to service_role;
revoke all on function public.fail_influencer(uuid) from public, anon, authenticated;
grant execute on function public.fail_influencer(uuid) to service_role;
