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

    // Fetch initial online users from REST
    api.get('/users/online').then((res) => {
      const ids: string[] = res.data.onlineUserIds ?? [];
      setUsers(ids.map((id) => ({ userId: id })));
    }).catch(() => {});

    socket.on('user:online', (data: { userId: string; name?: string; roleName?: string }) => {
      addUser({ userId: data.userId, name: data.name, roleName: data.roleName });
    });

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
