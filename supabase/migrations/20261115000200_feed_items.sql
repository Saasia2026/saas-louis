-- Fil d'exemples façon TikTok : chaque vidéo du fil est une ligne.
--   own          : nos vidéos, et les avant/après de nos utilisateurs avec leur accord
--   partner      : vidéo d'un créateur partenaire, hébergée chez nous
--   tiktok_embed : vidéo TikTok lue par le lecteur officiel (jamais téléchargée ni
--                  ré-hébergée) ; le créateur est toujours crédité, avec son profil.
-- Les lignes s'ajoutent avec scripts/feed-add-tiktok.mjs (clé service) ; le site
-- ne fait que lire.

create table public.feed_items (
  id uuid primary key default gen_random_uuid(),
  -- Identifiant court des liens partagés (/studio?reel=g-24).
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  source text not null check (source in ('own', 'partner', 'tiktok_embed')),
  -- Vidéo hébergée chez nous (own, partner) ou identifiant TikTok.
  video_url text,
  tiktok_id text unique check (tiktok_id ~ '^[0-9]{5,25}$'),
  poster_url text,
  -- Avant/après : la vidéo d'origine, et la seconde où le balayage révèle le résultat.
  before_url text,
  reveal_at numeric(6, 2) check (reveal_at >= 0),
  ratio text not null default '9/16' check (ratio ~ '^[0-9]+/[0-9]+$'),
  has_sound boolean not null default false,
  creator_handle text,
  creator_name text,
  creator_url text check (creator_url ~ '^https://'),
  creator_avatar_url text,
  caption text,
  category text not null default 'shinka' check (category in ('shinka', 'personas', 'trending')),
  -- D'où vient la vidéo et quel accord couvre sa diffusion (note interne).
  rights_note text,
  -- Tenus à jour par les déclencheurs de feed_reactions : rien n'est saisi à la main.
  like_count integer not null default 0 check (like_count >= 0),
  recreate_count integer not null default 0 check (recreate_count >= 0),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint feed_items_media check (
    case source
      when 'tiktok_embed' then tiktok_id is not null and video_url is null and before_url is null
      else video_url is not null and tiktok_id is null
    end
  ),
  -- Une vidéo TikTok n'apparaît jamais sans son créateur.
  constraint feed_items_tiktok_credit check (
    source <> 'tiktok_embed' or (creator_handle is not null and creator_url is not null)
  ),
  constraint feed_items_reveal check (reveal_at is null or before_url is not null)
);

create index feed_items_order on public.feed_items (position) where active;

alter table public.feed_items enable row level security;

create policy "feed_items_read_active" on public.feed_items
  for select to anon, authenticated
  using (active);

-- Le site lit tout sauf la note interne sur les droits.
revoke all on public.feed_items from anon, authenticated;
grant select (
  id, slug, source, video_url, tiktok_id, poster_url, before_url, reveal_at, ratio, has_sound,
  creator_handle, creator_name, creator_url, creator_avatar_url, caption, category,
  like_count, recreate_count, position, active, created_at
) on public.feed_items to anon, authenticated;

-- Réactions des comptes connectés : un j'aime, une recréation (une seule par
-- personne et par vidéo, les compteurs restent honnêtes).
create table public.feed_reactions (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.feed_items (id) on delete cascade,
  kind text not null check (kind in ('like', 'recreate')),
  created_at timestamptz not null default now(),
  primary key (user_id, item_id, kind)
);

create index feed_reactions_item on public.feed_reactions (item_id);

alter table public.feed_reactions enable row level security;

revoke all on public.feed_reactions from anon, authenticated;
grant select, insert, delete on public.feed_reactions to authenticated;

create policy "feed_reactions_read_own" on public.feed_reactions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "feed_reactions_insert_own" on public.feed_reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Seul un j'aime se retire ; une recréation reste comptée.
create policy "feed_reactions_delete_own_like" on public.feed_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()) and kind = 'like');

