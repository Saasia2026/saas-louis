-- Achats de crédits par Stripe Checkout. Une ligne par session de paiement :
-- la clé unique rend le crédit idempotent (webhook rejoué, retour sur la
-- page de succès et webhook en même temps).

create table public.credit_purchases (
  stripe_session_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pack_id text not null,
  credits integer not null check (credits > 0),
  amount_total integer not null check (amount_total >= 0),
  currency text not null,
  created_at timestamptz not null default now()
);

create index credit_purchases_user_id_idx on public.credit_purchases (user_id);

alter table public.credit_purchases enable row level security;

create policy "credit_purchases: lecture" on public.credit_purchases
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Enregistre un paiement réussi et crédite le compte, une seule fois par
-- session. Renvoie true si les crédits viennent d'être ajoutés.
create function public.apply_credit_purchase(
  p_session_id text,
  p_user_id uuid,
  p_pack_id text,
  p_credits integer,
  p_amount_total integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_purchases
    (stripe_session_id, user_id, pack_id, credits, amount_total, currency)
  values (p_session_id, p_user_id, p_pack_id, p_credits, p_amount_total, p_currency)
  on conflict (stripe_session_id) do nothing;

  if not found then
    return false;
  end if;

  update public.profiles
  set credits_remaining = credits_remaining + p_credits
  where id = p_user_id;

  return true;
end;
$$;

-- Appelée uniquement par le serveur (clé service_role), jamais par un client.
revoke execute on function public.apply_credit_purchase(text, uuid, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_credit_purchase(text, uuid, text, integer, integer, text)
  to service_role;
