import { create } from 'zustand';

interface OnlineUser {
  userId: string;
  name?: string;
  avatarUrl?: string | null;
  roleName?: string;
}

interface OnlineState {
  onlineUsers: Map<string, OnlineUser>;
  addUser: (user: OnlineUser) => void;
  removeUser: (userId: string) => void;
  setUsers: (users: OnlineUser[]) => void;
  getCount: () => number;
}

export const useOnlineStore = create<OnlineState>((set, get) => ({
  onlineUsers: new Map(),

  addUser: (user) =>
    set((state) => {
      const next = new Map(state.onlineUsers);
      next.set(user.userId, user);
      return { onlineUsers: next };
    }),

  removeUser: (userId) =>
    set((state) => {
      const next = new Map(state.onlineUsers);
      next.delete(userId);
      return { onlineUsers: next };
    }),

  setUsers: (users) =>
    set({ onlineUsers: new Map(users.map((u) => [u.userId, u])) }),

  getCount: () => get().onlineUsers.size,
}));
