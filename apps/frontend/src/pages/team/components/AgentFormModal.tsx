import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { CRMButton } from '@/components/ui/CRMButton';
import { teamApi, type RoleDetail, type TeamUser } from '@/services/teamApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: TeamUser | null;
  roles: RoleDetail[];
}

export function AgentFormModal({ open, onClose, onSaved, editing, roles }: Props) {
  const isEdit = Boolean(editing);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPassword('');
    if (editing) {
      setName(editing.name);
      setEmail(editing.email);
      setPhone(editing.phone ?? '');
      setRoleId(editing.role.id);
      setAvatarUrl(editing.avatarUrl ?? '');
    } else {
      setName('');
      setEmail('');
      setPhone('');
      setRoleId(roles[0]?.id ?? '');
      setAvatarUrl('');
    }
  }, [open, editing, roles]);

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.label }));

  const canSave =
    name.trim().length >= 2 &&
    email.trim().length >= 5 &&
    roleId &&
    (isEdit || password.length >= 8);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit && editing) {
        await teamApi.updateUser(editing.id, {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          roleId,
          avatarUrl: avatarUrl.trim() || null,
          ...(password ? { password } : {}),
        });
      } else {
        await teamApi.createUser({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          password,
          roleId,
          avatarUrl: avatarUrl.trim() || null,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (isAxiosError(err)) {
        const data = err.response?.data as { error?: { message?: string } } | undefined;
        setError(data?.error?.message ?? 'Failed to save');
      } else {
        setError('Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${editing?.name}` : 'New team member'}
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
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
              {isEdit ? 'Save changes' : 'Create agent'}
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label="Full name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sara El Amrani"
        />
        <CRMInput
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@anaqatoki.ma"
        />
        <CRMInput
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="06XXXXXXXX (optional)"
        />
        <CRMSelect
          label="Role"
          options={roleOptions}
          value={roleId}
          onChange={(v) => setRoleId(v as string)}
          placeholder="Select role..."
        />
        <CRMInput
          label={isEdit ? 'Reset password (optional)' : 'Password'}
          type="password"
          required={!isEdit}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit ? 'Leave blank to keep current' : 'At least 8 characters'}
          hint={!isEdit ? 'Agent uses this to log in.' : undefined}
        />
        <CRMInput
          label="Avatar URL"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://... (optional)"
        />
      </div>
    </GlassModal>
  );
}
