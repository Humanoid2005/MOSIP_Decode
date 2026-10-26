# Local Inji stack

The local development setup runs the playground client/server, Inji Certify, Mimoto, Inji Web, Inji Verify and a local Keycloak authorization server. Docker keeps databases, wallet encryption keys and object storage in persistent volumes. No public domain, Google account or eSignet registration is required for this local setup.

## Open the applications

- Integrated workbench: https://inji.127.0.0.1.sslip.io/playground/
- Localhost entry: http://localhost:5173
- Inji Web: https://inji.127.0.0.1.sslip.io
- Playground API: http://localhost:8000/api/v1

The hostname resolves to this computer. The local CA is `infra/inji/secrets/local-ca.crt`; trust that certificate in your browser if needed. If the wallet login/guest page already appears, there is no warning to accept there. Host trust settings are not modified by the setup scripts.

The Inji Web image retains its upstream Google login label. In this local configuration that button opens **local Keycloak**, not Google. Use the optional **Step 0 · Create account / Sign in** in the workbench. On Keycloak’s sign-in page, choose **Register** to create your own account. Already authenticated users skip this step automatically; other users can defer it until issuance. The seeded `farmer` account remains optional, with its password in `LOCAL_FARMER_PASSWORD` in the root `.env`. Create a wallet and remember its separate PIN. Guest mode does not provide the persistent wallet needed for the stored-credential presentation journey.

## Start or rebuild this configured workspace

Run from the repository root with Docker running and Node 22.19+ installed:

```bash
unset INJI_CONFIG_HOME
node infra/inji/scripts/prepare.mjs
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait --wait-timeout 600
```

This directly starts the frontend, backend and Inji services from the source Compose files. The generated runtime Compose JSON and `sync-runtime.mjs` are not required for this workspace. `prepare` renders local properties, issuer metadata, trust lists, realm import and SQL using this checkout's `.env` and keys. A fresh database and realm receive all seeds and the embedded-wallet callback automatically.

The `wallet-keys-init` service runs once before Mimoto and copies the seed keystore into the `wallet-keys` volume only if absent. Mimoto can update that copy without modifying the repository's tracked keystore. An exited initializer with code 0 is expected. Preserve `wallet-keys` together with `postgres-data`.

For a completely uncached application build, use:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml build --no-cache --pull
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --wait --wait-timeout 600
```

For status, logs, and shutdown:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml ps -a
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f playground-client playground-server
docker compose -f docker-compose.yml -f docker-compose.local.yml stop
```

After changing rendered configuration, run `prepare.mjs` again and restart the affected Java services. Rebuild the client/server when their source changes.

On a fresh Linux workspace without `.env`, first run:

```bash
node infra/inji/scripts/local/bootstrap.mjs
```

Bootstrap requires Node.js, OpenSSL and JDK `keytool`; it uses `/etc/ssl/certs/java/cacerts` as the Java truststore baseline. It generates unique passwords, TLS certificates, signing keys and local realm settings. It refuses to replace an existing `.env`. Preserve the `.env`, secrets and Docker volumes together. For client/server development outside Docker, use Node 22.19+ in the Node 22 line. Container builds use Node 22.22.0 and run both TypeScript builds plus frontend lint; no automated test cases were added.

Do not print or commit the rendered Compose JSON: it contains resolved secrets. Generated files are ignored. The development secrets are intentionally tracked in the private repository, as recorded in `WORK_DONE.md`. Use `docker compose -f docker-compose.yml -f docker-compose.local.yml config --quiet` for validation.

## Upgrade an existing local installation for signup

Fresh databases automatically receive the synthetic issuer registry and registration-enabled realm. For an existing installation, with PostgreSQL and Keycloak running:

```bash
node infra/inji/scripts/prepare.mjs
node infra/inji/scripts/local/enable-registration.mjs
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build --wait --wait-timeout 600
docker compose -f docker-compose.yml -f docker-compose.local.yml restart mimoto-service
```

The migration enables registration and adds the registry table without deleting accounts, wallets or issuer records. The local [synthetic data provider](certify/README.md) links a persistent fictional record to the authenticated subject on first issuance. Claims are explicitly labelled synthetic and do not establish real farming eligibility. Registration does not itself issue a credential. The CSV provider remains available in the non-local base configuration.

## Run a credential journey

1. Open the HTTPS workbench and select **Inji wallet · in this page** and **FarmerCredential**.
2. Start issuance. Sign in through local Keycloak when prompted; return to the workbench and unlock your wallet, or create one.
3. Select **Authorize and receive credential**. After identity authorization, Mimoto downloads and stores the credential and the workbench advances automatically.
4. Request verification, review the matching credential and verifier, then choose **Approve and share credential**.
5. Read the real Verify decision, inspect exchanges and export the report.

For an already initialized Keycloak realm, register the added callback once after startup:

```bash
node infra/inji/scripts/local/update-wallet-client.mjs
```

