-- Limite à 30 photos par jumeau, appliquée par la base.
-- (Remplacée par un trigger dans 20260917000100_training_photos_limit_trigger.sql.)

create function public.twin_photo_count(p_twin_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.training_photos
  where twin_id = p_twin_id and user_id = (select auth.uid());
$$;

revoke execute on function public.twin_photo_count(uuid) from public, anon;
grant execute on function public.twin_photo_count(uuid) to authenticated;

drop policy "training_photos: ajout" on public.training_photos;

create policy "training_photos: ajout" on public.training_photos
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/' || twin_id::text || '/%'
    and exists (
      select 1 from public.twins t
      where t.id = twin_id and t.user_id = (select auth.uid()) and t.status = 'pending'
    )
    and public.twin_photo_count(twin_id) < 30
  );
