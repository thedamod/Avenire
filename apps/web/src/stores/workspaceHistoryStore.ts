"use client";

import { create } from "zustand";

interface WorkspaceHistoryState {
  entries: string[];
  index: number;
  recordRoute: (route: string) => void;
}

export const useWorkspaceHistoryStore = create<WorkspaceHistoryState>()(
  (set) => ({
    entries: [],
    index: -1,
    recordRoute: (route) =>
      set((state) => {
        if (!route) {
          return state;
        }
        if (state.index >= 0 && state.entries[state.index] === route) {
          return state;
        }
        if (state.index > 0 && state.entries[state.index - 1] === route) {
          return {
            entries: state.entries,
            index: state.index - 1,
          };
        }
        if (
          state.index >= 0 &&
          state.index < state.entries.length - 1 &&
          state.entries[state.index + 1] === route
        ) {
          return {
            entries: state.entries,
            index: state.index + 1,
          };
        }
        const nextEntries = [...state.entries.slice(0, state.index + 1), route];
        return {
          entries: nextEntries,
          index: nextEntries.length - 1,
        };
      }),
  })
);