The external **Inji Web** option retains the earlier handoff and manual receipt confirmation. The integrated option confirms receipt from Mimoto's authenticated storage response. Both require a valid Verify result and an issuance fingerprint match for PASS. Stopping a local run does not cancel a request already created in Verify.

### Legacy runtime-volume installations

The earlier setup used `sync-runtime.mjs` for Docker Desktop installations without working bind mounts. If preserving one of those installations, select its matching `.env` and secrets through `INJI_CONFIG_HOME` before preparation and synchronization. Do not mix an existing database/keystore with a different identity. The legacy script checks certificates and preserves existing runtime secrets.

The user explicitly requested a full Docker reset on 26 October. The old project volumes were removed, so this workstation now uses the **current checkout's** `.env` and `infra/inji/secrets/`. The previous workspace and its `INJI_CONFIG_HOME` override are no longer used. This reset was explicit authorization for deleting the old local data, not a routine migration instruction.

## Components and persistence

| Component | Version / role |
| --- | --- |
| Certify | `injistack/inji-certify-with-plugins:0.14.0`; local persistent synthetic farmer provider |
| Mimoto | `injistack/mimoto:0.21.0` with the documented [repeat-login fix](mimoto/README.md) |
| Inji Web | `injistack/inji-web:0.16.0` |
| Verify | `injistack/inji-verify-service:0.17.0` |
| Local authorization | Keycloak 26.0.8 with [credential nonce mapper](keycloak/README.md) |
| Database | PostgreSQL 15.10; separate service databases |
| Object storage | MinIO `2022.2.7-debian-10-r0` and DataShare `1.3.0-beta.2` |
| Gateway / static configuration | Nginx 1.26.3 |
| Playground | Node 22.22.0 backend and Nginx frontend |

Host ports bind only to loopback: 443, 5173, 8000, 8091 and 8443. The databases and object storage are internal. Certify keys use `certify-keys`; Mimoto's mutable keystore uses `wallet-keys` and must be backed up with `postgres-data`. Object storage uses `object-data`. Playground run history remains in memory; export reports before restarting its server.

Stopping with `docker compose -f docker-compose.yml -f docker-compose.local.yml stop` preserves data. Do not delete volumes to apply configuration changes. SQL initialization runs only on an empty PostgreSQL volume, and realm import skips existing realms. Existing database changes require explicit migrations; `migrations/001-verify-definition.sql` fixes the pinned Verify schema and farmer definition without resetting data; `003-unanchored-type-pattern.sql` adapts the type filter to Mimoto 0.21.0 substring matching; `004-farmer-sd-jwt-certify.sql` (inji_certify) and `005-farmer-sd-jwt-verify.sql` (inji_verify) add the SD-JWT credential and its presentation definition.

## Scope and limitations

The configured journey is the JSON-LD Farmer credential using Inji Web. The repository includes SD-JWT issuer/Verify migrations, but Mimoto 0.21 cannot present SD-JWT. Use the separate mock wallet for that format once those migrations and Keycloak scopes are configured. Inji Mobile is not a container, and a physical phone cannot reach this loopback hostname; mobile use needs a reachable HTTPS deployment and device trust. No tunnel is created.

Local Keycloak supplies real OAuth/OIDC authentication and credential-bound nonces. It is not an eSignet deployment. MOSIP resident wallet binding and WebSub integrations are outside this standalone farmer setup; the upstream Mimoto scheduler can log an unavailable WebSub endpoint. DataShare uses the official local `encryptionType=NONE` policy, so this environment is for synthetic development credentials.

The base `docker-compose.yml` remains available for a separately onboarded external authorization provider. The working local setup additionally requires `docker-compose.local.yml`, passed explicitly with the second `-f` option. Do not run only the base file expecting the local authorization service or playground containers.

## Sources

Pinned upstream assets and licenses are listed in [upstream/NOTICE.md](upstream/NOTICE.md). Local compatibility changes are explained alongside their Dockerfiles. The live validation record is in [context/LIVE_VALIDATION.md](../../context/LIVE_VALIDATION.md).

## Local negative-scenario fixtures

The local renderer includes migrations 007 (signed expired JSON-LD) and 008 (signed, unresolvable DID), plus corresponding optional Keycloak scopes. Existing installations can run `node infra/inji/scripts/local/enable-negative-scenarios.mjs` without a database reset, then restart Certify and Mimoto to clear metadata caches. Rebuild the playground services after updating source.

The helper restricts itself to `INJI_LOCAL_DEVELOPMENT=true`. It leaves the normal issuer configurations and keys unchanged. Fixture IDs are hidden from the workbench's normal credential selector and selected through the scenario controls. Certify requires millisecond precision in its JSON-LD timestamp template. Normal JSON-LD scope is optional, rather than automatically attached to every token, because Certify can stop on an unrelated credential scope before checking the requested fixture scope.
