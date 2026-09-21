-- Carte enregistrée, recharge automatique et abonnements.
--
-- stripe_customer_id : client Stripe de l'utilisateur ; ses cartes et son
-- abonnement vivent chez Stripe, lus à la demande.
-- auto_recharge_pack : pack acheté automatiquement quand le solde passe sous
-- auto_recharge_threshold (null : recharge désactivée). Réglés par le serveur
-- seulement (aucun droit de modification côté client sur ces colonnes).
-- auto_recharge_failed : la dernière tentative a été refusée par la banque ;
-- plus aucun débit tant que l'utilisateur ne l'a pas réactivée.

alter table public.profiles
  add column stripe_customer_id text unique,
  add column auto_recharge_pack text check (auto_recharge_pack in ('starter', 'creator', 'studio')),
  add column auto_recharge_threshold integer not null default 20
    check (auto_recharge_threshold between 5 and 500),
  add column auto_recharge_failed boolean not null default false,
  add column auto_recharge_at timestamptz;

-- Réserve une recharge automatique : renvoie le pack à débiter, ou null.
-- `p_needed` : crédits nécessaires tout de suite (une vidéo refusée faute de
-- solde), en plus du seuil. Garde-fous : 2 minutes entre deux recharges,
-- 5 au plus par 24 h.
create function public.claim_auto_recharge(p_user_id uuid, p_needed integer default 0)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack text;
begin
  if (
    select count(*) from public.credit_purchases
    where user_id = p_user_id and pack_id like 'auto-%' and created_at > now() - interval '1 day'
  ) >= 5 then
    return null;
  end if;

  update public.profiles
  set auto_recharge_at = now()
  where id = p_user_id
    and auto_recharge_pack is not null
    and not auto_recharge_failed
    and stripe_customer_id is not null
    and credits_remaining < greatest(auto_recharge_threshold, coalesce(p_needed, 0))
    and (auto_recharge_at is null or auto_recharge_at < now() - interval '2 minutes')
  returning auto_recharge_pack into v_pack;

  return v_pack;
end;
$$;

revoke all on function public.claim_auto_recharge(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_auto_recharge(uuid, integer) to service_role;
