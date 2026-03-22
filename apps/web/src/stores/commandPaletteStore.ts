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
  fileOpen: boolean;
  generalOpen: boolean;
  workspaceUuid: string | null;
  folders: CommandPaletteFolderNode[];
  files: CommandPaletteFileNode[];
}

const INITIAL_STATE: CommandPaletteState = {
  fileOpen: false,
  generalOpen: false,
  workspaceUuid: null,
  folders: [],
  files: [],
};

export const useCommandPaletteStore = create<CommandPaletteState>()(() => ({
  ...INITIAL_STATE,
}));

export const commandPaletteActions = {
  openFiles: () =>
    useCommandPaletteStore.setState({
      fileOpen: true,
      generalOpen: false,
    }),
  openGeneral: () =>
    useCommandPaletteStore.setState({
      fileOpen: false,
      generalOpen: true,
    }),
  setFileIndex: (next: CommandPaletteState) =>
    useCommandPaletteStore.setState((state) => ({
      ...state,
      workspaceUuid: next.workspaceUuid,
      folders: next.folders,
      files: next.files,
    })),
  close: () =>
    useCommandPaletteStore.setState({
      fileOpen: false,
      generalOpen: false,
    }),
  reset: () => useCommandPaletteStore.setState({ ...INITIAL_STATE }),
};
