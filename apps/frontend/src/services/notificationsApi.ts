import { api } from './api';

export type NotificationKind = 'order_assigned' | 'order_confirmed' | 'order_new';

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  orderId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: Notification[];
  unreadCount: number;
}

export const notificationsApi = {
  list: async (): Promise<NotificationList> => {
    const { data } = await api.get<NotificationList>('/notifications');
    return data;
  },
  markAllRead: async (): Promise<{ updated: number }> => {
    const { data } = await api.patch<{ updated: number }>('/notifications/read-all');
    return data;
  },
};
