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

## Boundaries

Only the configured JSON-LD Farmer flow is in scope for this local runtime. SD-JWT and a physical Inji Mobile journey are not validated. Mobile requires reachable HTTPS and device trust. Local Keycloak is not eSignet. Optional MOSIP resident binding/WebSub integration is not provisioned. The agent's in-app browser does not trust the development CA; no browser security warning was bypassed. The user reported reaching the wallet login page in their own browser.

Playground history is in memory and must be exported before server restart. No production deployment, automated test suite, CI pipeline or demo video is claimed.
