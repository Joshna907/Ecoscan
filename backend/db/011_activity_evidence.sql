-- No account required. Keep evidence deduplication after anonymous sessions expire.
CREATE TABLE IF NOT EXISTS eco_activity_requests (
  id uuid PRIMARY KEY,
  session_id uuid REFERENCES eco_sessions(id) ON DELETE SET NULL,
  code_hash text NOT NULL UNIQUE,
  partner_id text NOT NULL,
  activity text NOT NULL CHECK (activity IN ('repair','secondhand_purchase','donation','recycling')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS eco_activity_requests_session ON eco_activity_requests(session_id, created_at);
CREATE TABLE IF NOT EXISTS eco_activity_events (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES eco_activity_requests(id),
  session_id uuid REFERENCES eco_sessions(id) ON DELETE SET NULL,
  partner_id text NOT NULL,
  partner_name text NOT NULL,
  event_hash text NOT NULL UNIQUE,
  participant_hash text NOT NULL,
  fingerprint text NOT NULL,
  activity text NOT NULL CHECK (activity IN ('repair','secondhand_purchase','donation','recycling')),
  credits integer NOT NULL CHECK (credits > 0),
  occurred_at timestamptz NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  reversal_reason text CHECK (reversal_reason IN ('returned','cancelled','rejected')),
  reversed_at timestamptz
);
CREATE INDEX IF NOT EXISTS eco_activity_events_participant ON eco_activity_events(participant_hash, confirmed_at);
CREATE INDEX IF NOT EXISTS eco_activity_events_partner ON eco_activity_events(partner_id, confirmed_at);
CREATE INDEX IF NOT EXISTS eco_activity_events_session ON eco_activity_events(session_id);
