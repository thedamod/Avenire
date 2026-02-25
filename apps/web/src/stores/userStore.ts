"use client";

import { getSession } from "@avenire/auth/client";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  username?: string | null;
}

interface UserState {
  user: User | null;
  isPending: boolean;
  error: string | null;
}

interface UserActions {
  setUser: (user: User | null) => void;
  clearUser: () => void;
  fetchUser: () => Promise<void>;
}

type UserStore = UserState & UserActions;

const initialState: UserState = {
  user: null,
  isPending: true,
  error: null
};

export const useUserStore = create<UserStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setUser: (user) => set({ user }),
      clearUser: () => set(initialState),
      fetchUser: async () => {
        set({ isPending: true, error: null });
        try {
          const { data, error } = await getSession();
          if (error || !data?.user) {
            set({ user: null, error: error?.message ?? "No active session", isPending: false });
            return;
          }
          set({ user: data.user as User, isPending: false, error: null });
        } catch {
          set({ user: null, error: "Failed to fetch session", isPending: false });
        }
      }
    }),
    { name: "user-store" }
  )
);
