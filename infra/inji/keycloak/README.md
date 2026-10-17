# Local credential authorization

This provider targets Keycloak 26.0.8 and the pinned Inji Certify 0.14.0 / Mimoto 0.21.0 combination. It adds a random `c_nonce` to each credential access token and copies the same nonce into the token response. Mimoto signs its credential proof with that nonce; Certify validates the authorization token, audience, client, nonce and holder proof using its normal implementation.

The mapper is attached only to `mock_identity_vc_ldp`, the official farmer credential scope. Ordinary wallet-account login is unaffected. The 300-second nonce lifetime matches the realm's default access-token lifetime. The provider uses Keycloak's protocol mapper SPI, so upgrade and validate it together with Keycloak.

Sources: [Keycloak mapper SPI](https://github.com/keycloak/keycloak/tree/26.0.8/services/src/main/java/org/keycloak/protocol/oidc/mappers), [Certify JWT proof validator](https://github.com/inji/inji-certify/blob/v0.14.0/certify-service/src/main/java/io/mosip/certify/proof/JwtProofValidator.java).

Realm imports initialize empty environments. They do not overwrite an existing realm. Preserve existing users and keys when applying later realm configuration changes.
