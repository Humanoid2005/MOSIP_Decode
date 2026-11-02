-- Creates the inji_certify table in which the synthetic farmer provider keeps
-- one fictional record per authenticated subject. Runs in local mode, in the
-- fresh seed and on every upgrade.mjs run, so it must stay rerunnable.
BEGIN;
CREATE TABLE IF NOT EXISTS certify.playground_synthetic_farmer (
    subject_id VARCHAR(255) PRIMARY KEY,
    record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE certify.playground_synthetic_farmer IS
    'Local playground synthetic records; not evidence of real identity or agricultural eligibility.';
COMMIT;
