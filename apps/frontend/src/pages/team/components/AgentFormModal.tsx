import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        setError(data?.error?.message ?? t('team.agentForm.saveFailed'));
      } else {
        setError(t('team.agentForm.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={isEdit ? t('team.agentForm.titleEdit', { name: editing?.name ?? '' }) : t('team.agentForm.titleNew')}
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
              {t('common.cancel')}
            </CRMButton>
            <CRMButton onClick={handleSave} loading={saving} disabled={!canSave}>
              {isEdit ? t('team.agentForm.save') : t('team.agentForm.create')}
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label={t('team.agentForm.fullName')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('team.agentForm.fullNamePlaceholder')}
        />
        <CRMInput
          label={t('team.agentForm.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('team.agentForm.emailPlaceholder')}
        />
        <CRMInput
          label={t('team.agentForm.phone')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('team.agentForm.phonePlaceholder')}
        />
        <CRMSelect
          label={t('team.agentForm.role')}
          options={roleOptions}
          value={roleId}
          onChange={(v) => setRoleId(v as string)}
          placeholder={t('team.agentForm.rolePlaceholder')}
        />
        <CRMInput
          label={isEdit ? t('team.agentForm.passwordReset') : t('team.agentForm.password')}
          type="password"
          required={!isEdit}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEdit ? t('team.agentForm.passwordPlaceholderEdit') : t('team.agentForm.passwordPlaceholderCreate')}
          hint={!isEdit ? t('team.agentForm.passwordHint') : undefined}
        />
        <CRMInput
          label={t('team.agentForm.avatarUrl')}
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder={t('team.agentForm.avatarUrlPlaceholder')}
        />
      </div>
    </GlassModal>
  );
}
