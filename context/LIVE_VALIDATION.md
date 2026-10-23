# Local live validation — 17 October 2026

This record describes manual checks against the actual Docker services, not an automated test suite. The user requested a local development setup and did not authorize adding test cases.

## Build and runtime checks

- Client ESLint, client TypeScript/Vite build and server TypeScript build passed in Node 22.22.0 Docker builds.
- The Keycloak nonce provider compiled against Keycloak 26.0.8.
- The Mimoto compatibility source compiled against the exact 0.21.0 image classes/dependencies.
- Issuer discovery, issuer DID, verifier DID, Verify request creation, local OAuth login, wallet creation and wallet unlock were exercised against real services.
- Repeat local login and unlock of the existing wallet succeeded after a container rebuild, exercising persisted encrypted metadata and keys.
- The playground browser displayed its real service configuration and connected WebSocket updates.
- A signed Farmer credential was issued by Certify and captured by the playground bridge. Earlier failed runs remain diagnostic evidence, not passing journeys.

## Full credential journey

**Passed on 21 October 2026** (run `23560c16-c808-48b6-9cb0-c214f6c444e5`, freshly bootstrapped Linux environment) after applying migration 003:

| Issuer | Wallet | Verifier | Format | Proof | Outcome |
| --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Inji Web 0.16.0 / Mimoto 0.21.0 | Inji Verify 0.17.0 | `ldp_vc` FarmerCredential | Ed25519Signature2020 | PASS |

Observed sequence: issuer metadata, Keycloak token (bridge), Certify `/credential` 200 (bridge), holder confirmation, presentation definition, Verify request 201, wallet `vp-request` fetch (bridge), `vp-submission/direct-post` 200 (bridge), Verify result `vpResultStatus: SUCCESS`. The presented credential's fingerprint matched the issuance observed in the same run.

Earlier attempts in the same session failed at presentation: Inji Web reported "No matching credentials found — Missing: type[*]" (see Mimoto pattern finding below), and declining from that dialog triggered the Verify HTTP 500 finding. These remain diagnostic evidence.

## Compatibility findings

- Verify's pinned request DTO accepts `ldp_vc`, string/pattern filters and text-backed input descriptors; the original seed used incompatible values/types.
- Standard Keycloak access tokens lacked the credential nonce and `client_id` required by Certify/Mimoto. Local protocol mappings supply genuine signed claims; proof verification remains active.
- Mimoto 0.21.0 throws on repeat login with a missing profile picture. The local source fix uses null-safe equality.
- The upstream farmer JSON-LD context file was empty. It is restored from the template's referenced source and validated during preparation.
- The pinned wallet VC verifier does not decode ports in `did:web` host identifiers. Canonical local service identity now uses HTTPS port 443.
- The generic HSM health probe assumes a directly stored symmetric key. The local wallet now checks its actual encryption/decryption service instead.
- Docker Desktop could not bind-mount this workspace; a synchronized Docker runtime volume supplies configuration and persistent mutable wallet keys.
- Mimoto 0.21.0 (`CredentialMatchingServiceImpl.matchesFilter`) evaluates a Presentation Exchange `filter.pattern` with `String.contains` instead of as a JSON Schema regular expression. The spec-valid anchored pattern `^FarmerCredential$` therefore never matches, and Inji Web reports "No matching credentials found — Missing: type[*]". The local definition now uses the unanchored pattern `FarmerCredential` (migration 003). Filters using `const` instead of `pattern` are likely unsupported by the same method.
- Inji Verify 0.17.0 returns HTTP 500 when a wallet posts an OpenID4VP error response (`error=access_denied`) to `/vp-submission/direct-post`: it attempts to persist a submission with a null `vp_token` (`vp_submission.vp_token` NOT NULL violation) instead of recording the wallet's error. Observed on 21 October 2026 when declining from the Inji Web "No matching credentials" dialog.
- Mimoto 0.21.0 caches issuer metadata. A credential configuration added to Certify is not offered by Inji Web until Mimoto restarts.
- Mimoto 0.21.0 cannot select SD-JWT credentials against common presentation definitions. `CredentialMatchingServiceImpl.matchesFormat` returns false for any credential other than `ldp_vc` whenever an input descriptor declares `format`, and `getCredentialData` throws `UNSUPPORTED_FORMAT` when constraint fields are evaluated against `vc+sd-jwt`/`dc+sd-jwt`. Only a descriptor with neither format nor fields matches, which also offers every JSON-LD credential.
- Mimoto 0.21.0 cannot present SD-JWT credentials over OpenID4VP. `WalletPresentationServiceImpl.mapStringToFormatType` rejects the selected credential ("Unsupported credential format: vc+sd-jwt. Only ldp_vc format is supported.") and Inji Web receives HTTP 400. The same check exists in Mimoto 0.22.0; SD-JWT presentation code first appears in v1.0.0-alpha.1.

## SD-JWT journey (21 October 2026)

Migrations 004/005 add `FarmerCredentialSdJwt` (`vc+sd-jwt`, ES256, `vct` FarmerCredential, all subject claims selectively disclosable) and SD-JWT presentation definition `…0002`; Keycloak gains optional scope `mock_identity_vc_sd_jwt`.

| Issuer | Wallet | Verifier | Format | Proof | Outcome |
| --- | --- | --- | --- | --- | --- |
| Inji Certify 0.14.0 | Inji Web 0.16.0 / Mimoto 0.21.0 | Inji Verify 0.17.0 | `vc+sd-jwt` FarmerCredentialSdJwt | ES256, `did:jwk` holder binding | FAIL at wallet presentation |
| Inji Certify 0.14.0 | Playground mock wallet (non-Inji) | Inji Verify 0.17.0 | `vc+sd-jwt` FarmerCredentialSdJwt | ES256, `did:jwk` holder binding, ES256 Key Binding JWT | PASS |

With Inji Web, issuance passed: Certify returned a `vc+sd-jwt` credential (ES256 with `x5c` header), its P-256 key appeared in the issuer DID document, and Inji Web stored it. Presentation failed inside Mimoto before any submission reached Verify (see findings above).

The playground mock wallet run (`60818b03-f1f8-4834-8de6-1a88201359a2`) used authorization code + PKCE with the public client `playground-mock-wallet`, an `openid4vci-proof+jwt` proof whose `iss` matched the token's `client_id`, and a fresh P-256 holder key. It fetched Verify's signed request object (`application/oauth-authz-req+jwt`), disclosed all 13 claims, and submitted a Key Binding JWT bound to the verifier DID, request nonce and `sd_hash`. Verify returned `vpResultStatus: SUCCESS`, and the presented issuer-signed JWT matched the issuance observed by the bridge. All wire traffic passed through the bridge. The mock wallet does not authenticate the verifier's request object signature.

Supporting the mock wallet moved the hard-coded `client_id` token claim from the credential scopes to each Keycloak client (`inji-wallet` keeps the same value).

## Boundaries

The JSON-LD Farmer flow is validated end to end with Inji Web. The SD-JWT flow is validated end to end with the playground mock wallet and through issuance only with Inji Web. A physical Inji Mobile journey is not validated. Mobile requires reachable HTTPS and device trust. Local Keycloak is not eSignet. Optional MOSIP resident binding/WebSub integration is not provisioned. The agent's in-app browser does not trust the development CA; no browser security warning was bypassed. The user reported reaching the wallet login page in their own browser.

Playground history is in memory and must be exported before server restart. No production deployment, automated test suite, CI pipeline or demo video is claimed.
