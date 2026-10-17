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
export function useCurrentRun() {
  const selected = useWorkspace((state) => state.selectedRunId);
  const runs = useRuns();
  const active = runs.data?.find((run) =>
    ["ISSUING", "HELD", "VERIFYING"].includes(run.phase),
  );
  const id = selected ?? active?.id;
  return useQuery({
    queryKey: ["run", id],
    queryFn: () => api.run(id!),
    enabled: Boolean(id),
    refetchInterval: id ? 4000 : false,
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
