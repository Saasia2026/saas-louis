-- Langue du site au moment où le rythme a été enregistré : celle des emails
-- d'alerte.
alter table public.posting_plans add column if not exists locale text not null default 'fr';