create function public.feed_reactions_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.feed_items
    set like_count = like_count + (new.kind = 'like')::int,
        recreate_count = recreate_count + (new.kind = 'recreate')::int
    where id = new.item_id;
    return new;
  end if;
  update public.feed_items
  set like_count = greatest(like_count - (old.kind = 'like')::int, 0),
      recreate_count = greatest(recreate_count - (old.kind = 'recreate')::int, 0)
  where id = old.item_id;
  return old;
end;
$$;

revoke execute on function public.feed_reactions_count() from public, anon, authenticated;

create trigger feed_reactions_count
  after insert or delete on public.feed_reactions
  for each row execute function public.feed_reactions_count();

-- Les démos qui étaient écrites dans le code (demo-clips.ts), dans le même ordre.
insert into public.feed_items
  (slug, source, video_url, poster_url, before_url, reveal_at, ratio, has_sound, rights_note, position)
values
  ('genjutsu-salle', 'own', '/examples/genjutsu-salle.mp4', '/examples/genjutsu-salle.jpg', null, null, '16/9', false, null, 10),
  ('g-22', 'own', '/examples/gallery/g-22.mp4', '/examples/gallery/g-22.jpg', null, null, '4/3', true, 'Vidéo source à identifier (créateur inconnu)', 20),
  ('g-23', 'own', '/examples/gallery/g-23.mp4', '/examples/gallery/g-23.jpg', null, null, '752/1224', true, 'Vidéo source à identifier (créateur inconnu)', 30),
  ('g-24', 'own', '/examples/gallery/g-24.mp4', '/examples/gallery/g-24.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 40),
  ('g-25', 'own', '/examples/gallery/g-25.mp4', '/examples/gallery/g-25.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 50),
  ('g-26', 'own', '/examples/gallery/g-26.mp4', '/examples/gallery/g-26.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 60),
  ('g-27', 'own', '/examples/gallery/g-27.mp4', '/examples/gallery/g-27.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 70),
  ('g-28', 'own', '/examples/gallery/g-28.mp4', '/examples/gallery/g-28.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 80),
  ('g-29', 'own', '/examples/gallery/g-29.mp4', '/examples/gallery/g-29.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 90),
  ('g-30', 'own', '/examples/gallery/g-30.mp4', '/examples/gallery/g-30.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 100),
  ('g-31', 'own', '/examples/gallery/g-31.mp4', '/examples/gallery/g-31.jpg', null, null, '16/9', true, 'Vidéo source à identifier (créateur inconnu)', 110),
  ('g-32', 'own', '/examples/gallery/g-32.mp4', '/examples/gallery/g-32.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 120),
  ('g-33', 'own', '/examples/gallery/g-33.mp4', '/examples/gallery/g-33.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 130),
  ('g-34', 'own', '/examples/gallery/g-34.mp4', '/examples/gallery/g-34.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 140),
  ('g-35', 'own', '/examples/gallery/g-35.mp4', '/examples/gallery/g-35.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 150),
  ('g-36', 'own', '/examples/gallery/g-36.mp4', '/examples/gallery/g-36.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 160),
  ('g-37', 'own', '/examples/gallery/g-37.mp4', '/examples/gallery/g-37.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 170),
  ('g-38', 'own', '/examples/gallery/g-38.mp4', '/examples/gallery/g-38.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 180),
  ('g-39', 'own', '/examples/gallery/g-39.mp4', '/examples/gallery/g-39.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 190),
  ('g-40', 'own', '/examples/gallery/g-40.mp4', '/examples/gallery/g-40.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 200),
  ('g-41', 'own', '/examples/gallery/g-41.mp4', '/examples/gallery/g-41.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 210),
  ('g-42', 'own', '/examples/gallery/g-42.mp4', '/examples/gallery/g-42.jpg', null, null, '652/1416', true, 'Vidéo source à identifier (créateur inconnu)', 220),
  ('g-43', 'own', '/examples/gallery/g-43.mp4', '/examples/gallery/g-43.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 230),
  ('g-44', 'own', '/examples/gallery/g-44.mp4', '/examples/gallery/g-44.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 240),
  ('g-45', 'own', '/examples/gallery/g-45.mp4', '/examples/gallery/g-45.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 250),
  ('g-46', 'own', '/examples/gallery/g-46.mp4', '/examples/gallery/g-46.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 260),
  ('g-47', 'own', '/examples/gallery/g-47.mp4', '/examples/gallery/g-47.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 270),
  ('g-48', 'own', '/examples/gallery/g-48.mp4', '/examples/gallery/g-48.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 280),
  ('g-49', 'own', '/examples/gallery/g-49.mp4', '/examples/gallery/g-49.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 290),
  ('g-50', 'own', '/examples/gallery/g-50.mp4', '/examples/gallery/g-50.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 300),
  ('g-51', 'own', '/examples/gallery/g-51.mp4', '/examples/gallery/g-51.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 310),
  ('g-52', 'own', '/examples/gallery/g-52.mp4', '/examples/gallery/g-52.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 320),
  ('g-53', 'own', '/examples/gallery/g-53.mp4', '/examples/gallery/g-53.jpg', null, null, '704/1306', true, 'Vidéo source à identifier (créateur inconnu)', 330),
  ('g-54', 'own', '/examples/gallery/g-54.mp4', '/examples/gallery/g-54.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 340),
  ('g-55', 'own', '/examples/gallery/g-55.mp4', '/examples/gallery/g-55.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 350),
  ('g-56', 'own', '/examples/gallery/g-56.mp4', '/examples/gallery/g-56.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 360),
  ('g-57', 'own', '/examples/gallery/g-57.mp4', '/examples/gallery/g-57.jpg', null, null, '4/3', true, 'Vidéo source à identifier (créateur inconnu)', 370),
  ('g-58', 'own', '/examples/gallery/g-58.mp4', '/examples/gallery/g-58.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 380),
  ('g-59', 'own', '/examples/gallery/g-59.mp4', '/examples/gallery/g-59.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 390),
  ('g-60', 'own', '/examples/gallery/g-60.mp4', '/examples/gallery/g-60.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 400),
  ('g-61', 'own', '/examples/gallery/g-61.mp4', '/examples/gallery/g-61.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 410),
  ('g-62', 'own', '/examples/gallery/g-62.mp4', '/examples/gallery/g-62.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 420),
  ('g-63', 'own', '/examples/gallery/g-63.mp4', '/examples/gallery/g-63.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 430),
  ('g-64', 'own', '/examples/gallery/g-64.mp4', '/examples/gallery/g-64.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 440),
  ('g-65', 'own', '/examples/gallery/g-65.mp4', '/examples/gallery/g-65.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 450),
  ('g-66', 'own', '/examples/gallery/g-66.mp4', '/examples/gallery/g-66.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 460),
  ('g-67', 'own', '/examples/gallery/g-67.mp4', '/examples/gallery/g-67.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 470),
  ('g-68', 'own', '/examples/gallery/g-68.mp4', '/examples/gallery/g-68.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 480),
  ('g-69', 'own', '/examples/gallery/g-69.mp4', '/examples/gallery/g-69.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 490),
  ('g-70', 'own', '/examples/gallery/g-70.mp4', '/examples/gallery/g-70.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 500),
  ('g-71', 'own', '/examples/gallery/g-71.mp4', '/examples/gallery/g-71.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 510),
  ('g-72', 'own', '/examples/gallery/g-72.mp4', '/examples/gallery/g-72.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 520),
  ('g-73', 'own', '/examples/gallery/g-73.mp4', '/examples/gallery/g-73.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 530),
  ('g-74', 'own', '/examples/gallery/g-74.mp4', '/examples/gallery/g-74.jpg', null, null, '16/9', true, 'Vidéo source à identifier (créateur inconnu)', 540),
  ('g-75', 'own', '/examples/gallery/g-75.mp4', '/examples/gallery/g-75.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 550),
  ('g-76', 'own', '/examples/gallery/g-76.mp4', '/examples/gallery/g-76.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 560),
  ('g-77', 'own', '/examples/gallery/g-77.mp4', '/examples/gallery/g-77.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 570),
  ('g-78', 'own', '/examples/gallery/g-78.mp4', '/examples/gallery/g-78.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 580),
  ('g-79', 'own', '/examples/gallery/g-79.mp4', '/examples/gallery/g-79.jpg', null, null, '16/9', true, 'Vidéo source à identifier (créateur inconnu)', 590),
  ('g-80', 'own', '/examples/gallery/g-80.mp4', '/examples/gallery/g-80.jpg', null, null, '16/9', true, 'Vidéo source à identifier (créateur inconnu)', 600),
  ('g-81', 'own', '/examples/gallery/g-81.mp4', '/examples/gallery/g-81.jpg', null, null, '16/9', true, 'Vidéo source à identifier (créateur inconnu)', 610),
  ('g-82', 'own', '/examples/gallery/g-82.mp4', '/examples/gallery/g-82.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 620),
  ('g-83', 'own', '/examples/gallery/g-83.mp4', '/examples/gallery/g-83.jpg', null, null, '16/9', true, 'Vidéo source à identifier (créateur inconnu)', 630),
  ('g-84', 'own', '/examples/gallery/g-84.mp4', '/examples/gallery/g-84.jpg', null, null, '16/9', true, 'Vidéo source à identifier (créateur inconnu)', 640),
  ('g-88', 'own', '/examples/gallery/g-88.mp4', '/examples/gallery/g-88.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 650),
  ('g-89', 'own', '/examples/gallery/g-89.mp4', '/examples/gallery/g-89.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 660),
  ('g-92', 'own', '/examples/gallery/g-92.mp4', '/examples/gallery/g-92.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 670),
  ('g-93', 'own', '/examples/gallery/g-93.mp4', '/examples/gallery/g-93.jpg', null, null, '3/4', true, 'Vidéo source à identifier (créateur inconnu)', 680),
  ('g-97', 'own', '/examples/gallery/g-97.mp4', '/examples/gallery/g-97.jpg', null, null, '4/3', true, 'Vidéo source à identifier (créateur inconnu)', 690),
  ('g-98', 'own', '/examples/gallery/g-98.mp4', '/examples/gallery/g-98.jpg', null, null, '9/16', true, 'Vidéo source à identifier (créateur inconnu)', 700),
  ('g-01', 'own', '/examples/gallery/g-01.mp4', '/examples/gallery/g-01.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 710),
  ('g-02', 'own', '/examples/gallery/g-02.mp4', '/examples/gallery/g-02.jpg', null, null, '3/4', false, 'Vidéo source à identifier (créateur inconnu)', 720),
  ('g-03', 'own', '/examples/gallery/g-03.mp4', '/examples/gallery/g-03.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 730),
  ('g-04', 'own', '/examples/gallery/g-04.mp4', '/examples/gallery/g-04.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 740),
  ('g-05', 'own', '/examples/gallery/g-05.mp4', '/examples/gallery/g-05.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 750),
  ('g-06', 'own', '/examples/gallery/g-06.mp4', '/examples/gallery/g-06.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 760),
  ('g-07', 'own', '/examples/gallery/g-07.mp4', '/examples/gallery/g-07.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 770),
  ('g-08', 'own', '/examples/gallery/g-08.mp4', '/examples/gallery/g-08.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 780),
  ('g-09', 'own', '/examples/gallery/g-09.mp4', '/examples/gallery/g-09.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 790),
  ('g-10', 'own', '/examples/gallery/g-10.mp4', '/examples/gallery/g-10.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 800),
  ('g-11', 'own', '/examples/gallery/g-11.mp4', '/examples/gallery/g-11.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 810),
  ('g-12', 'own', '/examples/gallery/g-12.mp4', '/examples/gallery/g-12.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 820),
  ('g-13', 'own', '/examples/gallery/g-13.mp4', '/examples/gallery/g-13.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 830),
  ('g-14', 'own', '/examples/gallery/g-14.mp4', '/examples/gallery/g-14.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 840),
  ('g-15', 'own', '/examples/gallery/g-15.mp4', '/examples/gallery/g-15.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 850),
  ('g-16', 'own', '/examples/gallery/g-16.mp4', '/examples/gallery/g-16.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 860),
  ('g-17', 'own', '/examples/gallery/g-17.mp4', '/examples/gallery/g-17.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 870),
  ('g-18', 'own', '/examples/gallery/g-18.mp4', '/examples/gallery/g-18.jpg', null, null, '3/4', false, 'Vidéo source à identifier (créateur inconnu)', 880),
  ('g-19', 'own', '/examples/gallery/g-19.mp4', '/examples/gallery/g-19.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 890),
  ('g-20', 'own', '/examples/gallery/g-20.mp4', '/examples/gallery/g-20.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 900),
  ('g-21', 'own', '/examples/gallery/g-21.mp4', '/examples/gallery/g-21.jpg', null, null, '9/16', false, 'Vidéo source à identifier (créateur inconnu)', 910),
  ('genjutsu-cage', 'own', '/examples/genjutsu-cage.mp4', '/examples/genjutsu-cage.jpg', null, null, '9/16', false, null, 920),
  ('genjutsu-danse', 'own', '/examples/genjutsu-danse.mp4', '/examples/genjutsu-danse.jpg', null, null, '9/16', false, null, 930),
  ('genjutsu-dunk', 'own', '/examples/genjutsu-dunk.mp4', '/examples/genjutsu-dunk.jpg', null, null, '9/16', false, null, 940),
  ('genjutsu-bras-de-fer', 'own', '/examples/genjutsu-bras-de-fer.mp4', '/examples/genjutsu-bras-de-fer.jpg', null, null, '1/1', false, null, 950),
  ('genjutsu-diable', 'own', '/examples/genjutsu-diable.mp4', '/examples/genjutsu-diable.jpg', null, null, '9/16', false, null, 960),
  ('genjutsu-camion', 'own', '/examples/genjutsu-camion.mp4', '/examples/genjutsu-camion.jpg', null, null, '4/3', false, null, 970),
  ('genjutsu-lincoln', 'own', '/examples/genjutsu-lincoln.mp4', '/examples/genjutsu-lincoln.jpg', null, null, '9/16', false, null, 980),
  ('genjutsu-panier', 'own', '/examples/genjutsu-panier.mp4', '/examples/genjutsu-panier.jpg', null, null, '3/4', false, null, 990),
  ('mma-apres', 'own', '/examples/mma-apres.mp4', '/examples/mma-apres.jpg', '/examples/mma-avant.mp4', 1.5, '9/16', false, null, 1000),
  ('micro-apres', 'own', '/examples/micro-apres.mp4', '/examples/micro-apres.jpg', '/examples/micro-avant.mp4', 1.5, '9/16', false, null, 1010),
  ('military', 'own', '/showcase/military.mp4', '/showcase/military.jpg', null, null, '9/16', false, null, 1020),
  ('courtyard', 'own', '/showcase/courtyard.mp4', '/showcase/courtyard.jpg', null, null, '9/16', false, null, 1030),
  ('army', 'own', '/showcase/army.mp4', '/showcase/army.jpg', null, null, '9/16', false, null, 1040),
  ('cats', 'own', '/showcase/cats.mp4', '/showcase/cats.jpg', null, null, '9/16', false, null, 1050),
  ('fight', 'own', '/showcase/fight.mp4', '/showcase/fight.jpg', null, null, '9/16', false, null, 1060),
  ('henry', 'own', '/showcase/henry.mp4', '/showcase/henry.jpg', null, null, '9/16', false, null, 1070),
  ('gasmask', 'own', '/showcase/gasmask.mp4', '/showcase/gasmask.jpg', null, null, '9/16', false, null, 1080),
  ('dog', 'own', '/showcase/dog.mp4', '/showcase/dog.jpg', null, null, '9/16', false, null, 1090),
  ('demo-03', 'own', '/demos/demo-03.mp4', '/demos/demo-03.jpg', null, null, '9/16', false, null, 1100),
  ('demo-05', 'own', '/demos/demo-05.mp4', '/demos/demo-05.jpg', null, null, '9/16', false, null, 1110),
  ('demo-07', 'own', '/demos/demo-07.mp4', '/demos/demo-07.jpg', null, null, '9/16', false, null, 1120),
  ('demo-10', 'own', '/demos/demo-10.mp4', '/demos/demo-10.jpg', null, null, '9/16', false, null, 1130),
  ('demo-12', 'own', '/demos/demo-12.mp4', '/demos/demo-12.jpg', null, null, '9/16', false, null, 1140),
  ('demo-13', 'own', '/demos/demo-13.mp4', '/demos/demo-13.jpg', null, null, '9/16', false, null, 1150),
  ('demo-08', 'own', '/demos/demo-08.mp4', '/demos/demo-08.jpg', null, null, '5/4', false, null, 1160),
  ('demo-15', 'own', '/demos/demo-15.mp4', '/demos/demo-15.jpg', null, null, '5/4', false, null, 1170),
  ('demo-01', 'own', '/demos/demo-01.mp4', '/demos/demo-01.jpg', null, null, '16/9', false, null, 1180),
  ('demo-02', 'own', '/demos/demo-02.mp4', '/demos/demo-02.jpg', null, null, '16/9', false, null, 1190),
  ('demo-04', 'own', '/demos/demo-04.mp4', '/demos/demo-04.jpg', null, null, '16/9', false, null, 1200),
  ('demo-06', 'own', '/demos/demo-06.mp4', '/demos/demo-06.jpg', null, null, '16/9', false, null, 1210),
  ('demo-09', 'own', '/demos/demo-09.mp4', '/demos/demo-09.jpg', null, null, '16/9', false, null, 1220),
  ('demo-11', 'own', '/demos/demo-11.mp4', '/demos/demo-11.jpg', null, null, '16/9', false, null, 1230),
  ('demo-14', 'own', '/demos/demo-14.mp4', '/demos/demo-14.jpg', null, null, '16/9', false, null, 1240),
  ('demo-16', 'own', '/demos/demo-16.mp4', '/demos/demo-16.jpg', null, null, '16/9', false, null, 1250),
  ('demo-17', 'own', '/demos/demo-17.mp4', '/demos/demo-17.jpg', null, null, '16/9', false, null, 1260),
  ('demo-18', 'own', '/demos/demo-18.mp4', '/demos/demo-18.jpg', null, null, '16/9', false, null, 1270),
  ('demo-19', 'own', '/demos/demo-19.mp4', '/demos/demo-19.jpg', null, null, '16/9', false, null, 1280),
  ('demo-20', 'own', '/demos/demo-20.mp4', '/demos/demo-20.jpg', null, null, '16/9', false, null, 1290),
  ('demo-21', 'own', '/demos/demo-21.mp4', '/demos/demo-21.jpg', null, null, '16/9', false, null, 1300),
  ('demo-22', 'own', '/demos/demo-22.mp4', '/demos/demo-22.jpg', null, null, '16/9', false, null, 1310),
  ('demo-23', 'own', '/demos/demo-23.mp4', '/demos/demo-23.jpg', null, null, '16/9', false, null, 1320),
  ('chien', 'own', '/examples/chien.mp4', '/examples/chien.jpg', null, null, '16/9', true, null, 1330),
  ('ours', 'own', '/examples/ours.mp4', '/examples/ours.jpg', null, null, '16/9', true, null, 1340);
