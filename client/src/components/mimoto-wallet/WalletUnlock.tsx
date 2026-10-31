import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InjiWallet } from "../../models/mimoto";
import { mimotoApi } from "../../services/mimoto-wallet/MimotoApi";
import { ErrorNotice } from "../ui";
export function WalletUnlock({
  wallets,
  onUnlocked,
}: {
  wallets: InjiWallet[];
  onUnlocked: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const walletId = selected || wallets[0]?.walletId;
  const queryClient = useQueryClient();
  const unlock = useMutation({
    mutationFn: async () => {
      const value = pin;
      const confirmed = confirmation;
      setPin("");
      setConfirmation("");
      const wallet = walletId
        ? await mimotoApi.unlock(walletId, value)
        : await mimotoApi.create(value, confirmed);
      if (!walletId) await mimotoApi.unlock(wallet.walletId, value);
      return wallet.walletId;
    },
    onSuccess: onUnlocked,
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: ["mimoto-wallets"] }),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        unlock.mutate();
      }}
    >
      <p className="text-sm text-slate-600">
        {walletId
          ? "Unlock your Inji wallet to issue and share credentials here."
          : "Create your Inji wallet. Mimoto encrypts and stores your credentials."}
      </p>
      {wallets.length > 1 && (
        <label className="block text-sm">
          Wallet
          <select
            className="field"
            value={walletId}
            onChange={(event) => setSelected(event.target.value)}
          >
            {wallets.map((wallet) => (
              <option key={wallet.walletId} value={wallet.walletId}>
                {wallet.walletName}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        Six-digit wallet PIN
        <input
          className="field"
          type="password"
          inputMode="numeric"
          autoComplete={walletId ? "current-password" : "new-password"}
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          value={pin}
          onChange={(event) => setPin(event.target.value)}
        />
      </label>
      {!walletId && (
        <label className="block text-sm">
          Confirm PIN
          <input
            className="field"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
      )}
      <button
        className="btn-primary"
        disabled={
          unlock.isPending ||
          pin.length !== 6 ||
          (!walletId && pin !== confirmation)
        }
      >
        {unlock.isPending
          ? "Unlocking…"
          : walletId
            ? "Unlock wallet"
            : "Create wallet"}
      </button>
      <ErrorNotice error={unlock.error} />
    </form>
  );
}
