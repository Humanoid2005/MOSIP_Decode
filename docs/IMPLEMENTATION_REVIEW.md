# Implementation review — 26 October 2026

This review uses current source, the recorded 17/21 October validation, and a new manual HTTP journey against the local services. It follows `WORK_DONE.md`: Inji first, modular services with constructor injection, no new automated test cases, and no public deployment. The architecture document describes planned features; it is not evidence that those features exist.

## Main finding and implemented correction

The original Inji Web issuance path only discovered issuer metadata and opened the wallet home page. It did not carry the selected credential into Mimoto, establish a wallet session, initiate authorization, or confirm storage. The user had to repeat selection and issuance in another application. Verification request creation already used Inji Verify's API; presentation approval was delegated to Inji Web.

The workbench now offers **Inji wallet · in this page** (`INJI_MIMOTO`). It uses the real Mimoto wallet backend:

1. Open the workbench at the existing HTTPS origin under `/playground/`.
2. Sign in through Mimoto's configured identity provider and return to the workbench.
3. Create or unlock a wallet with its PIN. PINs are cleared from component state on submission and are not written to application storage or telemetry.
4. Authorize the exact credential configuration selected for the run using PKCE. The identity provider remains a separate authorization page.
5. Mimoto exchanges the code, creates the possession proof, downloads from Certify and stores the credential. The run advances only after the authenticated storage API returns its credential ID.
6. Request verification, review the verifier and issued credential, then explicitly approve sharing. Mimoto authenticates the presentation request, matches the stored credential, signs the presentation and submits it to Verify.
7. Require Verify's overall presentation result as well as per-credential results, holder receipt and the observed issuance fingerprint for PASS.

Mimoto's session cookies retain their Secure, HttpOnly and path attributes. The orchestration endpoints live under `/v1/mimoto/playground/`, within the cookie path. They enforce the configured origin and forward CSRF tokens to Mimoto. Issuance state is bound to the Mimoto session and expires after ten minutes; consuming it prevents replay. Wallet actions are serialized per run. The server stores workflow identifiers, not wallet keys or PINs. An active session in another browser cannot complete or present this run.

The standalone Inji Web and mobile handoffs remain separate options. The shared login return route sends standalone Inji Web users back to its existing passcode page. Integrated issuance does not fabricate credential offers or claim to redeem supplied offers.

## Findings by priority

| Priority | Finding | Status / next step |
| --- | --- | --- |
| High | Issuance required manual work in the external Inji Web UI. | Implemented the Mimoto-backed workbench flow described above. |
| High | Verify adapter ignored `vpResultStatus` and result transaction identity. Successful credential checks alone could be reported as valid despite failed presentation checks. | Fixed: require the matching transaction and recognized overall status; overall failure cannot yield VALID. |
| High | Existing Docker volumes could silently be combined with another checkout's `.env` and public certificates. This caused database authentication and keystore failures here. | Added runtime identity checks before configuration upload and `INJI_CONFIG_HOME` support. Recovered this machine's matching previous configuration; no pre-existing keys, wallets or volumes were deleted. |
| High | Mock wallet decodes the signed verifier request without authenticating its signature and follows its `response_uri`; it discloses all claims. | Request signature, configured DID identity, response endpoint and run bindings are now checked by verifyRequest.ts. Full claim disclosure and development-only scope remain. The Mimoto path delegates wallet protocol operations to Inji. |
| Medium | External-wallet issuance correlation is based on a token seen while the single global run is active, plus credential format; it does not prove the selected configuration for arbitrary simultaneous external traffic. | Integrated issuance requests the exact configuration and presents the stored ID returned for that request. External paths still need stronger subject/configuration correlation before claiming multi-user isolation. |
| Medium | UI offered known unsupported combinations without useful guidance. | Integrated Mimoto explicitly supports JSON-LD only. External Inji Web warns that pinned SD-JWT presentation is unsupported; mock wallet remains the SD-JWT alternative. |
| Medium | Supplied offers were accepted for the mock wallet but never redeemed. | Reject offers for authorization-code-only wallet adapters; hide their offer input. |
| Medium | Receipt reports always described user confirmation, including automatic mock-wallet storage. | Reports now distinguish user, Mimoto and mock-wallet receipt sources. Manual receipt cannot advance integrated or mock-wallet runs. |
| Medium | Run history and workflow sessions disappear on backend restart; limits are 100 runs and 300 events/run. | Still intentional in-memory storage. Add durable run/session storage and recovery for longer-lived use. |
| Medium | Verification polling lives in the Workbench component. Leaving that page pauses result collection. | Fixed in the follow-up review: VerificationCoordinator collects results independently of browser navigation, with delayed retries and persisted transient errors. |
| Medium | Wallet rejection reaches a pinned Verify bug (HTTP 500 for a null `vp_token`). | Still upstream. The integrated UI supports stopping the local run before sharing, but does not claim upstream cancellation. |
| Medium | Some protocol evidence is not captured: direct traffic, browser login exchanges and traffic outside the bridge allowlist. | Inspector remains an observation tool, not full conformance certification. |
| Lower | Matrix execution, replay/tampering, broader format/proof coverage and a demo video appear in planning but are absent. | Future work. Other stacks, CI, public deployment and automated test cases remain outside the authorized scope. |

