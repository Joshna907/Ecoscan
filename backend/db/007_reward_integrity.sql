ALTER TABLE eco_analyses
  ADD COLUMN IF NOT EXISTS image_hash text;

CREATE TABLE IF NOT EXISTS eco_reward_claims (
  session_id uuid NOT NULL REFERENCES eco_sessions(id) ON DELETE CASCADE,
  image_hash text NOT NULL,
  analysis_id uuid REFERENCES eco_analyses(id) ON DELETE SET NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, image_hash),
  UNIQUE (analysis_id)
);

CREATE INDEX IF NOT EXISTS eco_reward_claims_claimed_at_idx
  ON eco_reward_claims(claimed_at);
