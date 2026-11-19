-- Analyse d'un compte TikTok par Scout : les 30 dernières vidéos du compte
-- (récoltées par Apify), leurs chiffres, et le bilan rédigé par Claude
-- (ce qui marche, ce qu'il faut arrêter, potentiel viral, meilleurs
-- créneaux, rythme conseillé). Une analyse par utilisateur et par 24 h.
-- Écrite par le serveur ; chacun ne lit que les siennes.

create table if not exists public.tiktok_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  handle text not null,
  status text not null default 'ready' check (status in ('ready', 'failed')),
  stats jsonb,
  report jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tiktok_analyses_user_idx on public.tiktok_analyses (user_id, created_at desc);

alter table public.tiktok_analyses enable row level security;

drop policy if exists "tiktok_analyses lisibles par leur auteur" on public.tiktok_analyses;
create policy "tiktok_analyses lisibles par leur auteur"
  on public.tiktok_analyses for select
  to authenticated
  using ((select auth.uid()) = user_id);
