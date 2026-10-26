import { randomBytes, createHash } from "node:crypto";
import type { TestRun } from "../../models/dtos.js";
import type {
  MimotoContext,
  MimotoSession,
} from "../../models/MimotoSession.js";
import type { MimotoClient } from "./MimotoClient.js";
import { AppError, object, requiredString } from "../errors.js";
export class MimotoIssuanceService {
  constructor(private readonly client: MimotoClient) {}
  async authorize(
    run: TestRun,
    session: MimotoSession,
    context: MimotoContext,
  ) {
    const base = run.environment.mimotoUrl;
    await this.client.send(
      base,
      `/wallets/${encodeURIComponent(session.walletId)}/credentials`,
      context,
    );
    const issuers = object(
      object(await this.client.send(base, "/issuers", context)).response,
    ).issuers;
    const issuer = Array.isArray(issuers)
      ? issuers
          .map(object)
          .find(
            (item) => item.credential_issuer_host === run.environment.issuerUrl,
          )
      : undefined;
    if (!issuer)
      throw new AppError(
        409,
        "The selected issuer is not onboarded in Mimoto.",
      );
    const issuerId = requiredString(issuer.issuer_id, "issuer_id");
    const configuration = object(
      object(
        await this.client.send(
          base,
          `/issuers/${encodeURIComponent(issuerId)}/configuration`,
          context,
        ),
      ).response,
    );
    const credentials = configuration.credentials_supported;
    const credential = Array.isArray(credentials)
      ? credentials
          .map(object)
          .find((item) => item.name === run.configuration.id)
      : undefined;
    if (!credential)
      throw new AppError(
        409,
        "Mimoto does not advertise the selected credential. Check its issuer configuration and metadata cache.",
      );
    const authorization = {
      state: randomBytes(32).toString("base64url"),
      codeVerifier: randomBytes(32).toString("base64url"),
      issuerId,
      redirectUri: `${run.environment.embeddedWalletUrl}/wallet-callback`,
      expiresAt: Date.now() + 10 * 60_000,
    };
    const url = new URL(
      requiredString(
        configuration.authorization_endpoint,
        "authorization_endpoint",
      ),
    );
    if (url.protocol !== "https:")
      throw new AppError(502, "Wallet authorization requires HTTPS.");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: requiredString(issuer.client_id, "client_id"),
      scope: requiredString(credential.scope, "scope"),
      redirect_uri: authorization.redirectUri,
      state: authorization.state,
      code_challenge: createHash("sha256")
        .update(authorization.codeVerifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    session.authorization = authorization;
    return { url: url.toString() };
  }
  async complete(
    run: TestRun,
    session: MimotoSession,
    context: MimotoContext,
    state: string,
    code: string,
  ) {
    const authorization = session.authorization;
    if (
      !authorization ||
      authorization.state !== state ||
      authorization.expiresAt < Date.now()
    )
      throw new AppError(
        409,
        "Issuance authorization is expired or already used. Start sign-in again.",
      );
    session.authorization = undefined;
    const stored = object(
      await this.client.send(
        run.environment.mimotoUrl,
        `/wallets/${encodeURIComponent(session.walletId)}/credentials`,
        context,
        "POST",
        {
          issuer: authorization.issuerId,
          credentialConfigurationId: run.configuration.id,
          code,
          grantType: "authorization_code",
          redirectUri: authorization.redirectUri,
          codeVerifier: authorization.codeVerifier,
        },
        run.id,
      ),
    );
    session.credentialId = requiredString(
      stored.credentialId,
      "stored credentialId",
    );
    return session.credentialId;
  }
}
