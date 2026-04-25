import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export function SessionsTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canConnect = hasPermission(PERMISSIONS.WHATSAPP_CONNECT);
  const canManage = hasPermission(PERMISSIONS.AUTOMATION_MANAGE);
  // Branch on automation:manage rather than whatsapp:view — agents are
  // commonly granted whatsapp:view so they can use the WhatsApp Inbox,
  // but we don't want that to bleed into showing them the system-session
  // card. Only users who can manage automation see the full admin view;
  // everyone else (including agents with inbox access) gets the focused
  // self-view below.
  const isAdminView = canManage;

  if (!isAdminView) {
    return <AgentSelfSessionView />;
  }

  return <AdminSessionsView canConnect={canConnect} canManage={canManage} />;
}

function AdminSessionsView({
  canConnect,
  canManage,
}: {
  canConnect: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation();
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
      const msg = err?.response?.data?.error?.message ?? err?.message ?? t('automation.sessions.unknownError');
      pushToast({ kind: 'error', title: t('automation.sessions.createFailed'), body: msg });
    }
  };

  const disconnect = async (s: WhatsAppSession) => {
    if (!window.confirm(t('automation.sessions.disconnectConfirm'))) return;
    try {
      await whatsappApi.disconnect(s.id);
      await load();
    } catch {
      pushToast({ kind: 'error', title: t('automation.sessions.disconnectFailed') });
    }
  };

  const remove = async (s: WhatsAppSession) => {
    if (!window.confirm(t('automation.sessions.deleteConfirm'))) return;
    try {
      await whatsappApi.remove(s.id);
      await load();
    } catch {
      pushToast({ kind: 'error', title: t('automation.sessions.deleteFailed') });
    }
  };

  const setAsSystem = async (s: WhatsAppSession) => {
    try {
      await automationApi.setSystemSession(s.id);
      setSystemSessionId(s.id);
      pushToast({ kind: 'success', title: t('automation.sessions.systemUpdated') });
    } catch {
      pushToast({ kind: 'error', title: t('automation.sessions.systemUpdateFailed') });
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
              {t('automation.sessions.systemSession')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {t('automation.sessions.systemSubtitle')}
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
              {t('automation.sessions.createSystemSession')}
            </CRMButton>
          ) : null}
        </div>

        {systemSession && (
          <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[systemSession.status]}`} />
            <span className="font-medium text-gray-700">
              {t(`automation.sessions.statusLabels.${systemSession.status}`)}
            </span>
            <span className="text-gray-500">{systemSession.phoneNumber ?? '—'}</span>
          </div>
        )}

        {!systemSession && systemSessionId && (
          <p className="mt-3 text-xs text-amber-600">
            {t('automation.sessions.systemMissing')}
          </p>
        )}
      </GlassCard>

      <GlassCard padding="md">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t('automation.sessions.agentSessions')}</h3>
          {canConnect && availableUsers.length > 0 && (
            <div className="flex items-center gap-2">
              <CRMSelect
                value={newUserId}
                onChange={(v) => setNewUserId(Array.isArray(v) ? (v[0] ?? '') : v)}
                className="min-w-[200px]"
                options={[
                  { value: '', label: t('automation.sessions.pickAgent') },
                  ...availableUsers.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
              <CRMButton
                size="sm"
                leftIcon={<Plus size={14} />}
                disabled={!newUserId}
                onClick={() => newUserId && createSession(newUserId)}
              >
                {t('automation.sessions.add')}
              </CRMButton>
            </div>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-btn border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">{t('automation.sessions.columns.agent')}</th>
                <th className="px-3 py-2 text-left">{t('automation.sessions.columns.phone')}</th>
                <th className="px-3 py-2 text-left">{t('automation.sessions.columns.status')}</th>
                <th className="px-3 py-2 text-left">{t('automation.sessions.columns.lastHeartbeat')}</th>
                <th className="px-3 py-2 text-right">{t('automation.sessions.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {agentSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs text-gray-400">
                    {t('automation.sessions.noAgentSessions')}
                  </td>
                </tr>
              ) : (
                agentSessions.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {s.user?.name ?? '—'}
                      {systemSessionId === s.id && (
                        <span className="ml-2 rounded-badge bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          {t('automation.sessions.systemBadge')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{s.phoneNumber ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[s.status]}`} />
                        <span>{t(`automation.sessions.statusLabels.${s.status}`)}</span>
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

// Focused self-view shown to agents who only have `whatsapp:connect`. They
// see one card with their personal session status and a single Connect /
// Disconnect button — no system session, no agent table, no roster.
function AgentSelfSessionView() {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrSession, setQrSession] = useState<WhatsAppSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await whatsappApi.getMine();
      setSession(s);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
      const msg =
        err?.response?.data?.error?.message ?? err?.message ?? t('automation.sessions.unknownError');
      pushToast({ kind: 'error', title: t('automation.sessions.loadFailed'), body: msg });
    } finally {
      setLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Light polling so the status badge follows reality without forcing a
  // manual refresh after the agent finishes the QR scan on their phone.
  useEffect(() => {
    const handle = setInterval(() => {
      void whatsappApi.getMine().then(setSession).catch(() => {});
    }, 5000);
    return () => clearInterval(handle);
  }, []);

  const disconnect = async () => {
    if (!session) return;
    if (!window.confirm(t('automation.sessions.disconnectConfirm'))) return;
    try {
      await whatsappApi.disconnect(session.id);
      await load();
    } catch {
      pushToast({ kind: 'error', title: t('automation.sessions.disconnectFailed') });
    }
  };

  if (loading) {
    return <div className="skeleton h-32 rounded-card" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassCard padding="md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('automation.sessions.mySessionTitle')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {t('automation.sessions.mySessionSubtitle')}
            </p>
          </div>
          {session && session.status !== 'connected' && (
            <CRMButton
              size="sm"
              leftIcon={<QrCode size={14} />}
              onClick={() => setQrSession(session)}
            >
              {t('automation.sessions.actions.connect')}
            </CRMButton>
          )}
          {session && session.status === 'connected' && (
            <CRMButton
              size="sm"
              variant="ghost"
              leftIcon={<LogOut size={14} />}
              onClick={disconnect}
            >
              {t('automation.sessions.actions.disconnect')}
            </CRMButton>
          )}
        </div>

        {session && (
          <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[session.status]}`} />
            <span className="font-medium text-gray-700">
              {t(`automation.sessions.statusLabels.${session.status}`)}
            </span>
            <span className="text-gray-500">{session.phoneNumber ?? '—'}</span>
          </div>
        )}
      </GlassCard>

      <QrModal
        open={!!qrSession}
        session={qrSession}
        onClose={() => setQrSession(null)}
        onConnected={() => {
          setQrSession(null);
          void load();
        }}
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
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-1.5">
      {session.status !== 'connected' && canConnect && (
        <CRMButton size="sm" variant="ghost" leftIcon={<QrCode size={13} />} onClick={onConnect}>
          {t('automation.sessions.actions.connect')}
        </CRMButton>
      )}
      {session.status === 'connected' && canConnect && (
        <CRMButton size="sm" variant="ghost" leftIcon={<LogOut size={13} />} onClick={onDisconnect}>
          {t('automation.sessions.actions.disconnect')}
        </CRMButton>
      )}
      {!isSystem && session.status === 'connected' && canManage && (
        <CRMButton size="sm" variant="ghost" leftIcon={<Star size={13} />} onClick={onSetSystem}>
          {t('automation.sessions.actions.setAsSystem')}
        </CRMButton>
      )}
      {canConnect && (
        <button
          onClick={onRemove}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
          aria-label={t('automation.sessions.actions.deleteSession')}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
