-- Provenance des inscrits : liens de bio des réseaux, rattachés comme des
-- partenaires (profiles.referred_by). Exemple : twinpost.video/?ref=TIKTOK
--   select referred_by, count(*), count(stripe_customer_id)
--   from public.profiles group by 1;
insert into public.partners (code, name) values
  ('TIKTOK', 'Bio TikTok (Overtime IA)'),
  ('INSTAGRAM', 'Bio Instagram (Overtime IA)'),
  ('YOUTUBE', 'Bio YouTube')
on conflict (code) do nothing;
