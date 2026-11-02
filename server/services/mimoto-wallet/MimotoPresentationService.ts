import type { ScenarioService } from "../scenario-service/ScenarioService.js";
import type { TestRun } from "../../models/dtos.js";
import type {
  MimotoContext,
  MimotoSession,
} from "../../models/MimotoSession.js";
import type { MimotoClient } from "./MimotoClient.js";
import { AppError, object, requiredString } from "../errors.js";
// OpenID4VP presentation from the embedded wallet. Mimoto authenticates the
// verifier's request, matches stored credentials, signs the presentation and
// submits it; the workbench only relays the user's review and consent.
export class MimotoPresentationService {
  constructor(
    private readonly client: MimotoClient,
    private readonly scenarios: ScenarioService,
  ) {}
  // Opens the verifier request in Mimoto and checks that it names the expected
  // verifier and that the credential issued in this run matches it. A failed
  // match fails the run at the wallet-matching stage, which is how the
  // request-side fault tests surface for Inji wallets. The result is cached on
  // the session so a page reload does not open a second presentation.
  async prepare(run: TestRun, session: MimotoSession, context: MimotoContext) {
    if (session.presentation) return session.presentation;
    if (!session.credentialId)
      throw new AppError(409, "This run has no stored Mimoto credential.");
    const path = `/wallets/${encodeURIComponent(session.walletId)}/presentations`;
    const response = object(
      await this.client.send(
        run.environment.mimotoUrl,
        path,
        context,
        "POST",
        {
          authorizationRequestUrl: requiredString(
            run.presentationUri,
            "presentationUri",
          ),
        },
        run.id,
      ),
    );
    const id = requiredString(response.presentationId, "presentationId");
    const verifier = object(response.verifier);
    if (verifier.id !== run.environment.verifierClientId)
      throw new AppError(502, "Mimoto returned a different verifier identity.");
    const matches = object(
      await this.client.send(
        run.environment.mimotoUrl,
        `${path}/${encodeURIComponent(id)}/credentials`,
        context,
        "GET",
        undefined,
        run.id,
      ),
    );
    const credentials = matches.availableCredentials;
    const credential = Array.isArray(credentials)
      ? credentials
          .map(object)
          .find((item) => item.credentialId === session.credentialId)
      : undefined;
    if (
      !credential ||
      (Array.isArray(matches.missingClaims) && matches.missingClaims.length)
    ) {
      this.scenarios.fail(
        run.id,
        "WALLET_MATCHING",
        "NO_MATCHING_CREDENTIAL",
        "Mimoto found no matching credential for this presentation request.",
      );
      throw new AppError(
        409,
        "The credential issued in this run does not satisfy the verifier request. Inspect Mimoto's matching response.",
      );
    }
    session.presentation = {
      id,
      verifier: {
        id: String(verifier.id),
        name:
          typeof verifier.name === "string"
            ? verifier.name
            : String(verifier.id),
      },
      credential: {
        credentialId: session.credentialId,
        credentialTypeDisplayName: String(
          credential.credentialTypeDisplayName ?? run.configuration.name,
        ),
        format: String(credential.format ?? run.configuration.format),
      },
      submitted: false,
    };
    return session.presentation;
  }
  // Shares the reviewed credential. Repeating the call after success does
  // nothing, so a retried request cannot submit the presentation twice.
  async submit(run: TestRun, session: MimotoSession, context: MimotoContext) {
    const presentation = session.presentation;
    if (!presentation)
      throw new AppError(
        409,
        "Review the presentation request before sharing.",
      );
    if (presentation.submitted) return;
    const response = object(
      await this.client.send(
        run.environment.mimotoUrl,
        `/wallets/${encodeURIComponent(session.walletId)}/presentations/${encodeURIComponent(presentation.id)}`,
        context,
        "PATCH",
        {
          selectedCredentials: [presentation.credential.credentialId],
        },
        run.id,
      ),
    );
    if (response.status !== "success")
      throw new AppError(
        502,
        "Mimoto did not confirm presentation delivery. Inspect its response before retrying.",
      );
    presentation.submitted = true;
  }
}
