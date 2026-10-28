import { ScenarioResult } from "./ScenarioResult";
import { VerificationResult } from "./VerificationResult";
import { ReplayPanel } from "./ReplayPanel";
import { Link } from "react-router";
import { ArrowRight, Download, ShieldCheck } from "lucide-react";
import { api } from "../../api/PlaygroundApi";
import type { TestRun } from "../../models/playground";
import { useRunAction } from "../../services/usePlayground";
import {
  formatName,
  runOutcome,
  webPresentationUrl,
} from "../../services/presentation";
import { useWorkspace } from "../../store/workspace";
import { ErrorNotice } from "../ui";
import { WalletHandoff } from "./WalletHandoff";
import { MockWalletPanel } from "./MockWalletPanel";
import { MimotoWalletPanel } from "../mimoto-wallet/MimotoWalletPanel";
export function RunStage({ run }: { run: TestRun }) {
  const action = useRunAction();
  const select = useWorkspace((state) => state.selectRun);
  const finished = ["COMPLETED", "FAILED", "CANCELLED"].includes(run.phase);
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <h2 className="font-semibold">
          {run.phase === "ISSUING"
            ? "Receive your credential"
            : run.phase === "HELD"
              ? "Present your credential"
              : run.phase === "VERIFYING"
                ? "Waiting for your wallet"
                : "Run complete"}
        </h2>
        <span className="text-xs text-slate-500">
          {formatName(run.configuration.format)}
        </span>
      </div>
      <div className="space-y-4 p-6">
        <ScenarioResult run={run} />
        <VerificationResult run={run} />
        <ErrorNotice error={run.error} />
        <ErrorNotice error={action.error} />
        {run.wallet === "INJI_MIMOTO" &&
          ["ISSUING", "VERIFYING"].includes(run.phase) && (
            <MimotoWalletPanel key={run.id} run={run} />
          )}
        {run.wallet === "MOCK_WALLET" &&
          ["ISSUING", "VERIFYING"].includes(run.phase) && (
            <MockWalletPanel run={run} />
          )}
        {run.phase === "ISSUING" &&
          !["MOCK_WALLET", "INJI_MIMOTO"].includes(run.wallet) && (
            <>
              <p className="text-sm leading-6 text-slate-500">
                Complete issuance in your wallet. Confirm receipt only after the
                credential appears there.
              </p>
              <WalletHandoff
                uri={run.offerUri}
                // Inji Mobile 0.22 scans offers in-app; it registers no offer deep link.
                deepLink={run.wallet !== "INJI_MOBILE"}
                instruction={
                  run.wallet === "INJI_MOBILE"
                    ? "In Inji Mobile, open Add card → Scan & Download Card and scan this code. Sign in, then confirm receipt here once the card appears."
                    : undefined
                }
                webUrl={
                  run.wallet === "INJI_WEB"
                    ? run.environment.webWalletUrl
                    : undefined
                }
              />
              <p className="text-xs leading-5 text-slate-500">
                {run.credentialObserved
                  ? "The bridge observed a credential response. Wallet storage still needs your confirmation."
                  : "No credential response has been observed. Direct wallet-to-issuer traffic is not visible here."}
              </p>
              <button
                className="btn-primary"
                disabled={action.isPending}
                onClick={() => action.mutate({ id: run.id, action: "holder" })}
              >
                I received the credential
                <ArrowRight size={15} />
              </button>
            </>
          )}
        {run.phase === "HELD" && (
          <>
            <ShieldCheck size={36} className="text-teal-700" />
            <p className="text-sm leading-6 text-slate-500">
              Wallet receipt has been confirmed. Request a presentation from
              Inji Verify using your configured presentation definition.
            </p>
            <button
              className="btn-primary"
              disabled={action.isPending}
              onClick={() =>
                action.mutate({ id: run.id, action: "presentation" })
              }
            >
              {action.isPending ? "Requesting…" : "Request verification"}
              <ArrowRight size={15} />
            </button>
          </>
        )}
        {run.phase === "VERIFYING" && (
          <>
            {!["MOCK_WALLET", "INJI_MIMOTO"].includes(run.wallet) && (
              <WalletHandoff
                uri={run.presentationUri}
                instruction={
                  run.wallet === "INJI_MOBILE"
                    ? "In Inji Mobile, tap Scan, scan this code and share the card."
                    : undefined
                }
                webPresentationUrl={
                  run.wallet === "INJI_WEB"
                    ? webPresentationUrl(
                        run.environment.webWalletUrl,
                        run.presentationUri,
                      )
                    : undefined
                }
              />
            )}
            {run.error ? (
              <button
                className="btn-secondary"
                onClick={() => action.mutate({ id: run.id, action: "refresh" })}
                disabled={action.isPending}
              >
                Check status now
              </button>
            ) : (
              <p role="status" className="text-sm text-slate-500">
                Waiting for the wallet to submit a presentation…
              </p>
            )}
          </>
        )}
        {finished && (
          <>
            <p className="text-2xl font-semibold">{runOutcome(run)}</p>
            <p className="text-sm leading-6 text-slate-500">
              {run.verdict === "VALID" && !run.credentialMatched
                ? "Inji Verify accepted the presentation, but the presented credential could not be matched to an observed issuance response. This is not a complete end-to-end pass."
                : run.phase === "CANCELLED"
                  ? "This local run has been stopped. Requests already sent to Inji may remain active until they expire."
                  : "Review the protocol evidence and download the report for this run."}
            </p>
            <ReplayPanel run={run} />
            <div className="flex flex-wrap gap-3">
              <a href={api.reportUrl(run.id)} className="btn-primary">
                <Download size={16} />
                Export report
              </a>
              <button className="btn-secondary" onClick={() => select(null)}>
                New run
              </button>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 px-6 py-4">
        <Link to="/inspector" className="text-sm font-medium text-teal-800">
          Inspect exchanges →
        </Link>
        {!finished && (
          <button
            className="text-xs text-slate-500 hover:text-slate-900"
            disabled={action.isPending}
            onClick={() => action.mutate({ id: run.id, action: "cancel" })}
          >
            Stop this local run
          </button>
        )}
      </div>
    </section>
  );
}
