import { create } from "zustand";
// The run the user is looking at, shared by the workbench, inspector and
// history pages. Null means no explicit choice: useCurrentRun then follows
// the active run, if there is one.
interface Workspace {
  selectedRunId: string | null;
  selectRun: (id: string | null) => void;
}
export const useWorkspace = create<Workspace>((set) => ({
  selectedRunId: null,
  selectRun: (selectedRunId) => set({ selectedRunId }),
}));
