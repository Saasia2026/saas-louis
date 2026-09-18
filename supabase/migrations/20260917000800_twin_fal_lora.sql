-- Poids LoRA du jumeau hébergés sur fal.ai (fal ne lit pas l'archive .tar
-- produite par l'entraînement Replicate). Rempli à la première génération
-- basculée sur fal.

alter table public.twins
  add column fal_lora_url text;
