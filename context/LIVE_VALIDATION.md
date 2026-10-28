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

## Embedded Mimoto API journey — 26 October 2026

The user requested the real wallet flow within the workbench. A new `INJI_MIMOTO` run used Mimoto's wallet APIs, retaining its session cookies, CSRF, key management, persistent storage and OpenID4VP implementation.

Manual HTTP validation passed for run `4d19e663-7704-44d8-98f2-046d76153aff`: Keycloak login → dedicated synthetic wallet creation/unlock → PKCE authorization → Mimoto credential storage (HTTP 200 with stored credential ID) → automatic holder receipt → Verify request → Mimoto verifier authentication and credential matching → approved Mimoto presentation submission → Verify `vpResultStatus=SUCCESS`. The run was `COMPLETED`, `VALID`, with observed issuance and a matching fingerprint; report outcome was `PASS` and receipt source `MIMOTO`.

The first run (`7e2f9996-9f8f-4a48-b026-0d8b0c5799fe`) stopped at matching because this older database still contained `^FarmerCredential$`. Existing migration 003 was applied and a fresh run passed. No data reset was used.

This machine's Docker Desktop volumes required the previous workspace's matching configuration, selected with `INJI_CONFIG_HOME=/media/sriram-srikanth/New Volume/Mosip Challenge`. The checkout's shared `.env` and keys were not overwritten. Its existing runtime now has an additive workbench OAuth callback registration. The recovered environment currently advertises JSON-LD only.

Server build, client lint and client build pass. Browser inventory was empty and creating an in-app browser returned `Browser is not available`; UI rendering and interactive browser navigation have not been checked. The API journey is genuine integration evidence, not browser acceptance or an automated test suite. Host trust settings were not changed.

The final deployed images were validated again with the passing run above. The sanitized [exported report](evidence/mimoto-2026-10-26.json) preserves the evidence across server restarts. The dedicated temporary validation wallet was then removed; pre-existing wallets were preserved. Workbench routes and JS/CSS assets returned HTTP 200; missing-origin and missing-CSRF requests to the orchestration endpoint were rejected with HTTP 403.

## Fresh direct Compose startup — 26 October 2026

Following explicit user authorization, the old project Docker data and images were removed and application images rebuilt with `--no-cache --pull`. The new runtime uses this checkout's `.env` and keys, direct source Compose files, and a dedicated persistent Mimoto `wallet-keys` volume. The earlier runtime-volume and external configuration-home recovery notes are historical.

Verified 12 running services, all configured health checks healthy, and successful completion of `wallet-keys-init`. The HTTPS workbench, API health and issuer metadata, Mimoto and Verify health, and Keycloak discovery returned HTTP 200 using the checkout CA. Fresh issuer metadata advertises both `FarmerCredential` (`ldp_vc`) and `FarmerCredentialSdJwt` (`vc+sd-jwt`). No complete credential journey was repeated after this reset; the preceding report remains evidence from the previous runtime. Mimoto's SD-JWT presentation limitation still applies.

## Self-registration and synthetic registry — 26 October 2026

A disposable account was created through Keycloak’s actual registration form (no admin-created account or seeded farmer login). Registration returned to `/playground/login-return`; authenticated Mimoto wallet creation/unlock succeeded. First issuance provisioned a persistent record named `Synthetic Demo Farmer …` with a `DEMO-…` farmer ID.

Run `be7866e6-a8cd-42ba-aaa9-73e586db7736` completed with `VALID`, observed issuance, matched credential, `holderReceiptSource=MIMOTO` and report outcome `PASS`. The new credential travelled through Certify → Mimoto storage → approved Mimoto presentation → Inji Verify. See [sanitized evidence](evidence/signup-2026-10-26.json). Repeat issuance for the same account succeeded and left exactly one registry row.

Client ESLint, TypeScript and Vite build and the Java provider build passed. HTTP validation used the checkout CA. Browser inventory was empty; this validates the actual registration/protocol APIs and served application build, not visual interaction.

