import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  mimotoApi,
  walletIssuanceKey,
  walletLoginKey,
} from "../services/mimoto-wallet/MimotoApi";
import { useWorkspace } from "../store/workspace";
import { ErrorNotice } from "../components/ui";
// Mimoto's redirect after sign-in, which the workbench shares with Inji Web.
// Returns to the workbench if the sign-in started there (see
// signInToWallet); otherwise continues to Inji Web's passcode page. The ref
// stops StrictMode's repeated effect from redirecting twice.
export function WalletLoginReturn() {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fromWorkbench =
      sessionStorage.getItem(walletLoginKey) === "workbench";
    sessionStorage.removeItem(walletLoginKey);
    location.replace(fromWorkbench ? "/playground/" : "/user/passcode");
  }, []);
  return <p role="status">Returning to your wallet…</p>;
}
// Keycloak's redirect after the user authorizes issuance into the embedded
// wallet. The returned state must match the pending request that
// MimotoWalletPanel saved before leaving; the server then has Mimoto redeem
// the code and store the credential, and the browser returns to the
// workbench with the updated run.
export function WalletCallbackPage() {
  const started = useRef(false);
  const [error, setError] = useState<unknown>();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const select = useWorkspace((state) => state.selectRun);
  // Runs once, even under StrictMode, because an authorization code can be
  // redeemed only once. The query string is cleared from the address bar
  // straight away so the code does not stay in history, and the pending
  // request is removed whatever the outcome.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(location.search);
    history.replaceState(history.state, "", location.pathname);
    const complete = async () => {
      const pending = JSON.parse(
        sessionStorage.getItem(walletIssuanceKey) ?? "null",
      );
      sessionStorage.removeItem(walletIssuanceKey);
      if (!pending || pending.state !== params.get("state"))
        throw new Error(
          "The authorization response does not match this browser's issuance request.",
        );
      select(pending.runId);
      if (params.has("error"))
        throw new Error(
          "Issuance authorization was declined or failed. Return to the workbench to try again.",
        );
      if (!params.get("code"))
        throw new Error("The authorization response is missing its code.");
      const run = await mimotoApi.complete(
        pending.runId,
        pending.state,
        params.get("code")!,
      );
      cache.setQueryData(["run", run.id], run);
      await cache.invalidateQueries({ queryKey: ["runs"] });
      navigate("/", { replace: true });
    };
    void complete().catch(setError);
  }, [cache, navigate, select]);
  return (
    <div className="panel space-y-4 p-6">
      <h1 className="font-semibold">Receiving your credential</h1>
      {error ? (
        <>
          <ErrorNotice error={error} />
          <Link className="btn-secondary" to="/">
            Return to workbench
          </Link>
        </>
      ) : (
        <p role="status" className="text-sm text-slate-600">
          Mimoto is downloading and storing the credential in your Inji wallet…
        </p>
      )}
    </div>
  );
}
