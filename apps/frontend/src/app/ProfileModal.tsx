import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2 } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { authService } from '@/services/api';
import { resolveImageUrl } from '@/lib/imageUrl';
import { getInitials } from '@/components/ui/AvatarChip';
import type { AuthUser } from '@/types/auth';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 8 * 1024 * 1024;

export function ProfileModal({ open, onClose }: ProfileModalProps) {
  const { t } = useTranslation();
  const { user, updateUser } = useAuthStore();
  const pushToast = useToastStore((s) => s.push);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && user) setName(user.name);
  }, [open, user]);

  if (!user) return null;

  const nameTrimmed = name.trim();
  const nameDirty = nameTrimmed !== user.name;
  const nameValid = nameTrimmed.length >= 2 && nameTrimmed.length <= 80;

  const handleSaveName = async () => {
    if (!nameDirty || !nameValid) return;
    setSavingName(true);
    try {
      const res = await authService.updateProfile({ name: nameTrimmed });
      updateUser(res.data as AuthUser);
      pushToast({ kind: 'success', title: t('shared.profile.updated'), body: t('shared.profile.updatedBody') });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('shared.profile.updateError');
      pushToast({ kind: 'error', title: t('shared.profile.updateFailed'), body: msg });
    } finally {
      setSavingName(false);
    }
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_MIME.includes(file.type)) {
      pushToast({ kind: 'error', title: t('shared.profile.unsupportedFormat'), body: t('shared.profile.unsupportedFormatBody') });
      return;
    }
    if (file.size > MAX_BYTES) {
      pushToast({ kind: 'error', title: t('shared.profile.fileTooLarge'), body: t('shared.profile.fileTooLargeBody') });
      return;
    }

    setUploadingAvatar(true);
    try {
      const res = await authService.uploadAvatar(file);
      updateUser(res.data as AuthUser);
      pushToast({ kind: 'success', title: t('shared.profile.avatarUpdated') });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('shared.profile.uploadError');
      pushToast({ kind: 'error', title: t('shared.profile.uploadFailed'), body: msg });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const avatarSrc = resolveImageUrl(user.avatarUrl);
  const initials = getInitials(user.name);

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('shared.profile.title')}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {t('common.close')}
          </button>
          <button
            type="button"
            onClick={handleSaveName}
            disabled={!nameDirty || !nameValid || savingName}
            className="inline-flex items-center gap-1.5 rounded-btn bg-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingName && <Loader2 size={14} className="animate-spin" />}
            {t('shared.profile.saveChanges')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* Avatar with overlay button */}
        <button
          type="button"
          onClick={handlePickFile}
          disabled={uploadingAvatar}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm"
          aria-label={t('shared.profile.changeAvatar')}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={user.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #18181B, #27272A)' }}
            >
              {initials}
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
            {uploadingAvatar ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <Camera size={22} />
            )}
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_MIME.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={handlePickFile}
          disabled={uploadingAvatar}
          className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
        >
          {uploadingAvatar ? t('shared.profile.uploading') : t('shared.profile.changePhoto')}
        </button>
        <p className="-mt-2 text-[11px] text-gray-400">{t('shared.profile.avatarHelp')}</p>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-700">{t('shared.profile.displayName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={t('shared.profile.displayNamePlaceholder')}
            className="w-full rounded-input border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            {t('shared.profile.displayNameHelp')}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-700">{t('shared.profile.email')}</label>
          <input
            type="email"
            value={user.email}
            readOnly
            className="w-full cursor-not-allowed rounded-input border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-700">{t('shared.profile.role')}</label>
          <input
            type="text"
            value={user.role.label}
            readOnly
            className="w-full cursor-not-allowed rounded-input border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </div>
      </div>
    </GlassModal>
  );
}
