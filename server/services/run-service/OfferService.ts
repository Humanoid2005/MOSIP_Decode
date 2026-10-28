import type { TestRun } from "../../models/dtos.js";
import { AppError, object } from "../errors.js";
import type { ObservedHttpClient } from "../telemetry/ObservedHttpClient.js";
// Inji Mobile splits the query on "=", so the whole offer is percent-encoded.
export function offerUri(offer: Record<string, unknown>): string {
  return `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;
}
export class OfferService {
  constructor(private readonly http: ObservedHttpClient) {}
  // An offer without grants tells the wallet to use the authorization code
  // flow with the authorization server advertised in issuer metadata.
  authorizationCodeOffer(run: TestRun): {
    uri: string;
    offer: Record<string, unknown>;
  } {
    if (!run.environment.issuerUrl.startsWith("https://"))
      throw new AppError(
        409,
        "Wallets only accept credential offers from an HTTPS issuer.",
      );
    const offer = {
      credential_issuer: run.environment.issuerUrl,
      credential_configuration_ids: [run.configuration.id],
    };
    return { uri: offerUri(offer), offer };
  }
  async resolve(
    input: string,
    run: TestRun,
  ): Promise<{ uri: string; offer: Record<string, unknown> }> {
    if (input.length > 16000)
      throw new AppError(422, "Credential offer is too large.");
    let offer: Record<string, unknown>;
    if (input.trim().startsWith("{")) {
      try {
        offer = object(JSON.parse(input));
      } catch {
        throw new AppError(422, "Credential offer must contain valid JSON.");
      }
    } else {
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        throw new AppError(422, "Paste a credential-offer URI or JSON.");
      }
      if (url.protocol !== "openid-credential-offer:")
        throw new AppError(422, "Expected an openid-credential-offer URI.");
      const inline = url.searchParams.get("credential_offer");
      const reference = url.searchParams.get("credential_offer_uri");
      if (Boolean(inline) === Boolean(reference))
        throw new AppError(
          422,
          "Offer must use exactly one of credential_offer or credential_offer_uri.",
        );
      if (inline) {
        try {
          offer = object(JSON.parse(inline));
        } catch {
          throw new AppError(422, "Invalid offer JSON.");
        }
      } else {
        let offerUrl: URL;
        try {
          offerUrl = new URL(reference!);
        } catch {
          throw new AppError(422, "Invalid credential_offer_uri.");
        }
        const issuer = new URL(run.environment.issuerUrl);
        if (
          offerUrl.origin !== issuer.origin ||
          offerUrl.username ||
          offerUrl.password ||
          !(
            offerUrl.pathname === issuer.pathname ||
            offerUrl.pathname.startsWith(
              `${issuer.pathname.replace(/\/$/, "")}/`,
            )
          )
        )
          throw new AppError(
            422,
            "Offer reference must be hosted under the configured issuer URL.",
          );
        offer = object(
          await this.http.json(offerUrl.toString(), "Credential offer", run.id),
        );
      }
    }
    if (offer.credential_issuer !== run.environment.issuerUrl)
      throw new AppError(
        422,
        "Offer issuer does not match the configured issuer.",
      );
    if (
      !Array.isArray(offer.credential_configuration_ids) ||
      !offer.credential_configuration_ids.includes(run.configuration.id)
    )
      throw new AppError(
        422,
        "Offer does not include the selected credential configuration.",
      );
    return { uri: offerUri(offer), offer };
  }
}
