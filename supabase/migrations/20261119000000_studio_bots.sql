-- Bots du studio.
-- - trend_picks : la sélection du jour (vidéos TikTok d'influenceurs IA qui
--   cartonnent), avec pour chacune une accroche, pourquoi elle marche et
--   comment la refaire dans TwinPost, en français, anglais et espagnol.
--   Lisible par tout utilisateur connecté, écrite par le serveur.
-- - bot_messages : une ligne par question posée à un bot, pour limiter le
--   nombre de questions par jour. Aucun accès direct depuis le navigateur.
-- - trends_daily_tick : chaque jour à 6 h UTC, pg_cron appelle
--   /api/trends/tick (même secret Vault que les autres tâches) si la
--   sélection du jour n'existe pas encore.

create table if not exists public.trend_picks (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  rank smallint not null,
  platform text not null default 'tiktok',
  video_id text not null,
  url text not null,
  author text not null,
  followers bigint,
  views bigint not null,
  likes bigint,
  shares bigint,
  seconds integer,
  posted_at timestamptz,
  caption text not null default '',
  -- { "fr": "…", "en": "…", "es": "…" }
  hook jsonb not null,
  why jsonb not null,
  how jsonb not null,
  created_at timestamptz not null default now(),
  unique (day, rank)
);

create index if not exists trend_picks_day_idx on public.trend_picks (day desc, rank);

alter table public.trend_picks enable row level security;

drop policy if exists "trend_picks lisibles par les connectés" on public.trend_picks;
create policy "trend_picks lisibles par les connectés"
  on public.trend_picks for select
  to authenticated
  using (true);

create table if not exists public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bot text not null check (bot in ('scout', 'hook')),
  created_at timestamptz not null default now()
);

create index if not exists bot_messages_user_idx on public.bot_messages (user_id, created_at desc);

alter table public.bot_messages enable row level security;

create or replace function public.trends_daily_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if exists (select 1 from public.trend_picks where day = (now() at time zone 'utc')::date) then
    return;
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'swap_tick_secret';
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://twinpost.video/api/trends/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.trends_daily_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'trends-daily-tick';
-- 6 h UTC, puis une nouvelle tentative à 9 h si la première a échoué.
select cron.schedule('trends-daily-tick', '0 6,9 * * *', 'select public.trends_daily_tick()');
