CREATE TABLE IF NOT EXISTS eco_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  session_id uuid NOT NULL UNIQUE REFERENCES eco_sessions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eco_auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES eco_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eco_auth_sessions_user_idx ON eco_auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS eco_auth_sessions_expiry_idx ON eco_auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS eco_auth_attempts (
  email_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now()
);
