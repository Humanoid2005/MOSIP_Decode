# mDoc interoperability gaps — issue drafts

Drafts for the gaps found while adding `mso_mdoc` to the playground on 1 November 2026. They have not been filed. Evidence: [validation record](LIVE_VALIDATION.md#mdoc-isoiec-18013-5-credential--1-november-2026), [mDoc run report](evidence/mobile-mdoc-2026-11-01.json), [unpatched Certify run report](evidence/mobile-mdoc-unpatched-certify-2026-11-01.json).

## mosip/mimoto — Inji Web cannot download `mso_mdoc` credentials

**Versions:** Mimoto 0.21.0 with Inji Web 0.16.0; the same code is in 0.22.0 and 1.0.0-alpha.1.

**Steps:** Configure an issuer that advertises an `mso_mdoc` credential configuration (Inji Certify 0.14.0 with `doctype` set). In Inji Web, select that credential and download it.

**Expected:** Mimoto requests the credential with `format: mso_mdoc` and `doctype`, and stores it.

**Actual:** `CredentialRequestServiceImpl` calls `CredentialFormatHandlerFactory.getHandler("mso_mdoc")`, which throws `IllegalArgumentException: Unsupported credential format: mso_mdoc` because only `ldp_vc`, `vc+sd-jwt` and `dc+sd-jwt` handlers exist. The `CredentialFormat` enum has no `mso_mdoc` value either. No request reaches the issuer.

**Suggestion:** Add an `mso_mdoc` handler (request with `doctype` and optional `claims`; claim extraction from the base64url CBOR `IssuerSigned`, as Inji Mobile does with PixelPass), or hide `mso_mdoc` configurations from Inji Web until then.

## mosip/inji-verify — `mso_mdoc` is not supported and is rejected with a JSON-LD parsing error

**Versions:** verify-service 0.17.0; unchanged in 0.18.2 and 1.0.0-alpha.1.

**Steps:** POST an `mso_mdoc` credential issued by Inji Certify 0.14.0 (base64url CBOR) to `/v1/verify/v2/vc-verification` as `verifiableCredential`.

**Expected:** Either a verification of the mDoc (issuer signature over the MSO, value digests, validity, doc type), or a clear unsupported-format error.

**Actual:** HTTP 200 with `allChecksSuccessful: false` and `schemaAndSignatureCheck.error`: `ERR_GENERIC: Exception during Validation: A JSONObject text must begin with '{' at 1 [character 2 line 1]`. `Utils.getCredentialFormat` detects CWT and SD-JWT, then falls back to `LDP_VC`. The OpenID4VP path has the same gap: `VerifiablePresentationSubmissionServiceImpl` handles JSON-LD presentations and SD-JWT tokens only, and `FormatDto` / `VpFormats` have no `mso_mdoc` entry.

**Suggestion:** The `vc-verifier` dependency already provides `CredentialFormat.MSO_MDOC` and `MsoMdocVerifier`. Detecting `mso_mdoc` in `getCredentialFormat` would cover the credential check; OpenID4VP support needs `DeviceResponse` handling.

## mosip/inji-certify — release the `did:jwk` fragment fix for mDoc issuance

**Versions:** 0.14.0 and 1.0.0-alpha.1.

**Steps:** Request an `mso_mdoc` credential with a JWT proof whose header names the key as `kid: did:jwk:<base64url JWK>#0`, as Inji Mobile 0.22 does in its credential-offer flow.

**Actual:** HTTP 400 `ERROR_SIGNING_QR_DATA: Failed to add proof to mDoc`; the log shows `Illegal base64 character 23`. `MDocProcessor.createDeviceKeyInfo` removes the `did:jwk:` prefix but not the fragment.

**Note:** Fixed on `develop` in 943185e ("fix: Mdoc structure as per spec (#951)") with the later fragment handling, but no release contains it, so Inji Certify and Inji Mobile releases cannot complete an mDoc offer flow together. A patch release would close the gap.
