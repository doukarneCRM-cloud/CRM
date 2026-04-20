import { useEffect, useState } from 'react';
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
        setError(data?.error?.message ?? 'Failed to create role');
      } else {
        setError('Failed to create role');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="New role"
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
              Cancel
            </CRMButton>
            <CRMButton onClick={handleSave} loading={saving} disabled={!canSave}>
              Create role
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label="Display name"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Senior Supervisor"
        />
        <CRMInput
          label="Slug (used internally)"
          required
          value={name}
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
          }}
          placeholder="senior_supervisor"
          hint="Lowercase letters, digits, and underscores only."
        />
        <p className="text-xs text-gray-500">
          You'll pick permissions on the next screen after the role is created.
        </p>
      </div>
    </GlassModal>
  );
}
