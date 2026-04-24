import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { PillTabGroup } from '@/components/ui/PillTab';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { teamApi, type TeamUser, type RoleDetail } from '@/services/teamApi';

import { TeamTabs } from './components/TeamTabs';
import { AgentCard } from './components/AgentCard';
import { AgentFormModal } from './components/AgentFormModal';

type TabKey = 'active' | 'inactive';

export default function AgentsPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(PERMISSIONS.TEAM_CREATE);
  const canEdit = hasPermission(PERMISSIONS.TEAM_EDIT);

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('active');

  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([teamApi.listUsers(), teamApi.listRoles()]);
      setUsers(u);
      setRoles(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    return { active, inactive: users.length - active };
  }, [users]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (tab === 'active' && !u.isActive) return false;
      if (tab === 'inactive' && u.isActive) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.label.toLowerCase().includes(q)
      );
    });
  }, [users, search, tab]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (user: TeamUser) => {
    setEditing(user);
    setModalOpen(true);
  };

  const toggleActive = async (user: TeamUser) => {
    const note = user.isActive
      ? t('team.agents.confirm.deactivate')
      : t('team.agents.confirm.reactivate');
    if (!window.confirm(note)) return;
    try {
      await teamApi.updateUser(user.id, { isActive: !user.isActive });
      await load();
    } catch {
      window.alert(
        user.isActive
          ? t('team.agents.toggleFailed.deactivate')
          : t('team.agents.toggleFailed.reactivate'),
      );
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TeamTabs />

      <div className="flex flex-col gap-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('team.agents.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('team.agents.counts', { active: counts.active, inactive: counts.inactive })}
            </p>
          </div>
          {canCreate && (
            <CRMButton leftIcon={<Plus size={14} />} onClick={openCreate}>
              {t('team.agents.new')}
            </CRMButton>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-card border border-gray-100 bg-white p-3">
          <div className="min-w-[240px] flex-1">
            <CRMInput
              placeholder={t('team.agents.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={14} />}
            />
          </div>
          <PillTabGroup
            tabs={[
              { id: 'active',   label: t('team.agents.filter.active'),   count: counts.active   },
              { id: 'inactive', label: t('team.agents.filter.inactive'), count: counts.inactive },
            ]}
            activeTab={tab}
            onChange={(id) => setTab(id as TabKey)}
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-48 rounded-card" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-gray-200 py-16 text-gray-400">
            <p className="text-sm">{t('team.agents.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((user) => (
              <AgentCard
                key={user.id}
                user={user}
                canEdit={canEdit}
                onEdit={() => openEdit(user)}
                onToggleActive={() => toggleActive(user)}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </div>

      <AgentFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        editing={editing}
        roles={roles}
      />
    </div>
  );
}