## Validation and boundaries

- Server TypeScript build and client ESLint / TypeScript / Vite build pass in the pinned Node 22 Docker environment.
- A real API journey passed with Certify 0.14.0, Mimoto 0.21.0 and Verify 0.17.0: run `4d19e663-7704-44d8-98f2-046d76153aff`.
- It used local Keycloak sign-in, a dedicated synthetic validation wallet, authorization code + PKCE, Mimoto credential storage, matching, explicit API submission, and Verify's actual result.
- Result: `COMPLETED`, `VALID`, `credentialObserved=true`, `credentialMatched=true`, `holderReceiptSource=MIMOTO`, report `PASS`.
- The first attempt exposed the older database's anchored pattern (`^FarmerCredential$`). Applying the existing migration `003` fixed matching; no volume reset was performed.
- Browser tools reported no available browser. Visual layout, browser navigation and user interaction have **not** been live-validated in this session. Build success and the real API journey do not substitute for that check.
- Physical mobile use and production readiness remain unvalidated. Mimoto's pinned release still cannot present SD-JWT. This recovered runtime currently advertises only JSON-LD; the 21 October SD-JWT evidence belongs to the separately bootstrapped Linux environment.
- Browser certificate acceptance remains the user's action. System trust was not modified. HTTP validation used the matching local CA explicitly.

## Pinned upstream contracts checked

- [Inji Web 0.16 API calls](https://github.com/inji/inji-web/blob/v0.16.0/inji-web/src/utils/api.ts): wallet session, unlock, storage and presentation endpoints.
- [Mimoto 0.21 wallet credential controller](https://github.com/inji/mimoto/blob/v0.21.0/src/main/java/io/mosip/mimoto/controller/WalletCredentialsController.java): authenticated credential storage and returned stored ID.
- [Mimoto 0.21 presentation controller](https://github.com/inji/mimoto/blob/v0.21.0/src/main/java/io/mosip/mimoto/controller/WalletPresentationsController.java): verifier authentication, matching and approved submission.
- [Verify 0.17 result implementation](https://github.com/inji/inji-verify/blob/v0.17.0/verify-service/src/main/java/io/inji/verify/services/impl/VerifiablePresentationSubmissionServiceImpl.java): overall status includes presentation and credential checks.

The final run report is saved at [evidence/mimoto-2026-10-26.json](evidence/mimoto-2026-10-26.json). Its temporary validation wallet was cleaned up after completion; existing wallets were preserved.

## Signup follow-up

Optional Step 0 now exposes local account registration/sign-in and automatically recognizes an existing Mimoto session. Keycloak self-registration is enabled. A local Certify data provider persists fictional issuer records by authenticated subject on first issuance, removing dependence on the seeded farmer ID and fixed CSV. The live registration-to-presentation journey passed; see the latest live-validation section. The credential domain is still Farmer; new domains need their own data/template/verifier configuration. Global run/history state remains a local-workbench limitation and is not made multi-user isolated merely by adding separate wallet accounts.

## Negative-scenario implementation update — 26 October 2026

The earlier note that replay/tampering is absent is superseded. The workbench now supports controlled signature/claim tampering, signed JSON-LD expiry and DID fixtures, request type/format/proof mismatches, mock-wallet wrong nonce, a QR policy probe, linked fresh-issuance replay, and v2 scenario reports. The current validation matrix and actual upstream gaps are recorded in [LIVE_VALIDATION.md](LIVE_VALIDATION.md) and [scenario evidence](evidence/negative-scenarios-2026-10-26.json). CI/matrix automation and automated test cases remain absent.
