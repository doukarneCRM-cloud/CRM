import { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMButton } from '@/components/ui';
import { atelieApi, type Task, type TaskVisibility } from '@/services/atelieApi';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';

const COLOR_SWATCHES = [
  '#18181B',
  '#52525B',
  '#C97B63',
  '#E09F3E',
  '#5B8E7D',
  '#3A7CA5',
  '#6A4C93',
  '#B5667E',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  task?: Task | null;
}

export function TaskFormModal({ open, onClose, onSaved, task }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<TaskVisibility>('private');
  const [color, setColor] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setVisibility(task?.visibility ?? 'private');
      setColor(task?.color ?? null);
      setDueAt(task?.dueAt ? task.dueAt.slice(0, 10) : '');
      setPendingFiles([]);
      setError(null);
    }
  }, [open, task]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next: File[] = [];
    for (let i = 0; i < files.length; i++) next.push(files[i]);
    setPendingFiles((prev) => [...prev, ...next]);
  }

  async function submit() {
    if (!title.trim()) {
      setError(t('atelie.taskForm.titleRequired'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        visibility,
        color,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      };
      let targetId: string;
      if (task) {
        await atelieApi.updateTask(task.id, payload);
        targetId = task.id;
      } else {
        const created = await atelieApi.createTask(payload);
        targetId = created.id;
      }
      for (const file of pendingFiles) {
        try {
          await atelieApi.uploadAttachment(targetId, file);
        } catch {
          // Skip a single failed upload rather than losing the whole task.
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t('atelie.taskForm.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={task ? t('atelie.taskForm.titleEdit') : t('atelie.taskForm.titleNew')}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </CRMButton>
          <CRMButton onClick={submit} loading={saving}>
            {task ? t('atelie.taskForm.save') : t('atelie.taskForm.create')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <CRMInput
          label={t('atelie.taskForm.titleField')}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('atelie.taskForm.titlePlaceholder')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('atelie.taskForm.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-input border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={t('atelie.taskForm.descriptionPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              {t('atelie.taskForm.visibility')}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setVisibility('private')}
                className={cn(
                  'flex-1 rounded-btn border px-3 py-2 text-sm font-medium transition-colors',
                  visibility === 'private'
                    ? 'border-primary bg-accent text-primary'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {t('atelie.taskForm.private')}
              </button>
              <button
                onClick={() => setVisibility('shared')}
                className={cn(
                  'flex-1 rounded-btn border px-3 py-2 text-sm font-medium transition-colors',
                  visibility === 'shared'
                    ? 'border-primary bg-accent text-primary'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                {t('atelie.taskForm.shared')}
              </button>
            </div>
          </div>

          <CRMInput
            label={t('atelie.taskForm.dueOptional')}
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('atelie.taskForm.color')}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setColor(null)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs',
                !color ? 'border-primary text-primary' : 'border-gray-200 text-gray-300',
              )}
              title={t('atelie.taskForm.noColor')}
            >
              ✕
            </button>
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-7 w-7 rounded-full border-2',
                  color === c ? 'border-gray-900' : 'border-white',
                )}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {t('atelie.taskForm.attachments')}
          </label>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-btn border border-dashed border-gray-300 bg-white px-3 py-2 text-sm text-gray-500 hover:border-primary hover:text-primary"
            >
              <Paperclip size={14} /> {t('atelie.taskForm.addFiles')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {pendingFiles.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs">
                {pendingFiles.map((f, idx) => (
                  <li
                    key={`${f.name}:${idx}`}
                    className="flex items-center justify-between rounded-btn border border-gray-100 bg-gray-50 px-2 py-1.5"
                  >
                    <span className="truncate text-gray-600">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500"
                        aria-label={t('atelie.taskForm.remove')}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </GlassModal>
  );
}
