import { useEffect, useRef, useState } from 'react';
import {
  Paperclip,
  Trash2,
  Pencil,
  Send,
  Download,
  Lock,
  Users,
  X as XIcon,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMButton } from '@/components/ui';
import { atelieApi, type TaskDetail, type TaskStatus, type TaskVisibility } from '@/services/atelieApi';
import { useAuthStore } from '@/store/authStore';
import { TaskFormModal } from './TaskFormModal';

interface Props {
  open: boolean;
  taskId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function TaskDetailModal({ open, taskId, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const detail = await atelieApi.getTask(taskId);
      setTask(detail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && taskId) refresh();
    if (!open) setTask(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  if (!open) return null;
  const isOwner = !!(task && me && task.ownerId === me.id);

  function visibilityLabel(v: TaskVisibility): string {
    return v === 'shared' ? t('atelie.taskDetail.visibilityShared') : t('atelie.taskDetail.visibilityPrivate');
  }

  function statusLabel(s: TaskStatus): string {
    if (s === 'backlog') return t('atelie.taskDetail.statusBacklog');
    if (s === 'processing') return t('atelie.taskDetail.statusProcessing');
    if (s === 'done') return t('atelie.taskDetail.statusDone');
    if (s === 'forgotten') return t('atelie.taskDetail.statusForgotten');
    return t('atelie.taskDetail.statusIncomplete');
  }

  async function postComment() {
    if (!task || !commentBody.trim()) return;
    setPosting(true);
    try {
      await atelieApi.addComment(task.id, commentBody.trim());
      setCommentBody('');
      await refresh();
      onChanged();
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(cid: string) {
    if (!task) return;
    if (!window.confirm(t('atelie.taskDetail.confirmDeleteComment'))) return;
    await atelieApi.deleteComment(task.id, cid);
    await refresh();
    onChanged();
  }

  async function uploadFile(f: File) {
    if (!task) return;
    await atelieApi.uploadAttachment(task.id, f);
    await refresh();
    onChanged();
  }

  async function deleteAttachment(aid: string) {
    if (!task) return;
    if (!window.confirm(t('atelie.taskDetail.confirmRemoveAttachment'))) return;
    await atelieApi.deleteAttachment(task.id, aid);
    await refresh();
    onChanged();
  }

  async function deleteTask() {
    if (!task) return;
    if (!window.confirm(t('atelie.taskDetail.confirmDeleteTask', { title: task.title }))) return;
    await atelieApi.deleteTask(task.id);
    onChanged();
    onClose();
  }

  return (
    <>
      <GlassModal open={open} onClose={onClose} size="2xl" title={task?.title ?? t('atelie.taskDetail.fallbackTitle')}>
        {loading && !task ? (
          <p className="text-sm text-gray-400">{t('atelie.taskDetail.loading')}</p>
        ) : task ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={
                  task.visibility === 'shared'
                    ? 'inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-600'
                    : 'inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-500'
                }
              >
                {task.visibility === 'shared' ? <Users size={11} /> : <Lock size={11} />}
                {visibilityLabel(task.visibility)}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold capitalize text-gray-600">
                {statusLabel(task.status)}
              </span>
              <span className="text-gray-400">{t('atelie.taskDetail.by', { name: task.owner.name })}</span>
              {task.dueAt && (
                <span className="text-amber-600">
                  {t('atelie.taskDetail.due', { date: new Date(task.dueAt).toLocaleDateString() })}
                </span>
              )}
              {isOwner && (
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => setEditing(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-accent hover:text-primary"
                    aria-label={t('atelie.taskDetail.edit')}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={deleteTask}
                    className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                    aria-label={t('atelie.taskDetail.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            {task.description && (
              <div className="whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-sm text-gray-700">
                {task.description}
              </div>
            )}

            {task.incompleteReason && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                <strong>{t('atelie.taskDetail.incompletePrefix')}</strong> {task.incompleteReason}
              </div>
            )}

            {/* Attachments */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">
                  {t('atelie.taskDetail.attachmentsTitle', { count: task.attachments.length })}
                </h4>
                {isOwner && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f);
                        e.target.value = '';
                      }}
                    />
                    <CRMButton
                      variant="ghost"
                      size="sm"
                      leftIcon={<Paperclip size={12} />}
                      onClick={() => fileRef.current?.click()}
                    >
                      {t('atelie.taskDetail.attachFile')}
                    </CRMButton>
                  </>
                )}
              </div>
              <AttachmentList
                attachments={task.attachments}
                baseUrl={BASE_URL}
                canDelete={isOwner}
                onDelete={deleteAttachment}
              />
            </div>

            {/* Comments */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700">
                {t('atelie.taskDetail.commentsTitle', { count: task.comments.length })}
              </h4>

              <div className="mb-3 flex flex-col gap-2">
                {task.comments.length === 0 && (
                  <p className="text-xs text-gray-400">{t('atelie.taskDetail.noComments')}</p>
                )}
                {task.comments.map((c) => {
                  const canDel = me?.id === c.author.id || isOwner;
                  return (
                    <div key={c.id} className="rounded-xl border border-gray-100 bg-white p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">{c.author.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400">
                            {new Date(c.createdAt).toLocaleString()}
                          </span>
                          {canDel && (
                            <button
                              onClick={() => deleteComment(c.id)}
                              className="text-gray-300 hover:text-red-500"
                              aria-label={t('atelie.taskDetail.deleteComment')}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-gray-700">{c.body}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start gap-2">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={2}
                  placeholder={t('atelie.taskDetail.commentPlaceholder')}
                  className="flex-1 rounded-input border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <CRMButton
                  onClick={postComment}
                  loading={posting}
                  disabled={!commentBody.trim()}
                  leftIcon={<Send size={12} />}
                >
                  {t('atelie.taskDetail.post')}
                </CRMButton>
              </div>
            </div>
          </div>
        ) : null}
      </GlassModal>

      {task && (
        <TaskFormModal
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={() => {
            refresh();
            onChanged();
          }}
          task={task}
        />
      )}
    </>
  );
}

interface AttachmentListProps {
  attachments: TaskDetail['attachments'];
  baseUrl: string;
  canDelete: boolean;
  onDelete: (aid: string) => void;
}

function AttachmentList({ attachments, baseUrl, canDelete, onDelete }: AttachmentListProps) {
  const { t } = useTranslation();
  if (attachments.length === 0) {
    return <p className="text-xs text-gray-400">{t('atelie.taskDetail.noAttachments')}</p>;
  }

  const images = attachments.filter((a) => a.mimeType.startsWith('image/'));
  const others = attachments.filter((a) => !a.mimeType.startsWith('image/'));

  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <div key={a.id} className="group relative">
              <a
                href={`${baseUrl}${a.fileUrl}`}
                target="_blank"
                rel="noreferrer"
                className="block h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                title={t('atelie.taskDetail.fileOpenTitle', { name: a.fileName })}
              >
                <img
                  src={`${baseUrl}${a.fileUrl}`}
                  alt={a.fileName}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </a>
              {canDelete && (
                <button
                  onClick={() => onDelete(a.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  aria-label={t('atelie.taskDetail.remove')}
                >
                  <XIcon size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {others.map((a) => {
            // PDFs and most text/doc types render inline in the browser; anything
            // unknown falls back to a browser-native download via the link itself.
            const openable =
              a.mimeType === 'application/pdf' ||
              a.mimeType.startsWith('text/') ||
              a.mimeType === 'application/json';
            const openLabel = openable
              ? t('atelie.taskDetail.openInNewTab')
              : t('atelie.taskDetail.download');
            return (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-1.5 text-xs"
              >
                {a.mimeType === 'application/pdf' ? (
                  <FileText size={12} className="text-red-500" />
                ) : (
                  <Paperclip size={12} className="text-gray-400" />
                )}
                <a
                  href={`${baseUrl}${a.fileUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 truncate text-gray-700 hover:text-primary hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="text-gray-400">
                  {t('atelie.taskDetail.fileSizeKb', { size: (a.sizeBytes / 1024).toFixed(0) })}
                </span>
                <a
                  href={`${baseUrl}${a.fileUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 hover:text-primary"
                  aria-label={openLabel}
                  title={openLabel}
                >
                  {openable ? <ExternalLink size={12} /> : <Download size={12} />}
                </a>
                {canDelete && (
                  <button
                    onClick={() => onDelete(a.id)}
                    className="text-gray-400 hover:text-red-500"
                    aria-label={t('atelie.taskDetail.remove')}
                  >
                    <XIcon size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
