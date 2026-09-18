-- Crédits offerts à l'inscription : 3, de quoi essayer quelques photos (1
-- crédit chacune) mais pas une vidéo (5 crédits minimum), qui coûte plusieurs
-- dollars chez fal. Les comptes existants gardent leur solde.
alter table public.profiles alter column credits_remaining set default 3;
