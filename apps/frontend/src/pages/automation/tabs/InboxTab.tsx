import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Send,
  CheckCircle2,
  Clock3,
  Search,
  UserX,
  Check,
  CheckCheck,
  FileText,
  Download,
  Paperclip,
  Mic,
  Image as ImageIcon,
  Film,
  File as FileIcon,
  X,
} from 'lucide-react';
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

export function InboxTab() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const pushToast = useToastStore((s) => s.push);

  const STATUS_OPTIONS = useMemo<Array<{ value: WhatsAppThreadStatus | 'all'; label: string }>>(
    () => [
      { value: 'all', label: t('automation.inbox.status.all') },
      { value: 'open', label: t('automation.inbox.status.open') },
      { value: 'snoozed', label: t('automation.inbox.status.snoozed') },
      { value: 'closed', label: t('automation.inbox.status.closed') },
    ],
    [t],
  );
  const roleName = (user?.role?.name ?? '').toLowerCase();
  const isAdmin = roleName === 'admin' || roleName === 'supervisor';

  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine');
  // Default to "All" so every conversation shows up without the admin
  // fiddling with filters — they wanted "all messages, all agents" on load.
  const [statusFilter, setStatusFilter] = useState<WhatsAppThreadStatus | 'all'>('all');
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

  // ── Attachment + voice-note state ─────────────────────────────────────
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      pushToast({ kind: 'error', title: t('automation.inbox.loadThreadsFailed') });
    } finally {
      setLoadingThreads(false);
    }
  }, [scope, statusFilter, agentFilter, pushToast, t]);

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
        setThreads((prev) => prev.map((thr) => (thr.id === id ? { ...thr, unreadCount: 0 } : thr)));
      } catch (err) {
        console.error(err);
        pushToast({ kind: 'error', title: t('automation.inbox.loadMessagesFailed') });
      } finally {
        setLoadingMessages(false);
      }
    },
    [pushToast, t],
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
        const idx = prev.findIndex((thr) => thr.id === payload.thread.id);
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
    () => threads.find((thr) => thr.id === activeId) ?? null,
    [threads, activeId],
  );

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.trim().toLowerCase();
    return threads.filter((thr) => {
      const name = thr.customer?.fullName?.toLowerCase() ?? '';
      const phone = (thr.customer?.phoneDisplay ?? thr.customerPhone).toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [threads, search]);

  const clearPending = useCallback(() => {
    setPendingFile(null);
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingPreview(null);
  }, [pendingPreview]);

  const handleSend = async () => {
    if (!activeThread) return;
    // Media path: caption comes from the composer text (image/video only).
    if (pendingFile) {
      setSending(true);
      try {
        const kind = fileKind(pendingFile);
        await whatsappApi.inbox.sendMedia(activeThread.id, pendingFile, {
          fileName: pendingFile.name,
          caption: kind === 'image' || kind === 'video' ? composer.trim() : undefined,
        });
        setComposer('');
        clearPending();
        await refreshMessages(activeThread.id);
      } catch (err) {
        console.error(err);
        pushToast({ kind: 'error', title: t('automation.inbox.sendFailed') });
      } finally {
        setSending(false);
      }
      return;
    }
    if (!composer.trim()) return;
    setSending(true);
    try {
      await whatsappApi.inbox.reply(activeThread.id, composer.trim());
      setComposer('');
      await refreshMessages(activeThread.id);
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: t('automation.inbox.sendFailed') });
    } finally {
      setSending(false);
    }
  };

  // ── File picker → preview ─────────────────────────────────────────────
  const pickFile = (kind: 'image' | 'video' | 'document') => {
    setAttachMenuOpen(false);
    if (kind === 'image') imageInputRef.current?.click();
    else if (kind === 'video') videoInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = '';
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      pushToast({ kind: 'error', title: t('automation.inbox.fileTooLarge') });
      return;
    }
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(f);
    const previewable = f.type.startsWith('image/') || f.type.startsWith('video/');
    setPendingPreview(previewable ? URL.createObjectURL(f) : null);
  };

  // ── Voice-note recording (WhatsApp PTT) ───────────────────────────────
  const startRecording = async () => {
    if (!activeThread) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Prefer Opus in WebM/OGG — what WhatsApp's voice-note pipeline expects.
      // Evolution transcodes either way, but picking a supported mime first
      // keeps the bytes small on the wire.
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : '';
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordTimerRef.current != null) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const type = rec.mimeType || 'audio/ogg';
        const blob = new Blob(recordChunksRef.current, { type });
        recordChunksRef.current = [];
        if (blob.size === 0 || !activeIdRef.current) return;
        // Send the voice note immediately — matches WhatsApp Web behavior:
        // tap mic → talk → release / stop → ship.
        setSending(true);
        try {
          const ext = type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : 'bin';
          await whatsappApi.inbox.sendMedia(activeIdRef.current, blob, {
            fileName: `voice-${Date.now()}.${ext}`,
            voiceNote: true,
          });
          await refreshMessages(activeIdRef.current);
        } catch (err) {
          console.error(err);
          pushToast({ kind: 'error', title: t('automation.inbox.voiceNoteFailed') });
        } finally {
          setSending(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordElapsed(0);
      const started = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        setRecordElapsed(Math.floor((Date.now() - started) / 1000));
      }, 250);
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: t('automation.inbox.micDenied') });
    }
  };

  const stopRecording = (send: boolean) => {
    const rec = recorderRef.current;
    setRecording(false);
    if (!rec) return;
    if (send) {
      rec.stop();
    } else {
      // Cancel: swap the onstop to a no-op so the chunks are discarded.
      rec.onstop = () => {
        rec.stream.getTracks().forEach((track) => track.stop());
        recordChunksRef.current = [];
        if (recordTimerRef.current != null) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
      };
      rec.stop();
    }
    recorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (recordTimerRef.current != null) window.clearInterval(recordTimerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStatus = async (status: WhatsAppThreadStatus) => {
    if (!activeThread) return;
    try {
      await whatsappApi.inbox.updateThread(activeThread.id, { status });
      await refreshThreads();
      pushToast({ kind: 'success', title: t(`automation.inbox.markedStatus_${status}`) });
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: t('automation.inbox.updateFailed') });
    }
  };

  const groupedMessages = useMemo(() => groupByDay(messages), [messages]);

  return (
    <div className="grid h-[calc(100vh-180px)] grid-cols-[360px_1fr] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* ── Left: thread list ────────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="space-y-2 border-b border-gray-200 bg-[#F0F2F5] px-3 py-2.5">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('automation.inbox.searchPlaceholder')}
              className="w-full rounded-full border border-transparent bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-gray-300"
            />
          </div>
          {isAdmin && (
            <div className="flex gap-1">
              <FilterChip
                label={t('automation.inbox.scope.mine')}
                active={scope === 'mine'}
                onClick={() => setScope('mine')}
              />
              <FilterChip
                label={t('automation.inbox.scope.all')}
                active={scope === 'all'}
                onClick={() => setScope('all')}
              />
              {STATUS_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                <FilterChip
                  key={o.value}
                  label={o.label}
                  active={statusFilter === o.value}
                  onClick={() =>
                    setStatusFilter(statusFilter === o.value ? 'all' : (o.value as WhatsAppThreadStatus))
                  }
                />
              ))}
            </div>
          )}
          {isAdmin && scope === 'all' && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full rounded-full border border-transparent bg-white px-3 py-1.5 text-xs outline-none focus:border-gray-300"
              title={t('automation.inbox.filterByAgent')}
            >
              <option value="">{t('automation.inbox.allAgents')}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto bg-white">
          {loadingThreads ? (
            <div className="p-4 text-sm text-gray-500">{t('automation.inbox.loading')}</div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">{t('automation.inbox.noConversations')}</div>
          ) : (
            filteredThreads.map((thr) => (
              <ThreadRow
                key={thr.id}
                thread={thr}
                active={thr.id === activeId}
                showAgent={isAdmin && (scope === 'all' || !!agentFilter)}
                onClick={() => setActiveId(thr.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: thread view ───────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden">
        {!activeThread ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-[#F0F2F5] text-center">
            <div className="max-w-sm px-8">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-white text-[#00A884] shadow-sm">
                <Send size={36} />
              </div>
              <h3 className="mb-1 text-xl font-light text-gray-700">{t('automation.inbox.welcome.title')}</h3>
              <p className="text-sm text-gray-500">{t('automation.inbox.welcome.body')}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 bg-[#F0F2F5] px-4 py-2.5">
              <div className="flex items-center gap-3">
                <Avatar name={activeThread.customer?.fullName ?? activeThread.customerPhone} size={40} />
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {activeThread.customer?.fullName ?? activeThread.customerPhone}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {activeThread.customer?.phoneDisplay ?? activeThread.customerPhone}
                    {activeThread.customer?.city ? ` · ${activeThread.customer.city}` : ''}
                    {activeThread.assignedAgent ? ` · ${activeThread.assignedAgent.name}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleStatus('snoozed')}
                  className="rounded-full p-2 text-gray-600 hover:bg-black/5"
                  title={t('automation.inbox.snooze')}
                >
                  <Clock3 size={16} />
                </button>
                <button
                  onClick={() => handleStatus('closed')}
                  className="rounded-full p-2 text-gray-600 hover:bg-black/5"
                  title={t('automation.inbox.close')}
                >
                  <CheckCircle2 size={16} />
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
                <div className="text-sm text-gray-500">{t('automation.inbox.loading')}</div>
              ) : messages.length === 0 ? (
                <div className="text-sm text-gray-500">{t('automation.inbox.noMessages')}</div>
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

            <div className="relative bg-[#F0F2F5] px-3 py-2">
              {activeThread.customer?.whatsappOptOut && (
                <div className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                  {t('automation.inbox.optedOutBanner')}
                </div>
              )}

              {/* Hidden file inputs — the paperclip menu triggers these. */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChosen}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={onFileChosen}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={onFileChosen}
              />

              {/* Attachment preview strip — WhatsApp-Web-like: shows the
                  selected file, composer below becomes the caption. */}
              {pendingFile && (
                <div className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  {pendingPreview && pendingFile.type.startsWith('image/') ? (
                    <img
                      src={pendingPreview}
                      alt={t('automation.inbox.mediaAlt.preview')}
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                  ) : pendingPreview && pendingFile.type.startsWith('video/') ? (
                    <video src={pendingPreview} className="h-14 w-14 rounded-lg bg-black object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#F0F2F5]">
                      <FileText size={22} className="text-gray-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-gray-800">
                      {pendingFile.name}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {formatBytes(pendingFile.size)}
                      {pendingFile.type ? ` · ${pendingFile.type}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={clearPending}
                    className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
                    title={t('automation.inbox.remove')}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Recording banner — replaces the composer while the mic is hot. */}
              {recording ? (
                <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2.5 shadow-sm">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {t('automation.inbox.recordingLabel', { duration: formatDuration(recordElapsed) })}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => stopRecording(false)}
                      className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
                      title={t('common.cancel')}
                    >
                      <X size={18} />
                    </button>
                    <button
                      onClick={() => stopRecording(true)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00A884] text-white shadow hover:bg-[#008f72]"
                      title={t('automation.inbox.sendVoiceNote')}
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  {/* Paperclip + attach menu */}
                  <div className="relative">
                    <button
                      onClick={() => setAttachMenuOpen((v) => !v)}
                      disabled={!!activeThread.customer?.whatsappOptOut || sending}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-black/5 disabled:opacity-40"
                      title={t('automation.inbox.attach')}
                    >
                      <Paperclip size={22} />
                    </button>
                    {attachMenuOpen && (
                      <div className="absolute bottom-12 left-0 z-10 w-44 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-xl">
                        <AttachOption
                          icon={<ImageIcon size={16} className="text-pink-500" />}
                          label={t('automation.inbox.attachPhoto')}
                          onClick={() => pickFile('image')}
                        />
                        <AttachOption
                          icon={<Film size={16} className="text-purple-500" />}
                          label={t('automation.inbox.attachVideo')}
                          onClick={() => pickFile('video')}
                        />
                        <AttachOption
                          icon={<FileIcon size={16} className="text-blue-500" />}
                          label={t('automation.inbox.attachDocument')}
                          onClick={() => pickFile('document')}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 rounded-full bg-white px-4 py-2 shadow-sm">
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
                      placeholder={
                        pendingFile
                          ? fileKind(pendingFile) === 'image' || fileKind(pendingFile) === 'video'
                            ? t('automation.inbox.composerCaption')
                            : t('automation.inbox.composerPressSend')
                          : t('automation.inbox.composerPlaceholder')
                      }
                      rows={1}
                      className="block max-h-28 w-full resize-none border-0 bg-transparent p-0 text-sm leading-6 outline-none placeholder:text-gray-400 disabled:opacity-50"
                    />
                  </div>

                  {/* Mic when composer empty, Send when there's text or a file. */}
                  {!composer.trim() && !pendingFile ? (
                    <button
                      onClick={startRecording}
                      disabled={!!activeThread.customer?.whatsappOptOut || sending}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00A884] text-white shadow hover:bg-[#008f72] disabled:opacity-40"
                      title={t('automation.inbox.recordVoiceNote')}
                    >
                      <Mic size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={
                        sending ||
                        !!activeThread.customer?.whatsappOptOut ||
                        (!composer.trim() && !pendingFile)
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00A884] text-white shadow hover:bg-[#008f72] disabled:opacity-40"
                      title={t('automation.inbox.send')}
                    >
                      <Send size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Filter chip ───────────────────────────────────────────────────────────
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-[#00A884] text-white shadow-sm'
          : 'bg-white text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
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
  const { t } = useTranslation();
  const last = thread.messages?.[0];
  const name = thread.customer?.fullName ?? thread.customerPhone;
  const hasUnread = thread.unreadCount > 0;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
        active ? 'bg-[#F0F2F5]' : 'hover:bg-[#F5F6F6]'
      }`}
    >
      <Avatar name={name} size={48} />
      <div className="min-w-0 flex-1 border-b border-gray-100 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[15px] font-normal text-gray-900">{name}</span>
          <span
            className={`shrink-0 text-[11px] ${hasUnread ? 'font-semibold text-[#00A884]' : 'text-gray-500'}`}
          >
            {formatRelative(t, thread.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 truncate text-[13px] text-gray-500">
            {last?.direction === 'out' && <CheckCheck size={14} className="shrink-0 text-gray-400" />}
            <span className="truncate">
              {last ? formatMessagePreview(t, last) : thread.customer?.phoneDisplay ?? thread.customerPhone}
            </span>
          </span>
          {hasUnread && (
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#00A884] px-1.5 text-[11px] font-semibold text-white">
              {thread.unreadCount}
            </span>
          )}
        </div>
        {(showAgent || thread.customer?.whatsappOptOut) && (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
            {thread.customer?.whatsappOptOut && (
              <span className="flex items-center gap-0.5 text-red-500">
                <UserX size={10} /> {t('automation.inbox.optedOut')}
              </span>
            )}
            {thread.assignedAgent && showAgent && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
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
  const { t } = useTranslation();
  const out = message.direction === 'out';
  // Stickers aren't bubbles on WhatsApp — render bare so the transparent
  // webp sits on the chat background like a real sticker would.
  if (message.mediaType === 'sticker' && message.mediaUrl) {
    return (
      <div className={`flex ${out ? 'justify-end' : 'justify-start'} ${first ? 'mt-1.5' : ''}`}>
        <div className="flex flex-col items-end">
          <img
            src={resolveImageUrl(message.mediaUrl)}
            alt={t('automation.inbox.mediaAlt.sticker')}
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
    <div className={`flex ${out ? 'justify-end' : 'justify-start'} ${first ? 'mt-2' : ''}`}>
      <div
        className={`relative max-w-[65%] text-[14.2px] leading-[19px] ${radius} ${inner} ${
          out
            ? 'bg-[#D9FDD3] text-gray-900 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]'
            : 'bg-white text-gray-900 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]'
        }`}
      >
        {first && message.author?.name && out && (
          <div className={`${inner === 'p-1' ? 'px-2 pt-1' : ''} mb-0.5 text-[11px] font-semibold text-[#06cf9c]`}>
            {message.author.name}
          </div>
        )}
        {hasMedia && <MediaBlock message={message} />}
        {message.body && (
          <div
            className={`${inner === 'p-1' ? 'px-2 pb-0.5 pt-1' : ''} whitespace-pre-wrap break-words`}
          >
            {message.body}
          </div>
        )}
        <div
          className={`${
            inner === 'p-1' ? 'px-2 pb-1' : 'mt-0.5'
          } flex items-center justify-end gap-1 text-[11px] text-gray-500`}
        >
          <span className="opacity-70">{formatTime(message.createdAt)}</span>
          {out && <MessageTicks read={!!message.readAt} />}
        </div>
      </div>
    </div>
  );
}

// ─── Media renderers ───────────────────────────────────────────────────────
function MediaBlock({ message }: { message: InboxMessage }) {
  const { t } = useTranslation();
  const url = resolveImageUrl(message.mediaUrl ?? '');
  if (!url) return null;
  switch (message.mediaType) {
    case 'image':
      return (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={message.body || t('automation.inbox.mediaAlt.image')}
            className="max-h-72 w-full rounded-lg object-cover"
          />
        </a>
      );
    case 'video':
      return (
        <video controls src={url} className="max-h-72 w-full rounded-lg bg-black">
          {t('automation.inbox.browser.cantPlayVideo')}
        </video>
      );
    case 'audio':
      return (
        <audio controls src={url} className="w-64 max-w-full">
          {t('automation.inbox.browser.cantPlayAudio')}
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
          <span className="flex-1 truncate">{message.body || t('automation.inbox.mediaAlt.document')}</span>
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
  const { t } = useTranslation();
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-600 shadow-sm">
        {formatDayLabel(t, date)}
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

function formatDayLabel(t: TFunction, d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return t('automation.inbox.day.today');
  if (target.getTime() === yesterday.getTime()) return t('automation.inbox.day.yesterday');
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMessagePreview(
  t: TFunction,
  last: {
    body: string;
    mediaType: InboxMessage['mediaType'];
  },
): string {
  if (last.body) return last.body;
  switch (last.mediaType) {
    case 'image':
      return t('automation.inbox.preview.photo');
    case 'video':
      return t('automation.inbox.preview.video');
    case 'audio':
      return t('automation.inbox.preview.voice');
    case 'sticker':
      return t('automation.inbox.preview.sticker');
    case 'document':
      return t('automation.inbox.preview.document');
    default:
      return '';
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(t: TFunction, iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('automation.inbox.relative.now');
  if (mins < 60) return t('automation.inbox.relative.minutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('automation.inbox.relative.hours', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t('automation.inbox.relative.days', { count: days });
  return new Date(iso).toLocaleDateString();
}

// ─── Attachment helpers ────────────────────────────────────────────────────
function AttachOption({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </span>
      <span className="font-medium text-gray-700">{label}</span>
    </button>
  );
}

function fileKind(f: File): 'image' | 'video' | 'audio' | 'document' {
  const t = f.type.toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'document';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
