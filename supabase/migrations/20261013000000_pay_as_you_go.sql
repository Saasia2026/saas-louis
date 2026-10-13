-- Paiement à l'usage : avec une carte enregistrée, les crédits qui manquent
-- pour lancer une vidéo (ou poser une question) sont débités sur la carte au
-- moment du lancement, sans détour par la page des crédits. Il remplace la
-- recharge automatique (auto_recharge_pack et auto_recharge_threshold ne
-- servent plus) ; auto_recharge_failed garde son rôle : un refus de la banque
-- suspend les débits jusqu'à ce que l'utilisateur les réactive.
alter table public.profiles
  add column if not exists pay_as_you_go boolean not null default false;
