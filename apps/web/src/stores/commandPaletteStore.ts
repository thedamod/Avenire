"use client";

import { create } from "zustand";

export interface CommandPaletteFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  readOnly?: boolean;
}

export interface CommandPaletteFileNode {
  id: string;
  name: string;
  folderId: string;
  readOnly?: boolean;
}

interface CommandPaletteState {
  workspaceUuid: string | null;
  folders: CommandPaletteFolderNode[];
  files: CommandPaletteFileNode[];
}

const INITIAL_STATE: CommandPaletteState = {
  workspaceUuid: null,
  folders: [],
  files: [],
};

export const useCommandPaletteStore = create<CommandPaletteState>()(() => ({
  ...INITIAL_STATE,
}));

export const commandPaletteActions = {
  setFileIndex: (next: CommandPaletteState) =>
    useCommandPaletteStore.setState({
      workspaceUuid: next.workspaceUuid,
      folders: next.folders,
      files: next.files,
    }),
  reset: () => useCommandPaletteStore.setState({ ...INITIAL_STATE }),
};
