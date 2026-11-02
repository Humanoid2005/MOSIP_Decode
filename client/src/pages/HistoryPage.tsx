import {
  scenarioDefinition,
  scenarios,
} from "../../../server/models/scenarios";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Download, History } from "lucide-react";
import { useRuns } from "../services/usePlayground";
import { useWorkspace } from "../store/workspace";
import { api } from "../api/PlaygroundApi";
import {
  formatName,
  runOutcome,
  timestamp,
  walletName,
} from "../services/presentation";
import { ErrorNotice, Loading, PageTitle } from "../components/ui";
// Run history at /history: totals, then the runs the server still holds in
// memory, filterable by outcome, format, scenario and stack version. Choosing
// a run opens it in the inspector; each row also links to its JSON report.
export function HistoryPage() {
  const runs = useRuns();
  const select = useWorkspace((state) => state.selectRun);
  const navigate = useNavigate();
  const [filter, setFilter] = useState("All outcomes");
  const [format, setFormat] = useState("All formats");
  const [scenario, setScenario] = useState("ALL");
  const [version, setVersion] = useState("");
  const items = runs.data || [];
  const filtered = items.filter(
    (run) =>
      (scenario === "ALL" || run.scenario === scenario) &&
      (filter === "All outcomes" || runOutcome(run) === filter) &&
      (format === "All formats" || run.configuration.format === format) &&
      run.environment.stackVersion
        .toLowerCase()
        .includes(version.toLowerCase()),
  );
  return (
    <>
      <PageTitle title="A record of every journey.">
        Review outcomes and the protocol evidence behind each run. The latest
        100 runs are kept for this server session.
      </PageTitle>
      <ErrorNotice error={runs.error} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Total runs", items.length],
          [
            "End-to-end passes",
            items.filter((run) => runOutcome(run) === "Pass").length,
          ],
          [
            "In progress",
            items.filter((run) =>
              ["ISSUING", "HELD", "VERIFYING"].includes(run.phase),
            ).length,
          ],
        ].map(([label, value]) => (
          <div key={label} className="panel p-5">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 p-5">
          <h2 className="mr-auto pb-3 font-semibold">Recent runs</h2>
          <label className="text-xs text-slate-500">
            Outcome
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="field"
            >
              {[
                "All outcomes",
                "Pass",
                "Expected failure confirmed",
                "Unexpected acceptance",
                "Inconclusive",
                "Incomplete evidence",
                "Protocol checks failed",
                "Invalid",
                "Expired",
                "Error",
                "Cancelled",
                "Issuing",
                "Held",
                "Awaiting presentation",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Format
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              className="field"
            >
              <option>All formats</option>
              {[...new Set(items.map((run) => run.configuration.format))].map(
                (value) => (
                  <option key={value} value={value}>
                    {formatName(value)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Scenario
            <select
              className="field"
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
            >
              <option value="ALL">All scenarios</option>
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Stack version
            <input
              className="field"
              placeholder="Filter version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            />
          </label>
        </div>
        {runs.isPending ? (
          <Loading />
        ) : filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <tr>
                  {["Credential / wallet", "Started", "Outcome", "Report"].map(
                    (title) => (
                      <th key={title} className="px-5 py-4 font-medium">
                        {title}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-5 py-5">
                      <button
                        className="font-medium text-teal-800 hover:underline"
                        onClick={() => {
                          select(run.id);
                          navigate("/inspector");
                        }}
                      >
                        {run.configuration.name}
                      </button>
                      <p className="mt-1 text-xs text-slate-500">
                        {walletName(run.wallet)} ·{" "}
                        {formatName(run.configuration.format)} ·{" "}
                        {scenarioDefinition(run.scenario).name}
                      </p>
                    </td>
                    <td className="px-5 py-5 text-xs text-slate-500 tabular-nums">
                      {timestamp(run.createdAt)}
                    </td>
                    <td className="px-5 py-5">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                        {runOutcome(run)}
                      </span>
                    </td>
                    <td className="px-5 py-5">
                      <a
                        href={api.reportUrl(run.id)}
                        className="btn-secondary"
                        aria-label={`Export report ${run.id}`}
                      >
                        <Download size={15} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <History size={32} className="mb-5 text-slate-300" />
            <h3 className="font-semibold">
              {items.length
                ? "No runs match these filters"
                : "Your first journey starts here"}
            </h3>
            <p className="mt-2 mb-6 text-sm text-slate-500">
              {items.length
                ? "Adjust your filters to find a run."
                : "Start a flow in the workbench to create your first report."}
            </p>
            {items.length ? (
              <button
                className="btn-secondary"
                onClick={() => {
                  setFilter("All outcomes");
                  setFormat("All formats");
                  setVersion("");
                  setScenario("ALL");
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link className="btn-primary" to="/">
                Go to workbench
              </Link>
            )}
          </div>
        )}
      </section>
    </>
  );
}
