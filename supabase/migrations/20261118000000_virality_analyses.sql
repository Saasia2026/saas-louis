-- Analyses de viralité : un clip relu avant publication (voir lib/virality.ts).
-- Le clip est un rendu de l'utilisateur (generation_id) ou un fichier déposé
-- dans swap-inputs, sous son dossier (video_path).
create table if not exists public.virality_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  generation_id uuid references public.generations (id) on delete set null,
  video_path text,
  seconds numeric,
  report jsonb,
  facts jsonb,
  credits_cost integer not null default 0 check (credits_cost >= 0),
  created_at timestamptz not null default now()
);

create index if not exists virality_analyses_user_created_idx
  on public.virality_analyses (user_id, created_at desc);

alter table public.virality_analyses enable row level security;

create policy "virality_analyses: lecture des siennes" on public.virality_analyses
  for select using ((select auth.uid()) = user_id);

-- Débit puis création, d'un seul bloc : sans crédits, rien n'est créé.
create or replace function public.start_virality_analysis(
  p_user_id uuid,
  p_generation_id uuid,
  p_video_path text,
  p_seconds numeric,
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
  if p_credits < 0 or p_credits > 50 then
    raise exception 'invalid_cost' using errcode = 'P0001';
  end if;
  if not public.spend_credits(p_user_id, p_credits) then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
  insert into public.virality_analyses (user_id, generation_id, video_path, seconds, credits_cost)
  values (p_user_id, p_generation_id, p_video_path, p_seconds, p_credits)
  returning id into v_id;
  return v_id;
end;
$$;

-- Échec de l'analyse : crédits rendus une seule fois.
create or replace function public.fail_virality_analysis(p_id uuid)
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
  from public.virality_analyses
  where id = p_id and status = 'pending'
  for update;
  if not found then
    return;
  end if;
  update public.virality_analyses set status = 'failed', credits_cost = 0 where id = p_id;
  if v_credits > 0 then
    update public.profiles set credits_remaining = credits_remaining + v_credits where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.start_virality_analysis(uuid, uuid, text, numeric, integer) from public, anon, authenticated;
grant execute on function public.start_virality_analysis(uuid, uuid, text, numeric, integer) to service_role;
revoke all on function public.fail_virality_analysis(uuid) from public, anon, authenticated;
grant execute on function public.fail_virality_analysis(uuid) to service_role;
