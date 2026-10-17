import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowRight, Download, ShieldCheck } from "lucide-react";
import { api } from "../../api/PlaygroundApi";
import type { TestRun } from "../../models/playground";
import { useRunAction } from "../../services/usePlayground";
import { formatName, runOutcome, webPresentationUrl } from "../../services/presentation";
import { useWorkspace } from "../../store/workspace";
import { ErrorNotice } from "../ui";
import { WalletHandoff } from "./WalletHandoff";
export function RunStage({ run }: { run: TestRun }) {
  const action = useRunAction();
  const select = useWorkspace((state) => state.selectRun);
  const queryClient = useQueryClient();
  const refresh = useQuery({
    queryKey: ["verification-status", run.id],
    queryFn: () => api.action(run.id, "refresh"),
    enabled: run.phase === "VERIFYING",
    refetchInterval: (query) => (query.state.error ? false : 3000),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (refresh.data) queryClient.setQueryData(["run", run.id], refresh.data);
  }, [refresh.data, queryClient, run.id]);
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
        <ErrorNotice error={run.error} />
        <ErrorNotice error={action.error} />
        {run.phase === "ISSUING" && (
          <>
            <p className="text-sm leading-6 text-slate-500">
              Complete issuance in your wallet. Confirm receipt only after the
              credential appears there.
            </p>
            <WalletHandoff
              uri={run.offerUri}
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
            <WalletHandoff uri={run.presentationUri} webPresentationUrl={run.wallet === "INJI_WEB" ? webPresentationUrl(run.environment.webWalletUrl, run.presentationUri) : undefined} />
            <ErrorNotice error={refresh.error} />
            {refresh.error ? (
              <button
                className="btn-secondary"
                onClick={() => void refresh.refetch()}
                disabled={refresh.isFetching}
              >
                Retry status check
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
