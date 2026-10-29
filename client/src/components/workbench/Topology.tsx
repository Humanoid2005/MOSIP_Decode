import {
  ArrowRight,
  Check,
  FileBadge,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { cn } from "../../services/cn";
import type { TestRun } from "../../models/playground";
import { walletName } from "../../services/presentation";
import { SequenceDialog } from "../inspector/SequenceDialog";
export function Topology({ run }: { run?: TestRun }) {
  const step = !run ? 0 : run.phase === "ISSUING" ? 1 : 2;
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-slate-200 py-5">
        <ol className="flex flex-wrap gap-5">
          {["Configure", "Issue & hold", "Present & verify"].map((label, i) => (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs",
                  i <= step
                    ? "bg-teal-800 text-white"
                    : "border border-slate-200 bg-white text-slate-400",
                )}
              >
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span
                className={cn(
                  i <= step ? "font-medium text-slate-800" : "text-slate-400",
                )}
              >
                {label}
              </span>
              {i < 2 && (
                <ArrowRight size={16} className="ml-3 text-slate-300" />
              )}
            </li>
          ))}
        </ol>
        <SequenceDialog run={run} />
      </div>
      <div className="mb-8 grid gap-3 lg:grid-cols-3">
        {[
          {
            role: "01 / ISSUER",
            name: "Inji Certify",
            detail: "Credential issuance",
            icon: FileBadge,
          },
          {
            role: "02 / HOLDER",
            name: run ? walletName(run.wallet) : "Inji Wallet",
            detail: "Credential storage & sharing",
            icon: Smartphone,
          },
          {
            role: "03 / VERIFIER",
            name: "Inji Verify",
            detail: "Presentation verification",
            icon: ShieldCheck,
          },
        ].map(({ role, name, detail, icon: Icon }) => (
          <div
            key={role}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
              <Icon size={21} />
            </div>
            <div>
              <div className="text-xs text-slate-500">{role}</div>
              <div className="mt-1 text-sm font-semibold">{name}</div>
              <div className="mt-1 text-xs text-slate-500">{detail}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
