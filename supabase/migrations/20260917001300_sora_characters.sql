-- Personnages Sora : une vidéo courte envoyée une fois donne un identifiant
-- réutilisable dans chaque plan (le sujet reste le même d'une vidéo à
-- l'autre). Remplace l'entraînement d'un jumeau pour ce cas d'usage.

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  video_path text not null,
  sora_character_id text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index characters_user_id_idx on public.characters (user_id, created_at desc);

alter table public.characters enable row level security;

create policy "characters: lecture" on public.characters
  for select to authenticated using (user_id = auth.uid());

create policy "characters: ajout" on public.characters
  for insert to authenticated with check (user_id = auth.uid());

create policy "characters: suppression" on public.characters
  for delete to authenticated using (user_id = auth.uid());

-- Vidéos sources, privées, rangées sous <user_id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('character-videos', 'character-videos', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "character-videos: ajout" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'character-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "character-videos: lecture" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'character-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "character-videos: suppression" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'character-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
