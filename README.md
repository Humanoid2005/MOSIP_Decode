# Inji Interoperability Playground

A React workbench and Express orchestrator for Inji Certify, Inji Mobile / Web, and Inji Verify. This implementation uses configurable real services. It does not simulate credentials or verification outcomes.

## Local development

The local stack includes the client, server, Inji services and Keycloak. Open the playground at http://localhost:5173 and the wallet at https://inji.127.0.0.1.sslip.io. Follow [the local setup guide](infra/inji/README.md) for login, certificates, startup, persistence and supported flows.

For this configured workspace:

```bash
node infra/inji/scripts/prepare.mjs
node infra/inji/scripts/local/sync-runtime.mjs
docker compose -f infra/inji/generated/compose.runtime.json up -d --build --wait --wait-timeout 300
```

For a fresh Linux setup, first run `node infra/inji/scripts/local/bootstrap.mjs`. It preserves an existing root `.env` by refusing to overwrite it. No public account or tunnel is required for the local Inji Web flow.

To run client/server outside Docker, use Node.js 22.19+ in the Node 22 line, install dependencies with `npm ci` in each directory, and run `npm run dev` in both. The server reads the generated endpoints; nonempty `INJI_*` environment settings override them. Set `NODE_EXTRA_CA_CERTS` to the absolute path of `infra/inji/secrets/local-ca.crt` when calling the local HTTPS origin. Configure endpoints through files; Connections remains intentionally removed. The container workflow avoids host filesystem permission problems on mounted Windows volumes.

## Use the workbench

1. Configure Certify's upstream base URL and its canonical issuer identifier. They can differ when a protocol bridge is used, but the canonical identifier must exactly match Certify metadata.
2. Configure Inji Verify's **v1** base URL (usually ending in `/v1/verify`), its client ID, and an existing presentation definition ID. That definition must request the credential and format selected for the run.
3. Discover issuer configurations on the Workbench. JSON-LD (`ldp_vc`) and SD-JWT (`vc+sd-jwt` / `dc+sd-jwt`) options appear only when advertised by Certify. The selected wallet and Verify release must also support the format.
4. Start issuance. Either paste a genuine issuer-provided credential offer or initiate the credential download inside Inji Mobile / Inji Web. Complete authentication in the wallet. No generic Certify offer-creation endpoint is assumed.
5. Confirm receipt after the credential appears in the wallet. This is recorded as **user confirmation**, not as a wallet callback or cryptographic evidence.
6. Request verification. Scan the returned QR code with Inji Mobile, or open the protocol link on a supported wallet device. For the configured Inji Web release, use **Present with Inji Web** to open its `/authorize` flow.
7. Inspect captured exchanges and export the run's JSON report from Run History. Verification status is polled while the run is open on the Workbench. Return there to resume polling after navigating away.

Issuer-led offer creation and onboarding APIs vary by Certify release. The current adapter supports wallet-initiated downloads and externally supplied offers; it does not automatically create an offer through Certify's administrative APIs.

## Protocol visibility

The BFF observes its own metadata / verifier API calls. It also provides a byte-preserving protocol bridge:

| Bridge prefix           | Upstream configuration   | Enabled paths                                                                                   |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `/bridge/certify`       | `INJI_CERTIFY_URL`       | `/.well-known/openid-credential-issuer`, `/credential`, `/nonce`, `/notification`               |
| `/bridge/authorization` | `INJI_AUTHORIZATION_URL` | `/token`, `/oauth/token`, `/protocol/openid-connect/token`, `/.well-known/openid-configuration` |
| `/bridge/verify`        | `INJI_VERIFY_URL`        | `/vp-request/*`, `/vp-response/*`, `/vp-submission/*`, `/presentation-definition/*`             |

Only GET and POST are forwarded. Request/response bodies are bounded at 5 MB. Authentication tokens are redacted from captured structured data. Each recorded payload is limited to 32 KB and marked when truncated; the last 300 events are retained per run. No payload signatures, issuer identifiers, authorization request parameters, callback URLs, or redirect locations are rewritten.

