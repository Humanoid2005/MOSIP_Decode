import { AppError, object, requiredString } from "../errors.js";
import type { TestRun } from "../../models/dtos.js";
// Parses a URL returned by Verify. A malformed one is the verifier's fault,
// so it is reported as 502 rather than as a server error.
function verifierUrl(value: string, label: string, base?: string): URL {
  try {
    return new URL(value, base);
  } catch {
    throw new AppError(502, `Verifier returned an invalid ${label}.`);
  }
}
// Builds the openid4vp://authorize link a wallet opens to answer the run's
// Inji Verify request. When Verify returns a request URI, the request is
// passed by reference with the verifier's client ID. Otherwise every
// parameter is sent by value: the Verify request ID as state, and the
// presentation definition inline or as a URI resolved against the Verify base.
export function presentationUri(
  payload: Record<string, unknown>,
  run: TestRun,
): string {
  const query = new URLSearchParams({
    client_id: run.environment.verifierClientId,
  });
  if (typeof payload.requestUri === "string") {
    const uri = verifierUrl(payload.requestUri, "request URI");
    if (!["https:", "http:"].includes(uri.protocol))
      throw new AppError(502, "Verifier returned an invalid request URI.");
    query.set("request_uri", uri.toString());
  } else {
    const details = object(payload.authorizationDetails);
    query.set("state", requiredString(payload.requestId, "requestId"));
    for (const [wire, field] of [
      ["response_mode", "responseMode"],
      ["response_type", "responseType"],
      ["nonce", "nonce"],
      ["response_uri", "responseUri"],
    ] as const)
      query.set(wire, requiredString(details[field], field));
    if (details.presentationDefinitionUri)
      query.set(
        "presentation_definition_uri",
        verifierUrl(
          String(details.presentationDefinitionUri),
          "presentation definition URI",
          `${run.environment.verifyUrl}/`,
        ).toString(),
      );
    else
      query.set(
        "presentation_definition",
        JSON.stringify(object(details.presentationDefinition)),
      );
    // Presentation formats and signature algorithms declared on the
    // verifier's behalf, which the wallet uses when choosing what to present.
    query.set(
      "client_metadata",
      JSON.stringify({
        client_name: "Inji Interoperability Playground",
        vp_formats: {
          ldp_vp: {
            proof_type: [
              "Ed25519Signature2018",
              "Ed25519Signature2020",
              "RsaSignature2018",
            ],
          },
          ldp_vc: {
            proof_type: [
              "Ed25519Signature2018",
              "Ed25519Signature2020",
              "RsaSignature2018",
            ],
          },
          "vc+sd-jwt": {
            "sd-jwt_alg_values": ["RS256", "ES256", "EdDSA"],
            "kb-jwt_alg_values": ["RS256", "ES256", "EdDSA"],
          },
        },
      }),
    );
  }
  return `openid4vp://authorize?${query}`;
}
