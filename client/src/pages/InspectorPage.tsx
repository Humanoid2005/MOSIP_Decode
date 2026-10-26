import { VerificationResult } from "../components/workbench/VerificationResult";
import { ScenarioResult } from "../components/workbench/ScenarioResult";
import { useState } from "react";
import { Link } from "react-router";
import { SquareTerminal } from "lucide-react";
import { useCurrentRun, useRuns } from "../services/usePlayground";
import { useWorkspace } from "../store/workspace";
import { ErrorNotice, Loading, PageTitle } from "../components/ui";
import { ExchangeList } from "../components/inspector/ExchangeList";
import { PayloadView } from "../components/inspector/PayloadView";
import { timestamp } from "../services/presentation";
export function InspectorPage() {
  const current = useCurrentRun();
  const runs = useRuns();
  const selectRun = useWorkspace((state) => state.selectRun);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [filter, setFilter] = useState("");
  const events =
    current.data?.events.filter((event) =>
      `${event.title} ${event.endpoint}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) || [];
  const selected =
    events.find((event) => event.id === selectedEvent) ??
    events.find((event) => event.status >= 400) ??
    events.at(-1);
  return (
    <>
      <PageTitle title="Every exchange, in context.">
        Inspect captured requests, responses, and holder confirmations.
        Unobserved wallet traffic is never filled in with sample data.
      </PageTitle>
      <ErrorNotice error={current.error || runs.error} />
      <div className="mb-5 flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-500">
          Run
          <select
            value={current.data?.id || ""}
            onChange={(event) => {
              selectRun(event.target.value);
              setSelectedEvent("");
            }}
            className="field"
          >
            <option value="" disabled>
              Select a run
            </option>
            {runs.data?.map((run) => (
              <option key={run.id} value={run.id}>
                {run.configuration.name} · {timestamp(run.createdAt)} ·{" "}
                {run.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-500">
          Filter exchanges
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search title or endpoint"
            className="field"
          />
        </label>
      </div>
      {current.data && (
        <div className="mb-5 space-y-4">
          <ErrorNotice error={current.data.error} />
          <ScenarioResult run={current.data} />
          <VerificationResult run={current.data} />
        </div>
      )}
      {current.isFetching && !current.data ? (
        <Loading />
      ) : selected ? (
        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-3">
          <ExchangeList
            events={events}
            selectedId={selected.id}
            select={setSelectedEvent}
          />
          <div className="min-w-0 lg:col-span-2">
            <PayloadView key={selected.id} event={selected} />
          </div>
        </div>
      ) : (
        <section className="panel flex flex-col items-center px-6 py-16 text-center">
          <SquareTerminal size={32} className="mb-4 text-slate-300" />
          <h2 className="font-semibold">
            {filter
              ? "No exchanges match your search"
              : "No captured exchanges yet"}
          </h2>
          <p className="mt-2 mb-6 text-sm text-slate-500">
            {filter
              ? "Try another title or endpoint."
              : "Start a credential journey to capture its observable protocol steps."}
          </p>
          {filter ? (
            <button className="btn-secondary" onClick={() => setFilter("")}>
              Clear search
            </button>
          ) : (
            <Link to="/" className="btn-primary">
              Go to workbench
            </Link>
          )}
        </section>
      )}
    </>
  );
}
