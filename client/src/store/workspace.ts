import { create } from "zustand";
interface Workspace {
  selectedRunId: string | null;
  selectRun: (id: string | null) => void;
}
export const useWorkspace = create<Workspace>((set) => ({
  selectedRunId: null,
  selectRun: (selectedRunId) => set({ selectedRunId }),
}));
