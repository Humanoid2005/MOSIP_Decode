-- For inji_verify databases created before the seed included this fix.
-- Converts input_descriptors to text, the column type the pinned Verify
-- service expects, and sets the farmer definition's ldp_vc format and type
-- filter. No script runs this file. Apply it before 003, which removes the
-- anchors from the pattern set here.
BEGIN;
ALTER TABLE verify.presentation_definition
    ALTER COLUMN input_descriptors TYPE text USING input_descriptors::text;
UPDATE verify.presentation_definition
SET vp_format = '{"ldp_vc":{"proof_type":["Ed25519Signature2020"]}}',
    input_descriptors = '[{"id":"farmer","format":{"ldp_vc":{"proof_type":["Ed25519Signature2020"]}},"constraints":{"fields":[{"path":["$.type[*]"],"filter":{"type":"string","pattern":"^FarmerCredential$"}}]}}]'
WHERE id = '00000000-0000-4000-8000-000000000001';
COMMIT;
