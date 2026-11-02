CREATE TABLE IF NOT EXISTS eco_receipt_archive (
  reference text PRIMARY KEY,
  offer_id text NOT NULL,
  redeemed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('issued','used','refunded')),
  recovery_hash text UNIQUE,
  recovery_expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS eco_reward_security_events (
  id uuid PRIMARY KEY,
  rule text NOT NULL,
  subject text NOT NULL,
  dedup_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eco_reward_security_events_window ON eco_reward_security_events(rule,subject,occurred_at);
CREATE TABLE IF NOT EXISTS eco_reward_reviews (
  id uuid PRIMARY KEY, rule text NOT NULL, subject text NOT NULL,
  event_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','held','dismissed','released')),
  version integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS eco_reward_reviews_active ON eco_reward_reviews(rule,subject) WHERE status IN ('open','held');
CREATE TABLE IF NOT EXISTS eco_reward_holds (
  subject text PRIMARY KEY, operator_id text NOT NULL, reason text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS eco_reward_review_audit (
  id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES eco_reward_reviews(id),
  operator_id text NOT NULL, decision text NOT NULL, reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
