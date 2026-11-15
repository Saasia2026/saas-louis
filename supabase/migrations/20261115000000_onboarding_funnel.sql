-- Tunnel d'accueil : les réponses du nouvel inscrit (objectif, réseaux,
-- abonnés, rythme) et la date à laquelle il l'a terminé ou passé. Tant
-- qu'onboarded_at est vide, le studio l'y envoie d'abord.
alter table public.profiles
  add column if not exists onboarding jsonb,
  add column if not exists onboarded_at timestamptz;

-- Les comptes déjà inscrits ne voient pas le tunnel.
update public.profiles set onboarded_at = coalesce(created_at, now()) where onboarded_at is null;
