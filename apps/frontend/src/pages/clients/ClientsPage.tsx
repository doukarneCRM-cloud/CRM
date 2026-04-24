import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { PillTabGroup } from '@/components/ui/PillTab';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { customersApi, supportApi, type ClientListItem } from '@/services/ordersApi';
import type { ShippingCity } from '@/types/orders';

import { useClients } from './useClients';
import { ClientsTable } from './components/ClientsTable';
import { CreateClientModal } from './components/CreateClientModal';
import { CustomerHistoryModal } from '../orders/components/CustomerHistoryModal';

export default function ClientsPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(PERMISSIONS.CLIENTS_EDIT);
  const canEditTag = hasPermission(PERMISSIONS.CLIENTS_EDIT);

  const tagTabs = useMemo(
    () => [
      { id: 'all',         label: t('clients.tabs.all')         },
      { id: 'normal',      label: t('clients.tabs.normal')      },
      { id: 'vip',         label: t('clients.tabs.vip')         },
      { id: 'blacklisted', label: t('clients.tabs.blacklisted') },
    ],
    [t],
  );

  const sortOptions = useMemo(
    () => [
      { value: 'recent',       label: t('clients.sort.recent')     },
      { value: 'totalOrders',  label: t('clients.sort.topBuyers')  },
    ],
    [t],
  );

  const {
    clients, total, totalPages, loading,
    page, setPage,
    pageSize, setPageSize,
    search, setSearch,
    city, setCity,
    tag, setTag,
    sortBy, setSortBy,
    refresh,
  } = useClients();

  const [cities, setCities] = useState<ShippingCity[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);

  useEffect(() => {
    supportApi.shippingCities().then(setCities).catch(() => setCities([]));
  }, []);

  const cityOptions = [
    { value: '', label: t('clients.allCities') },
    ...cities.map((c) => ({ value: c.name, label: c.name })),
  ];

  const handleTagChange = async (client: ClientListItem, nextTag: ClientListItem['tag']) => {
    // Optimistic — silently fall back by refreshing on error
    try {
      await customersApi.update(client.id, { tag: nextTag });
      refresh();
    } catch {
      refresh();
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('clients.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('clients.subtitle')}</p>
        </div>
        {canCreate && (
          <CRMButton
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            {t('clients.newClient')}
          </CRMButton>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-card border border-gray-100 bg-white p-3">
        <div className="min-w-[240px] flex-1">
          <CRMInput
            placeholder={t('clients.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search size={14} />}
          />
        </div>

        <div className="w-44">
          <CRMSelect
            options={cityOptions}
            value={city}
            onChange={(v) => setCity(v as string)}
            placeholder={t('clients.allCities')}
            searchable
          />
        </div>

        <div className="w-40">
          <CRMSelect
            options={sortOptions}
            value={sortBy ?? 'recent'}
            onChange={(v) => setSortBy(v as typeof sortBy)}
          />
        </div>

        <PillTabGroup
          tabs={tagTabs}
          activeTab={tag || 'all'}
          onChange={(id) => setTag(id === 'all' ? '' : (id as typeof tag))}
        />
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1">
        <ClientsTable
          clients={clients}
          loading={loading}
          canEditTag={canEditTag}
          onViewHistory={(c) => setHistoryId(c.id)}
          onTagChange={handleTagChange}
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modals */}
      <CreateClientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />

      <CustomerHistoryModal
        customerId={historyId}
        onClose={() => setHistoryId(null)}
      />
    </div>
  );
}
