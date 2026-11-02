// One check in a run's verification evidence. source tells apart Inji
// Verify's own results from the playground's independent checks.
export interface VerificationCheck {
  id: string;
  label: string;
  source: "INJI_VERIFY" | "PLAYGROUND";
  status: "PASS" | "FAIL" | "NOT_CHECKED" | "NOT_APPLICABLE";
  detail?: string;
}
// upstreamAccepted is Inji Verify's overall decision (allChecksSuccessful);
// checks hold its per-check results and the playground's own.
export interface VerificationEvidence {
  version: 1;
  upstreamAccepted: boolean;
  checks: VerificationCheck[];
}

// Status of one check by ID. A check that is absent counts as NOT_CHECKED.
export function checkStatus(
  checks: VerificationCheck[] | undefined,
  id: string,
) {
  return checks?.find((check) => check.id === id)?.status ?? "NOT_CHECKED";
}
