import { useEffect, useState } from 'react';
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

const TAG_TABS = [
  { id: 'all',         label: 'All'         },
  { id: 'normal',      label: 'Normal'      },
  { id: 'vip',         label: 'VIP'         },
  { id: 'blacklisted', label: 'Blacklisted' },
];

const SORT_OPTIONS = [
  { value: 'recent',       label: 'Most recent'  },
  { value: 'totalOrders',  label: 'Top buyers'   },
];

export default function ClientsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(PERMISSIONS.CLIENTS_EDIT);
  const canEditTag = hasPermission(PERMISSIONS.CLIENTS_EDIT);

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
    { value: '', label: 'All cities' },
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
          <h1 className="text-2xl font-bold text-primary">Clients</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse, segment, and review the history of every customer.
          </p>
        </div>
        {canCreate && (
          <CRMButton
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            New client
          </CRMButton>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-card border border-gray-100 bg-white p-3">
        <div className="min-w-[240px] flex-1">
          <CRMInput
            placeholder="Search by name, phone, or city..."
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
            placeholder="All cities"
            searchable
          />
        </div>

        <div className="w-40">
          <CRMSelect
            options={SORT_OPTIONS}
            value={sortBy ?? 'recent'}
            onChange={(v) => setSortBy(v as typeof sortBy)}
          />
        </div>

        <PillTabGroup
          tabs={TAG_TABS}
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
