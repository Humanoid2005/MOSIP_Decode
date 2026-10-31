import type { ProtocolEvent } from "../../models/playground";
import { cn } from "../../services/cn";
export function ExchangeList({
  events,
  selectedId,
  select,
}: {
  events: ProtocolEvent[];
  selectedId?: string;
  select: (id: string) => void;
}) {
  return (
    <section
      aria-label="Protocol exchanges"
      className="border-b border-slate-200 p-3 lg:border-r lg:border-b-0"
    >
      <h2 className="px-3 py-3 text-xs font-semibold text-slate-500">
        EXCHANGES · <span className="tabular-nums">{events.length}</span>
      </h2>
      <div className="max-h-96 overflow-auto">
        {events.map((event, index) => (
          <button
            key={event.id}
            onClick={() => select(event.id)}
            aria-pressed={selectedId === event.id}
            className={cn(
              "my-1 flex w-full items-start gap-3 rounded-lg p-4 text-left",
              selectedId === event.id
                ? "bg-teal-50 text-teal-900"
                : "text-slate-600 hover:bg-slate-50",
            )}
          >
            <span className="pt-1 text-xs tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="break-words text-sm font-medium">
                {event.title}
              </div>
              <div className="mt-2 text-xs opacity-70">
                {event.source} · {event.status || "—"} ·{" "}
                <span className="tabular-nums">{event.durationMs} ms</span>
                {event.repeats ? (
                  <span className="tabular-nums"> · ×{event.repeats}</span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
