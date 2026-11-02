CREATE TABLE IF NOT EXISTS eco_maintenance (
  name text PRIMARY KEY,
  last_success_at timestamptz NOT NULL DEFAULT now(),
  last_failure_at timestamptz
);
INSERT INTO eco_maintenance(name) VALUES ('retention') ON CONFLICT DO NOTHING;
