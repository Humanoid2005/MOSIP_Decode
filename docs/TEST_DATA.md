# Test data

Everything needed to run and test the playground. All of it is synthetic: no real person, identity document or land record is involved, and the credentials certify nothing outside this stack.

## Accounts

| Purpose | Username | Password | Where it is used |
| --- | --- | --- | --- |
| **Your own holder account** (recommended) | Choose one | Choose one | **Register** on the Keycloak sign-in page. No email is sent. |
| **Seeded holder** | `farmer` | `LOCAL_FARMER_PASSWORD` in the root `.env` | Keycloak sign-in, from any wallet |
| **Keycloak administrator** | `admin` | `KEYCLOAK_ADMIN_PASSWORD` in the root `.env` | https://inji.127.0.0.1.sslip.io/auth/admin, on the local origin only |

Print the shared passwords from the repository root:

```bash
grep -E '^(LOCAL_FARMER|KEYCLOAK_ADMIN)_PASSWORD=' .env
```

These two secrets you create yourself:

| Secret | Rule | Where it is used |
| --- | --- | --- |
| **Wallet PIN** | Exactly 6 digits, for example `123456` | The embedded Inji wallet and Inji Web. It is set the first time you create a wallet, and never stored or logged by the playground. |
| **Inji Mobile passcode** | Set in the app | On the phone only |

The first issuance for any account creates its synthetic record, so no data needs to be loaded first.

## Synthetic farmer record

Every credential carries this record, created on first issuance and kept per signed-in account.

| Claim | Value |
| --- | --- |
| `id` | The account's Keycloak subject |
| `fullName` | `Synthetic Demo Farmer` plus 8 identifier characters |
| `farmerID` | `DEMO-` plus the identifier |
| `dateOfBirth` | `01-01-1990` |
| `gender` | `Not specified` |
| `mobileNumber` | `0000000000` |
| `state` | `Demo State` |
| `district` | `Demo District` |
| `villageOrTown` | `Synthetic Village` |
| `postalCode` | `000000` |
| `landArea` | `1 hectare (synthetic)` |
| `landOwnershipType` | `Demo only` |
| `primaryCropType` | `Maize` |
| `secondaryCropType` | `Rice` |
| `face` | A small placeholder image |

## Credential configurations

| ID | Name in the workbench | Format | Signature | Keycloak scope | Used for |
| --- | --- | --- | --- | --- | --- |
| `FarmerCredential` | Farmer Verifiable Credential | `ldp_vc` | Ed25519Signature2020 | `mock_identity_vc_ldp` | JSON-LD journeys |
| `FarmerCredentialSdJwt` | Farmer Credential (SD-JWT) | `vc+sd-jwt` | ES256 | `mock_identity_vc_sd_jwt` | SD-JWT journeys |
| `FarmerCredentialMdoc` | Farmer Credential (mDoc) | `mso_mdoc`, doc type `io.mosip.farmer.1.FarmerCredential` | COSE ES256 | `mock_identity_vc_mdoc` | mDoc issuance |
| `FarmerCredentialExpired` | Chosen by the scenario | `ldp_vc` | Ed25519Signature2020, dated January 2020 | `mock_identity_vc_expired` | **Expired credential** scenario |
| `FarmerCredentialUnsupportedDid` | Chosen by the scenario | `ldp_vc` | Ed25519Signature2020, issuer `did:playground:unresolvable-issuer` | `mock_identity_vc_unsupported_did` | **Unsupported DID** scenario |

## Presentation definitions

| ID | Format | Input descriptor |
| --- | --- | --- |
| `00000000-0000-4000-8000-000000000001` | `ldp_vc` | `farmer`, with proof type Ed25519Signature2020 and `$.type[*]` matching `FarmerCredential` |
| `00000000-0000-4000-8000-000000000002` | `vc+sd-jwt` | `farmer-sd-jwt`, with no constraints |

## OAuth clients

All are in the Keycloak realm `inji`.

