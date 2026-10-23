BEGIN;
-- SD-JWT variant of the farmer credential, signed with the existing ES256 (P-256) key.
-- Copies the issuer DID, display and data-provider settings from the JSON-LD configuration.
INSERT INTO certify.credential_config (
    credential_config_key_id, config_id, status, vc_template, sd_jwt_vct, credential_format,
    did_url, key_manager_app_id, key_manager_ref_id, signature_algo, sd_claim, display,
    display_order, scope, cryptographic_binding_methods_supported,
    credential_signing_alg_values_supported, proof_types_supported, plugin_configurations, cr_dtimes
)
SELECT
    'FarmerCredentialSdJwt', gen_random_uuid()::VARCHAR(255), 'active',
    'ewogICJmdWxsTmFtZSI6ICIke2Z1bGxOYW1lfSIsCiAgIm1vYmlsZU51bWJlciI6ICIke21vYmlsZU51bWJlcn0iLAogICJkYXRlT2ZCaXJ0aCI6ICIke2RhdGVPZkJpcnRofSIsCiAgImdlbmRlciI6ICIke2dlbmRlcn0iLAogICJzdGF0ZSI6ICIke3N0YXRlfSIsCiAgImRpc3RyaWN0IjogIiR7ZGlzdHJpY3R9IiwKICAidmlsbGFnZU9yVG93biI6ICIke3ZpbGxhZ2VPclRvd259IiwKICAicG9zdGFsQ29kZSI6ICIke3Bvc3RhbENvZGV9IiwKICAibGFuZEFyZWEiOiAiJHtsYW5kQXJlYX0iLAogICJsYW5kT3duZXJzaGlwVHlwZSI6ICIke2xhbmRPd25lcnNoaXBUeXBlfSIsCiAgInByaW1hcnlDcm9wVHlwZSI6ICIke3ByaW1hcnlDcm9wVHlwZX0iLAogICJzZWNvbmRhcnlDcm9wVHlwZSI6ICIke3NlY29uZGFyeUNyb3BUeXBlfSIsCiAgImZhcm1lcklEIjogIiR7ZmFybWVySUR9IiwKICAiZmFjZSI6ICIke2ZhY2V9Igp9Cg==',
    'FarmerCredential', 'vc+sd-jwt', did_url, 'CERTIFY_VC_SIGN_EC_R1', 'EC_SECP256R1_SIGN', 'ES256',
    '$.fullName,$.mobileNumber,$.dateOfBirth,$.gender,$.state,$.district,$.villageOrTown,$.postalCode,$.landArea,$.landOwnershipType,$.primaryCropType,$.secondaryCropType,$.farmerID',
    jsonb_set(display, '{0,name}', '"Farmer Credential (SD-JWT)"'),
    display_order, 'mock_identity_vc_sd_jwt', ARRAY['did:jwk'], ARRAY['ES256'],
    proof_types_supported, plugin_configurations, NOW()
FROM certify.credential_config
WHERE credential_config_key_id = 'FarmerCredential'
  AND NOT EXISTS (SELECT 1 FROM certify.credential_config WHERE credential_config_key_id = 'FarmerCredentialSdJwt');
COMMIT;
