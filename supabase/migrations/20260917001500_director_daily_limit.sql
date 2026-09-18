-- Chat Director : chaque message appelle Claude Opus et n'est pas payé en
-- crédits. On plafonne à 20 messages par jour (UTC) et par compte.
-- La limite est alignée avec DIRECTOR_DAILY_LIMIT (src/lib/director.ts).

create table public.director_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  messages integer not null default 0 check (messages >= 0),
  primary key (user_id, day)
);

-- Aucun accès direct : seul use_director_message écrit ici.
alter table public.director_usage enable row level security;

-- Compte un message du jour ; refuse au-delà de la limite.
create function public.use_director_message()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_messages integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.director_usage as u (user_id, day, messages)
  values (v_user_id, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update
    set messages = u.messages + 1
    where u.messages < 20
  returning messages into v_messages;

  if v_messages is null then
    raise exception 'director_limit' using errcode = 'P0001';
  end if;

  return v_messages;
end;
$$;

revoke execute on function public.use_director_message() from public, anon;
grant execute on function public.use_director_message() to authenticated;
