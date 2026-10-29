CREATE TABLE IF NOT EXISTS eco_scan_rate_buckets (
  key_hash text PRIMARY KEY,
  tokens double precision NOT NULL CHECK (tokens >= 0),
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS eco_upload_slots (
  id uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS eco_upload_slots_expiry_idx ON eco_upload_slots(expires_at);

CREATE TABLE IF NOT EXISTS eco_vision_slots (
  id uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS eco_vision_slots_expiry_idx ON eco_vision_slots(expires_at);

CREATE TABLE IF NOT EXISTS eco_vision_daily_usage (
  day date PRIMARY KEY,
  calls integer NOT NULL CHECK (calls >= 0)
);
