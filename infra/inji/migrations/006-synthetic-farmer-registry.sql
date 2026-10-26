BEGIN;
CREATE TABLE IF NOT EXISTS certify.playground_synthetic_farmer (
    subject_id VARCHAR(255) PRIMARY KEY,
    record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE certify.playground_synthetic_farmer IS
    'Local playground synthetic records; not evidence of real identity or agricultural eligibility.';
COMMIT;
