import {
  scenarioDefinition,
  scenarioOutcome,
  interoperabilityOutcome,
} from "../../models/scenarios.js";
import type { RunDao } from "../../models/contracts.js";
import { sanitize } from "../telemetry/sanitize.js";

// Builds the exportable JSON report for a run (report version 3).
export class ReportService {
  constructor(private readonly dao: RunDao) {}

  // Omits the offer and presentation links, the issued credential fingerprints
  // and the raw mDoc, and redacts secrets from the rest. The top-level outcome
  // is the interoperability outcome for the normal flow and the scenario
  // outcome for negative scenarios. The limitations state what the run cannot
  // prove.
  generate(id: string) {
    const {
      offerUri,
      presentationUri,
      credentialFingerprints,
      issuedMdoc,
      ...run
    } = this.dao.get(id);
    const outcome = interoperabilityOutcome(run);
    return sanitize({
      reportVersion: 3,
      scenarioResult: scenarioOutcome(run),
      expectedResult: scenarioDefinition(run.scenario).expected,
      outcome: run.scenario === "NONE" ? outcome : scenarioOutcome(run),
      interoperabilityOutcome: outcome,
      ...run,
      limitations: [
        run.holderReceiptSource === "MIMOTO"
          ? "Holder storage was confirmed by Mimoto's credential storage API."
          : run.holderReceiptSource === "MOCK_WALLET"
            ? "The non-Inji mock wallet stored the credential in server memory."
            : "Holder storage is confirmed by the user.",
        "Only traffic routed through the bridge and orchestrator is observable.",
        "Issuer result matching does not establish full protocol conformance.",
        "Inji verification results and independent playground request checks are reported separately. HTTP 200 is delivery, not acceptance.",
        "Request checks cover the supported single-credential presentation shapes only. Missing or unsupported evidence cannot produce a pass.",
        ...(run.configuration.format === "mso_mdoc"
          ? [
              "Inji Verify has no OpenID4VP path for mso_mdoc. The playground sent the bridge-observed mDoc to its direct credential check; no presentation took place.",
            ]
          : []),
      ],
    });
  }
}
