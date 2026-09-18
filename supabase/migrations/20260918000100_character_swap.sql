-- Remplacement de personnage : l'utilisateur dépose un clip filmé et l'image
-- d'un personnage, le modèle vidéo remplace la personne du clip en gardant
-- ses mouvements, le décor et la lumière.
--
-- - generations.kind 'swap' : une seule requête fal, suivie comme une photo
--   (stage 'image').
-- - bucket swap-inputs : clips et images déposés par l'utilisateur.
-- - start_swap_generation : débite les crédits d'après la durée mesurée par
--   le serveur (ffmpeg). Réservée au service_role, sinon un client pourrait
--   déclarer une durée plus courte que celle de son clip.

alter table public.generations drop constraint generations_kind_check;
alter table public.generations
  add constraint generations_kind_check
  check (kind in ('image', 'video', 'swap'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'swap-inputs', 'swap-inputs', false, 52428800,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "swap-inputs: ajout" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'swap-inputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "swap-inputs: lecture" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'swap-inputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "swap-inputs: suppression" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'swap-inputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Aligné avec SWAP_CREDITS_PER_SECOND et SWAP_MAX_SECONDS (generation.ts).
create or replace function public.start_swap_generation(
  p_user_id uuid,
  p_duration_seconds integer,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost integer;
  v_generation_id uuid;
begin
  if p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 15 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  v_cost := p_duration_seconds * 1;

  update public.profiles
  set credits_remaining = credits_remaining - v_cost
  where id = p_user_id and credits_remaining >= v_cost;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.generations
    (user_id, prompt, metadata, kind, stage, credits_cost, duration_seconds)
  values
    (p_user_id, 'Remplacement de personnage', coalesce(p_metadata, '{}'), 'swap', 'image',
     v_cost, p_duration_seconds)
  returning id into v_generation_id;

  return v_generation_id;
end;
$$;

revoke all on function public.start_swap_generation(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.start_swap_generation(uuid, integer, jsonb) to service_role;
