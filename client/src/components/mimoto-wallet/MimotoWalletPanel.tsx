import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../api/PlaygroundApi";
import type { TestRun } from "../../models/playground";
import {
  mimotoApi,
  walletIssuanceKey,
  signInToWallet,
} from "../../services/mimoto-wallet/MimotoApi";
import { ErrorNotice } from "../ui";
import { WalletUnlock } from "./WalletUnlock";
import { WalletConsent } from "./WalletConsent";
export function MimotoWalletPanel({ run }: { run: TestRun }) {
  const secure =
    location.origin === new URL(run.environment.embeddedWalletUrl).origin;
  const [unlockedId, setWalletId] = useState("");
  const wallets = useQuery({
    queryKey: ["mimoto-wallets"],
    queryFn: mimotoApi.wallets,
    enabled: secure,
    retry: false,
  });
  const candidate = unlockedId || wallets.data?.[0]?.walletId;
  const credentials = useQuery({
    queryKey: ["mimoto-credentials", candidate],
    queryFn: () => mimotoApi.credentials(candidate!),
    enabled: secure && Boolean(candidate),
    retry: false,
  });
  const walletId = unlockedId || (credentials.isSuccess ? candidate : "");
  const authorize = useMutation({
    mutationFn: async () => {
      const { url } = await mimotoApi.authorize(run.id, walletId!);
      sessionStorage.setItem(
        walletIssuanceKey,
        JSON.stringify({
          runId: run.id,
          state: new URL(url).searchParams.get("state"),
        }),
      );
      location.assign(url);
    },
  });
  if (!secure)
    return (
      <a className="btn-primary" href={`${run.environment.embeddedWalletUrl}/`}>
        Continue in the secure workbench
      </a>
    );
  if (wallets.isPending)
    return <p role="status">Connecting to your Inji wallet…</p>;
  if (
    wallets.error instanceof ApiError &&
    [401, 403].includes(wallets.error.status)
  )
    return (
      <div className="my-6 space-y-4 rounded-xl bg-slate-50 p-6">
        <p className="text-sm text-slate-600">
          Sign in to your Inji wallet, or choose Register on the sign-in page to
          create an account. You’ll return here to set up or unlock your wallet.
        </p>
        <button className="btn-primary" onClick={signInToWallet}>
          Create account / Sign in
        </button>
      </div>
    );
  if (wallets.error)
    return (
      <>
        <ErrorNotice error={wallets.error} />
        <button
          className="btn-secondary"
          onClick={() => void wallets.refetch()}
        >
          Retry wallet connection
        </button>
      </>
    );
  if (candidate && credentials.isPending)
    return <p role="status">Checking wallet unlock status…</p>;
  const unlockRequired =
    credentials.error instanceof ApiError &&
    [401, 403, 423].includes(credentials.error.status);
  if (credentials.error && !unlockRequired)
    return (
      <>
        <ErrorNotice error={credentials.error} />
        <button
          className="btn-secondary"
          onClick={() => void credentials.refetch()}
        >
          Retry wallet connection
        </button>
      </>
    );
  return (
    <div className="my-6 space-y-4 rounded-xl bg-slate-50 p-6">
      {!walletId ? (
        <WalletUnlock wallets={wallets.data ?? []} onUnlocked={setWalletId} />
      ) : run.phase === "ISSUING" ? (
        <>
          <p className="text-sm text-slate-600">
            Your wallet is unlocked. Authorize issuance of{" "}
            <strong>{run.configuration.name}</strong>. Mimoto will receive and
            store it automatically.
          </p>
          <button
            className="btn-primary"
            disabled={authorize.isPending}
            onClick={() => authorize.mutate()}
          >
            {authorize.isPending
              ? "Preparing sign-in…"
              : "Authorize and receive credential"}
          </button>
          <ErrorNotice error={authorize.error} />
        </>
      ) : (
        <WalletConsent runId={run.id} />
      )}
      <button
        className="text-xs text-slate-500 underline"
        onClick={() => {
          setWalletId("");
          void wallets.refetch();
          void credentials.refetch();
        }}
      >
        Refresh wallet session
      </button>
    </div>
  );
}
