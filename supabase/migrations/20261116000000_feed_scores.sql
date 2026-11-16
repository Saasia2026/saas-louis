-- Goûts d'un compte dans le fil d'exemples, par catégorie : ils font remonter
-- ses catégories préférées dans « Pour toi ». Sans compte, la même chose reste
-- dans le navigateur (localStorage) ; à la connexion, elle rejoint le compte.

create table public.feed_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('shinka', 'personas', 'trending')),
  watch_seconds integer not null default 0 check (watch_seconds >= 0),
  rewatches integer not null default 0 check (rewatches >= 0),
  likes integer not null default 0 check (likes >= 0),
  recreates integer not null default 0 check (recreates >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.feed_scores enable row level security;

revoke all on public.feed_scores from anon, authenticated;
grant select, insert, update on public.feed_scores to authenticated;

create policy "feed_scores_read_own" on public.feed_scores
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "feed_scores_insert_own" on public.feed_scores
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "feed_scores_update_own" on public.feed_scores
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Ajoute un lot aux totaux du compte connecté (le fil envoie toutes les
-- 20 s environ). Lancée avec les droits de l'appelant : la RLS s'applique.
-- Les lots sont bornés pour qu'un envoi aberrant ne fausse pas les goûts.
create function public.feed_track(
  p_category text,
  p_watch integer,
  p_rewatches integer,
  p_likes integer,
  p_recreates integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.feed_scores as s (user_id, category, watch_seconds, rewatches, likes, recreates)
  values (
    auth.uid(),
    p_category,
    least(greatest(coalesce(p_watch, 0), 0), 3600),
    least(greatest(coalesce(p_rewatches, 0), 0), 100),
    least(greatest(coalesce(p_likes, 0), 0), 100),
    least(greatest(coalesce(p_recreates, 0), 0), 100)
  )
  on conflict (user_id, category) do update
  set watch_seconds = s.watch_seconds + excluded.watch_seconds,
      rewatches = s.rewatches + excluded.rewatches,
      likes = s.likes + excluded.likes,
      recreates = s.recreates + excluded.recreates,
      updated_at = now();
end;
$$;

revoke execute on function public.feed_track(text, integer, integer, integer, integer) from public, anon;
grant execute on function public.feed_track(text, integer, integer, integer, integer) to authenticated;
