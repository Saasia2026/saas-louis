-- Modèle 3D de chaque jumeau, créé automatiquement une fois le jumeau prêt :
-- une photo en pied du jumeau (stage 'image'), puis sa conversion en 3D
-- (stage 'mesh'). Les fichiers vont dans le bucket privé twin-models,
-- sous <user_id>/<twin_id>/.

alter table public.twins
  add column model_status text
    check (model_status in ('image', 'mesh', 'ready', 'failed')),
  add column model_prediction_id text unique,
  add column model_attempts integer not null default 0,
  add column model_image_path text,
  add column model_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'twin-models',
  'twin-models',
  false,
  104857600,
  array['model/gltf-binary', 'image/webp', 'image/png', 'image/jpeg']
);

-- Lecture seule pour l'utilisateur ; l'écriture et la suppression passent
-- par le serveur (service role).
create policy "twin-models: lecture des siens" on storage.objects
  for select to authenticated using (
    bucket_id = 'twin-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
