import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScenarioId } from "../../../../server/models/scenarios";
import {
  expiredConfigurationId,
  unsupportedDidConfigurationId,
  scenarioUnavailable,
} from "../../../../server/models/scenarios";
import type { TestRun } from "../../models/playground";
import { api } from "../../api/PlaygroundApi";
import { useWorkspace } from "../../store/workspace";
import { ErrorNotice } from "../ui";
import { ScenarioSelector } from "./ScenarioSelector";

// "Rerun with a scenario" on a finished run: starts a new run with the same
// wallet and credential, fresh issuance and the chosen scenario, linked to
// this run as its parent. The original run stays in history.
export function ReplayPanel({ run }: { run: TestRun }) {
  const [scenario, setScenario] = useState<ScenarioId>("BAD_SIGNATURE");
  const issuer = useQuery({
    queryKey: ["issuer"],
    queryFn: api.discovery,
    staleTime: 60000,
  });
  const client = useQueryClient();
  const select = useWorkspace((state) => state.selectRun);
  const didAvailable = Boolean(
    issuer.data?.configurations.some(
      (item) => item.id === unsupportedDidConfigurationId,
    ),
  );
  const available = Boolean(
    issuer.data?.configurations.some(
      (item) => item.id === expiredConfigurationId,
    ),
  );
  // A fixture configuration may only be used by its own scenario, so a run
  // that used one is rerun from the base FarmerCredential. The server switches
  // back to the fixture when the chosen scenario needs it.
  const configurationId = [
    expiredConfigurationId,
    unsupportedDidConfigurationId,
  ].includes(run.configuration.id)
    ? "FarmerCredential"
    : run.configuration.id;
  const replay = useMutation({
    mutationFn: () =>
      api.start({
        wallet: run.wallet,
        configurationId,
        scenario,
        offer: "",
        parentRunId: run.id,
      }),
    onSuccess: (next) => {
      select(next.id);
      client.setQueryData(["run", next.id], next);
      void client.invalidateQueries({ queryKey: ["runs"] });
    },
  });
  return (
    <details className="rounded-lg border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Rerun with a scenario
      </summary>
      <div className="mt-4 space-y-4">
        <ScenarioSelector
          value={scenario}
          onChange={setScenario}
          wallet={run.wallet}
          format={run.configuration.format}
          fixtureAvailable={available}
          didFixtureAvailable={didAvailable}
        />
        <p className="text-xs leading-5 text-slate-500">
          Creates a linked run with fresh issuance and a new presentation
          request. The original run stays available in history.
        </p>
        <ErrorNotice error={replay.error} />
        <button
          className="btn-secondary"
          disabled={
            replay.isPending ||
            Boolean(
              scenarioUnavailable(
                scenario,
                run.wallet,
                run.configuration.format,
                available,
                didAvailable,
              ),
            )
          }
          onClick={() => replay.mutate()}
        >
          {replay.isPending ? "Starting…" : "Start new run"}
        </button>
      </div>
    </details>
  );
}