| Client | Type | Used by | Redirect URI |
| --- | --- | --- | --- |
| `inji-wallet` | Confidential, signed client JWT | Mimoto, for Inji Web and the embedded wallet | `…/redirect`, `…/playground/wallet-callback`, `io.mosip.residentapp.inji://oauthredirect` |
| `inji-web-login` | Confidential | Mimoto's wallet sign-in | `…/v1/mimoto/oauth2/callback/google` (the upstream route name; it opens local Keycloak) |
| `playground-mock-wallet` | Public, PKCE | Mock wallet | `http://localhost:5173/api/v1/mock-wallet/callback` |
| `wallet` | Public, PKCE | Inji Mobile | `io.mosip.residentapp.inji://oauthredirect` |

## Sample inputs

**Test scenarios**, for the **Test scenario** field or the API's `scenario`:

| Scenario ID | Wallets |
| --- | --- |
| `NONE` | All |
| `BAD_SIGNATURE`, `MODIFIED_CLAIM` | Embedded Inji wallet, mock wallet |
| `EXPIRED_CREDENTIAL`, `UNSUPPORTED_DID` | JSON-LD wallets |
| `WRONG_TYPE`, `FORMAT_MISMATCH`, `PROOF_MISMATCH` | All with JSON-LD or SD-JWT |
| `WRONG_NONCE` | Mock wallet |

**A credential offer**, for **Have a credential offer?** with Inji Mobile or Inji Web:

```json
{
  "credential_issuer": "https://inji.127.0.0.1.sslip.io",
  "credential_configuration_ids": ["FarmerCredential"]
}
```

## Sample results

Exported reports from real runs, with secrets redacted, are in [evidence/](evidence/):

| File | What it shows |
| --- | --- |
| [mobile-phone-2026-11-01.json](evidence/mobile-phone-2026-11-01.json) | Inji Mobile on a physical phone, SD-JWT: PASS |
| [mobile-mdoc-2026-11-01.json](evidence/mobile-mdoc-2026-11-01.json) | mDoc issued, and rejected by Inji Verify |
| [mobile-mdoc-unpatched-certify-2026-11-01.json](evidence/mobile-mdoc-unpatched-certify-2026-11-01.json) | mDoc issuance failing on Certify's original jar |
| [mobile-sd-jwt-2026-10-28.json](evidence/mobile-sd-jwt-2026-10-28.json) | Simulated Inji Mobile through the workbench: PASS |
| [browser-mimoto-2026-10-29.json](evidence/browser-mimoto-2026-10-29.json) | Embedded Inji wallet in a browser, JSON-LD: normal and bad signature |
| [browser-mock-wallet-2026-10-29.json](evidence/browser-mock-wallet-2026-10-29.json) | Mock wallet in a browser, SD-JWT: normal and bad signature |
| [negative-scenarios-2026-10-26.json](evidence/negative-scenarios-2026-10-26.json) | The negative scenario matrix |
| [review-scenarios-2026-10-26.json](evidence/review-scenarios-2026-10-26.json) | Scenario review summary |
| [review-happy-path-2026-10-26.json](evidence/review-happy-path-2026-10-26.json), [review-bad-signature-2026-10-26.json](evidence/review-bad-signature-2026-10-26.json) | Embedded wallet: normal and bad signature |
| [mimoto-2026-10-26.json](evidence/mimoto-2026-10-26.json) | First embedded wallet journey |
| [signup-2026-10-26.json](evidence/signup-2026-10-26.json) | Journey with a self-registered account |

Unit tests create their own keys and credentials when they run (`server/tests/credentials.ts`). The certificate and key in `infra/inji/scripts/tests/fixtures/` exist only for the mDoc check's tests.

## Shared development secrets

The root `.env` and `infra/inji/secrets/` hold local-only keys and passwords, committed so a clone runs without setup. They protect nothing outside a developer's own machine, and they are not used by any deployed system. Do not trust `local-ca.crt` system-wide, because its private key is shared. To replace them, remove both from history and run `npm run bootstrap`.
