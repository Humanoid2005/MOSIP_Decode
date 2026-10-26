import type { TestRun } from "../../models/playground";
import type { VerificationCheck } from "../../../../server/models/verification";
import { interoperabilityOutcome } from "../../../../server/models/scenarios";

function CheckList({ checks }: { checks: VerificationCheck[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {checks.map((check) => (
        <li key={check.id} className="py-2 text-xs">
          <div className="flex justify-between gap-4">
            <span>{check.label}</span>
            <strong
              className={
                check.status === "PASS"
                  ? "text-teal-800"
                  : check.status === "FAIL"
                    ? "text-red-700"
                    : "text-slate-500"
              }
            >
              {check.status.replaceAll("_", " ")}
            </strong>
          </div>
          <p className="mt-1 break-words text-slate-500">
            {check.source === "INJI_VERIFY"
              ? "Inji Verify"
              : "Playground check"}
            {check.detail ? ` · ${check.detail}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function VerificationResult({ run }: { run: TestRun }) {
  if (!run.verification) return null;
  const outcome = interoperabilityOutcome(run);
  const attention = run.verification.checks.filter((check) =>
    ["FAIL", "NOT_CHECKED"].includes(check.status),
  );
  const remaining = run.verification.checks.filter(
    (check) => !["FAIL", "NOT_CHECKED"].includes(check.status),
  );
  return (
    <section
      className="rounded-xl border border-slate-200 p-4 space-y-4"
      aria-label="Verification checks"
    >
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Verification evidence</h3>
        <p className="text-sm">
          Inji Verify:{" "}
          {run.verification.upstreamAccepted ? "accepted" : "rejected"} ·
          End-to-end checks: {outcome}
        </p>
        {run.verification.upstreamAccepted &&
          attention.some((check) => check.status === "FAIL") && (
            <p role="alert" className="text-sm text-red-700">
              The verifier accepted the presentation, but the protocol checks
              below failed. This run is not an end-to-end pass.
            </p>
          )}
        {run.scenario !== "NONE" && (
          <p className="text-xs leading-5 text-slate-500">
            An expected rejection can pass the negative scenario while the
            presentation remains invalid. Other failed or missing checks can
            make the scenario inconclusive.
          </p>
        )}
      </div>
      {!!attention.length && <CheckList checks={attention} />}
      {!!remaining.length && (
        <details>
          <summary className="cursor-pointer text-xs font-medium">
            Other verification checks ({remaining.length})
          </summary>
          <CheckList checks={remaining} />
        </details>
      )}
      <p className="text-xs text-slate-500">
        Issued credential matched: {run.credentialMatched ? "yes" : "no"} ·
        Wallet receipt: {run.holderConfirmed ? "confirmed" : "not confirmed"}
      </p>
    </section>
  );
}
