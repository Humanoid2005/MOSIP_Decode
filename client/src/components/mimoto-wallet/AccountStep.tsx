import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, UserRound } from "lucide-react";
import { ApiError } from "../../api/PlaygroundApi";
import { useEnvironment } from "../../services/usePlayground";
import { mimotoApi, signInToWallet } from "../../services/mimoto-wallet/MimotoApi";
import { ErrorNotice } from "../ui";

// Optional step 0 on the workbench: sign in to, or register, the Inji account
// behind the embedded wallet before starting a flow. Hidden when no embedded
// wallet is configured. Mimoto's session cookie exists only on the secure
// workbench origin, so on any other origin it links there instead.
export function AccountStep() {
  const environment = useEnvironment();
  const url = environment.data?.embeddedWalletUrl;
  const secure = Boolean(url && location.origin === new URL(url).origin);
  const [skipped, setSkipped] = useState(false);
  // Listing wallets doubles as the sign-in check: 401 or 403 means there is no
  // Mimoto session. The query is shared with MimotoWalletPanel.
  const session = useQuery({
    queryKey: ["mimoto-wallets"],
    queryFn: mimotoApi.wallets,
    enabled: secure,
    retry: false,
  });
  const signedOut = session.error instanceof ApiError &&
    [401, 403].includes(session.error.status);
  if (!url) return null;
  return (
    <section className="panel mb-6 p-5" aria-labelledby="account-step-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="account-step-title" className="flex items-center gap-2 text-sm font-semibold">
          {session.isSuccess ? <Check size={18} className="text-teal-700" /> : <UserRound size={18} />}
          Step 0 · {session.isSuccess ? "Signed in" : "Create account / Sign in"}
          {!session.isSuccess && <span className="font-normal text-slate-500">Optional</span>}
        </h2>
        {skipped && !session.isSuccess && (
          <button className="text-sm text-teal-800 underline" onClick={() => setSkipped(false)}>
            Set up account
          </button>
        )}
      </div>
      {session.isSuccess ? (
        <p className="mt-2 text-sm text-slate-500">
          Your Inji account is connected. Continue with the three steps below.
        </p>
      ) : !skipped && (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-6 text-slate-600">
            Use your own account. Choose Register on the sign-in page to create one,
            then return here. You can also sign in during issuance.
          </p>
          <p className="text-xs leading-5 text-slate-500">
            Your first issuance creates a fictional farmer record linked to your account.
            Demo credentials do not certify your real identity, land or eligibility.
            Your wallet PIN is set separately after sign-in.
          </p>
          {!secure ? (
            <a className="btn-primary" href={`${url}/`}>Open secure workbench</a>
          ) : session.isPending ? (
            <p role="status" className="text-sm text-slate-500">Checking sign-in…</p>
          ) : signedOut ? (
            <button className="btn-primary" onClick={signInToWallet}>Create account / Sign in</button>
          ) : (
            <>
              <ErrorNotice error={session.error} />
              <button className="btn-secondary" onClick={() => void session.refetch()}>Retry account connection</button>
            </>
          )}
          <button className="ml-3 text-sm text-slate-500 underline" onClick={() => setSkipped(true)}>
            Skip for now
          </button>
        </div>
      )}
    </section>
  );
}
