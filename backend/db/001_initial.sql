CREATE TABLE IF NOT EXISTS eco_sessions (
  id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  demo_points_balance integer NOT NULL DEFAULT 0 CHECK (demo_points_balance >= 0)
);

CREATE TABLE IF NOT EXISTS eco_analyses (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES eco_sessions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('awaiting_review', 'confirmed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  fingerprint text,
  result jsonb
);
CREATE INDEX IF NOT EXISTS eco_analyses_session_idx ON eco_analyses(session_id);
CREATE INDEX IF NOT EXISTS eco_analyses_expiry_idx ON eco_analyses(expires_at);

CREATE TABLE IF NOT EXISTS eco_upload_leases (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES eco_sessions(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS eco_upload_leases_expiry_idx ON eco_upload_leases(expires_at);

CREATE TABLE IF NOT EXISTS eco_redemptions (
  session_id uuid NOT NULL REFERENCES eco_sessions(id) ON DELETE CASCADE,
  offer_id text NOT NULL,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, offer_id)
);
