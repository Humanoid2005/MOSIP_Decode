import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mimotoApi } from "../../services/mimoto-wallet/MimotoApi";
import { ErrorNotice } from "../ui";
export function WalletConsent({ runId }: { runId: string }) {
  const cache = useQueryClient();
  const prepare = useMutation({ mutationFn: () => mimotoApi.prepare(runId) });
  const submit = useMutation({
    mutationFn: () => mimotoApi.submit(runId),
    onSuccess: (run) => cache.setQueryData(["run", run.id], run),
  });
  const presentation = prepare.data;
  return (
    <div className="space-y-4">
      {!presentation ? (
        <>
          <p className="text-sm text-slate-600">
            Check the verifier and the credential requested before sharing.
          </p>
          <button
            className="btn-primary"
            disabled={prepare.isPending}
            onClick={() => prepare.mutate()}
          >
            {prepare.isPending ? "Checking request…" : "Review sharing request"}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <p className="font-medium">{presentation.verifier.name}</p>
            <p className="mt-1 break-all text-xs text-slate-500">
              {presentation.verifier.id}
            </p>
            <p className="mt-4">
              Share{" "}
              <strong>
                {presentation.credential.credentialTypeDisplayName}
              </strong>
              , issued in this run.
            </p>
            <p className="mt-2 text-slate-500">
              This JSON-LD presentation shares the full credential and its
              claims. Mimoto signs and sends it to Inji Verify.
            </p>
          </div>
          {submit.isSuccess || presentation.submitted ? (
            <p role="status" className="text-sm text-teal-800">
              Credential shared. Waiting for Inji Verify’s result…
            </p>
          ) : (
            <button
              className="btn-primary"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Sharing…" : "Approve and share credential"}
            </button>
          )}
        </>
      )}
      <ErrorNotice error={prepare.error || submit.error} />
      <p className="text-xs text-slate-500">
        To decline, stop this local run below. Nothing is shared before
        approval.
      </p>
    </div>
  );
}
