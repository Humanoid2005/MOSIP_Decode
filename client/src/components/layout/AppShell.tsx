import { NavLink, Outlet } from "react-router";
import { History, Layers3, ShieldCheck, SquareTerminal } from "lucide-react";
import { useTelemetry } from "../../services/useTelemetry";
import { cn } from "../../services/cn";
const links = [
  { to: "/", label: "Workbench", icon: Layers3 },
  { to: "/inspector", label: "Protocol inspector", icon: SquareTerminal },
  { to: "/history", label: "Run history", icon: History },
];
export function AppShell() {
  const live = useTelemetry();
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:p-4">
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-white md:w-60 md:border-r md:border-b-0">
          <div className="flex items-center gap-3 px-6 py-7">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-800 text-white">
              <Layers3 size={22} />
            </div>
            <div>
              <div className="text-xl font-semibold">inji.</div>
              <div className="text-xs text-slate-500">
                Interoperability playground
              </div>
            </div>
          </div>
          <p className="px-6 pt-5 pb-3 text-xs text-slate-400">WORKSPACE</p>
          <nav
            aria-label="Main navigation"
            className="flex flex-wrap gap-1 px-3 md:flex-col"
          >
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm hover:bg-slate-50",
                    isActive
                      ? "bg-teal-50 font-medium text-teal-800"
                      : "text-slate-600",
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="m-5 mt-auto hidden rounded-xl border border-slate-200 p-4 md:block">
            <ShieldCheck size={22} className="mb-3 text-teal-700" />
            <p className="text-sm font-medium">Built around open standards</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Follow every observable exchange from issuance to verification.
            </p>
            <div className="mt-4 flex gap-2 text-xs text-slate-500">
              <span className="rounded border border-slate-200 px-2 py-1">
                OpenID4VCI
              </span>
              <span className="rounded border border-slate-200 px-2 py-1">
                OpenID4VP
              </span>
            </div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-5 lg:px-10">
            <span className="text-sm text-slate-500">
              Inji stack / Developer workspace
            </span>
            <span
              role="status"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  live ? "bg-teal-600" : "bg-slate-400",
                )}
              />
              {live
                ? "Live updates connected"
                : "Live updates offline · polling enabled"}
            </span>
          </header>
          <main
            id="main-content"
            className="mx-auto max-w-7xl px-5 py-8 lg:px-10 lg:py-10"
          >
            <Outlet />
            <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-5 text-xs text-slate-500">
              <span>Inji Interoperability Playground</span>
              <span>
                Session history · export reports before restarting the server
              </span>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
