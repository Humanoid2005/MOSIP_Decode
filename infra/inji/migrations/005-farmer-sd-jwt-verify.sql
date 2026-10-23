BEGIN;
-- Mimoto 0.21.0 rejects SD-JWT credentials when an input descriptor declares a format, and throws
-- UNSUPPORTED_FORMAT when constraint fields are evaluated against them. The only definition it can
-- match against an SD-JWT therefore has neither; the holder selects the SD-JWT credential.
INSERT INTO verify.presentation_definition (id, input_descriptors, name, purpose)
SELECT
    '00000000-0000-4000-8000-000000000002',
    '[{"id":"farmer-sd-jwt","constraints":{}}]',
    'Farmer credential (SD-JWT)',
    'Verify the locally issued SD-JWT farmer credential'
WHERE NOT EXISTS (
    SELECT 1 FROM verify.presentation_definition WHERE id = '00000000-0000-4000-8000-000000000002'
);
COMMIT;
