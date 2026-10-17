import type { RunDao } from "../../models/contracts.js";
import { sanitize } from "../telemetry/sanitize.js";

export class ReportService {
  constructor(private readonly dao: RunDao) {}

  generate(id: string) {
    const { offerUri, presentationUri, credentialFingerprints, ...run } =
      this.dao.get(id);
    const outcome =
      run.verdict === "VALID"
        ? run.credentialObserved && run.credentialMatched && run.holderConfirmed
          ? "PASS"
          : "INCOMPLETE_EVIDENCE"
        : run.phase === "COMPLETED" || run.phase === "FAILED"
          ? "FAIL"
          : run.phase;
    return sanitize({
      reportVersion: 1,
      outcome,
      ...run,
      limitations: [
        "Holder storage is confirmed by the user.",
        "Only traffic routed through the bridge and orchestrator is observable.",
        "Issuer result matching does not establish full protocol conformance.",
      ],
    });
  }
}
