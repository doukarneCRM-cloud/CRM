import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSocket } from '@/hooks/useSocket';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { unlockAudioOnFirstGesture } from '@/utils/sound';
import { Toaster } from '@/components/ui/Toaster';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  // Initiate & manage socket lifecycle for the entire authenticated session
  useSocket();
  // Play a sound when this user is assigned a new order
  useOrderNotifications();

  // Prime audio playback on the first user gesture (browsers block autoplay)
  useEffect(() => {
    unlockAudioOnFirstGesture();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar sidebarCollapsed={collapsed} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
