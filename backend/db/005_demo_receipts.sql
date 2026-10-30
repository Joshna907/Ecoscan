ALTER TABLE eco_redemptions ADD COLUMN IF NOT EXISTS demo_reference text;
UPDATE eco_redemptions
SET demo_reference = 'DEMO-' || upper(substr(md5(session_id::text || ':' || offer_id || ':' || redeemed_at::text), 1, 16))
WHERE demo_reference IS NULL;
ALTER TABLE eco_redemptions ALTER COLUMN demo_reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS eco_redemptions_reference_idx ON eco_redemptions(demo_reference);
