# Work Done by Codex Till Now

Last updated: 26 October 2026, Asia/Kolkata.
Workspace: `/home/sriram-srikanth/Documents/MOSIP-Decode`.

## 1. Current task and state

The latest runtime instructions are in section 9: the user authorized a full Docker reset and direct Compose startup using this checkout’s `.env` and keys. Earlier runtime-volume recovery notes describe the superseded setup.

The user explicitly asked to start Docker, make the Inji stack work, replace nonfunctional integrations and connect the real client/server/wallet/verifier. They chose a **local development setup** without external identity-provider registrations or a public tunnel. This supersedes the earlier instruction to prepare Compose without running it.

The local stack and compatibility work are described in [infra/inji/README.md](infra/inji/README.md). Consult [context/LIVE_VALIDATION.md](context/LIVE_VALIDATION.md) for actual verified outcomes and remaining boundaries. Do not equate a running container, successful compilation or a captured issued credential with a completed wallet-to-verifier journey.

The approved UI remains the React workbench, protocol inspector and run history. Connections was intentionally removed; do not restore it. Service configuration comes from files. Focused server unit tests were added on 27 October 2026 (see section 2.5). No public deployment or demo video has been added.

## 2. User requirements and strict working rules

These requirements came directly from the user's prompts. Preserve them unless the user explicitly changes them.

### 2.1 Scope and priority

- First and foremost, get this working for the **Inji stack**.
- Keep the code open for extension to other stacks, but do not implement or spend effort on other stacks now.
- The original client/server code was boilerplate for a clean structure. Inconsistencies could be resolved during implementation.
- Requirements and architecture were considered decided; the requested phase was implementation, not a fresh redesign.
- The user approved the UI before authorizing implementation.
- The user initially selected configurable endpoints and said they would supply the environment later.
- Later, the user decided service configuration should be managed from the project/Docker side and explicitly requested removal of Connections.

### 2.2 Code design

The user's wording included:

> Follow OOPs principles and design patterns enabling correctness, robustness, flexibility and reusability. Use SOLID principles to ensure we don't write patchy, kludgy code.

Apply this through focused responsibilities, explicit contracts, replaceable dependencies, and constructor injection in backend services. React uses focused functional components and hooks; do not force class components solely to satisfy OOP terminology.

### 2.3 Comments

> Add comments only where necessary and keep the comments clean and professional without adding any unnecessary lines, emojis,etc.

Avoid narration, decorative comments, and obvious restatements of code. Preserve required upstream license notices.

### 2.4 Modularity and directories

> Follow modular architecture formats in the codebase. Do not cram a lot of logic into one file. Ensure the codebase is easily readable and modifiable.

The user's concrete placement rules:

- DAO and DTOs belong in `models`.
- Business processing belongs in `services`.
- Page subcomponents belong in `components`.
- Do not put an entire workflow into a single React component.
- Add files in their appropriate directories.
- Create subdirectories only when needed.
- When a related group grows beyond three files, group it in a feature subdirectory, such as `verification-service`.

These rules informed the run-service, telemetry, proxy-service, workbench, inspector, and infrastructure-script organization. Keep route handlers thin and business rules in services.

### 2.5 Testability and testing stage

> Keep your code design testable so that we can create test cases later. Do not create test cases right now, we will focus on that later.

- Do not add automated test cases until the user changes this restriction.
- On 27 October 2026 the user lifted this restriction. Server unit tests live in `server/tests` (`npm test`, Node test runner through `tsx`, no extra dependencies). Prefer pure logic and stubbed collaborators; tests must not need the running Inji stack.
- Interfaces and dependency injection keep code testable.
- Compilation, lint, browser inspection, syntax checks, schema validation, and temporary configuration-rendering checks were used.
- Do not describe these checks as a completed automated test suite or live integration test.

### 2.6 Environment and deployment

Original instruction:

> Also keep your code deployable i.e. env is clean, .gitignore is proper, dependencies in package.json seem to be good. But do not start working on deployment (i.e. do not create any docker, jenkins artifacts) we will focus on that aspect later.

**Later explicit exception:**

> Just keep the docker-compose file ready for setting inji stack up, don't run it.

Current interpretation:

