import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, Plus, QrCode, Star, Trash2 } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  whatsappApi,
  type WhatsAppSession,
  type WhatsAppSessionStatus,
} from '@/services/whatsappApi';
import { automationApi } from '@/services/automationApi';
import { teamApi, type TeamUser } from '@/services/teamApi';
import { QrModal } from '../components/QrModal';

const STATUS_COLOR: Record<WhatsAppSessionStatus, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500',
  disconnected: 'bg-gray-400',
  error: 'bg-red-500',
};

const STATUS_LABEL: Record<WhatsAppSessionStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Disconnected',
  error: 'Error',
};

export function SessionsTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canConnect = hasPermission(PERMISSIONS.WHATSAPP_CONNECT);
  const canManage = hasPermission(PERMISSIONS.AUTOMATION_MANAGE);
  const pushToast = useToastStore((s) => s.push);

  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [systemSessionId, setSystemSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrSession, setQrSession] = useState<WhatsAppSession | null>(null);
  const [newUserId, setNewUserId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, sys] = await Promise.all([
        whatsappApi.list(),
        teamApi.listUsers({ isActive: true }),
        automationApi.getSystemSession(),
      ]);
      setSessions(s);
      setUsers(u);
      setSystemSessionId(sys.sessionId);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => void whatsappApi.list().then(setSessions).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  const systemSession = useMemo(
    () => sessions.find((s) => s.userId === null) ?? null,
    [sessions],
  );
  const agentSessions = useMemo(
    () => sessions.filter((s) => s.userId !== null),
    [sessions],
  );

  const usedUserIds = new Set(agentSessions.map((s) => s.userId!));
  const availableUsers = users.filter((u) => !usedUserIds.has(u.id));

  const createSession = async (userId: string | null) => {
    try {
      const created = await whatsappApi.create(userId);
      setSessions((list) => [...list, created]);
      setQrSession(created);
      setNewUserId('');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Unknown error';
      pushToast({ kind: 'error', title: 'Failed to create session', body: msg });
    }
  };

  const disconnect = async (s: WhatsAppSession) => {
    if (!window.confirm('Disconnect this session?')) return;
    try {
      await whatsappApi.disconnect(s.id);
      await load();
    } catch {
      pushToast({ kind: 'error', title: 'Failed to disconnect' });
    }
  };

  const remove = async (s: WhatsAppSession) => {
    if (!window.confirm('Delete this session permanently?')) return;
    try {
      await whatsappApi.remove(s.id);
      await load();
    } catch {
      pushToast({ kind: 'error', title: 'Failed to delete' });
    }
  };

  const setAsSystem = async (s: WhatsAppSession) => {
    try {
      await automationApi.setSystemSession(s.id);
      setSystemSessionId(s.id);
      pushToast({ kind: 'success', title: 'System sender updated' });
    } catch {
      pushToast({ kind: 'error', title: 'Failed to set system sender' });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassCard padding="md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Star size={14} className="text-amber-500" />
              System session
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Used for commission DMs and as a fallback when an agent is offline.
            </p>
          </div>
          {systemSession ? (
            <SessionRowActions
              session={systemSession}
              isSystem={true}
              canConnect={canConnect}
              canManage={canManage}
              onConnect={() => setQrSession(systemSession)}
              onDisconnect={() => disconnect(systemSession)}
              onRemove={() => remove(systemSession)}
              onSetSystem={() => setAsSystem(systemSession)}
            />
          ) : canConnect ? (
            <CRMButton
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => createSession(null)}
            >
              Create system session
            </CRMButton>
          ) : null}
        </div>

        {systemSession && (
          <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[systemSession.status]}`} />
            <span className="font-medium text-gray-700">
              {STATUS_LABEL[systemSession.status]}
            </span>
            <span className="text-gray-500">{systemSession.phoneNumber ?? '—'}</span>
          </div>
        )}

        {!systemSession && systemSessionId && (
          <p className="mt-3 text-xs text-amber-600">
            A system session was configured but no matching session exists. Commission messages
            will fail until you create one.
          </p>
        )}
      </GlassCard>

      <GlassCard padding="md">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Agent sessions</h3>
          {canConnect && availableUsers.length > 0 && (
            <div className="flex items-center gap-2">
              <CRMSelect
                value={newUserId}
                onChange={(v) => setNewUserId(Array.isArray(v) ? (v[0] ?? '') : v)}
                className="min-w-[200px]"
                options={[
                  { value: '', label: 'Pick agent…' },
                  ...availableUsers.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
              <CRMButton
                size="sm"
                leftIcon={<Plus size={14} />}
                disabled={!newUserId}
                onClick={() => newUserId && createSession(newUserId)}
              >
                Add
              </CRMButton>
            </div>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-btn border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Last heartbeat</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agentSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs text-gray-400">
                    No agent sessions yet.
                  </td>
                </tr>
              ) : (
                agentSessions.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {s.user?.name ?? '—'}
                      {systemSessionId === s.id && (
                        <span className="ml-2 rounded-badge bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          System
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{s.phoneNumber ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[s.status]}`} />
                        <span>{STATUS_LABEL[s.status]}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {s.lastHeartbeat ? new Date(s.lastHeartbeat).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <SessionRowActions
                        session={s}
                        isSystem={systemSessionId === s.id}
                        canConnect={canConnect}
                        canManage={canManage}
                        onConnect={() => setQrSession(s)}
                        onDisconnect={() => disconnect(s)}
                        onRemove={() => remove(s)}
                        onSetSystem={() => setAsSystem(s)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <QrModal
        open={!!qrSession}
        session={qrSession}
        onClose={() => setQrSession(null)}
        onConnected={() => void load()}
      />
    </div>
  );
}

function SessionRowActions({
  session,
  isSystem,
  canConnect,
  canManage,
  onConnect,
  onDisconnect,
  onRemove,
  onSetSystem,
}: {
  session: WhatsAppSession;
  isSystem: boolean;
  canConnect: boolean;
  canManage: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onSetSystem: () => void;
}) {
  return (
    <div className="flex justify-end gap-1.5">
      {session.status !== 'connected' && canConnect && (
        <CRMButton size="sm" variant="ghost" leftIcon={<QrCode size={13} />} onClick={onConnect}>
          Connect
        </CRMButton>
      )}
      {session.status === 'connected' && canConnect && (
        <CRMButton size="sm" variant="ghost" leftIcon={<LogOut size={13} />} onClick={onDisconnect}>
          Disconnect
        </CRMButton>
      )}
      {!isSystem && session.status === 'connected' && canManage && (
        <CRMButton size="sm" variant="ghost" leftIcon={<Star size={13} />} onClick={onSetSystem}>
          Set as system
        </CRMButton>
      )}
      {canConnect && (
        <button
          onClick={onRemove}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Delete session"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
