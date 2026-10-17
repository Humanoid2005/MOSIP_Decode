import { Link } from "react-router";
import { ArrowRight, SquareTerminal } from "lucide-react";
import type { TestRun } from "../../models/playground";
export function ProtocolSummary({ run }: { run?: TestRun }) {
  return (
    <aside className="space-y-5">
      <section className="panel p-6">
        <div className="mb-5 flex items-center gap-2">
          <SquareTerminal size={18} className="text-teal-700" />
          <h2 className="text-sm font-semibold">Follow the protocol</h2>
        </div>
        <p className="text-sm leading-6 text-slate-500">
          Requests and responses appear as the orchestrator and protocol bridge
          observe them.
        </p>
        <div className="my-5 space-y-4">
          {run?.events.length ? (
            run.events.slice(-4).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 text-xs text-slate-500"
              >
                <span className="truncate">{event.title}</span>
                <span className="shrink-0 tabular-nums">
                  {event.source === "USER"
                    ? "Confirmed"
                    : event.status || "Error"}
                </span>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-500">
              No exchanges yet. Start a flow to record the first event.
            </p>
          )}
        </div>
        <Link
          to="/inspector"
          className="flex items-center gap-2 text-sm font-medium text-teal-800"
        >
          Open protocol inspector
          <ArrowRight size={15} />
        </Link>
      </section>
      <p className="px-2 text-xs leading-5 text-slate-500">
        Direct wallet traffic requires Inji to advertise the configured protocol
        bridge. Signed payloads are never rewritten.
      </p>
    </aside>
  );
}
