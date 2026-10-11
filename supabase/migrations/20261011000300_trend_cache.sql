-- Cache des tendances (TikTok via Apify) : un appel payant par pays et par
-- période au plus toutes les quelques heures. Lu et écrit par le serveur seul
-- (RLS sans règle : aucun accès client).
create table if not exists public.trend_cache (
  key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.trend_cache enable row level security;
