-- Planning de publication sur les réseaux, alertes et chat de viralité.
--
-- - profiles.zernio_profile_id : profil Zernio de l'utilisateur, qui regroupe
--   ses comptes connectés (TikTok, Instagram, YouTube, Facebook).
-- - posting_plans : rythme de publication (jours, heures, fuseau), comptes
--   visés par défaut et alerte quand des créneaux à venir n'ont pas de vidéo.
-- - scheduled_posts : une vidéo programmée sur un créneau, confiée à Zernio
--   qui la publie à l'heure dite ; son statut est relu par la relance.
-- - viral_messages : fil du chat de viralité (texte seul).
-- - social_background_tick : toutes les 15 min, pg_cron appelle
--   /api/social/tick (alertes par email, statut des publications) s'il y a
--   quelque chose à faire. Même secret Vault que la relance des remplacements.

alter table public.profiles add column if not exists zernio_profile_id text;

create table if not exists public.posting_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 0 = dimanche … 6 = samedi.
  weekdays smallint[] not null default '{1,3,5}',
  -- Heures locales "HH:MM".
  times text[] not null default '{18:00}',
  timezone text not null default 'Europe/Paris',
  account_ids text[] not null default '{}',
  alert_days integer not null default 3 check (alert_days between 1 and 14),
  alert_email boolean not null default true,
  last_alert_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_id uuid references public.generations (id) on delete set null,
  scheduled_for timestamptz not null,
  caption text not null default '',
  account_ids text[] not null default '{}',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled')),
  zernio_post_id text,
  -- Par plateforme : { platform, status, url, error }.
  results jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_posts_user_time on public.scheduled_posts (user_id, scheduled_for);
create index if not exists scheduled_posts_status_time on public.scheduled_posts (status, scheduled_for);

create table if not exists public.viral_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists viral_messages_user_time on public.viral_messages (user_id, created_at);

alter table public.posting_plans enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.viral_messages enable row level security;

-- Lecture seule côté client : les écritures passent par le serveur (actions),
-- qui vérifie les comptes et parle à Zernio.
create policy "posting_plans: lecture du sien" on public.posting_plans
  for select using ((select auth.uid()) = user_id);
create policy "scheduled_posts: lecture des siennes" on public.scheduled_posts
  for select using ((select auth.uid()) = user_id);
create policy "viral_messages: lecture des siens" on public.viral_messages
  for select using ((select auth.uid()) = user_id);

create or replace function public.social_background_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from public.posting_plans where alert_email)
     and not exists (
       select 1 from public.scheduled_posts
       where status in ('scheduled', 'publishing') and scheduled_for < now()
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
    url := 'https://twinpost.video/api/social/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.social_background_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'social-background-tick';
select cron.schedule('social-background-tick', '*/15 * * * *', 'select public.social_background_tick()');
