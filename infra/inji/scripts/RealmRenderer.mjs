import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { secretsDirectory, playgroundOrigin } from "./Configuration.mjs";

export const mobileClientId = "wallet";
export const mobileRedirectUri = "io.mosip.residentapp.inji://oauthredirect";

export class RealmRenderer {
  constructor(configuration) { this.config = configuration; }
  async render(output) {
    if (this.config.values.INJI_LOCAL_DEVELOPMENT !== "true") return;
    const { origin, values } = this.config;
    const certificate = await readFile(resolve(secretsDirectory, "wallet-certificate.txt"), "utf8");
    const credentialScope = (name) => ({
      name, protocol: "openid-connect",
      attributes: { "include.in.token.scope": "true", "display.on.consent.screen": "true" },
      protocolMappers: [{ name: "credential-nonce", protocol: "openid-connect", protocolMapper: "inji-credential-nonce", config: {} }, { name: "credential-audience", protocol: "openid-connect", protocolMapper: "oidc-audience-mapper", config: { "included.custom.audience": values.AUTHORIZATION_CREDENTIAL_AUDIENCE, "access.token.claim": "true", "id.token.claim": "false" } }],
    });
    // Certify requires the proof JWT issuer to equal the token's client_id claim, so each wallet client asserts its own ID.
    const clientIdMapper = (clientId) => [{ name: "credential-client", protocol: "openid-connect", protocolMapper: "oidc-hardcoded-claim-mapper", config: { "claim.name": "client_id", "claim.value": clientId, "jsonType.label": "String", "access.token.claim": "true", "id.token.claim": "false" } }];
    const realm = {
      realm: "inji", enabled: true, sslRequired: "external", registrationAllowed: true,
      clients: [
        {
          clientId: "inji-wallet", enabled: true, protocol: "openid-connect",
          publicClient: false, clientAuthenticatorType: "client-jwt",
          standardFlowEnabled: true, directAccessGrantsEnabled: false,
          redirectUris: [origin + "/redirect", origin + "/playground/wallet-callback", "io.mosip.residentapp.inji://oauthredirect"],
          attributes: { "jwt.credential.certificate": certificate, "use.jwks.url": "false" },
          defaultClientScopes: ["profile", "email", "basic"],
          optionalClientScopes: ["mock_identity_vc_ldp", "mock_identity_vc_sd_jwt", "mock_identity_vc_expired", "mock_identity_vc_unsupported_did", "mock_identity_vc_mdoc"],
          protocolMappers: clientIdMapper("inji-wallet"),
        },
        {
          clientId: "playground-mock-wallet", enabled: true, protocol: "openid-connect",
          publicClient: true, standardFlowEnabled: true, directAccessGrantsEnabled: false,
          redirectUris: [playgroundOrigin + "/api/v1/mock-wallet/callback"],
          attributes: { "pkce.code.challenge.method": "S256" },
          defaultClientScopes: ["profile", "email", "basic"],
          optionalClientScopes: ["mock_identity_vc_ldp", "mock_identity_vc_sd_jwt", "mock_identity_vc_expired", "mock_identity_vc_unsupported_did", "mock_identity_vc_mdoc"],
          protocolMappers: clientIdMapper("playground-mock-wallet"),
        },
        // Inji Mobile's credential-offer flow uses this fixed public client and app redirect.
        {
          clientId: mobileClientId, enabled: true, protocol: "openid-connect",
          publicClient: true, standardFlowEnabled: true, directAccessGrantsEnabled: false,
          redirectUris: [mobileRedirectUri],
          attributes: { "pkce.code.challenge.method": "S256" },
          defaultClientScopes: ["profile", "email", "basic"],
          optionalClientScopes: ["mock_identity_vc_ldp", "mock_identity_vc_sd_jwt", "mock_identity_vc_expired", "mock_identity_vc_unsupported_did", "mock_identity_vc_mdoc"],
          protocolMappers: clientIdMapper(mobileClientId),
        },
        {
          clientId: "inji-web-login", enabled: true, protocol: "openid-connect",
          publicClient: false, secret: values.GOOGLE_OAUTH_CLIENT_SECRET,
          standardFlowEnabled: true, directAccessGrantsEnabled: false,
          redirectUris: [origin + "/v1/mimoto/oauth2/callback/google"],
          defaultClientScopes: ["profile", "email", "basic", "openid"],
        },
      ],
      clientScopes: [
        { name: "basic", protocol: "openid-connect", protocolMappers: [{ name: "sub", protocol: "openid-connect", protocolMapper: "oidc-sub-mapper", config: { "access.token.claim": "true", "introspection.token.claim": "true" } }] },
        { name: "openid", protocol: "openid-connect", attributes: { "include.in.token.scope": "true" } },
        { name: "email", protocol: "openid-connect", protocolMappers: [{ name: "email", protocol: "openid-connect", protocolMapper: "oidc-usermodel-property-mapper", config: { "user.attribute": "email", "claim.name": "email", "jsonType.label": "String", "access.token.claim": "true", "id.token.claim": "true", "userinfo.token.claim": "true" } }] },
        { name: "profile", protocol: "openid-connect", protocolMappers: [{ name: "full name", protocol: "openid-connect", protocolMapper: "oidc-full-name-mapper", config: { "access.token.claim": "true", "id.token.claim": "true", "userinfo.token.claim": "true" } }] },
        credentialScope("mock_identity_vc_ldp"),
        credentialScope("mock_identity_vc_sd_jwt"),
        credentialScope("mock_identity_vc_expired"),
        credentialScope("mock_identity_vc_unsupported_did"),
        credentialScope("mock_identity_vc_mdoc"),
      ],
      users: [{ id: "2154189532", username: "farmer", enabled: true, emailVerified: true, email: "farmer@example.test", firstName: "Gorge", lastName: "Cooper", credentials: [{ type: "password", value: values.LOCAL_FARMER_PASSWORD, temporary: false }] }],
    };
    await writeFile(resolve(output, "database/04-keycloak.sql"), "CREATE DATABASE keycloak;\n");
    await mkdir(resolve(output, "keycloak"), { recursive: true });
    await writeFile(resolve(output, "keycloak/inji-realm.json"), JSON.stringify(realm, null, 2) + "\n", { mode: 0o600 });
  }
}
