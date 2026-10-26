import {
  expiredConfigurationId,
  unsupportedDidConfigurationId,
  scenarioUnavailable,
} from "../../../../server/models/scenarios";
import type { ScenarioId } from "../../../../server/models/scenarios";
import { ScenarioSelector } from "./ScenarioSelector";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Cable } from "lucide-react";
import { api } from "../../api/PlaygroundApi";
import { useEnvironment } from "../../services/usePlayground";
import { useWorkspace } from "../../store/workspace";
import { formatName } from "../../services/presentation";
import { ErrorNotice, Loading } from "../ui";
import type { Wallet } from "../../models/playground";
export function FlowConfiguration({ blocked }: { blocked: boolean }) {
  const env = useEnvironment();
  const configured = Boolean(env.data?.certifyUrl && env.data?.issuerUrl);
  const discovery = useQuery({
    queryKey: ["issuer"],
    queryFn: api.discovery,
    enabled: configured,
    staleTime: 60000,
  });
  const [selectedWallet, setWallet] = useState<Wallet>();
  const wallet =
    selectedWallet ??
    (env.data?.embeddedWalletUrl
      ? "INJI_MIMOTO"
      : env.data?.webWalletUrl
        ? "INJI_WEB"
        : "INJI_MOBILE");
  const [configurationId, setConfiguration] = useState("");
  const [scenario, setScenario] = useState<ScenarioId>("NONE");
  const [offer, setOffer] = useState("");
  const select = useWorkspace((state) => state.selectRun);
  const client = useQueryClient();
  const start = useMutation({
    mutationFn: api.start,
    onSuccess: (run) => {
      select(run.id);
      setOffer("");
      client.setQueryData(["run", run.id], run);
      void client.invalidateQueries({ queryKey: ["runs"] });
    },
  });
  const options = (discovery.data?.configurations || []).filter(
    (item) =>
      ![expiredConfigurationId, unsupportedDidConfigurationId].includes(
        item.id,
      ),
  );
  const choice =
    options.find((item) => item.id === configurationId) ?? options[0];
  const scenarioError = choice
    ? scenarioUnavailable(
        scenario,
        wallet,
        choice.format,
        Boolean(
          discovery.data?.configurations.some(
            (item) => item.id === expiredConfigurationId,
          ),
        ),
        Boolean(
          discovery.data?.configurations.some(
            (item) => item.id === unsupportedDidConfigurationId,
          ),
        ),
      )
    : undefined;
  const mockUnsupported =
    wallet === "MOCK_WALLET" && choice?.format === "ldp_vc";
  const mimotoUnsupported =
    wallet === "INJI_MIMOTO" && choice?.format !== "ldp_vc";
  const needsSecureWorkbench =
    wallet === "INJI_MIMOTO" &&
    Boolean(env.data?.embeddedWalletUrl) &&
    location.origin !== new URL(env.data!.embeddedWalletUrl).origin;
  if (env.isPending) return <Loading />;
  if (env.error) return <ErrorNotice error={env.error} />;
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="font-semibold">Configure your flow</h2>
      </div>
      {!configured ? (
        <div className="flex flex-col items-start p-6">
          <Cable size={28} className="mb-4 text-teal-700" />
          <h3 className="text-lg font-semibold">
            The Inji stack is not ready yet
          </h3>
          <p className="mt-2 mb-6 text-sm leading-6 text-slate-500">
            Services are managed by the project setup. Once the stack is
            available, credential options will appear here.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={env.isFetching}
            onClick={() => void env.refetch()}
          >
            {env.isFetching ? "Checking…" : "Check again"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (
              choice &&
              !scenarioError &&
              !mockUnsupported &&
              !mimotoUnsupported &&
              !needsSecureWorkbench &&
              !blocked &&
              !start.isPending
            )
              start.mutate({
                wallet,
                scenario,
                configurationId: choice.id,
                offer: ["INJI_MIMOTO", "MOCK_WALLET"].includes(wallet)
                  ? ""
                  : offer,
              });
          }}
        >
          <fieldset
            disabled={start.isPending || blocked}
            className="space-y-6 p-6"
          >
            <p className="text-sm leading-6 text-slate-500">
              Choose a wallet and a credential advertised by your issuer.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Holder wallet
                <select
                  value={wallet}
                  onChange={(event) => setWallet(event.target.value as Wallet)}
                  className="field"
                >
                  {env.data?.embeddedWalletUrl && (
                    <option value="INJI_MIMOTO">
                      Inji wallet · in this page
                    </option>
                  )}
                  <option value="INJI_MOBILE">Inji Mobile</option>
                  <option value="INJI_WEB" disabled={!env.data?.webWalletUrl}>
                    Inji Web · external
                    {!env.data?.webWalletUrl ? " — URL required" : ""}
                  </option>
                  <option value="MOCK_WALLET">
                    Playground mock wallet · non-Inji
                  </option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Credential
                <select
                  value={choice?.id || ""}
                  onChange={(event) => setConfiguration(event.target.value)}
                  className="field"
                  disabled={discovery.isFetching || !options.length}
                >
                  <option value="" disabled>
                    {discovery.isFetching
                      ? "Discovering credentials…"
                      : "No supported credentials"}
                  </option>
                  {options.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatName(item.format)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {choice && (
              <ScenarioSelector
                value={scenario}
                onChange={setScenario}
                wallet={wallet}
                format={choice.format}
                fixtureAvailable={Boolean(
                  discovery.data?.configurations.some(
                    (item) => item.id === expiredConfigurationId,
                  ),
                )}
                didFixtureAvailable={Boolean(
                  discovery.data?.configurations.some(
                    (item) => item.id === unsupportedDidConfigurationId,
                  ),
                )}
              />
            )}
            {scenarioError && (
              <p className="text-sm text-amber-700">{scenarioError}</p>
            )}
            {mimotoUnsupported && (
              <p className="text-sm text-slate-600">
                This Mimoto release can present JSON-LD only. Choose a JSON-LD
                credential, or the mock wallet for SD-JWT.
              </p>
            )}
            {wallet === "INJI_WEB" && choice?.format !== "ldp_vc" && (
              <p className="text-sm text-slate-600">
                The pinned Inji Web can store SD-JWT but cannot present it. This
                combination is useful for diagnosing that limitation.
              </p>
            )}
            {mockUnsupported && (
              <p className="text-sm text-slate-600">
                The mock wallet supports SD-JWT credentials only. Choose an
                SD-JWT credential or another wallet.
              </p>
            )}
            {wallet === "INJI_MOBILE" && (
              <p className="text-sm text-slate-500">
                Your phone must be able to reach the configured Inji services.
                Use Inji Web when running only on this computer.
              </p>
            )}
            <ErrorNotice error={discovery.error} />
            {discovery.error && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void discovery.refetch()}
              >
                Retry discovery
              </button>
            )}
            {discovery.isSuccess && !options.length && (
              <p className="text-sm text-slate-600">
                The issuer does not advertise a JSON-LD or SD-JWT configuration
                supported by this adapter.
              </p>
            )}
            {!["INJI_MIMOTO", "MOCK_WALLET"].includes(wallet) && (
              <details className="rounded-lg border border-slate-200 p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Have a credential offer?{" "}
                  <span className="font-normal text-slate-500">Optional</span>
                </summary>
                <label className="mt-4 block text-xs text-slate-500">
                  Paste an offer URI or JSON supplied by your issuer
                  <textarea
                    value={offer}
                    onChange={(event) => setOffer(event.target.value)}
                    className="field min-h-28 font-mono"
                    placeholder="openid-credential-offer://…"
                    maxLength={16000}
                  />
                </label>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Otherwise, initiate the download from the selected Inji
                  wallet. The playground does not manufacture offers.
                </p>
              </details>
            )}
            <ErrorNotice error={start.error} />
            {blocked && (
              <p className="text-sm text-slate-600">
                Another run is active. Resume it before starting a new flow.
              </p>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 px-6 py-5">
            <span className="text-xs text-slate-500">
              {choice ? formatName(choice.format) : "Live Inji configuration"}
            </span>
            {needsSecureWorkbench ? (
              <a
                className="btn-primary"
                href={`${env.data!.embeddedWalletUrl}/`}
              >
                Continue in secure workbench
                <ArrowRight size={16} />
              </a>
            ) : (
              <button
                className="btn-primary"
                disabled={
                  start.isPending ||
                  !choice ||
                  blocked ||
                  Boolean(scenarioError) ||
                  mockUnsupported ||
                  mimotoUnsupported
                }
              >
                {start.isPending ? "Starting…" : "Start issuance"}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