A second independently self-registered account also completed issuance and Mimoto storage. Docker Desktop then became unavailable (its socket disappeared and local HTTPS refused connections), preventing final disposable-data cleanup. Temporary accounts still requiring cleanup: `signup-demo-6460ba7874`, `signup-demo-b67925d73a`. Their wallets and synthetic issuer rows should be removed only by these exact identities after Docker returns; user-created accounts must be preserved. Do not infer the stack is currently running from the earlier PASS.

## Negative scenarios — 26 October 2026

Implemented and exercised the scenario controls against the current direct Compose runtime (Certify 0.14.0, Mimoto 0.21.0, Verify 0.17.0). These are manual real HTTP journeys using the existing synthetic demo account. See [scenario evidence](evidence/negative-scenarios-2026-10-26.json) for run IDs, expected outcomes, mutation details and actual responses.

| Scenario | Embedded Mimoto / JSON-LD | Mock wallet / SD-JWT |
| --- | --- | --- |
| Normal | VALID; full end-to-end PASS | VALID; full end-to-end PASS |
| Bad signature | INVALID; scenario PASS | INVALID; scenario PASS |
| Modified claim | INVALID; scenario PASS | INVALID; scenario PASS |
| Expired credential | EXPIRED; scenario PASS; presented fingerprint matches the signed expired fixture | Unavailable; JSON-LD fixture only |
| Wrong credential type | Wallet matching rejection; scenario PASS | VALID; scenario FAIL (unexpected acceptance) |
| Format mismatch | Wallet matching rejection; scenario PASS | VALID; scenario FAIL (unexpected acceptance) |
| Proof mismatch | Wallet matching rejection; scenario PASS | VALID; scenario FAIL (unexpected acceptance) |
| Unsupported DID | Certify issued a signed fixture; Mimoto storage returned HTTP 500 / internal_server_error; scenario INCONCLUSIVE | Unavailable; JSON-LD fixture only |
| Wrong nonce | Unavailable; wallet controls its binding | VALID; scenario FAIL (unexpected acceptance) |
| QR limit | 2202-byte local sample selected link fallback; policy scenario PASS | Same policy result |

The mock intentionally submits the held SD-JWT despite incompatible request constraints. Its unexpected acceptances are observed behavior of this pinned stack, not a complete conformance/security assessment. Generic INVALID responses do not identify the precise failing cryptographic check. The unsupported-DID fixture sets both issuer and proof verificationMethod before signing; the generic wallet error does not prove a specific resolver rejection. QR results concern the workbench's 2000-byte policy, not physical scanner limits.

Linked replay was verified from normal mock run `6b4c6751-eab3-486b-9885-db646b999747` to bad-signature run `d352e7b6-3a90-40cd-a3de-574bf4cb1d62`: new issuance and request, original parent retained, final INVALID with scenario PASS. Replay does not resend an old VP.

During repeated issuance, an intermittent remote W3C JSON-LD context fetch failed inside Certify; the playground recorded an issuance error rather than a negative-scenario pass. Fresh normal JSON-LD and QR journeys subsequently passed. Existing credentials/keys were preserved; fixture configurations and optional scopes were added. The normal credential scope is now explicitly requested to avoid Certify stopping at an unrelated default scope.

Server TypeScript build, client ESLint/TypeScript/Vite build, infrastructure syntax/rendering checks passed. Browser inventory was empty, so visual browser acceptance remains unverified. No automated test suite was added. The final playground images are running locally; history remains in memory.

## Happy path, negative paths and error-display review — 26 October 2026

The running Compose project is `/home/sriram-srikanth/Documents/MOSIP-Decode`; the older `Mosip Challenge` directory is not its source. This review preserved the existing uncommitted work, keys, database, accounts and wallet volumes. Completed in-memory reports were saved before app restarts. No automated test cases were added.

### Corrections

