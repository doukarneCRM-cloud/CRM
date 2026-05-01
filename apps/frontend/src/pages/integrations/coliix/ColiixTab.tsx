import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, MapPin, Tag, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { coliixApi } from '@/services/coliixApi';
import { getSocket } from '@/services/socket';
import { SetupTab } from './SetupTab';
import { CitiesTab } from './CitiesTab';
import { MappingsTab } from './MappingsTab';
import { ErrorsTab } from './ErrorsTab';

type SubTabId = 'setup' | 'cities' | 'mappings' | 'errors';

export function ColiixTab() {
  const { t } = useTranslation();
  const [active, setActive] = useState<SubTabId>('setup');
  // The Errors sub-tab shows a red dot when any unresolved error exists.
  // Initial value comes from the count endpoint; after that we tick locally
  // off `coliix:error` (increment) and our own resolve flow (decrement) so
  // the badge stays live without polling.
  const [unresolved, setUnresolved] = useState(0);

  useEffect(() => {
    let cancelled = false;
    coliixApi
      .unresolvedCount()
      .then((c) => {
        if (!cancelled) setUnresolved(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick on every new unresolved error. `coliix:error` ships the full row
  // inline (see ErrorsTab) so we know whether it's already resolved.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }
    const onError = (payload: unknown) => {
      const resolved = (payload as { resolved?: boolean })?.resolved ?? false;
      if (!resolved) setUnresolved((n) => n + 1);
    };
    const onResolved = () => {
      setUnresolved((n) => Math.max(0, n - 1));
    };
    socket.on('coliix:error', onError);
    socket.on('coliix:error:resolved', onResolved);
    return () => {
      socket?.off('coliix:error', onError);
      socket?.off('coliix:error:resolved', onResolved);
    };
  }, []);

  const tabs = useMemo(
    () => [
      { id: 'setup' as const,    label: t('coliix.tabs.setup'),    icon: Settings },
      { id: 'cities' as const,   label: t('coliix.tabs.cities'),   icon: MapPin },
      { id: 'mappings' as const, label: t('coliix.tabs.mappings'), icon: Tag },
      { id: 'errors' as const,   label: t('coliix.tabs.errors'),   icon: AlertTriangle, badge: unresolved },
    ],
    [t, unresolved],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 rounded-card border border-gray-100 bg-white p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-semibold transition-all',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-500 hover:bg-accent hover:text-primary',
              )}
            >
              <Icon size={13} />
              {tab.label}
              {'badge' in tab && tab.badge && tab.badge > 0 ? (
                <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {active === 'setup' && <SetupTab />}
      {active === 'cities' && <CitiesTab />}
      {active === 'mappings' && <MappingsTab />}
      {active === 'errors' && <ErrorsTab />}
    </div>
  );
}
