import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, X } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { CRMButton } from '@/components/ui/CRMButton';
import { useToastStore } from '@/store/toastStore';
import { teamApi, type TeamUser } from '@/services/teamApi';
import { broadcastsApi, type BroadcastKind } from '@/services/broadcastsApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function BroadcastFormModal({ open, onClose, onSent }: Props) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [kind, setKind] = useState<BroadcastKind>('POPUP');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState(false);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form whenever the modal opens fresh.
  useEffect(() => {
    if (!open) return;
    setKind('POPUP');
    setTitle('');
    setBody('');
    setLinkUrl('');
    setImageFile(null);
    setImagePreview(null);
    setAllUsers(false);
    setRecipientIds([]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open]);

  // Pull active users (recipients picker) the first time the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUsersLoading(true);
    teamApi
      .listUsers({ isActive: true })
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Revoke object URLs as the file changes — otherwise we leak blob memory.
  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const recipientOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: `${u.name} · ${u.role.label}` })),
    [users],
  );

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME.includes(file.type)) {
      setError(t('team.broadcasts.errorImageType'));
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('team.broadcasts.errorImageTooBig'));
      e.target.value = '';
      return;
    }
    setError(null);
    setImageFile(file);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!title.trim()) {
      setError(t('team.broadcasts.errorTitleRequired'));
      return;
    }
    if (!allUsers && recipientIds.length === 0) {
      setError(t('team.broadcasts.errorRecipientsRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('title', title.trim());
      if (body.trim()) fd.append('body', body.trim());
      if (linkUrl.trim()) fd.append('linkUrl', linkUrl.trim());
      fd.append('allUsers', allUsers ? 'true' : 'false');
      fd.append('recipientIds', JSON.stringify(allUsers ? [] : recipientIds));
      if (imageFile) fd.append('image', imageFile);

      await broadcastsApi.create(fd);
      pushToast({
        kind: 'confirmed',
        title: t('team.broadcasts.sentToast'),
      });
      onSent();
      onClose();
    } catch (err) {
      const e = err as {
        response?: { data?: { error?: { message?: string } } };
      };
      setError(
        e?.response?.data?.error?.message ?? t('team.broadcasts.errorGeneric'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('team.broadcasts.new')}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={submitting}>
            {t('team.broadcasts.cancel')}
          </CRMButton>
          <CRMButton variant="primary" loading={submitting} onClick={handleSubmit}>
            {submitting
              ? t('team.broadcasts.sending')
              : t('team.broadcasts.send')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Kind selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('team.broadcasts.kind')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind('POPUP')}
              className={
                'flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors ' +
                (kind === 'POPUP'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')
              }
            >
              <span className="text-xs font-semibold">
                {t('team.broadcasts.kindPopup')}
              </span>
              <span className="text-[11px] text-gray-500">
                {t('team.broadcasts.kindPopupHint')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setKind('BAR')}
              className={
                'flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition-colors ' +
                (kind === 'BAR'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')
              }
            >
              <span className="text-xs font-semibold">
                {t('team.broadcasts.kindBar')}
              </span>
              <span className="text-[11px] text-gray-500">
                {t('team.broadcasts.kindBarHint')}
              </span>
            </button>
          </div>
        </div>

        <CRMInput
          label={t('team.broadcasts.name')}
          placeholder={t('team.broadcasts.namePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('team.broadcasts.body')}
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('team.broadcasts.bodyPlaceholder')}
            rows={4}
            maxLength={2000}
            className="rounded-input border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <CRMInput
          label={t('team.broadcasts.link')}
          placeholder={t('team.broadcasts.linkPlaceholder')}
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          type="url"
        />

        {/* Image picker */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('team.broadcasts.image')}
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_MIME.join(',')}
              onChange={handleFile}
              className="hidden"
              id="broadcast-image-input"
            />
            <label
              htmlFor="broadcast-image-input"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-input border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-primary hover:text-primary"
            >
              <ImageIcon size={14} />
              {imageFile ? t('team.broadcasts.imageReplace') : t('team.broadcasts.imagePick')}
            </label>
            {imageFile && (
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-500"
              >
                <X size={12} />
                {t('team.broadcasts.imageRemove')}
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">{t('team.broadcasts.imageHint')}</p>
          {imagePreview && (
            <img
              src={imagePreview}
              alt=""
              className="mt-2 max-h-48 w-auto rounded-lg border border-gray-100 object-contain"
            />
          )}
        </div>

        {/* Recipients */}
        <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={allUsers}
              onChange={(e) => setAllUsers(e.target.checked)}
            />
            {t('team.broadcasts.allActive')}
          </label>
          {!allUsers && (
            <CRMSelect
              multi
              searchable
              options={recipientOptions}
              value={recipientIds}
              onChange={(v) => setRecipientIds(Array.isArray(v) ? v : [v])}
              placeholder={
                usersLoading
                  ? t('team.broadcasts.loading')
                  : t('team.broadcasts.pickUsers')
              }
              disabled={usersLoading}
            />
          )}
          {!allUsers && recipientIds.length > 0 && (
            <p className="text-[11px] text-gray-500">
              {t('team.broadcasts.recipientCount', { count: recipientIds.length })}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    </GlassModal>
  );
}
