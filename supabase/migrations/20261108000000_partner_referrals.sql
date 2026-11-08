-- Partenaires (créateurs sponsorisés) : chacun a un code, par exemple ARCHIE.
-- Un nouvel inscrit arrivé par twinpost.video/?ref=archie, ou qui tape le code
-- à l'inscription, est rattaché au partenaire dans profiles.referred_by.
-- Compter les inscrits d'un partenaire :
--   select count(*) from public.profiles where referred_by = 'ARCHIE';

create table public.partners (
  code text primary key check (code ~ '^[A-Z0-9_-]{2,32}$'),
  name text not null,
  created_at timestamptz not null default now()
);

-- Aucune politique : seul le rôle service (et la fonction ci-dessous) y accède.
alter table public.partners enable row level security;

alter table public.profiles
  add column referred_by text references public.partners (code);

-- Rattache le compte connecté à un partenaire. Sans effet si le code n'existe
-- pas, si le compte a déjà un parrain, ou s'il a plus d'un jour : un ancien
-- client ne peut pas se rattacher après coup.
create function public.claim_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set referred_by = c.code
  from public.partners c
  where p.id = auth.uid()
    and p.referred_by is null
    and p.created_at > now() - interval '1 day'
    and c.code = upper(trim(p_code));
  return found;
end;
$$;

revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

insert into public.partners (code, name) values ('ARCHIE', 'Archie Pimm');
