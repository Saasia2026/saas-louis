-- Raison de l'échec d'une génération, affichée telle quelle à l'utilisateur
-- (solde du fournisseur épuisé, par exemple).

alter table public.generations
  add column error text;
