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

Final validation is in progress following the move to the standard HTTPS port required by the pinned DID resolver. This section must be updated with the actual run outcome before claiming end-to-end success.

## Compatibility findings

- Verify's pinned request DTO accepts `ldp_vc`, string/pattern filters and text-backed input descriptors; the original seed used incompatible values/types.
- Standard Keycloak access tokens lacked the credential nonce and `client_id` required by Certify/Mimoto. Local protocol mappings supply genuine signed claims; proof verification remains active.
- Mimoto 0.21.0 throws on repeat login with a missing profile picture. The local source fix uses null-safe equality.
- The upstream farmer JSON-LD context file was empty. It is restored from the template's referenced source and validated during preparation.
- The pinned wallet VC verifier does not decode ports in `did:web` host identifiers. Canonical local service identity now uses HTTPS port 443.
- The generic HSM health probe assumes a directly stored symmetric key. The local wallet now checks its actual encryption/decryption service instead.
- Docker Desktop could not bind-mount this workspace; a synchronized Docker runtime volume supplies configuration and persistent mutable wallet keys.

## Boundaries

Only the configured JSON-LD Farmer flow is in scope for this local runtime. SD-JWT and a physical Inji Mobile journey are not validated. Mobile requires reachable HTTPS and device trust. Local Keycloak is not eSignet. Optional MOSIP resident binding/WebSub integration is not provisioned. The agent's in-app browser does not trust the development CA; no browser security warning was bypassed. The user reported reaching the wallet login page in their own browser.

Playground history is in memory and must be exported before server restart. No production deployment, automated test suite, CI pipeline or demo video is claimed.
