import { AppError, object, requiredString } from "../errors.js";
import type { TestRun } from "../../models/dtos.js";
export function presentationUri(
  payload: Record<string, unknown>,
  run: TestRun,
): string {
  const query = new URLSearchParams({
    client_id: run.environment.verifierClientId,
  });
  if (typeof payload.requestUri === "string") {
    const uri = new URL(payload.requestUri);
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
        new URL(
          String(details.presentationDefinitionUri),
          `${run.environment.verifyUrl}/`,
        ).toString(),
      );
    else
      query.set(
        "presentation_definition",
        JSON.stringify(object(details.presentationDefinition)),
      );
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
