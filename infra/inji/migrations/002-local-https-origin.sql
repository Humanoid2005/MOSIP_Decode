BEGIN;
UPDATE certify.credential_config
SET did_url = replace(did_url, 'inji.127.0.0.1.sslip.io%3A8443', 'inji.127.0.0.1.sslip.io'),
    vc_template = encode(convert_to(replace(convert_from(decode(vc_template, 'base64'), 'UTF8'), 'inji.127.0.0.1.sslip.io:8443', 'inji.127.0.0.1.sslip.io'), 'UTF8'), 'base64'),
    context = replace(context, 'inji.127.0.0.1.sslip.io:8443', 'inji.127.0.0.1.sslip.io'),
    credential_config_key_id = replace(credential_config_key_id, 'inji.127.0.0.1.sslip.io:8443', 'inji.127.0.0.1.sslip.io')
WHERE credential_config_key_id = 'FarmerCredential';
COMMIT;
