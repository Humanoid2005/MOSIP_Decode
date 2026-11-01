import {
  scenarioOutcome,
  interoperabilityOutcome,
} from "../../../server/models/scenarios";
import type { RunSummary, TestRun } from "../models/playground";
export function runOutcome(run: TestRun | RunSummary): string {
  if (run.scenario !== "NONE" && ["COMPLETED", "FAILED"].includes(run.phase)) {
    const outcome = scenarioOutcome(run);
    return outcome === "PASS"
      ? "Expected failure confirmed"
      : outcome === "FAIL"
        ? "Unexpected acceptance"
        : "Inconclusive";
  }
  if (run.phase === "CANCELLED") return "Cancelled";
  if (run.phase === "FAILED") return "Error";
  if (run.verdict === "VALID") {
    const outcome = interoperabilityOutcome(run);
    return outcome === "PASS"
      ? "Pass"
      : outcome === "FAIL"
        ? "Protocol checks failed"
        : "Incomplete evidence";
  }
  if (run.verdict === "INVALID") return "Invalid";
  if (run.verdict === "EXPIRED") return "Expired";
  return run.phase === "HELD"
    ? "Held"
    : run.phase === "VERIFYING"
      ? "Awaiting presentation"
      : "Issuing";
}
export function formatName(format: string): string {
  return format === "ldp_vc"
    ? "W3C VC · JSON-LD"
    : format === "mso_mdoc"
      ? "mDoc · ISO 18013-5"
      : "SD-JWT VC";
}
export function walletName(wallet: string): string {
  return wallet === "INJI_MIMOTO"
    ? "Inji wallet · embedded"
    : wallet === "INJI_WEB"
      ? "Inji Web"
      : wallet === "MOCK_WALLET"
        ? "Playground mock wallet"
        : "Inji Mobile";
}
export function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function webPresentationUrl(
  walletUrl: string,
  requestUri?: string,
): string | undefined {
  if (!walletUrl || !requestUri) return undefined;
  const url = new URL("authorize", walletUrl.replace(/\/$/, "") + "/");
  url.search = new URL(requestUri).search;
  return url.toString();
}
