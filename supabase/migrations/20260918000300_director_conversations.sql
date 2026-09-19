-- Discussions du mode Director, enregistrées et listées dans la barre
-- latérale comme dans Claude ou ChatGPT. Le serveur (directorChat) écrit
-- chaque tour ; le créateur peut rouvrir ou supprimer ses discussions.

create table public.director_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  -- [{ role: 'user' | 'assistant', content: text }]
  messages jsonb not null default '[]',
  -- Dernier brief proposé (DirectorHandoff), et réponses rapides.
  handoff jsonb,
  ideas jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index director_conversations_user_id_idx
  on public.director_conversations (user_id, updated_at desc);

alter table public.director_conversations enable row level security;

create policy "director_conversations: lecture" on public.director_conversations
  for select to authenticated using (user_id = (select auth.uid()));

create policy "director_conversations: ajout" on public.director_conversations
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "director_conversations: modification" on public.director_conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "director_conversations: suppression" on public.director_conversations
  for delete to authenticated using (user_id = (select auth.uid()));
