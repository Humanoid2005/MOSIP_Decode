export interface VerificationCheck {
  id: string;
  label: string;
  source: "INJI_VERIFY" | "PLAYGROUND";
  status: "PASS" | "FAIL" | "NOT_CHECKED" | "NOT_APPLICABLE";
  detail?: string;
}
export interface VerificationEvidence {
  version: 1;
  upstreamAccepted: boolean;
  checks: VerificationCheck[];
}

export function checkStatus(
  checks: VerificationCheck[] | undefined,
  id: string,
) {
  return checks?.find((check) => check.id === id)?.status ?? "NOT_CHECKED";
}
