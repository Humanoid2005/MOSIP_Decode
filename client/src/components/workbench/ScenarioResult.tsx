import {
  scenarioDefinition,
  scenarioOutcome,
} from "../../../../server/models/scenarios";
import type { TestRun } from "../../models/playground";

export function ScenarioResult({ run }: { run: TestRun }) {
  if (run.scenario === "NONE") return null;
  const definition = scenarioDefinition(run.scenario);
  const result = scenarioOutcome(run);
  const evidence = run.scenarioEvidence;
  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
      aria-label="Scenario evidence"
    >
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-sm font-semibold">{definition.name}</h3>
        <span
          className={`text-xs font-semibold ${result === "PASS" ? "text-teal-800" : result === "FAIL" ? "text-red-700" : "text-amber-700"}`}
        >
          Scenario:{" "}
          {result === "PASS"
            ? "Expected failure confirmed"
            : result === "FAIL"
              ? "Unexpected acceptance"
              : result}
        </span>
      </div>
      <p className="text-xs leading-5 text-slate-600">
        Expected: {definition.expected}
      </p>
      <p className="text-xs text-slate-600">
        Inji presentation verdict:{" "}
        {run.verdict === "PENDING" ? "Not available" : run.verdict} · Stage:{" "}
        {evidence.stage ?? "Not exercised yet"}
      </p>
      {evidence.detail && (
        <p className="text-sm leading-6 text-slate-600">{evidence.detail}</p>
      )}
      {evidence.mutationNote && (
        <p className="text-xs leading-5 text-slate-500">
          {evidence.mutationNote}
        </p>
      )}
      {evidence.controls && (
        <p className="text-xs leading-5 text-slate-600">
          Independent credential controls: original{" "}
          {evidence.controls.originalValid ? "valid" : "not confirmed valid"};
          modified issuer signature{" "}
          {evidence.controls.modifiedSignatureRejected
            ? "rejected"
            : "rejection not confirmed"}
          . These calls exclude the enclosing presentation proof.
        </p>
      )}
      {result === "FAIL" && (
        <p className="text-sm text-red-700">
          The observed result did not meet this scenario's expectation. Inspect
          the response as a potential interoperability gap.
        </p>
      )}
      {result === "INCONCLUSIVE" && (
        <p className="text-sm text-amber-700">
          The evidence does not establish the expected rejection. An operational
          error is not a scenario pass.
        </p>
      )}
      {run.parentRunId && (
        <p className="text-xs text-slate-500">
          Fresh run linked to {run.parentRunId}
        </p>
      )}
      {!!evidence.changes?.length && (
        <details>
          <summary className="cursor-pointer text-xs font-medium">
            View applied changes
          </summary>
          <div className="mt-3 space-y-3">
            {evidence.changes.map((change) => (
              <div key={change.path}>
                <p className="mb-2 break-all font-mono text-xs">
                  {change.path}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Before", change.before],
                    ["After", change.after],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="min-w-0">
                      <p className="text-xs text-slate-500">{String(label)}</p>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-3 text-xs">
                        {JSON.stringify(value, null, 2) ?? "Absent"}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