- Docker Compose and supporting configuration for the local Inji services are authorized and have been prepared.
- The user subsequently explicitly requested that Docker, Inji and the app be started and integrated. Local startup and compatibility fixes are now authorized.
- Do not treat preparation as authorization to provision a public endpoint, run a tunnel, or complete external account onboarding.
- Production deployment, Jenkins and CI/CD remain outside the work done.
- Existing environment files must be preserved.
- On 21 October 2026 the user explicitly chose to commit the root `.env` and `infra/inji/secrets/` to the private repository so teammates can clone and run with shared development secrets. Keep them tracked; do not commit `infra/inji/generated/`, which is machine-specific. They must be removed from history and regenerated before the repository is made public.
- The playground client/server are now containerized for this authorized local setup.

### 2.7 UI/UX

> Use your design mcp servers to generate good, non-cluttered UI which does not dump everything into a single page. Make the UX good and easy to follow.

MagicPath was used for the approved design. Preserve its clear navigation, focused pages, readable spacing, and staged journey.

### 2.8 Later conversational instructions

- The user previously requested control of port 5173. The later request to run the integrated app authorizes its current Docker frontend on that port.
- The user asked a conceptual question about WebSockets and explicitly said not to implement anything based on it. No changes were made for that question.
- The user's question about `infra` was answered conceptually; it was not permission to run infrastructure.
- The earlier handoff was documentation-only. The current task explicitly authorizes running and fixing the local stack.

## 3. Context and architecture

Read `context/PROBLEM_STATEMENT.md`, `context/ARCHITECTURE.md`, `README.md` and `infra/inji/README.md`. The original architecture is a planning document; current source and later user instructions define implemented behavior. Preserve the approved MagicPath design (project `461838934851342336`, component `461839001024868352`, revision `461839001024868353`).

The client is React 19, TypeScript, Vite, Tailwind, React Router, TanStack Query and Zustand. The server is Express 5/TypeScript. Its API is `/api/v1`; WebSocket updates use `/api/v1/events`. WebSockets notify the client to refetch run data; they are not an Inji protocol channel.

Key code:

- `server/models`: DTOs, contracts and bounded in-memory run DAO.
- `server/services/run-service`: issuance coordination, offer validation, verification and sanitized reports.
- `server/services/inji`: real issuer and verifier adapters.
- `server/services/proxy-service`: allowlisted byte-preserving bridge and token/credential correlation.
- `server/services/telemetry`: event recording, redaction and live updates.
- `client/src/components/workbench`: staged wallet handoff and presentation UI.
- `client/src/services/presentation.ts`: display formatting and the pinned Inji Web `/authorize` handoff.
- `infra/inji/scripts`: configuration, assets, SQL and local bootstrap/runtime-volume synchronization.
- `infra/inji/keycloak`: credential nonce provider for local authentication.
- `infra/inji/mimoto`: documented repeat-login null fix and real wallet encryption health indicator.
- `infra/playground`: client/server Docker build and frontend API/WebSocket proxy.

## 4. Local runtime

The working Compose model merges `docker-compose.yml` with `docker-compose.local.yml`. On this Docker Desktop installation host bind mounts did not expose workspace files inside the VM, so `sync-runtime.mjs` uploads configuration to `inji-playground_runtime` and writes `infra/inji/generated/compose.runtime.json`.

```bash
node infra/inji/scripts/prepare.mjs
node infra/inji/scripts/local/sync-runtime.mjs
docker compose -f infra/inji/generated/compose.runtime.json up -d --build --wait --wait-timeout 300
```

For a fresh Linux environment without keys or `.env`, run `node infra/inji/scripts/local/bootstrap.mjs` first. It requires OpenSSL and JDK keytool. Never rerun it by deleting existing credentials. Bootstrap saves generated passwords before creating keys so failures do not orphan keys from their passwords.

- Playground: http://localhost:5173
- Wallet: https://inji.127.0.0.1.sslip.io
- API: http://localhost:8000/api/v1
- Compatibility listener: HTTPS 8443; HTTP gateway 8091.
- Local identity: `farmer`; password is `LOCAL_FARMER_PASSWORD` in root `.env`.
- The upstream Google-labelled wallet login button points to local Keycloak. Persistent wallet creation/unlock uses the user's chosen PIN.

