import type { ReactNode } from "react";
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
    >
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold text-teal-700">{eyebrow}</p>
      )}
      <h1 className="text-balance text-3xl font-semibold">{title}</h1>
      <div className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-slate-500">
        {children}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div
      role="status"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <span className="text-sm text-slate-500">Loading workspace…</span>
      <div className="h-5 w-2/3 rounded bg-slate-100" />
      <div className="h-24 rounded bg-slate-50" />
    </div>
  );
}
