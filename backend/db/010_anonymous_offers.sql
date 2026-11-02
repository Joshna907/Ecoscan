-- Accounts are deliberately retired; keep anonymous session balances/results.
DROP TABLE IF EXISTS eco_auth_sessions;
DROP TABLE IF EXISTS eco_auth_attempts;
DROP TABLE IF EXISTS eco_users;

CREATE TABLE IF NOT EXISTS eco_offer_inventory (
  offer_id text PRIMARY KEY,
  remaining integer NOT NULL CHECK (remaining >= 0)
);
INSERT INTO eco_offer_inventory VALUES ('repair-kit',100),('swap-pass',100),('secondhand-voucher',100)
  ON CONFLICT DO NOTHING;
ALTER TABLE eco_redemptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'issued'
  CHECK (status IN ('issued','used','refunded'));
ALTER TABLE eco_redemptions ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');
ALTER TABLE eco_redemptions ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- Existing receipts expire relative to original issuance, not upgrade time.
UPDATE eco_redemptions SET expires_at = LEAST(expires_at, redeemed_at + interval '30 days');
