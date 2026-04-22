import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, CheckCircle2, Clock3, MoreHorizontal, Search, UserX } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { getSocket } from '@/services/socket';
import {
  whatsappApi,
  type InboxThread,
  type InboxMessage,
  type WhatsAppThreadStatus,
} from '@/services/whatsappApi';

const STATUS_OPTIONS: Array<{ value: WhatsAppThreadStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'snoozed', label: 'Snoozed' },
  { value: 'closed', label: 'Closed' },
];

export function InboxTab() {
  const user = useAuthStore((s) => s.user);
  const pushToast = useToastStore((s) => s.push);
  const roleName = (user?.role?.name ?? '').toLowerCase();
  const isAdmin = roleName === 'admin' || roleName === 'supervisor';

  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine');
  const [statusFilter, setStatusFilter] = useState<WhatsAppThreadStatus | 'all'>('open');
  const [search, setSearch] = useState('');

  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const rows = await whatsappApi.inbox.listThreads({
        scope,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setThreads(rows);
      if (!activeId && rows.length > 0) setActiveId(rows[0].id);
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: 'Failed to load threads' });
    } finally {
      setLoadingThreads(false);
    }
  }, [scope, statusFilter, activeId, pushToast]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const refreshMessages = useCallback(
    async (id: string) => {
      setLoadingMessages(true);
      try {
        const rows = await whatsappApi.inbox.listMessages(id);
        setMessages(rows);
        await whatsappApi.inbox.markRead(id);
      } catch (err) {
        console.error(err);
        pushToast({ kind: 'error', title: 'Failed to load messages' });
      } finally {
        setLoadingMessages(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    if (!activeId) return;
    void refreshMessages(activeId);
  }, [activeId, refreshMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    const socket = getSocket();
    const onInbound = (payload: { thread: InboxThread; message: InboxMessage }) => {
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === payload.thread.id);
        if (idx === -1) return [payload.thread, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...payload.thread };
        return next.sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
        );
      });
      if (payload.thread.id === activeId) {
        setMessages((prev) => [...prev, payload.message]);
        void whatsappApi.inbox.markRead(payload.thread.id);
      }
    };
    socket.on('whatsapp:inbound', onInbound);
    return () => {
      socket.off('whatsapp:inbound', onInbound);
    };
  }, [activeId]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      const name = t.customer?.fullName?.toLowerCase() ?? '';
      const phone = (t.customer?.phoneDisplay ?? t.customerPhone).toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [threads, search]);

  const handleSend = async () => {
    if (!activeThread || !composer.trim()) return;
    setSending(true);
    try {
      await whatsappApi.inbox.reply(activeThread.id, composer.trim());
      setComposer('');
      await refreshMessages(activeThread.id);
      pushToast({ kind: 'success', title: 'Message queued' });
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: 'Send failed' });
    } finally {
      setSending(false);
    }
  };

  const handleStatus = async (status: WhatsAppThreadStatus) => {
    if (!activeThread) return;
    try {
      await whatsappApi.inbox.updateThread(activeThread.id, { status });
      await refreshThreads();
      pushToast({ kind: 'success', title: `Marked ${status}` });
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: 'Update failed' });
    }
  };

  return (
    <div className="grid h-[calc(100vh-220px)] grid-cols-[340px_1fr] gap-4">
      {/* ── Left: thread list ────────────────────────────────────────── */}
      <GlassCard padding="none" className="flex flex-col overflow-hidden">
        <div className="border-b border-gray-100 p-3">
          <div className="mb-2 flex items-center gap-2">
            {isAdmin && (
              <div className="flex overflow-hidden rounded-btn border border-gray-200 text-xs">
                <button
                  onClick={() => setScope('mine')}
                  style={
                    scope === 'mine'
                      ? { backgroundColor: '#3C2515', color: '#fff' }
                      : { backgroundColor: 'transparent', color: '#6b7280' }
                  }
                  className="px-3 py-1 font-semibold"
                >
                  Mine
                </button>
                <button
                  onClick={() => setScope('all')}
                  style={
                    scope === 'all'
                      ? { backgroundColor: '#3C2515', color: '#fff' }
                      : { backgroundColor: 'transparent', color: '#6b7280' }
                  }
                  className="px-3 py-1 font-semibold"
                >
                  All
                </button>
              </div>
            )}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WhatsAppThreadStatus | 'all')}
              className="flex-1 rounded-btn border border-gray-200 bg-white px-2 py-1 text-xs"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              className="w-full rounded-btn border border-gray-200 bg-white py-1.5 pl-7 pr-2 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <div className="p-4 text-sm text-gray-500">Loading…</div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No conversations yet.</div>
          ) : (
            filteredThreads.map((t) => {
              const last = t.messages?.[0];
              const active = t.id === activeId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`flex w-full flex-col gap-0.5 border-b border-gray-100 p-3 text-left transition-colors ${
                    active ? 'bg-primary/5' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-semibold text-primary">
                      {t.customer?.fullName ?? t.customerPhone}
                    </span>
                    {t.unreadCount > 0 && (
                      <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="truncate">
                      {last
                        ? `${last.direction === 'in' ? '← ' : '→ '}${last.body.slice(0, 50)}`
                        : t.customer?.phoneDisplay ?? t.customerPhone}
                    </span>
                    <span className="shrink-0">{formatRelative(t.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    {t.customer?.city && <span>{t.customer.city}</span>}
                    {t.customer?.whatsappOptOut && (
                      <span className="flex items-center gap-0.5 text-red-500">
                        <UserX size={9} /> opted out
                      </span>
                    )}
                    {t.assignedAgent && <span>· {t.assignedAgent.name}</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </GlassCard>

      {/* ── Right: thread view ───────────────────────────────────────── */}
      <GlassCard padding="none" className="flex flex-col overflow-hidden">
        {!activeThread ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-100 p-3">
              <div>
                <div className="text-sm font-semibold text-primary">
                  {activeThread.customer?.fullName ?? activeThread.customerPhone}
                </div>
                <div className="text-xs text-gray-500">
                  {activeThread.customer?.phoneDisplay ?? activeThread.customerPhone}
                  {activeThread.customer?.city ? ` · ${activeThread.customer.city}` : ''}
                  {activeThread.assignedAgent ? ` · ${activeThread.assignedAgent.name}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleStatus('snoozed')}
                  className="rounded-btn p-1.5 text-gray-500 hover:bg-gray-100"
                  title="Snooze"
                >
                  <Clock3 size={14} />
                </button>
                <button
                  onClick={() => handleStatus('closed')}
                  className="rounded-btn p-1.5 text-gray-500 hover:bg-gray-100"
                  title="Close"
                >
                  <CheckCircle2 size={14} />
                </button>
                <button className="rounded-btn p-1.5 text-gray-500 hover:bg-gray-100">
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 p-4">
              {loadingMessages ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-gray-500">No messages in this conversation yet.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-3">
              {activeThread.customer?.whatsappOptOut && (
                <div className="mb-2 rounded-btn bg-red-50 p-2 text-xs text-red-700">
                  This customer opted out of WhatsApp. Replies are blocked.
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={!!activeThread.customer?.whatsappOptOut}
                  placeholder="Write a reply… (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  className="flex-1 resize-none rounded-btn border border-gray-200 bg-white p-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                />
                <CRMButton
                  onClick={handleSend}
                  disabled={!composer.trim() || sending || !!activeThread.customer?.whatsappOptOut}
                >
                  <Send size={14} />
                  Send
                </CRMButton>
              </div>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}

function MessageBubble({ message }: { message: InboxMessage }) {
  const out = message.direction === 'out';
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-card px-3 py-2 text-sm shadow-sm ${
          out ? 'bg-primary text-white' : 'bg-white text-gray-800'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.body}</div>
        <div className={`mt-1 flex items-center gap-1 text-[10px] ${out ? 'text-white/70' : 'text-gray-500'}`}>
          {message.author?.name && <span>{message.author.name} · </span>}
          <span>{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}
