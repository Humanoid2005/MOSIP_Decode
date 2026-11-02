import { useCurrentRun, useRuns } from "../services/usePlayground";
import { useWorkspace } from "../store/workspace";
import { ErrorNotice, Loading, PageTitle } from "../components/ui";
import { Topology } from "../components/workbench/Topology";
import { FlowConfiguration } from "../components/workbench/FlowConfiguration";
import { RunStage } from "../components/workbench/RunStage";
import { ProtocolSummary } from "../components/workbench/ProtocolSummary";
import { AccountStep } from "../components/mimoto-wallet/AccountStep";
// The workbench at /. Below the optional account step and the step bar it
// shows the flow form when no run is selected, otherwise the selected run's
// current stage, beside the latest captured exchanges. Only one run can be in
// progress, so the form is blocked while another run is active and a button
// offers to resume it. If the selected run cannot be loaded, the user can
// clear the selection and return to the default view.
export function WorkbenchPage() {
  const current = useCurrentRun();
  const runs = useRuns();
  const select = useWorkspace((state) => state.selectRun);
  const active = runs.data?.find((run) =>
    ["ISSUING", "HELD", "VERIFYING"].includes(run.phase),
  );
  return (
    <>
      <PageTitle
        eyebrow="THE COMPLETE CREDENTIAL JOURNEY"
        title="One flow. Every exchange."
      >
        Issue a credential, hold it in your wallet, and present it for
        verification. See how the Inji stack works together, one step at a time.
      </PageTitle>
      <ErrorNotice error={runs.error || current.error} />
      {current.error && (
        <button className="btn-secondary mt-3" onClick={() => select(null)}>
          Return to current workspace
        </button>
      )}
      {active && active.id !== current.data?.id && (
        <button
          className="btn-secondary my-4"
          onClick={() => select(active.id)}
        >
          Resume active run
        </button>
      )}
      <AccountStep />
      <Topology run={current.data} />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {current.isFetching &&
          !current.data &&
          current.fetchStatus !== "idle" ? (
            <Loading />
          ) : current.data ? (
            <RunStage key={current.data.id} run={current.data} />
          ) : (
            <FlowConfiguration blocked={Boolean(active)} />
          )}
        </div>
        <ProtocolSummary run={current.data} />
      </div>
    </>
  );
}