- Mimoto 0.21.0 used its storage UUID for `descriptor_map.id`. The local pinned-source correction now passes the authenticated input descriptor ID into OpenID4VP construction. It supports exactly one descriptor/credential and rejects ambiguous mappings before signing. The actual holder signature remains produced by Mimoto. See `infra/inji/mimoto/README.md`.
- Negative signature/expiry outcomes require correlated results and intact request bindings. Unrelated failed protocol checks cannot be hidden by a generic INVALID result. `rejectionReasonConfirmed` now agrees with the scenario assessment.
- Empty credential-status checks are NOT_APPLICABLE, rather than claiming revocation was checked. Missing status evidence still cannot produce a normal pass.
- The inspector now displays the saved run error and detailed verification failures, defaults to a failed exchange or latest result, and describes scenario mutations accurately. Failed/missing checks remain visible; other checks are collapsed. HTTP success remains distinct from acceptance.
- Non-JSON bridge error responses are retained within the existing bounded telemetry limits; structured upstream error codes/messages reach the run/UI. Malformed API errors no longer cause client TypeErrors. Wallet connection failures no longer all appear as PIN/unlock problems.
- VerificationCoordinator polls on the backend, with delayed retries for transient failures. Errors persist on the run and clear after recovery. Submission evidence is captured before forwarding so result polling cannot outrun it; late response events remain observable. The UI no longer overwrites fresh run state with a cached status-query snapshot.

### Manual validation

The final image completed normal run `5af34750-c9a8-4cde-b63f-a1d561b409a0` with VALID/PASS and matching issuance, descriptor and presentation evidence. Linked fresh-issuance replay `e7e147ed-5c78-4b58-918b-0e4888b27760` corrupted only the presentation signature: Inji returned INVALID with `ERR_SIGNATURE_VERIFICATION_FAILED` on holder proof, the unchanged credential matched, other bindings passed, and the negative scenario passed with `rejectionReasonConfirmed=true`. Both completed without any client `/refresh` calls, proving unattended backend collection.

The preceding manual review also exercised JSON-LD modified claim, signed expiry, type/format/proof mismatch matching rejection, and SD-JWT normal/bad-signature flows. These produced the expected outcomes. The ten captured reports were re-evaluated with the final outcome rules; classifications remained correct. See [scenario summary](evidence/review-scenarios-2026-10-26.json), [final happy-path report](evidence/review-happy-path-2026-10-26.json) and [final bad-signature report](evidence/review-bad-signature-2026-10-26.json).

Server TypeScript, client ESLint/TypeScript/Vite and the pinned Java wallet build passed. Compose service health passed. Browser inspection at localhost verified history and the revised result UI. Real wallet operations were exercised through authenticated HTTP with the local CA; this does not claim a complete interactive HTTPS browser login journey or physical mobile coverage.

### Remaining boundaries

Pinned Inji Verify still accepts the diagnostic SD-JWT wrong-nonce submission (run `7640db4e-5966-4990-83a3-0703315c5cb5`). The playground's independent nonce check fails and the report is FAIL / Unexpected acceptance. Existing upstream format/type/proof acceptance gaps with the diagnostic holder are not reclassified as passes. The unsupported-DID fixture's generic wallet error remains inconclusive unless a precise rejection reason is observed. Earlier intermittent issuer HTTP 400 failures did not recur after the wallet rebuild; no definitive root cause is claimed for them. History remains in memory and the single active run is global to this local development workbench.

## Inji Mobile mode — 28 October 2026

Validated on macOS (Apple silicon) with Colima 6 CPU / 12 GiB, a freshly created stack, Certify 0.14.0, Mimoto 0.21.0 and Verify 0.17.0, and five real Cloudflare quick tunnels. The Inji Mobile 0.22.1 behaviour reproduced by the simulator was taken from the wallet, `inji-vci-client` 0.7.0 and `inji-openid4vp` 0.7.0 sources; Certify's proof validator at v0.14.0 accepts the wallet's proof without `iss`.

