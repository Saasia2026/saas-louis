-- TwinPost — schéma initial du MVP
-- Tables, RLS, trigger de profil, fonctions de crédits, buckets de stockage.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  credits_remaining integer not null default 5 check (credits_remaining >= 0),
  plan text not null default 'free' check (plan in ('free', 'creator', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.twins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null default 'Mon jumeau',
  status text not null default 'pending'
    check (status in ('pending', 'training', 'ready', 'failed')),
  replicate_training_id text unique,
  replicate_model_version text,
  training_started_at timestamptz,
  training_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.training_photos (
  id uuid primary key default gen_random_uuid(),
  twin_id uuid not null references public.twins (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  twin_id uuid references public.twins (id) on delete set null,
  prompt text not null,
  negative_prompt text,
  image_url text,
  storage_path text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  replicate_prediction_id text unique,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index twins_user_id_idx on public.twins (user_id);
create index training_photos_twin_id_idx on public.training_photos (twin_id);
create index training_photos_user_id_idx on public.training_photos (user_id);
create index generations_user_id_created_at_idx on public.generations (user_id, created_at desc);
create index generations_twin_id_idx on public.generations (twin_id);

-- ---------------------------------------------------------------------------
-- Droits par colonne : les champs sensibles (crédits, plan, statut, ids
-- Replicate) ne sont modifiables que côté serveur (service_role).
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.twins, public.training_photos, public.generations
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

grant select, delete on public.twins to authenticated;
grant insert (name) on public.twins to authenticated;
grant update (name) on public.twins to authenticated;

grant select, delete on public.training_photos to authenticated;
grant insert (twin_id, storage_path, file_name) on public.training_photos to authenticated;

grant select, delete on public.generations to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.twins enable row level security;
alter table public.training_photos enable row level security;
alter table public.generations enable row level security;

create policy "profiles: lecture du sien" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: modification du sien" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "twins: lecture des siens" on public.twins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "twins: création" on public.twins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "twins: modification des siens" on public.twins
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "twins: suppression des siens" on public.twins
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "training_photos: lecture des siennes" on public.training_photos
  for select to authenticated using ((select auth.uid()) = user_id);
-- On ne peut ajouter une photo qu'à son propre jumeau, et avant l'entraînement,
-- dans son propre dossier de stockage.
create policy "training_photos: ajout" on public.training_photos
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/%'
    and exists (
      select 1 from public.twins t
      where t.id = twin_id and t.user_id = (select auth.uid()) and t.status = 'pending'
    )
  );
create policy "training_photos: suppression des siennes" on public.training_photos
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "generations: lecture des siennes" on public.generations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "generations: suppression des siennes" on public.generations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Crédits
-- ---------------------------------------------------------------------------

-- Débite 1 crédit et crée la génération en une seule opération.
-- Appelée par l'utilisateur connecté (via /api/generate).
create function public.start_generation(
  p_twin_id uuid,
  p_prompt text,
  p_negative_prompt text default null,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_generation_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.twins
    where id = p_twin_id and user_id = v_user_id and status = 'ready'
  ) then
    raise exception 'twin_not_ready' using errcode = 'P0001';
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - 1
  where id = v_user_id and credits_remaining > 0;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.generations (user_id, twin_id, prompt, negative_prompt, metadata)
  values (v_user_id, p_twin_id, p_prompt, p_negative_prompt, coalesce(p_metadata, '{}'))
  returning id into v_generation_id;

  return v_generation_id;
end;
$$;

-- Marque une génération en échec et rend le crédit (une seule fois).
-- Réservée au serveur (webhook / erreur d'appel Replicate).
create function public.fail_generation(p_generation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  update public.generations
  set status = 'failed'
  where id = p_generation_id and status in ('pending', 'processing')
  returning user_id into v_user_id;

  if v_user_id is not null then
    update public.profiles
    set credits_remaining = credits_remaining + 1
    where id = v_user_id;
  end if;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.start_generation(uuid, text, text, jsonb) from public, anon;
grant execute on function public.start_generation(uuid, text, text, jsonb) to authenticated;
revoke execute on function public.fail_generation(uuid) from public, anon, authenticated;
grant execute on function public.fail_generation(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Stockage : buckets privés, un dossier par utilisateur (<user_id>/...)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('training-photos', 'training-photos', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('generations', 'generations', false, 20971520,
   array['image/webp', 'image/png', 'image/jpeg']);

create policy "training-photos: lecture des siennes" on storage.objects
  for select to authenticated using (
    bucket_id = 'training-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "training-photos: ajout dans son dossier" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'training-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "training-photos: suppression des siennes" on storage.objects
  for delete to authenticated using (
    bucket_id = 'training-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Les images générées sont écrites par le serveur ; l'utilisateur lit et supprime.
create policy "generations: lecture des siennes" on storage.objects
  for select to authenticated using (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "generations: suppression des siennes" on storage.objects
  for delete to authenticated using (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
