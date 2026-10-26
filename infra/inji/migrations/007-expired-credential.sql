BEGIN;
-- The dates are set before Certify signs the credential; the normal configuration is untouched.
INSERT INTO certify.credential_config
SELECT (jsonb_populate_record(NULL::certify.credential_config,
    to_jsonb(source) || jsonb_build_object(
        'credential_config_key_id', 'FarmerCredentialExpired',
        'config_id', gen_random_uuid()::text,
        'scope', 'mock_identity_vc_expired',
        'credential_type', 'FarmerCredential,FarmerCredentialExpired,VerifiableCredential',
        'display', jsonb_set(source.display, '{0,name}', '"Farmer Credential (expired scenario)"'),
        'vc_template', encode(convert_to(
            replace(replace(replace(convert_from(decode(source.vc_template, 'base64'), 'UTF8'),
                '${validFrom}', '2020-01-01T00:00:00.000Z'),
                '${validUntil}', '2020-01-02T00:00:00.000Z'),
                '"FarmerCredential"', '"FarmerCredential","FarmerCredentialExpired"'), 'UTF8'), 'base64')
    ))).*
FROM certify.credential_config source
WHERE source.credential_config_key_id = 'FarmerCredential'
  AND NOT EXISTS (SELECT 1 FROM certify.credential_config WHERE credential_config_key_id = 'FarmerCredentialExpired');
COMMIT;
