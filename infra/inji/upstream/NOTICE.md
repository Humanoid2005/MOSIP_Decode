These assets are from Inji's official local setup, under MPL-2.0 (see LICENSE).

- Certify configuration, SQL, farmer context, synthetic demo CSV and HTML template: https://github.com/inji/inji-certify/tree/e54539a89616f64dc90e8f6797db9e66d826d97d/docker-compose/docker-compose-injistack
- DataShare properties: https://github.com/inji/inji-web/tree/a9f4f829d3070be34ae11649327ea1561e123a2b/docker-compose/config
- Verify configuration contracts: https://github.com/inji/inji-verify/tree/b1271b6208de3ba10fa702e6cef28195447ed803

- MOSIP CBEFF schema: https://github.com/mosip/mosip-config/blob/9f995c06228a1b9b718c00bf54caef5dbd77aacf/mosip-cbeff.xsd

The Certify snapshot contains an empty `context/farmer.json`. That file is populated from https://piyush7034.github.io/my-files/farmer.json, the context URL already referenced by its credential template (retrieved 17 October 2026). Other source snapshots are retained unchanged. The preparation script derives runtime copies, replaces the demonstration tunnel/DID and identity-provider settings, and seeds the playground presentation definition. Upstream demonstration values are not production credentials. No upstream install or destroy scripts are included or executed.
