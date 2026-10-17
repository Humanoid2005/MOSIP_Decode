import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Expand, X } from "lucide-react";
import type { ProtocolEvent } from "../../models/playground";
import { decodePayload } from "../../services/decodePayload";
import { cn } from "../../services/cn";
export function PayloadView({ event }: { event: ProtocolEvent }) {
  const [side, setSide] = useState<"request" | "response">("response");
  const [decoded, setDecoded] = useState(false);
  const [message, setMessage] = useState("");
  const value = decoded ? decodePayload(event[side]) : event[side];
  const text = JSON.stringify(value, null, 2);
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <h2 className="text-sm font-semibold">{event.title}</h2>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            aria-label="Copy selected payload"
            onClick={() => {
              navigator.clipboard
                .writeText(text)
                .then(() => setMessage("Payload copied."))
                .catch(() =>
                  setMessage("Clipboard unavailable. Select the JSON to copy."),
                );
            }}
          >
            <Copy size={14} />
          </button>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                className="btn-secondary"
                aria-label="Expand selected payload"
              >
                <Expand size={14} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/40" />
              <Dialog.Content className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-xl sm:inset-10">
                <Dialog.Title className="pr-10 text-lg font-semibold">
                  {event.title}
                </Dialog.Title>
                <Dialog.Description className="mt-2 mb-4 text-sm text-slate-500">
                  {decoded
                    ? "Decoded for inspection only. This does not verify a signature."
                    : "Captured payload with authentication tokens redacted."}
                </Dialog.Description>
                <Dialog.Close
                  className="absolute top-5 right-5 rounded p-2 hover:bg-slate-100"
                  aria-label="Close payload"
                >
                  <X size={18} />
                </Dialog.Close>
                <pre className="min-h-0 flex-1 overflow-auto rounded-xl bg-slate-50 p-5 text-xs leading-6">
                  <code>{text}</code>
                </pre>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
        {(["request", "response"] as const).map((item) => (
          <button
            key={item}
            aria-pressed={side === item}
            onClick={() => {
              setSide(item);
              setMessage("");
            }}
            className={cn(
              "rounded px-3 py-2 text-xs capitalize",
              side === item
                ? "bg-teal-50 font-medium text-teal-800"
                : "text-slate-500",
            )}
          >
            {item}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={decoded}
            onChange={(event) => setDecoded(event.target.checked)}
          />
          Decode JWT / SD-JWT
        </label>
      </div>
      <div className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4 font-mono text-xs">
        <span className="font-semibold text-teal-800">
          {event.method || "USER"}
        </span>
        <span className="break-all text-slate-500">
          {event.endpoint || "Holder confirmation"}
        </span>
      </div>
      <pre className="max-h-96 min-h-64 overflow-auto p-6 text-xs leading-7 text-slate-700">
        <code>{text}</code>
      </pre>
      <div className="space-y-2 border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
        <p>
          {decoded
            ? "Decoding is for inspection; the verification verdict comes from Inji Verify."
            : "Authentication tokens are redacted. Raw bodies are not rewritten on the wire."}
        </p>
        <p role="status">{message}</p>
      </div>
    </section>
  );
}