| Check | Result |
| --- | --- |
| Baseline stack before changes | All services healthy; Certify advertises one authorization server (the Keycloak realm) |
| `mobile.mjs start`, first tunnel | 8/8 readiness checks over the public URL after one fix (below); about one minute |
| Rehearsal, SD-JWT (`c2cd5bf1`) | Offer scanned, Keycloak sign-in with client `wallet`, credential through the bridge, did:web-authenticated request, Verify VALID, outcome PASS |
| Rehearsal, JSON-LD (`699ab96f`) | Credential issued (context fetched back through the tunnel) and correlated; verifier request authenticated |
| `start` again on the same tunnel | Idempotent, 8/8 checks |
| `stop` | Issuer, authorization server, verifier DID, database DIDs, embedded wallet and Inji Web restored; tunnel removed |
| Rehearsal on the restored local origin (`a4f6cb60`) | VALID / PASS |
| `start` on a new tunnel | Identity moved from the local origin to the new URL; 8/8 checks; SD-JWT `7222d585` PASS; JSON-LD `42d3751f` issued and request authenticated |
| Tunnel dropped by Cloudflare after about seven hours | `status` reports the unreachable URL; `start` recreated the tunnel and moved the identity to the new URL in about a minute; 8/8 checks; SD-JWT `717c886b` PASS; JSON-LD `76c77e14` issued and request authenticated; `start` again kept the same tunnel and URL |
| `start` with Keycloak stopped; `start --origin https://x.example/` | Both refused before writing any state or starting a tunnel |
| `stop` interrupted after its first step (state file removed by hand) | `status` reported the unfinished stop and the tunnel origin still applied; `stop` again moved Certify and every realm redirect back to the local origin |
| Public listener probed with `;` path parameters, `..;/` and bare `/v1/mimoto/actuator` | Mimoto answered its own 401 (and the actuator index 200) before the fix; every probe now returns 404 from nginx, wallet paths unchanged |
| Final round on the finished code | 8/8 checks; SD-JWT `2fd6b5f8` PASS; JSON-LD `206d749f` issued and request authenticated; local mock-wallet runs: normal `18de3481` PASS, bad signature `e5096e25` PASS, wrong nonce `c996928c` FAIL (pinned Verify accepts it, as recorded above) |
| Workbench through Playwright (`7704c19b`) | Offer QR, verifier QR, PASS result and inspector captured in `context/screenshots/`; report in [evidence](evidence/mobile-sd-jwt-2026-10-28.json) |

Found and fixed during validation:

- The `wallet` client registered in an existing realm lacked the realm's `basic` scope, so tokens had no `sub` and Certify returned `invalid_token` ("The sub claim is not valid"). Mobile mode now assigns default and credential scopes on every start.
- The public listener answered `POST /v1/verify/vp-request` with a 301 to a bridged path. Both forms of the request-creation path now return 404.
- Moving the configuration back to an earlier origin silently kept the newer one; rebasing now starts from the current origin. Covered by a unit test.
- After the tunnel dropped, `start` reused the dead URL from the old tunnel log and `status` printed eight fetch failures. `start` now keeps only a URL that answers and otherwise recreates the tunnel; `status` explains the drop.
- A `start` or `stop` that failed partway could not be repaired by rerunning it, because the next run took its starting origin from the state file. Switching now starts from the origin last applied to Certify and the realm, both commands wait for a healthy database and Keycloak, and `--origin` is validated before anything is written. A new readiness check reads the DID Certify signs with from its database.
- Mimoto was published although a stock Inji Mobile reads its settings and trusted verifiers from the backend built into the app. It is now local only; the app instead asks the user once to trust the issuer and the verifier, which the workbench and README now say.

Not yet validated: a scan with a physical Android phone running Inji Mobile 0.22.x, JSON-LD presentation from the app, and iOS. The rehearsal reproduces the documented wallet requests; it cannot prove app UI behaviour or on-device credential verification.
