ALTER TABLE eco_sessions ADD COLUMN IF NOT EXISTS latest_result jsonb;

-- Backfill a recent confirmation when it is still available. Older analysis
-- rows may already have been deleted by the retry-retention cleanup.
UPDATE eco_sessions AS session
SET latest_result = recent.result
FROM (
  SELECT DISTINCT ON (session_id) session_id, result
  FROM eco_analyses
  WHERE status = 'confirmed' AND result IS NOT NULL
  ORDER BY session_id, expires_at DESC
) AS recent
WHERE session.id = recent.session_id AND session.latest_result IS NULL;
