import type { RunSummary, TestRun } from "../models/playground";
export function runOutcome(run: TestRun | RunSummary): string {
  if (run.phase === "CANCELLED") return "Cancelled";
  if (run.phase === "FAILED") return "Error";
  if (run.verdict === "VALID")
    return run.credentialMatched &&
      run.credentialObserved &&
      run.holderConfirmed
      ? "Pass"
      : "Valid · incomplete evidence";
  if (run.verdict === "INVALID") return "Invalid";
  if (run.verdict === "EXPIRED") return "Expired";
  return run.phase === "HELD"
    ? "Held"
    : run.phase === "VERIFYING"
      ? "Awaiting presentation"
      : "Issuing";
}
export function formatName(format: string): string {
  return format === "ldp_vc" ? "W3C VC · JSON-LD" : "SD-JWT VC";
}
export function walletName(wallet: string): string {
  return wallet === "INJI_WEB" ? "Inji Web" : "Inji Mobile";
}
export function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function webPresentationUrl(walletUrl: string, requestUri?: string): string | undefined {
  if (!walletUrl || !requestUri) return undefined;
  const url = new URL("authorize", walletUrl.replace(/\/$/, "") + "/");
  url.search = new URL(requestUri).search;
  return url.toString();
}
