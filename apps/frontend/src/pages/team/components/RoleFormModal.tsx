import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMButton } from '@/components/ui/CRMButton';
import { teamApi } from '@/services/teamApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function RoleFormModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLabel('');
    setError(null);
  }, [open]);

  // Auto-slug the name from the label until the user types a name manually
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => {
    if (nameTouched) return;
    setName(
      label
        .toLowerCase()
        .replace(/[^a-z0-9_\s]/g, '')
        .trim()
        .replace(/\s+/g, '_'),
    );
  }, [label, nameTouched]);

  const canSave = name.length >= 2 && label.length >= 2;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await teamApi.createRole({ name, label: label.trim(), permissionKeys: [] });
      onCreated();
      onClose();
    } catch (err) {
      if (isAxiosError(err)) {
        const data = err.response?.data as { error?: { message?: string } } | undefined;
        setError(data?.error?.message ?? t('team.roleForm.createFailed'));
      } else {
        setError(t('team.roleForm.createFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('team.roleForm.title')}
      size="sm"
      footer={
        <div className="flex items-center justify-between gap-2">
          {error ? (
            <p className="flex-1 text-xs font-medium text-red-500">{error}</p>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-2">
            <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </CRMButton>
            <CRMButton onClick={handleSave} loading={saving} disabled={!canSave}>
              {t('team.roleForm.create')}
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label={t('team.roleForm.label')}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('team.roleForm.labelPlaceholder')}
        />
        <CRMInput
          label={t('team.roleForm.slug')}
          required
          value={name}
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
          }}
          placeholder={t('team.roleForm.slugPlaceholder')}
          hint={t('team.roleForm.slugHint')}
        />
        <p className="text-xs text-gray-500">
          {t('team.roleForm.permissionsHint')}
        </p>
      </div>
    </GlassModal>
  );
}
