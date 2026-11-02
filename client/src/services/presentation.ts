import {
  scenarioOutcome,
  interoperabilityOutcome,
} from "../../../server/models/scenarios";
import type { RunSummary, TestRun } from "../models/playground";
// Outcome label shown on the workbench and history pages. A finished
// negative-scenario run is judged on whether the expected failure happened.
// A normal run needs Inji Verify's VALID verdict and the playground's
// end-to-end checks to pass, so a valid verdict alone is not a pass.
// HistoryPage filters on these exact labels.
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
// Credential format label; any format other than ldp_vc and mso_mdoc is one of
// the SD-JWT VC media types.
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
// Formats an ISO time in the viewer's locale.
export function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
// Link that opens the verifier's request in Inji Web: the presentation URI's
// query parameters on the pinned Inji Web release's /authorize page. Returns
// undefined until both URLs are known.
export function webPresentationUrl(
  walletUrl: string,
  requestUri?: string,
): string | undefined {
  if (!walletUrl || !requestUri) return undefined;
  const url = new URL("authorize", walletUrl.replace(/\/$/, "") + "/");
  url.search = new URL(requestUri).search;
  return url.toString();
}