For full visibility, the connected Inji environment must already advertise bridge URLs in its metadata and callback configuration, preserving the canonical issuer and verifier trust identities. `PUBLIC_BASE_URL` displays the expected prefix; setting it alone does **not** reconfigure Inji or create network connectivity. The public URL must be reachable by the wallet. The local Compose gateway wires these routes through the bridge; no tunnel is provisioned.

Use a dedicated development environment with one active run at a time. Token exchanges seen during that issuance session establish token-to-run correlation; `/credential` responses are associated only with a token observed by the bridge. Direct token exchanges, traffic from other wallets, encrypted payloads, and paths outside the allowlist are not fully observable. Mimoto owns the wallet login, encrypted credential storage and presentation flow.

## Outcomes and evidence

Credential validity and interoperability evidence are separate:

- **Pass** requires a valid Inji Verify result, holder confirmation, and a presented credential matching an observed issuance response in the selected format.
- **Valid · incomplete evidence** means Verify accepted the credential but the issuance-to-presentation match was not observed.
- **Invalid / Expired** comes from Verify's per-credential results. Request expiry is an operational error, not an expired credential verdict.
- **Error / Cancelled** never counts as a passing verification. Stopping a local run does not revoke an offer or cancel an upstream presentation request.

JSON-LD comparison uses a deterministic structural fingerprint, not a new cryptographic verification algorithm. SD-JWT comparison uses the issuer-signed JWT so selective disclosure does not break identity matching. The inspector decodes JWTs for readability only. Inji Verify remains responsible for signatures, trust, holder binding and credential validity.

The current v1 adapter expects `requestId`, `transactionId`, and either `requestUri` or `authorizationDetails`, then `vcResults[].verificationStatus` values `SUCCESS`, `INVALID`, or `EXPIRED`. An incompatible response fails explicitly. No claim of complete standards conformance is made from one successful run.

## Code organization

- `server/models`: DTOs, adapter/repository contracts, and the in-memory run DAO.
- `server/services`: workflow services, Inji adapters, HTTP transport, protocol proxy and telemetry, grouped by feature.
- `server/controllers`: HTTP route translation. `server/app.ts` is the composition root; `server/index.ts` starts the listener.
- `client/src/models`: shared DTO type exports. The import from server models is type-only and adds no server runtime code to the browser bundle.
- `client/src/api` and `services`: typed API transport, query hooks, WebSocket lifecycle, formatting and payload inspection.
- `client/src/pages` and `components`: routed views and focused feature components. Zustand holds selection state; TanStack Query owns server data.

Services receive their dependencies through constructors, keeping protocol implementations, storage and transport replaceable. React components remain functional. Feature groups exceeding three files use their own directories. No dependency-injection container or external-stack implementation is needed.

History is intentionally in memory: up to 100 runs per server session. Service endpoints are loaded from project configuration at startup. Export reports before restart. No test cases are included at this stage. Available checks are `npm run build` in both folders and `npm run lint` in `client`. Frontend API mutations do not automatically retry.

## Reference contracts

- [Inji Certify overview and supported capabilities](https://docs.inji.io/inji-certify/overview)
- [Inji Verify cross-device workflow](https://docs.inji.io/inji-verify/functional-overview/workflow/openid4vp-cross-device-flow)
- [Inji Verify integration guide](https://docs.inji.io/inji-verify/technical-overview/integration-guides/openid4vp-vp-verification-integration-guide)
- [Inji Mobile credential-offer release notes](https://docs.inji.io/inji-wallet/inji-mobile/versions/version-0.18.0)

The Verify v1 request/status/result shapes were also checked against the existing SDK 0.16.0 package supplied with the boilerplate. That package bundles React 18 internals, so the React 19 client uses its documented HTTP contracts through a dedicated adapter instead of mounting an incompatible widget.
