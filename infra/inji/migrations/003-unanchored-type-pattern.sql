-- Updates the farmer definition in inji_verify (gap M3). Fresh seeds already
-- use the unanchored pattern, and no script runs this file.
BEGIN;
-- Mimoto 0.21.0 evaluates filter.pattern with String.contains, so the anchored regex never matches.
UPDATE verify.presentation_definition
SET input_descriptors = replace(input_descriptors, '"pattern":"^FarmerCredential$"', '"pattern":"FarmerCredential"')
WHERE id = '00000000-0000-4000-8000-000000000001';
COMMIT;
