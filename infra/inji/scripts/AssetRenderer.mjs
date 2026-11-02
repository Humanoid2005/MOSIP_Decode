import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { root, properties, definitionIds, playgroundOrigin } from "./Configuration.mjs";

const copyFile = async (source, destination) => writeFile(destination, await readFile(source));

// Renders the configuration the Inji services and the playground read: Spring
// properties for Certify, Mimoto and DataShare, Mimoto's issuer and trusted
// verifier lists, Verify's DID settings, public assets, and the env files for
// Compose and the playground server.
export class AssetRenderer {
  constructor(configuration) {
    this.config = configuration;
  }

  // config/ is mounted as the services' Spring configuration directory and
  // public/ is served by the config server and the gateway.
  async render(output) {
    const { origin, issuerDid, verifierDid, localOrigin, values, mobile } =
      this.config;
    const source = resolve(root, "infra/inji/upstream/config");
    const destination = resolve(output, "config");
    const publicPath = resolve(output, "public");
    await mkdir(destination, { recursive: true });
    await mkdir(publicPath, { recursive: true });
    // Overrides per upstream properties file. ${...} placeholders are left for
    // Spring to resolve from the container environment, so no secret is
    // written into the rendered files.
    const replacements = {
      "certify-default.properties": {
        "spring.datasource.password": "${POSTGRES_PASSWORD}",
        "mosip.kernel.keymanager.hsm.config-path": "/home/mosip/CERTIFY_PKCS12/local.p12",
        "mosip.kernel.keymanager.hsm.keystore-pass":
          "${CERTIFY_KEYSTORE_PASSWORD}",
        "mosip.certify.domain.url": origin,
        "mosip.certify.discovery.issuer-id": origin + "/v1/certify",
        "mosip.certify.authorization.url": values.AUTHORIZATION_ISSUER_URL,
        "mosip.certify.authn.issuer-uri": values.AUTHORIZATION_ISSUER_URL,
        "mosip.certify.authn.jwk-set-uri": values.AUTHORIZATION_JWKS_URL,
        // An inline list literal; single quotes inside it are doubled.
        "mosip.certify.authn.allowed-audiences":
          "{ '" +
          values.AUTHORIZATION_CREDENTIAL_AUDIENCE.replaceAll("'", "''") +
          "' }",
        "management.endpoint.env.show-values": "NEVER",
        "management.endpoints.web.exposure.include": "health,info",
        "mosip.certify.vp-request.config-file-url":
          "http://config-server/vp_request_config.json",
      },
      "certify-csvdp-farmer.properties": {
        "mosip.certify.data-provider-plugin.did-url": issuerDid,
        // Selects the synthetic farmer provider (images/certify) instead of the
        // upstream CSV provider.
        ...(values.INJI_LOCAL_DEVELOPMENT === "true" ? {
          "mosip.certify.integration.data-provider-plugin": "PlaygroundSyntheticFarmerProvider",
        } : {}),
      },
      "mimoto-default.properties": {
        "mosip.kernel.xsdstorage-uri": "http://config-server/",
        "mosip.api.public.url": origin,
        "mosipbox.public.url": origin,
        "mosip.esignet.host": values.AUTHORIZATION_ORIGIN,
        "mosip.inji.web.url": origin,
        // Mimoto sends the browser to the workbench's login-return page after
        // a wallet login.
        ...(values.INJI_LOCAL_DEVELOPMENT === "true" ? {
          "mosip.inji.web.authentication.success.redirect.url": origin + "/playground/login-return",
        } : {}),
        "mosip.security.origins": origin,
        keymanager_database_username: "postgres",
        "mosip.kernel.keymanager.hsm.config-path":
          "/home/mosip/certs/oidckeystore.p12",
        "mosip.oidc.p12.path": "/home/mosip/certs/",
        "mosip.data.share.url": origin,
        "mosip.inji.ovp.qrdata.pattern":
          "INJI_OVP://" +
          origin +
          "/v1/mimoto/authorize?response_type=vp_token&resource=%s&presentation_definition=%s",
        "logging.level.org.springframework.http.client": "INFO",
        "spring.jpa.show-sql": "false",
        "management.health.redis.enabled": "false",
        "mosip.iam.adapter.self-token-renewal-enable": "false",
        "logging.level.io.mosip.kernel.auth.defaultadapter": "INFO",
      },
      "mimoto-bootstrap.properties": {
        "spring.cloud.config.uri": "http://config-server/",
        "config.server.file.storage.uri": "http://config-server/",
        "server.forward-headers-strategy": "framework",
      },
      "data-share-inji-default.properties": {
        "object.store.s3.accesskey": "${MINIO_ROOT_USER}",
        "object.store.s3.secretkey": "${MINIO_ROOT_PASSWORD}",
        "mosip.data.share.protocol": "https",
        "logging.level.org.springframework.web": "INFO",
      },
      // DataShare's static policy stores shares unencrypted, which suits only
      // synthetic development credentials.
      "data-share-standalone.properties": {
        "mosip.data.share.static-policy.policy-json": JSON.stringify({
          typeOfShare: "",
          transactionsAllowed: "250",
          shareDomain: new URL(origin).host,
          encryptionType: "NONE",
          source: "",
          validForInMinutes: "30",
        }),
      },
    };
    // Disables Mimoto's HSM health probe, which does not fit the wallet's RSA
    // keys (gap M9; WalletKeyHealthIndicator replaces it), and points Mimoto's
    // Google login registration at local Keycloak, so Inji Web's Google button
    // signs in with a local account.
    if (values.INJI_LOCAL_DEVELOPMENT === "true") {
      const auth = values.AUTHORIZATION_ISSUER_URL + "/protocol/openid-connect";
      Object.assign(replacements["mimoto-default.properties"], {
        "mosip.kernel.keymgr.hsm.health.check.enabled": "false",
        "spring.security.oauth2.client.registration.google.scope": "profile,email",
        "spring.security.oauth2.client.registration.google.client-name": "Local Inji account",
        "spring.security.oauth2.client.provider.google.authorization-uri": auth + "/auth",
        "spring.security.oauth2.client.provider.google.token-uri": auth + "/token",
        "spring.security.oauth2.client.provider.google.user-info-uri": auth + "/userinfo",
        "spring.security.oauth2.client.provider.google.jwk-set-uri": auth + "/certs",
      });
    }
    for (const [file, changes] of Object.entries(replacements)) {
      await writeFile(
        resolve(destination, file),
        properties(await readFile(resolve(source, file), "utf8"), changes),
      );
    }
    await copyFile(
      resolve(source, "farmer_identity_data.csv"),
      resolve(destination, "farmer_identity_data.csv"),
    );
    await copyFile(
      resolve(source, "credential-template.html"),
      resolve(publicPath, "credential-template.html"),
    );
    // The upstream context file is empty (gap C4); the restored copy must
    // define @context before it is published.
    const farmerContext = await readFile(resolve(root, "infra/inji/upstream/context/farmer.json"), "utf8");
    if (!JSON.parse(farmerContext)["@context"]) throw new Error("Farmer JSON-LD context is missing.");
    await writeFile(resolve(publicPath, "farmer.json"), farmerContext);
    await copyFile(resolve(source, "mosip-cbeff.xsd"), resolve(publicPath, "mosip-cbeff.xsd"));
    await copyFile(resolve(root, "infra/inji/config/farmer-logo.svg"), resolve(publicPath, "farmer-logo.svg"));
    // Mimoto's registry entry for the Farmer issuer. Token requests go through
    // Mimoto's get-token endpoint to Keycloak as the configured wallet client.
    const issuer = {
      credential_issuer: "Farmer",
      issuer_id: "Farmer",
      protocol: "OpenId4VCI",
      display: [
        {
          name: values.INJI_LOCAL_DEVELOPMENT === "true" ? "Playground synthetic issuer" : "Agriculture Department",
          title: "Farmer Credential",
          description: "Synthetic farmer credential for local demonstration",
          language: "en",
          logo: { url: origin + "/config/farmer-logo.svg", alt_text: "Local farmer issuer" },
        },
      ],
      client_id: values.WALLET_CLIENT_ID,
      client_alias: values.WALLET_CLIENT_ALIAS,
      redirect_uri: values.WALLET_REDIRECT_URI,
      token_endpoint: origin + "/v1/mimoto/get-token/Farmer",
      authorization_audience: values.AUTHORIZATION_TOKEN_URL,
      proxy_token_endpoint: values.AUTHORIZATION_TOKEN_URL,
      qr_code_type: "EmbeddedVC",
      credential_issuer_host: origin,
      enabled: "true",
      wellknown_endpoint:
        origin + "/v1/certify/issuance/.well-known/openid-credential-issuer",
    };
    // Mimoto trusts Verify's DID only for signed requests whose responses go
    // to Verify's direct-post endpoint.
    const verifiers = {
      verifiers: [
        {
          client_id: verifierDid,
          redirect_uri: [origin],
          response_uris: [origin + "/v1/verify/vp-submission/direct-post"],
          allow_unsigned_request: false,
        },
      ],
    };
    // Written to both folders: the config server serves public/ and the
    // services mount config/.
    for (const [file, value] of Object.entries({
      "mimoto-issuers-config.json": { issuers: [issuer] },
      "mimoto-trusted-verifiers.json": verifiers,
      "vp_request_config.json": {},
    })) {
      const json = JSON.stringify(value, null, 2) + "\n";
      await writeFile(resolve(publicPath, file), json);
      await writeFile(resolve(destination, file), json);
    }
    await copyFile(
      resolve(publicPath, "credential-template.html"),
      resolve(destination, "credential-template.html"),
    );
    // Verify's keystore, and the DID and public key ID it publishes at
    // /v1/verify/did.json.
    await writeFile(
      resolve(destination, "verify.properties"),
      [
        "inji.keystore.file.path=file:/home/mosip/certs/verify-keystore.p12",
        "inji.did.verify.uri=" + verifierDid,
        "inji.did.verify.public.key.uri=" + verifierDid + "#key-0",
        "",
      ].join("\n"),
    );
    // Playground server settings. playground.env is for a server run on the
    // host (npm run dev:server), which reaches the services through the
    // loopback gateway.
    const environment = {
      INJI_CERTIFY_URL: localOrigin + "/v1/certify/issuance",
      INJI_ISSUER_URL: origin,
      INJI_VERIFY_URL: localOrigin + "/v1/verify",
      INJI_MIMOTO_URL: localOrigin + "/v1/mimoto",
      // The public tunnel serves wallet protocols only, so browser wallets are disabled in mobile mode.
      INJI_WEB_URL: mobile ? "" : origin,
      INJI_EMBEDDED_WALLET_URL:
        values.INJI_LOCAL_DEVELOPMENT === "true" && !mobile
          ? origin + "/playground"
          : "",
      INJI_AUTHORIZATION_URL: values.AUTHORIZATION_ISSUER_URL,
      INJI_VERIFIER_CLIENT_ID: verifierDid,
      INJI_PRESENTATION_DEFINITION_IDS: Object.entries(definitionIds)
        .map(([format, id]) => `${format}=${id}`)
        .join(","),
      INJI_STACK_VERSION:
        "certify-0.14.0_mimoto-0.21.0_web-0.16.0_verify-0.17.0",
    };
    await writeFile(
      resolve(output, "playground.env"),
      Object.entries(environment)
        .map(([key, value]) => key + "=" + JSON.stringify(value))
        .join("\n") + "\n",
    );
    // Compose reads the live public origin here so mobile mode never edits .env.
    await writeFile(
      resolve(output, "origin.env"),
      Object.entries({
        KC_HOSTNAME: origin + "/auth",
        INJI_VP_SUBMISSION_BASE_URL: origin + "/v1/verify",
        INJI_VERIFY_REDIRECT_URI: origin,
        MIMOTO_URL: origin + "/v1/mimoto",
      })
        .map(([key, value]) => key + "=" + JSON.stringify(value))
        .join("\n") + "\n",
    );
    // The containerised playground server reaches the services directly on
    // the Compose network.
    await writeFile(
      resolve(output, "playground.docker.env"),
      Object.entries({ ...environment,
        INJI_CERTIFY_URL: "http://certify:8090/v1/certify/issuance",
        INJI_VERIFY_URL: "http://verify-service:8080/v1/verify",
        INJI_MIMOTO_URL: "http://mimoto-service:8099/v1/mimoto",
        INJI_AUTHORIZATION_URL: "http://keycloak:8080/auth/realms/inji",
        HOST: "0.0.0.0", PORT: "8000", CLIENT_ORIGIN: playgroundOrigin,
        PUBLIC_BASE_URL: origin,
      }).map(([key, value]) => key + "=" + JSON.stringify(value)).join("\n") + "\n",
    );
  }
}
