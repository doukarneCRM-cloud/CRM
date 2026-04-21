import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useOnlineStore } from '@/store/onlineStore';
import { api } from '@/services/api';

/**
 * Call once in AppLayout. Manages socket lifecycle tied to auth state.
 * Sets up listeners for user:online / user:offline events.
 */
export function useSocket() {
  const { isAuthenticated } = useAuthStore();
  const { addUser, removeUser, setUsers } = useOnlineStore();

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket();

    // Fetch initial online users from REST. Prefer the `users` array (name +
    // avatar + role), fall back to raw ids for older backends.
    api.get('/users/online').then((res) => {
      const hydrated: Array<{
        userId: string;
        name?: string;
        avatarUrl?: string | null;
        roleName?: string;
      }> =
        res.data.users ??
        (res.data.onlineUserIds ?? []).map((id: string) => ({ userId: id }));
      setUsers(hydrated);
    }).catch(() => {});

    socket.on(
      'user:online',
      (data: { userId: string; name?: string; avatarUrl?: string | null; roleName?: string }) => {
        addUser({
          userId: data.userId,
          name: data.name,
          avatarUrl: data.avatarUrl,
          roleName: data.roleName,
        });
      },
    );

    socket.on('user:offline', (data: { userId: string }) => {
      removeUser(data.userId);
    });

    return () => {
      socket.off('user:online');
      socket.off('user:offline');
      // Don't disconnect on cleanup — socket persists across re-renders
    };
  }, [isAuthenticated, addUser, removeUser, setUsers]);
}
