ALTER TABLE eco_analyses ADD COLUMN IF NOT EXISTS recognition_mode text;
ALTER TABLE eco_analyses DROP CONSTRAINT IF EXISTS eco_analyses_status_check;
ALTER TABLE eco_analyses ADD CONSTRAINT eco_analyses_status_check
  CHECK (status IN ('queued', 'processing', 'awaiting_review', 'confirmed', 'failed', 'expired'));

CREATE TABLE IF NOT EXISTS eco_recognition_jobs (
  analysis_id uuid PRIMARY KEY REFERENCES eco_analyses(id) ON DELETE CASCADE,
  image bytea NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  status text NOT NULL CHECK (status IN ('queued', 'processing')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claim_token uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eco_recognition_jobs_claim_idx
  ON eco_recognition_jobs(status, available_at, lease_until);
