import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { RotateCcw, Workflow, X } from "lucide-react";
import type { TestRun } from "../../models/playground";
import { cn } from "../../services/cn";
import { formatName, walletName } from "../../services/presentation";
import { SequenceDiagram } from "./SequenceDiagram";
import { PayloadView } from "./PayloadView";

// Button in the workbench's step bar that opens the current run's protocol
// sequence in a dialog. The diagram stays live while the run is in progress.
// Selecting an arrow shows that event's payload below the diagram, and the
// selection is cleared whenever the dialog opens or closes. Replay animation
// remounts the diagram so it draws in again from the top.
export function SequenceDialog({ run }: { run?: TestRun }) {
  const [selectedId, setSelected] = useState("");
  const [replay, setReplay] = useState(0);
  const live = run && ["ISSUING", "HELD", "VERIFYING"].includes(run.phase);
  const selected = run?.events.find((event) => event.id === selectedId);
  return (
    <Dialog.Root onOpenChange={() => setSelected("")}>
      <Dialog.Trigger asChild>
        <button
          className="btn-secondary"
          disabled={!run}
          title={run ? undefined : "Start a flow to record its sequence."}
        >
          <Workflow size={16} />
          View sequence flow diagram
        </button>
      </Dialog.Trigger>
      {run && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/40" />
          <Dialog.Content className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:inset-10">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 pr-16">
              <div>
                <Dialog.Title className="flex items-center gap-3 text-lg font-semibold">
                  Protocol sequence
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      live
                        ? "bg-teal-50 text-teal-800"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {live && (
                      <span className="size-1.5 animate-pulse rounded-full bg-teal-600 motion-reduce:animate-none" />
                    )}
                    {live ? "Live" : "Recorded"}
                  </span>
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-slate-500">
                  {walletName(run.wallet)} ·{" "}
                  {formatName(run.configuration.format)} · {run.events.length}{" "}
                  captured events. Select an arrow to see its payload.
                </Dialog.Description>
              </div>
              <button
                className="btn-secondary"
                onClick={() => setReplay((value) => value + 1)}
              >
                <RotateCcw size={14} />
                Replay animation
              </button>
            </div>
            <Dialog.Close
              className="absolute top-5 right-5 rounded p-2 hover:bg-slate-100"
              aria-label="Close sequence diagram"
            >
              <X size={18} />
            </Dialog.Close>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-50/60 p-6">
              <SequenceDiagram
                key={replay}
                run={run}
                selectedId={selectedId}
                onSelect={setSelected}
              />
            </div>
            <div className="max-h-[40%] shrink-0 overflow-auto border-t border-slate-100">
              {selected ? (
                <PayloadView event={selected} />
              ) : (
                <p className="px-6 py-4 text-xs leading-5 text-slate-500">
                  Arrows show only traffic the orchestrator and protocol bridge
                  observed. Notes mark wallet-internal steps and controlled
                  scenario changes; HTTP status is delivery, not acceptance.
                </p>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
