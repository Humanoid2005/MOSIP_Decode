import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/PlaygroundApi";
import { useWorkspace } from "../store/workspace";
// Run summaries for the history page, the inspector's run picker and
// active-run detection. Polls every five seconds as a fallback for the
// WebSocket notifications handled in useTelemetry.
export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: api.runs,
    refetchInterval: 5000,
  });
}
// The server's stack settings. They are fixed when the server starts, so the
// result never goes stale on its own.
export function useEnvironment() {
  return useQuery({
    queryKey: ["environment"],
    queryFn: api.environment,
    staleTime: Infinity,
  });
}
const finishedPhases = ["COMPLETED", "FAILED", "CANCELLED"];
// The run shown on the workbench and in the inspector: the user's selection,
// otherwise the run in progress. It polls every four seconds until the run
// finishes; WebSocket notifications refresh it sooner.
export function useCurrentRun() {
  const selected = useWorkspace((state) => state.selectedRunId);
  const select = useWorkspace((state) => state.selectRun);
  const runs = useRuns();
  const activeId = runs.data?.find((run) =>
    ["ISSUING", "HELD", "VERIFYING"].includes(run.phase),
  )?.id;
  // Pin the active run so its result stays on screen after it finishes.
  useEffect(() => {
    if (!selected && activeId) select(activeId);
  }, [selected, activeId, select]);
  const id = selected ?? activeId;
  return useQuery({
    queryKey: ["run", id],
    queryFn: () => api.run(id!),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      finishedPhases.includes(query.state.data?.phase ?? "") ? false : 4000,
  });
}
// Posts a run action and writes the returned run straight into the cache, so
// the stage updates without waiting for the next poll.
export function useRunAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "holder" | "cancel" | "presentation" | "refresh";
    }) => api.action(id, action),
    onSuccess: (run) => {
      client.setQueryData(["run", run.id], run);
      void client.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}
