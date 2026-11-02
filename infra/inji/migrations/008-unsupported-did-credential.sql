-- Adds the unsupported-DID scenario's configuration to inji_certify (gap
-- M10). Runs in local mode, in the fresh seed and on every upgrade.mjs run,
-- so it must stay rerunnable.
BEGIN;
-- Certify signs this fixture with its existing development key and the deliberately unresolvable issuer identifier.
INSERT INTO certify.credential_config
-- Copies every column of the JSON-LD farmer row and overrides the keys below.
SELECT (jsonb_populate_record(NULL::certify.credential_config,
    to_jsonb(source) || jsonb_build_object(
        'credential_config_key_id', 'FarmerCredentialUnsupportedDid',
        'config_id', gen_random_uuid()::text,
        'scope', 'mock_identity_vc_unsupported_did',
        'did_url', 'did:playground:unresolvable-issuer',
        'credential_type', 'FarmerCredential,FarmerCredentialUnsupportedDid,VerifiableCredential',
        'display', jsonb_set(source.display, '{0,name}', '"Farmer Credential (unsupported DID scenario)"'),
        'vc_template', encode(convert_to(
            replace(replace(convert_from(decode(source.vc_template, 'base64'), 'UTF8'),
                '"FarmerCredential"', '"FarmerCredential","FarmerCredentialUnsupportedDid"'),
                '${_issuer}', 'did:playground:unresolvable-issuer'), 'UTF8'), 'base64')
    ))).*
FROM certify.credential_config source
WHERE source.credential_config_key_id = 'FarmerCredential'
  AND NOT EXISTS (SELECT 1 FROM certify.credential_config WHERE credential_config_key_id = 'FarmerCredentialUnsupportedDid');
COMMIT;
