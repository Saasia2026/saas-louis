-- Chat Viralité payé en crédits : chaque question débite son prix au moment
-- où elle est posée (même requête que l'enregistrement du message) ; une
-- réponse interrompue ou vide est remboursée, une seule fois.

alter table public.viral_messages
  add column if not exists credits_cost integer not null default 0 check (credits_cost >= 0);

create or replace function public.start_viral_question(p_user_id uuid, p_content text, p_credits integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_credits < 0 or p_credits > 20 then
    raise exception 'invalid_cost' using errcode = 'P0001';
  end if;

  update public.profiles
  set credits_remaining = credits_remaining - p_credits
  where id = p_user_id and credits_remaining >= p_credits;

  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into public.viral_messages (user_id, role, content, credits_cost)
  values (p_user_id, 'user', p_content, p_credits)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.refund_viral_question(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_credits integer;
begin
  select user_id, credits_cost into v_user_id, v_credits
  from public.viral_messages
  where id = p_message_id and role = 'user' and credits_cost > 0
  for update;

  if not found then
    return;
  end if;

  update public.viral_messages set credits_cost = 0 where id = p_message_id;
  update public.profiles
  set credits_remaining = credits_remaining + v_credits
  where id = v_user_id;
end;
$$;

revoke all on function public.start_viral_question(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.start_viral_question(uuid, text, integer) to service_role;
revoke all on function public.refund_viral_question(bigint) from public, anon, authenticated;
grant execute on function public.refund_viral_question(bigint) to service_role;
