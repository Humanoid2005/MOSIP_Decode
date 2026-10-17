# Local Inji stack

The local development setup runs the playground client/server, Inji Certify, Mimoto, Inji Web, Inji Verify and a local Keycloak authorization server. Docker keeps databases, wallet encryption keys and object storage in persistent volumes. No public domain, Google account or eSignet registration is required for this local setup.

## Open the applications

- Playground: http://localhost:5173
- Inji Web: https://inji.127.0.0.1.sslip.io
- Playground API: http://localhost:8000/api/v1

The hostname resolves to this computer. The local CA is `infra/inji/secrets/local-ca.crt`; trust that certificate in your browser if needed. If the wallet login/guest page already appears, there is no warning to accept there. Host trust settings are not modified by the setup scripts.

The Inji Web image retains its upstream Google login label. In this local configuration that button opens **local Keycloak**, not Google. Sign in as `farmer`; the generated password is `LOCAL_FARMER_PASSWORD` in the root `.env`. Create a wallet and remember its PIN. Guest mode does not provide the persistent wallet needed for the stored-credential presentation journey.

## Start or rebuild this configured workspace

Run from the repository root:

```bash
node infra/inji/scripts/prepare.mjs
node infra/inji/scripts/local/sync-runtime.mjs
docker compose -f infra/inji/generated/compose.runtime.json up -d --build --wait --wait-timeout 300
```

Allow a few minutes for Java services to start. `prepare` validates configuration and renders local properties, issuer metadata, trust lists, realm import and SQL. `sync-runtime` copies configuration into the Docker-managed `inji-playground_runtime` volume and writes a resolved Compose model. This accommodates Docker Desktop installations that cannot bind-mount the host workspace. Content hashes cause Compose to recreate services when mounted configuration changes. Existing runtime secrets are preserved, because Mimoto updates its keystore in place.

On a fresh Linux workspace without `.env`, first run:

```bash
node infra/inji/scripts/local/bootstrap.mjs
```

Bootstrap requires Node.js, OpenSSL and JDK `keytool`; it uses `/etc/ssl/certs/java/cacerts` as the Java truststore baseline. It generates unique passwords, TLS certificates, signing keys and local realm settings. It refuses to replace an existing `.env`. Preserve the `.env`, secrets and Docker volumes together. For client/server development outside Docker, use Node 22.19+ in the Node 22 line. Container builds use Node 22.22.0 and run both TypeScript builds plus frontend lint; no automated test cases were added.

Do not print or commit the rendered Compose JSON: it contains resolved secrets. The generated and secrets directories are ignored. Use `docker compose -f infra/inji/generated/compose.runtime.json config --quiet` for validation.

## Run a credential journey

1. Open the playground, select **Inji Web** and **FarmerCredential**, and start issuance.
2. Open Inji Web from the handoff link, sign in locally and unlock your wallet.
3. Download the Farmer credential, completing local issuer authorization with the same `farmer` account.
4. After the credential is stored, return to the playground and confirm wallet receipt.
5. Request verification and select **Present with Inji Web**. Approve sharing the matching credential in the wallet.
6. Return to the playground for the real Verify decision. Inspect exchanges and export the report in Run History.

The gateway sends token exchanges, credential issuance, presentation request retrieval and presentation submission through the observation bridge. Signed payloads and canonical identities are preserved. PASS requires a genuine valid Verify result, holder confirmation and a match against the observed issued credential. Holder confirmation remains an explicit user action.

## Components and persistence

| Component | Version / role |
| --- | --- |
| Certify | `injistack/inji-certify-with-plugins:0.14.0`; official synthetic farmer CSV provider |
| Mimoto | `injistack/mimoto:0.21.0` with the documented [repeat-login fix](mimoto/README.md) |
| Inji Web | `injistack/inji-web:0.16.0` |
| Verify | `injistack/inji-verify-service:0.17.0` |
| Local authorization | Keycloak 26.0.8 with [credential nonce mapper](keycloak/README.md) |
| Database | PostgreSQL 15.10; separate service databases |
| Object storage | MinIO `2022.2.7-debian-10-r0` and DataShare `1.3.0-beta.2` |
| Gateway / static configuration | Nginx 1.26.3 |
| Playground | Node 22.22.0 backend and Nginx frontend |

Host ports bind only to loopback: 443, 5173, 8000, 8091 and 8443. The databases and object storage are internal. Certify keys use `certify-keys`; Mimoto's mutable keystore uses the runtime volume and must be backed up with `postgres-data`. Object storage uses `object-data`. Playground run history remains in memory; export reports before restarting its server.

Stopping with `docker compose -f infra/inji/generated/compose.runtime.json stop` preserves data. Do not delete volumes to apply configuration changes. SQL initialization runs only on an empty PostgreSQL volume, and realm import skips existing realms. Existing database changes require explicit migrations; `migrations/001-verify-definition.sql` fixes the pinned Verify schema and farmer definition without resetting data.

## Scope and limitations

The configured journey is the JSON-LD Farmer credential using Inji Web. SD-JWT requires additional issuer configuration and compatible wallet/verifier definitions. Inji Mobile is not a container, and a physical phone cannot reach this loopback hostname; mobile use needs a reachable HTTPS deployment and device trust. No tunnel is created.

Local Keycloak supplies real OAuth/OIDC authentication and credential-bound nonces. It is not an eSignet deployment. MOSIP resident wallet binding and WebSub integrations are outside this standalone farmer setup; the upstream Mimoto scheduler can log an unavailable WebSub endpoint. DataShare uses the official local `encryptionType=NONE` policy, so this environment is for synthetic development credentials.

The base `docker-compose.yml` remains available for a separately onboarded external authorization provider. The working local setup additionally requires `docker-compose.local.yml`, merged by `sync-runtime.mjs`. Do not run only the base file expecting the local authorization service or playground containers.

## Sources

Pinned upstream assets and licenses are listed in [upstream/NOTICE.md](upstream/NOTICE.md). Local compatibility changes are explained alongside their Dockerfiles. The live validation record is in [context/LIVE_VALIDATION.md](../../context/LIVE_VALIDATION.md).
