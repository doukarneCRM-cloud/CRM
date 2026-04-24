import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { teamApi, type RoleDetail, type PermissionOption } from '@/services/teamApi';

import { TeamTabs } from './components/TeamTabs';
import { RolePermissionCard } from './components/RolePermissionCard';
import { RoleFormModal } from './components/RoleFormModal';

export default function RolesPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.TEAM_MANAGE_ROLES);

  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [permissions, setPermissions] = useState<PermissionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([teamApi.listRoles(), teamApi.listPermissions()]);
      setRoles(r);
      setPermissions(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <TeamTabs />

      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('team.roles.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('team.roles.subtitle')}
            </p>
          </div>
          {canManage && (
            <CRMButton leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
              {t('team.roles.new')}
            </CRMButton>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-card" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {roles.map((role) => (
              <RolePermissionCard
                key={role.id}
                role={role}
                permissions={permissions}
                canEdit={canManage}
                onSaved={load}
              />
            ))}
          </div>
        )}
      </div>

      <RoleFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />
    </div>
  );
}
