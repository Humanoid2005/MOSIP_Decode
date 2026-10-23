import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Send } from "lucide-react";
import { api } from "../../api/PlaygroundApi";
import type { TestRun } from "../../models/playground";
import { ErrorNotice } from "../ui";
export function MockWalletPanel({ run }: { run: TestRun }) {
  const client = useQueryClient();
  const authorize = useMutation({
    mutationFn: async () => {
      // Open the tab during the click so the browser does not block it as a pop-up.
      const tab = window.open("", "_blank");
      try {
        const { url } = await api.mockAuthorize(run.id);
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        }
        return { url, opened: Boolean(tab) };
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
  });
  const present = useMutation({
    mutationFn: () => api.mockPresent(run.id),
    onSuccess: (updated) => client.setQueryData(["run", updated.id], updated),
  });
  if (run.phase === "ISSUING")
    return (
      <div className="my-6 space-y-4 rounded-xl bg-slate-50 p-6">
        <p className="text-sm leading-6 text-slate-500">
          The playground mock wallet is a minimal OpenID4VCI and OpenID4VP
          holder outside the Inji stack. Sign in as the credential subject; the
          wallet then proves possession of its own <code>did:jwk</code> key and
          stores the credential. This run advances automatically.
        </p>
        <button
          className="btn-primary"
          disabled={authorize.isPending}
          onClick={() => authorize.mutate()}
        >
          {authorize.isPending ? "Preparing…" : "Sign in and issue"}
          <ExternalLink size={15} />
        </button>
        {authorize.data && !authorize.data.opened && (
          <a
            href={authorize.data.url}
            target="_blank"
            rel="noreferrer"
            className="block text-sm font-medium text-teal-800"
          >
            Your browser blocked the new tab. Open the sign-in page →
          </a>
        )}
        <ErrorNotice error={authorize.error} />
      </div>
    );
  if (run.phase === "VERIFYING")
    return (
      <div className="my-6 space-y-4 rounded-xl bg-slate-50 p-6">
        <p className="text-sm leading-6 text-slate-500">
          The mock wallet fetches Inji Verify's request object, discloses every
          claim and binds the presentation to the verifier's nonce with a Key
          Binding JWT.
        </p>
        <button
          className="btn-primary"
          disabled={present.isPending || present.isSuccess}
          onClick={() => present.mutate()}
        >
          {present.isPending ? "Presenting…" : "Present with mock wallet"}
          <Send size={15} />
        </button>
        <ErrorNotice error={present.error} />
      </div>
    );
  return null;
}
