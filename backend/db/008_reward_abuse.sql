-- Independent of anonymous session lifetime: clearing cookies must not reset claims.
CREATE TABLE IF NOT EXISTS eco_visual_reward_claims (
  image_hash text PRIMARY KEY,
  session_id uuid REFERENCES eco_sessions(id) ON DELETE SET NULL,
  points integer NOT NULL CHECK (points > 0),
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eco_visual_reward_claims_time_idx ON eco_visual_reward_claims(claimed_at);
CREATE INDEX IF NOT EXISTS eco_visual_reward_claims_session_time_idx ON eco_visual_reward_claims(session_id, claimed_at);
