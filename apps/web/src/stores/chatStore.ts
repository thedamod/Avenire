"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface ChatThread {
  createdAt: string;
  id: string;
  pinned: boolean;
  title: string;
  updatedAt: string;
}

interface ChatStore {
  activeChatId: string | null;
  chats: ChatThread[];
  createChat: (title?: string) => string;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  setActiveChat: (id: string) => void;
  togglePinned: (id: string) => void;
  touchChat: (id: string) => void;
}

const nowIso = () => new Date().toISOString();

const createThread = (title?: string): ChatThread => {
  const now = nowIso();
  return {
    id: crypto.randomUUID(),
    title: title?.trim() || "New Method",
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
};

const initialThread = createThread("New Method");

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      chats: [initialThread],
      activeChatId: initialThread.id,
      createChat: (title) => {
        const nextThread = createThread(title);
        set((state) => ({
          chats: [nextThread, ...state.chats],
          activeChatId: nextThread.id,
        }));
        return nextThread.id;
      },
      setActiveChat: (id) => {
        const exists = get().chats.some((chat) => chat.id === id);
        if (!exists) {
          return;
        }
        set({ activeChatId: id });
      },
      renameChat: (id, title) => {
        const cleanTitle = title.trim();
        if (!cleanTitle) {
          return;
        }
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id
              ? { ...chat, title: cleanTitle, updatedAt: nowIso() }
              : chat,
          ),
        }));
      },
      deleteChat: (id) => {
        set((state) => {
          const nextChats = state.chats.filter((chat) => chat.id !== id);
          if (nextChats.length === 0) {
            const fallback = createThread("New Method");
            return { chats: [fallback], activeChatId: fallback.id };
          }

          const nextActiveChatId =
            state.activeChatId === id
              ? (nextChats[0]?.id ?? null)
              : state.activeChatId;

          return {
            chats: nextChats,
            activeChatId: nextActiveChatId,
          };
        });
      },
      togglePinned: (id) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id
              ? { ...chat, pinned: !chat.pinned, updatedAt: nowIso() }
              : chat,
          ),
        }));
      },
      touchChat: (id) => {
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === id ? { ...chat, updatedAt: nowIso() } : chat,
          ),
        }));
      },
    }),
    {
      name: "dashboard-chats",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
      }),
    },
  ),
);
