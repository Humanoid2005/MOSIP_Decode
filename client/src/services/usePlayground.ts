import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/PlaygroundApi";
import { useWorkspace } from "../store/workspace";
export function useRuns() {
  return useQuery({
    queryKey: ["runs"],
    queryFn: api.runs,
    refetchInterval: 5000,
  });
}
export function useEnvironment() {
  return useQuery({
    queryKey: ["environment"],
    queryFn: api.environment,
    staleTime: Infinity,
  });
}
const finishedPhases = ["COMPLETED", "FAILED", "CANCELLED"];
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