The local CA is `infra/inji/secrets/local-ca.crt`. No host trust settings were changed. Browser certificate acceptance belongs to the user. The user reported seeing the login/guest page in their browser; the agent's separate in-app browser may still not trust the CA.

Secrets, generated files and keystores are ignored. The generated Compose JSON contains resolved secrets and must not be printed/committed. Preserve the database volume, runtime volume (including Mimoto's mutable keystore), Certify key volume and object-data volume together. `sync-runtime` never overwrites an existing runtime secret. Configuration hashes trigger recreation after source changes; Nginx resolves Docker service names periodically to survive recreated containers.

Node 22.22.0 is used in Docker. Host npm installation on the mounted volume hit chmod/copy restrictions, so validate/build through Docker here. Client lint and both TypeScript builds run in the Dockerfile. No automated test cases were added.

## 5. Integration corrections

- Added local Keycloak login and issuer authorization registrations, profile/email/subject/client/audience claims and a nonce mapper. Each credential token receives a fresh nonce in both its signed claims and token response. Proof validation remains enabled.
- Configured shared HTTPS trust in Java and Node, DID endpoints, issuer discovery and local callback URLs.
- Moved canonical HTTPS to port 443 because the pinned VC verifier cannot resolve port-encoded `did:web` identifiers. The old 8443 listener remains available.
- Routed token, credential and presentation protocol traffic through the playground bridge, retaining signed bytes and canonical identities.
- Corrected Certify keystore persistence to its actual mounted path.
- Vendored the MOSIP CBEFF schema for Mimoto startup. Restored the farmer JSON-LD context: the pinned upstream file was empty. Source provenance is in `infra/inji/upstream/NOTICE.md`.
- Corrected Verify's presentation format/filter contract and its text-backed presentation definition column. Added explicit SQL migrations for initialized databases.
- Added a null-safe equality fix to Mimoto's repeat-login metadata update. The exact source change and build method are documented alongside its Dockerfile.
- Replaced the incompatible symmetric-HSM health probe in the local wallet with an actual encryption/decryption round trip, plus database health. Credential checks remain upstream behavior.
- Added the genuine Inji Web presentation handoff, corrected offer URL resolution, and redacted PKCE verifiers/client assertions from protocol reports.

SQL seeds and Keycloak realm imports only initialize empty environments. They do not automatically migrate existing data. Existing local realm registrations were updated without deleting the account or wallet. Existing Certify/Verify SQL changes were applied through migrations. Do not delete volumes to apply new configuration.

## 6. Evidence and boundaries

PASS requires a real valid Verify result, explicit holder confirmation, and a presented credential matching an observed issuance in the selected format. Validity without issuance matching remains INCOMPLETE_EVIDENCE. The inspector decodes payloads for readability; it does not replace cryptographic verification. Run history holds at most 100 runs in memory, with up to 300 events each. Export reports before server restart.

The configured credential is JSON-LD `FarmerCredential` using official synthetic data. Additional SD-JWT credentials require a compatible issuer/wallet/verifier configuration. Physical Inji Mobile needs reachable HTTPS and device trust; loopback is accessible only on this computer. Local Keycloak is a real development authorization service, not eSignet. Optional MOSIP resident binding/WebSub services are outside this standalone farmer environment; the upstream scheduler can log unavailable WebSub. No public tunnel or production infrastructure is provisioned.

Preserve these distinctions in final reports and future handoffs. Read the live validation record before claiming that the complete journey passed.

## 7. Session of 21 October 2026 (Claude Code, Linux workstation)

- Fresh Linux bootstrap; the stack runs on 13 containers in about 2.5 GB of RAM.
- First passing JSON-LD run (Certify → Inji Web → Verify) after migration 003 (Mimoto substring pattern matching).
- SD-JWT added: `FarmerCredentialSdJwt` (migrations 004/005), optional Keycloak scope `mock_identity_vc_sd_jwt`, and per-format presentation definitions (`INJI_PRESENTATION_DEFINITION_IDS`).
- Inji Web / Mimoto 0.21 cannot present SD-JWT (also true in 0.22.0). The user chose a playground mock wallet: `server/services/mock-wallet`, Keycloak public PKCE client `playground-mock-wallet`, and the `client_id` claim moved from credential scopes to each client. SD-JWT passes end to end with it.
- All findings are in `context/LIVE_VALIDATION.md`. The user explicitly authorized committing `.env` and `infra/inji/secrets/` to the private repository (see 2.6).

## 8. Session of 26 October 2026 — review and embedded Mimoto wallet

- The user explicitly chose to integrate the real Inji wallet through Mimoto into the workbench. See [implementation review](context/IMPLEMENTATION_REVIEW.md) for the audit and remaining gaps.
- Added `INJI_MIMOTO`, served at the existing HTTPS origin under `/playground/`: wallet login return, creation/unlock, PKCE issuance, authenticated storage receipt, verifier/credential review and explicit presentation approval. Standalone Inji Web remains an external option. Identity-provider sign-in still redirects normally.
- New backend services are in `server/services/mimoto-wallet`; session models/DAO remain in `server/models`; focused React controls are in `client/src/components/mimoto-wallet`. Mimoto retains wallet keys and persistent storage. Its session cookies and CSRF protections remain enabled.
- Added the workbench callback to realm rendering and the additive `local/update-wallet-client.mjs` migration for existing realms. Login success routes through `/playground/login-return`, returning standalone users to `/user/passcode`.
- Fixed Verify result handling to require the overall presentation result and matching transaction. Reports distinguish user, Mimoto and mock-wallet receipt evidence; manual confirmation cannot advance integrated-wallet runs. Unsupported format/offer guidance is explicit.
- This Docker Desktop context contained the older 17 October volumes, not the separate 21 October Linux environment. Matching `.env` and keys were recovered from `/media/sriram-srikanth/New Volume/Mosip Challenge`. No existing secrets, wallets or volumes were deleted. `INJI_CONFIG_HOME` and sync identity checks now prevent silently mixing these identities. Use that configuration home for this workstation's future prepare/sync calls; current checkout `.env` and secrets were preserved.
- Applied existing migration 003 to the older Verify database after reproducing its anchored-pattern mismatch. The recovered runtime advertises JSON-LD only; do not claim SD-JWT was revalidated here.
- Real API journey `4d19e663-7704-44d8-98f2-046d76153aff` reached PASS through Certify → Mimoto storage/presentation → Verify. Both TypeScript builds and client lint pass. Browser tools were unavailable, so visual/navigation QA remains outstanding. No automated test cases were added.

## 9. Explicit Docker reset and direct Compose setup — 26 October 2026

- The user explicitly requested deleting all previous project containers, volumes and images and starting from scratch with Compose. This supersedes the preservation requirement for that one reset only. Repository `.env` and keys were retained.
- The project containers/network were already absent. Removed the four old named Inji volumes, four identified orphan Inji anonymous volumes, project-built images, Inji service image tags and the base image tags used by this setup. Unrelated calculator resources, RASP/RabbitMQ volumes and Ubuntu were preserved. No global Docker prune was used.
- Direct bind mounts from the current workspace work. Use `node infra/inji/scripts/prepare.mjs`, then `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait --wait-timeout 600`. The old generated runtime Compose file was removed. Do not set `INJI_CONFIG_HOME` to the previous workspace for this new setup.
- Added a one-shot `wallet-keys-init` service and persistent `wallet-keys` volume so Mimoto never mutates the tracked seed keystore. Initialization preserves an existing volume. PostgreSQL health now checks TCP readiness to avoid starting dependents during the temporary seed server.
- Application images were rebuilt with `build --no-cache --pull`; normal restarts do not require an uncached build. Frontend and backend run inside Compose.

- Fresh startup verified: 12 services running, all configured health checks healthy, and the wallet initializer exited successfully. HTTPS workbench, backend health/issuer metadata, Mimoto/Verify health and Keycloak discovery return HTTP 200 with the current checkout CA. Issuer metadata advertises `FarmerCredential` (`ldp_vc`) and `FarmerCredentialSdJwt` (`vc+sd-jwt`). This is startup validation; the earlier full journey evidence belongs to the erased runtime.

## 10. Optional account signup and synthetic issuer records — 26 October 2026

- User authorized optional Step 0 registration/sign-in and per-account synthetic issuer provisioning. Added `AccountStep` before the existing three workbench steps. It uses Mimoto’s authenticated wallet session, skips account setup when signed in, permits deferral, and returns from Keycloak registration/login to the workbench. Passwords remain on Keycloak’s form; wallet PIN setup remains separate.
- Enabled Keycloak self-registration in fresh realm rendering and the additive `local/enable-registration.mjs` upgrade helper. Existing accounts/wallets were preserved; no Docker data reset was performed for this change.
- Added a separate Certify `DataProviderPlugin` in `infra/inji/certify`, selected only in local development. It creates a labelled fictional farmer record on first authorized issuance using Certify’s validated token subject, persists it in PostgreSQL and reuses it on subsequent issuance. It never uses a browser-supplied subject or treats registration profile information as verified farming facts. The original CSV provider remains in the base/non-local setup.
- Migration 006 creates the registry; the local image compiles against the pinned Certify libraries and leaves upstream signing/token/proof checks intact. The generic credential selector and the two existing Farmer formats remain. This adds registration, not new credential domains or multi-user run isolation.
- Frontend lint/TypeScript/Vite and the Java provider build pass. Manual registration through the real Keycloak form, Mimoto wallet creation, Certify issuance/storage and Mimoto presentation reached Verify PASS for run `be7866e6-a8cd-42ba-aaa9-73e586db7736`. Repeat issuance reused one stored issuer record. Browser inventory remains empty, so visual browser QA is unverified. No automated test cases were added.

A second independently self-registered account also completed issuance and Mimoto storage. Docker Desktop then became unavailable (its socket disappeared and local HTTPS refused connections), preventing final disposable-data cleanup. Temporary accounts still requiring cleanup: `signup-demo-6460ba7874`, `signup-demo-b67925d73a`. Their wallets and synthetic issuer rows should be removed only by these exact identities after Docker returns; user-created accounts must be preserved. Do not infer the stack is currently running from the earlier PASS.

## Negative paths and replay — 26 October 2026

The user approved implementation of the proposed negative-path workbench. Added the shared scenario catalog/outcome model, scenario execution service, controlled mock-wallet and correlated JSON-LD bridge mutations, signed expiry/DID fixtures, scenario controls, inspector diffs, linked fresh-issuance replay, history filters, and v2 reports. Credential verdict and scenario outcome are independent. Wallet matching/storage, issuer rejection, request errors and verifier results retain their actual stages.

The local fixture helper is `infra/inji/scripts/local/enable-negative-scenarios.mjs`; migrations 007/008 and RealmRenderer cover fresh installations. Normal JSON-LD scope is optional and explicitly requested; it previously masked another requested credential scope in Certify. No reset or key change was performed. Existing user changes were preserved.

Normal flows and signature/claim/expiry scenarios passed live validation. Mimoto rejected type/format/proof mismatches; the diagnostic mock bypassed matching and Verify accepted those mismatches and a wrong nonce. These remain visible failed scenarios. Signed DID issuance succeeded but Mimoto storage returned a generic HTTP 500, correctly marked inconclusive. QR is a local policy probe. Replay starts a new issuance/request with a parent link, rather than replaying an old token. Detailed outcomes and caveats are in `context/LIVE_VALIDATION.md` and its negative-scenario evidence file.

Server/client builds and client lint passed in Docker (host node_modules had broken compiler links). Browser inventory is empty; no visual browser QA is claimed. No automated tests, CI, external messages, production deployment or commits were added. The local playground containers were rebuilt and are running.

## Follow-up bug review — 26 October 2026

Fixed the actual JSON-LD happy-path descriptor mismatch in the pinned Mimoto implementation, strengthened negative-scenario attribution and independent checks, corrected NOT_APPLICABLE credential-status reporting, surfaced detailed errors in the workbench/inspector, retained non-JSON failure evidence, prevented stale UI status overwrites, and added backend result collection with retry/error persistence and submission-capture ordering. No new test cases or public deployment were added. Current implementation and manual evidence are in the final section of [LIVE_VALIDATION.md](context/LIVE_VALIDATION.md). Normal and bad-signature replay both passed their respective expectations on the final images without client polling. The wrong-nonce upstream acceptance gap remains a visible failed scenario. This work changed the active `Documents/MOSIP-Decode` checkout, not the older mounted-volume copy. Existing uncommitted changes and persistent stack data were preserved.
