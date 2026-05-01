import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Plus, Power, Trash2, Eye } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { broadcastsApi, type BroadcastListRow } from '@/services/broadcastsApi';
import { getSocket } from '@/services/socket';

import { TeamTabs } from './components/TeamTabs';
import { BroadcastFormModal } from './components/BroadcastFormModal';
import { BroadcastDetailModal } from './components/BroadcastDetailModal';

export default function BroadcastsPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.BROADCASTS_MANAGE);

  const [rows, setRows] = useState<BroadcastListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await broadcastsApi.list();
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live tail — when any admin creates / closes a broadcast, refresh the
  // table so the active list reflects current state without a manual reload.
  // Refetch (not surgical) is fine here: broadcast rows are tiny and the
  // events fire rarely; a per-event surgical patch would add complexity for
  // negligible gain.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }
    const refresh = () => {
      void load();
    };
    socket.on('broadcast:new', refresh);
    socket.on('broadcast:closed', refresh);
    return () => {
      socket?.off('broadcast:new', refresh);
      socket?.off('broadcast:closed', refresh);
    };
  }, [load]);

  const handleDeactivate = async (id: string) => {
    if (!window.confirm(t('team.broadcasts.confirmDeactivate'))) return;
    setBusyId(id);
    try {
      await broadcastsApi.deactivate(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('team.broadcasts.confirmDeleteBody'))) return;
    setBusyId(id);
    try {
      await broadcastsApi.remove(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TeamTabs />

      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">
              {t('team.broadcasts.title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('team.broadcasts.subtitle')}
            </p>
          </div>
          {canManage && (
            <CRMButton leftIcon={<Plus size={14} />} onClick={() => setFormOpen(true)}>
              {t('team.broadcasts.new')}
            </CRMButton>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-card" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-gray-200 py-16 text-gray-400">
            <Megaphone size={28} className="text-gray-300" />
            <p className="text-sm">{t('team.broadcasts.historyEmpty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-gray-100 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">{t('team.broadcasts.colTitle')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.colKind')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.colStatus')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.colRecipients')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.colAcked')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.colClicked')}</th>
                  <th className="px-3 py-2">{t('team.broadcasts.colSent')}</th>
                  <th className="px-3 py-2 text-right">{t('team.broadcasts.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {r.imageUrl && (
                          <img
                            src={r.imageUrl}
                            alt=""
                            className="h-7 w-7 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-800">{r.title}</p>
                          {r.body && (
                            <p className="truncate text-[11px] text-gray-400">{r.body}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                          (r.kind === 'POPUP'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700')
                        }
                      >
                        {r.kind === 'POPUP'
                          ? t('team.broadcasts.kindBadgePopup')
                          : t('team.broadcasts.kindBadgeBar')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                          (r.isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-500')
                        }
                      >
                        {r.isActive
                          ? t('team.broadcasts.statusActive')
                          : t('team.broadcasts.statusInactive')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{r.recipientCount}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.ackedCount}/{r.recipientCount}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.clickedCount}
                      {r.totalClicks > r.clickedCount && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          ({r.totalClicks})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailId(r.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          title={t('team.broadcasts.view')}
                        >
                          <Eye size={14} />
                        </button>
                        {canManage && r.kind === 'BAR' && r.isActive && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => handleDeactivate(r.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                            title={t('team.broadcasts.actionDeactivate')}
                          >
                            <Power size={14} />
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => handleDelete(r.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
                            title={t('team.broadcasts.actionDelete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BroadcastFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSent={load}
      />
      <BroadcastDetailModal
        broadcastId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}
