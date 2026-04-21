import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useSocket } from '@/hooks/useSocket';
import { useOrderNotifications } from '@/hooks/useOrderNotifications';
import { unlockAudioOnFirstGesture } from '@/utils/sound';
import { Toaster } from '@/components/ui/Toaster';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  useSocket();
  useOrderNotifications();

  useEffect(() => {
    unlockAudioOnFirstGesture();
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-bg">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          sidebarCollapsed={collapsed}
          onMobileMenuOpen={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto px-3 py-2 sm:px-4 sm:py-3 lg:px-5 lg:py-3">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
