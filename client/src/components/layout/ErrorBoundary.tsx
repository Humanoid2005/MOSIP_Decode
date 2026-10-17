import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="mx-auto max-w-xl p-10">
        <h1 className="text-2xl font-semibold">
          This view could not be displayed.
        </h1>
        <p className="my-4 text-sm text-slate-600">
          Reload the workspace to recover the current run from the server.
        </p>
        <button
          className="btn-primary"
          onClick={() => window.location.reload()}
        >
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
