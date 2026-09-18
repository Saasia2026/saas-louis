-- La limite de 30 photos passe d'une policy à un trigger BEFORE INSERT :
-- la policy évaluait le compte avant l'INSERT, donc un INSERT multi-lignes
-- pouvait la dépasser. Le trigger voit les lignes précédentes du même INSERT,
-- et le verrou sur le jumeau sérialise les uploads concurrents.

drop policy "training_photos: ajout" on public.training_photos;
drop function public.twin_photo_count(uuid);

create function public.enforce_training_photo_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.twins where id = new.twin_id for update;

  if (select count(*) from public.training_photos where twin_id = new.twin_id) >= 30 then
    raise exception 'training_photo_limit' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger training_photos_limit
  before insert on public.training_photos
  for each row execute function public.enforce_training_photo_limit();

-- Le chemin de stockage doit être <user_id>/<twin_id>/...
create policy "training_photos: ajout" on public.training_photos
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/' || twin_id::text || '/%'
    and exists (
      select 1 from public.twins t
      where t.id = twin_id and t.user_id = (select auth.uid()) and t.status = 'pending'
    )
  );
