import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, CheckCircle2, Clock3, Search, UserX, Check, CheckCheck, FileText, Download } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { getSocket } from '@/services/socket';
import { resolveImageUrl } from '@/lib/imageUrl';
import {
  whatsappApi,
  type InboxThread,
  type InboxMessage,
  type WhatsAppThreadStatus,
} from '@/services/whatsappApi';
import { teamApi, type TeamUser } from '@/services/teamApi';

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
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const [agents, setAgents] = useState<TeamUser[]>([]);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  useEffect(() => {
    if (!isAdmin) return;
    teamApi.listUsers({ isActive: true }).then(setAgents).catch(() => {});
  }, [isAdmin]);

  const refreshThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const rows = await whatsappApi.inbox.listThreads({
        scope,
        status: statusFilter === 'all' ? undefined : statusFilter,
        agentId: agentFilter || undefined,
      });
      setThreads(rows);
      if (!activeIdRef.current && rows.length > 0) setActiveId(rows[0].id);
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: 'Failed to load threads' });
    } finally {
      setLoadingThreads(false);
    }
  }, [scope, statusFilter, agentFilter, pushToast]);

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
        setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)));
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
  }, [messages.length, activeId]);

  useEffect(() => {
    const socket = getSocket();
    const onMessage = (payload: { thread: InboxThread; message: InboxMessage }) => {
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === payload.thread.id);
        const next = [...prev];
        const merged = idx === -1 ? payload.thread : { ...prev[idx], ...payload.thread };
        // Don't bump unread if this thread is already open on screen.
        if (payload.message.direction === 'in' && payload.thread.id === activeIdRef.current) {
          merged.unreadCount = 0;
        }
        if (idx === -1) next.unshift(merged);
        else next[idx] = merged;
        return next.sort(
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
        );
      });
      if (payload.thread.id === activeIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.message.id)) return prev;
          return [...prev, payload.message];
        });
        if (payload.message.direction === 'in') {
          void whatsappApi.inbox.markRead(payload.thread.id);
        }
      }
    };
    socket.on('whatsapp:message', onMessage);
    return () => {
      socket.off('whatsapp:message', onMessage);
    };
  }, []);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );

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
      // Socket will push the message back; still refresh to catch any gap.
      await refreshMessages(activeThread.id);
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

  const groupedMessages = useMemo(() => groupByDay(messages), [messages]);

  return (
    <div className="grid h-[calc(100vh-220px)] grid-cols-[340px_1fr] gap-4">
      {/* ── Left: thread list ────────────────────────────────────────── */}
      <GlassCard padding="none" className="flex flex-col overflow-hidden">
        <div className="space-y-2 border-b border-gray-100 p-3">
          {isAdmin && (
            <div className="flex overflow-hidden rounded-btn border border-gray-200 text-xs">
              <button
                onClick={() => setScope('mine')}
                style={
                  scope === 'mine'
                    ? { backgroundColor: '#3C2515', color: '#fff' }
                    : { backgroundColor: 'transparent', color: '#6b7280' }
                }
                className="flex-1 px-3 py-1 font-semibold"
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
                className="flex-1 px-3 py-1 font-semibold"
              >
                All agents
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WhatsAppThreadStatus | 'all')}
              className="flex-1 rounded-btn border border-gray-200 bg-white px-2 py-1.5 text-xs"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {isAdmin && scope === 'all' && (
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="flex-1 rounded-btn border border-gray-200 bg-white px-2 py-1.5 text-xs"
                title="Filter by agent"
              >
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
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
            filteredThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === activeId}
                showAgent={isAdmin && (scope === 'all' || !!agentFilter)}
                onClick={() => setActiveId(t.id)}
              />
            ))
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
            <div className="flex items-center justify-between border-b border-gray-100 bg-white/80 p-3 backdrop-blur">
              <div className="flex items-center gap-3">
                <Avatar name={activeThread.customer?.fullName ?? activeThread.customerPhone} size={36} />
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
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-3"
              style={{
                backgroundColor: '#ECE5DD',
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><g fill='%23d7ccbe' fill-opacity='0.35'><circle cx='10' cy='10' r='1.2'/><circle cx='40' cy='20' r='1'/><circle cx='65' cy='55' r='1.3'/><circle cx='20' cy='60' r='1'/><circle cx='55' cy='10' r='0.9'/></g></svg>\")",
              }}
            >
              {loadingMessages ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-gray-500">No messages in this conversation yet.</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {groupedMessages.map((group, gi) => (
                    <div key={gi} className="flex flex-col gap-1">
                      <DaySeparator date={group.date} />
                      {group.messages.map((m, mi) => {
                        const prev = group.messages[mi - 1];
                        const next = group.messages[mi + 1];
                        const first = !prev || prev.direction !== m.direction;
                        const last = !next || next.direction !== m.direction;
                        return <MessageBubble key={m.id} message={m} first={first} last={last} />;
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 bg-white p-3">
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

// ─── Thread row ────────────────────────────────────────────────────────────
function ThreadRow({
  thread,
  active,
  showAgent,
  onClick,
}: {
  thread: InboxThread;
  active: boolean;
  showAgent: boolean;
  onClick: () => void;
}) {
  const last = thread.messages?.[0];
  const name = thread.customer?.fullName ?? thread.customerPhone;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors ${
        active ? 'bg-primary/5' : 'hover:bg-gray-50'
      }`}
    >
      <Avatar name={name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">{name}</span>
          <span className="shrink-0 text-[10px] text-gray-400">
            {formatRelative(thread.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-gray-500">
            {last?.direction === 'out' && <CheckCheck size={11} className="shrink-0 text-gray-400" />}
            <span className="truncate">
              {last ? formatMessagePreview(last) : thread.customer?.phoneDisplay ?? thread.customerPhone}
            </span>
          </span>
          {thread.unreadCount > 0 && (
            <span className="shrink-0 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {thread.unreadCount}
            </span>
          )}
        </div>
        {(showAgent || thread.customer?.whatsappOptOut) && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
            {thread.customer?.whatsappOptOut && (
              <span className="flex items-center gap-0.5 text-red-500">
                <UserX size={9} /> opted out
              </span>
            )}
            {thread.assignedAgent && showAgent && (
              <span className="rounded-badge bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
                {thread.assignedAgent.name}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Message bubble ────────────────────────────────────────────────────────
function MessageBubble({
  message,
  first,
  last,
}: {
  message: InboxMessage;
  first: boolean;
  last: boolean;
}) {
  const out = message.direction === 'out';
  // Stickers aren't bubbles on WhatsApp — render bare so the transparent
  // webp sits on the chat background like a real sticker would.
  if (message.mediaType === 'sticker' && message.mediaUrl) {
    return (
      <div className={`flex ${out ? 'justify-end' : 'justify-start'} ${first ? 'mt-1.5' : ''}`}>
        <div className="flex flex-col items-end">
          <img
            src={resolveImageUrl(message.mediaUrl)}
            alt="sticker"
            className="h-32 w-32 object-contain"
          />
          <span className="mt-0.5 text-[10px] text-gray-500">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  // Tail radius: only on the first+last bubble of a run, corner points to sender side.
  const radius = out
    ? `rounded-2xl ${first ? 'rounded-tr-md' : ''} ${last ? 'rounded-br-sm' : ''}`
    : `rounded-2xl ${first ? 'rounded-tl-md' : ''} ${last ? 'rounded-bl-sm' : ''}`;
  const hasMedia = !!message.mediaType && !!message.mediaUrl;
  // Image/video bubbles hug the media so the bubble doesn't leak padding
  // around the asset — captions still get inner padding underneath.
  const inner = hasMedia && (message.mediaType === 'image' || message.mediaType === 'video')
    ? 'p-1'
    : 'px-3 py-1.5';
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'} ${first ? 'mt-1.5' : ''}`}>
      <div
        className={`max-w-[72%] text-sm shadow-sm ${radius} ${inner} ${
          out ? 'bg-[#DCF8C6] text-gray-900' : 'bg-white text-gray-900'
        }`}
      >
        {first && message.author?.name && out && (
          <div className={`${inner === 'p-1' ? 'px-2 pt-1' : ''} mb-0.5 text-[10px] font-semibold text-emerald-700`}>
            {message.author.name}
          </div>
        )}
        {hasMedia && <MediaBlock message={message} />}
        {message.body && (
          <div
            className={`${inner === 'p-1' ? 'px-2 pb-1 pt-1' : ''} whitespace-pre-wrap break-words`}
          >
            {message.body}
          </div>
        )}
        <div
          className={`${
            inner === 'p-1' ? 'px-2 pb-1' : 'mt-0.5'
          } flex items-center justify-end gap-1 text-[10px] text-gray-500`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {out && <MessageTicks read={!!message.readAt} />}
        </div>
      </div>
    </div>
  );
}

// ─── Media renderers ───────────────────────────────────────────────────────
function MediaBlock({ message }: { message: InboxMessage }) {
  const url = resolveImageUrl(message.mediaUrl ?? '');
  if (!url) return null;
  switch (message.mediaType) {
    case 'image':
      return (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img src={url} alt={message.body || 'image'} className="max-h-72 w-full rounded-lg object-cover" />
        </a>
      );
    case 'video':
      return (
        <video controls src={url} className="max-h-72 w-full rounded-lg bg-black">
          Your browser can't play this video.
        </video>
      );
    case 'audio':
      return (
        <audio controls src={url} className="w-64 max-w-full">
          Your browser can't play this audio.
        </audio>
      );
    case 'document':
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg bg-black/5 p-2 text-xs hover:bg-black/10"
        >
          <FileText size={18} className="shrink-0 text-gray-600" />
          <span className="flex-1 truncate">{message.body || 'document'}</span>
          <Download size={14} className="shrink-0 text-gray-500" />
        </a>
      );
    default:
      return null;
  }
}

function MessageTicks({ read }: { read: boolean }) {
  if (read) return <CheckCheck size={12} className="text-sky-500" />;
  return <Check size={12} className="text-gray-400" />;
}

// ─── Day separator ─────────────────────────────────────────────────────────
function DaySeparator({ date }: { date: Date }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm">
        {formatDayLabel(date)}
      </span>
    </div>
  );
}

// ─── Avatar ────────────────────────────────────────────────────────────────
function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name
    .split(/[\s·+]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
  const hue = hashHue(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue}, 55%, 70%)`,
        fontSize: size / 2.5,
      }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
    >
      {initials}
    </div>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// ─── Grouping + time helpers ───────────────────────────────────────────────
function groupByDay(messages: InboxMessage[]): Array<{ date: Date; messages: InboxMessage[] }> {
  const groups: Array<{ date: Date; messages: InboxMessage[] }> = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const key = d.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.date.toDateString() === key) last.messages.push(m);
    else groups.push({ date: d, messages: [m] });
  }
  return groups;
}

function formatDayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMessagePreview(last: {
  body: string;
  mediaType: InboxMessage['mediaType'];
}): string {
  if (last.body) return last.body;
  switch (last.mediaType) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎤 Voice message';
    case 'sticker':
      return 'Sticker';
    case 'document':
      return '📎 Document';
    default:
      return '';
  }
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
