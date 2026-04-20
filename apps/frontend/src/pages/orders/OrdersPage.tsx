import { useState, useCallback, useEffect, useMemo } from 'react';
import { UserPlus, ArchiveX, X, GitMerge, Plus, Send, Search } from 'lucide-react';
import { GlobalFilterBar, type FilterChipConfig } from '@/components/ui/GlobalFilterBar';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { ordersApi, supportApi } from '@/services/ordersApi';
import { coliixApi, type ExportResult } from '@/services/providersApi';
import {
  CONFIRMATION_STATUS_OPTIONS,
  SHIPPING_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from '@/constants/statusColors';
import { PERMISSIONS } from '@/constants/permissions';
import type { Order, Product } from '@/types/orders';
import { cn } from '@/lib/cn';

import { useOrders } from './hooks/useOrders';
import { OrderSummaryCards } from './components/OrderSummaryCards';
import { OrdersTable } from './components/OrdersTable';
import { OrderEditModal } from './components/OrderEditModal';
import { OrderLogsModal } from './components/OrderLogsModal';
import { CustomerHistoryModal } from './components/CustomerHistoryModal';
import { AgentPickerModal } from './components/AgentPickerModal';
import { MergeDuplicatesModal } from './components/MergeDuplicatesModal';
import { OrderCreateModal } from './components/OrderCreateModal';
import { ColiixExportResultModal } from './components/ColiixExportResultModal';

// ─── Filter configs for GlobalFilterBar ──────────────────────────────────────

const STATIC_FILTER_CONFIGS: FilterChipConfig[] = [
  {
    key: 'confirmationStatuses',
    label: 'Confirmation',
    options: CONFIRMATION_STATUS_OPTIONS,
  },
  {
    key: 'shippingStatuses',
    label: 'Shipping',
    options: SHIPPING_STATUS_OPTIONS,
  },
  {
    key: 'sources',
    label: 'Source',
    options: SOURCE_OPTIONS,
  },
];

// ─── Bulk action bar ──────────────────────────────────────────────────────────

interface BulkBarProps {
  count: number;
  canAssign: boolean;
  canShip: boolean;
  onAssign: () => void;
  onUnassign: () => void;
  onArchive: () => void;
  onSendColiix: () => void;
  onClear: () => void;
  loading: boolean;
  shipping: boolean;
}

function BulkBar({ count, canAssign, canShip, onAssign, onUnassign, onArchive, onSendColiix, onClear, loading, shipping }: BulkBarProps) {
  return (
    <div className="slide-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="glass flex items-center gap-3 px-5 py-3 shadow-hover">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
            {count}
          </span>
          <span className="text-sm font-semibold text-gray-700">
            order{count !== 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        {canAssign && (
          <CRMButton
            variant="primary"
            size="sm"
            leftIcon={<UserPlus size={13} />}
            onClick={onAssign}
            loading={loading}
          >
            Assign
          </CRMButton>
        )}
        {canAssign && (
          <CRMButton
            variant="secondary"
            size="sm"
            leftIcon={<X size={13} />}
            onClick={onUnassign}
            loading={loading}
          >
            Unassign
          </CRMButton>
        )}
        {canShip && (
          <CRMButton
            variant="primary"
            size="sm"
            leftIcon={<Send size={13} />}
            onClick={onSendColiix}
            loading={shipping}
          >
            Send to Coliix
          </CRMButton>
        )}
        <CRMButton
          variant="danger"
          size="sm"
          leftIcon={<ArchiveX size={13} />}
          onClick={onArchive}
          loading={loading}
        >
          Archive
        </CRMButton>
        <button
          onClick={onClear}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { hasPermission } = useAuthStore();
  const canAssign = hasPermission(PERMISSIONS.ORDERS_ASSIGN);
  const canDelete = hasPermission(PERMISSIONS.ORDERS_DELETE);
  const canCreate = hasPermission(PERMISSIONS.ORDERS_CREATE);
  const canImport = hasPermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const canShip = hasPermission(PERMISSIONS.SHIPPING_PUSH);

  const {
    orders,
    pagination,
    loading,
    page,
    pageSize,
    setPage,
    setPageSize,
    selectedIds,
    setSelectedIds,
    search,
    setSearch,
    refresh,
  } = useOrders();

  // ── Modal state ────────────────────────────────────────────────────────────
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [logsOrder, setLogsOrder] = useState<{
    orderId: string;
    reference: string;
    defaultFilter: 'all' | 'confirmation' | 'shipping';
  } | null>(null);
  const [historyCustomerId, setHistoryCustomerId] = useState<string | null>(null);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [assignTargetOrder, setAssignTargetOrder] = useState<Order | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  // Product filter options — loaded once so the filter chip can populate
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    let cancelled = false;
    supportApi
      .products()
      .then((res) => {
        if (!cancelled) setProducts(res);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => { cancelled = true; };
  }, []);

  const filterConfigs = useMemo<FilterChipConfig[]>(() => {
    if (products.length === 0) return STATIC_FILTER_CONFIGS;
    return [
      ...STATIC_FILTER_CONFIGS,
      {
        key: 'productIds',
        label: 'Product',
        options: products.map((p) => ({ value: p.id, label: p.name })),
      },
    ];
  }, [products]);

  // Coliix export state
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  const [coliixShipping, setColiixShipping] = useState(false);
  const [coliixResult, setColiixResult] = useState<
    { results: ExportResult[]; summary: { total: number; ok: number; failed: number } } | null
  >(null);

  // ── Poll duplicate count so the banner stays in sync with live order changes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { groups } = await ordersApi.duplicates();
        if (!cancelled) setDuplicateCount(groups.length);
      } catch {
        if (!cancelled) setDuplicateCount(0);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orders]);

  // ── Table callbacks ────────────────────────────────────────────────────────

  const handleEdit = useCallback((order: Order) => {
    setEditOrder(order);
  }, []);

  const handleArchive = useCallback(
    async (order: Order) => {
      if (!canDelete) return;
      if (!window.confirm(`Archive order ${order.reference}? This can be undone.`)) return;
      try {
        await ordersApi.archive(order.id);
        refresh();
      } catch {
        // ignore
      }
    },
    [canDelete, refresh],
  );

  const handleAssignSingle = useCallback((order: Order) => {
    setAssignTargetOrder(order);
    setAssignPickerOpen(true);
  }, []);

  const handleViewLogs = useCallback(
    (order: Order, type: 'confirmation' | 'shipping') => {
      setLogsOrder({
        orderId: order.id,
        reference: order.reference,
        defaultFilter: type,
      });
    },
    [],
  );

  const handleViewCustomer = useCallback((order: Order) => {
    setHistoryCustomerId(order.customer.id);
  }, []);

  // ── Bulk actions ──────────────────────────────────────────────────────────

  const handleBulkAssign = useCallback(() => {
    setAssignTargetOrder(null); // bulk mode — no single order
    setAssignPickerOpen(true);
  }, []);

  const handleBulkUnassign = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await ordersApi.bulk({ orderIds: selectedIds, action: 'unassign' });
      setSelectedIds([]);
      refresh();
    } catch {
      // ignore
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, setSelectedIds, refresh]);

  const handleBulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Archive ${selectedIds.length} orders? This can be undone.`)) return;
    setBulkLoading(true);
    try {
      await ordersApi.bulk({ orderIds: selectedIds, action: 'archive' });
      setSelectedIds([]);
      refresh();
    } catch {
      // ignore
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, setSelectedIds, refresh]);

  // ── Coliix export ─────────────────────────────────────────────────────────

  const handleSendColiix = useCallback(
    async (order: Order) => {
      if (!canShip) return;
      setSendingIds((prev) => [...prev, order.id]);
      try {
        const result = await coliixApi.exportOne(order.id);
        setColiixResult({
          results: [result],
          summary: { total: 1, ok: result.ok ? 1 : 0, failed: result.ok ? 0 : 1 },
        });
        refresh();
      } catch (e: any) {
        const message = e?.response?.data?.error?.message ?? e?.response?.data?.error ?? 'Export failed';
        setColiixResult({
          results: [{ orderId: order.id, reference: order.reference, ok: false, error: String(message) }],
          summary: { total: 1, ok: 0, failed: 1 },
        });
      } finally {
        setSendingIds((prev) => prev.filter((id) => id !== order.id));
      }
    },
    [canShip, refresh],
  );

  const handleBulkSendColiix = useCallback(async () => {
    if (!canShip || selectedIds.length === 0) return;
    if (!window.confirm(`Send ${selectedIds.length} order${selectedIds.length === 1 ? '' : 's'} to Coliix?`)) return;
    setColiixShipping(true);
    setSendingIds(selectedIds);
    try {
      const response = await coliixApi.exportBulk(selectedIds);
      setColiixResult(response);
      setSelectedIds([]);
      refresh();
    } catch (e: any) {
      const message = e?.response?.data?.error?.message ?? 'Bulk export failed';
      setColiixResult({
        results: selectedIds.map((id) => ({ orderId: id, reference: '?', ok: false, error: String(message) })),
        summary: { total: selectedIds.length, ok: 0, failed: selectedIds.length },
      });
    } finally {
      setColiixShipping(false);
      setSendingIds([]);
    }
  }, [canShip, selectedIds, setSelectedIds, refresh]);

  const showBulkBar = selectedIds.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header with "new order" action ─────────────────────────────────── */}
      {canCreate && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">Orders</h1>
            <p className="mt-1 text-sm text-gray-500">
              Browse, assign, and manage orders across all sources.
            </p>
          </div>
          <CRMButton
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            New order
          </CRMButton>
        </div>
      )}

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <OrderSummaryCards />

      {/* ── Duplicate-orders banner ────────────────────────────────────────── */}
      {duplicateCount > 0 && (
        <button
          onClick={() => setMergeOpen(true)}
          className="group flex items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50/80 px-4 py-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-100/60"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <GitMerge size={16} />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {duplicateCount} customer{duplicateCount !== 1 ? 's' : ''} with duplicate pending orders
              </p>
              <p className="text-[11px] text-amber-700/80">
                Review and merge to keep KPIs clean — merged orders count as one.
              </p>
            </div>
          </div>
          <span className="rounded-btn bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors group-hover:bg-amber-700">
            Review
          </span>
        </button>
      )}

      {/* ── Search + Filter bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex h-10 w-full min-w-[260px] items-center gap-2 rounded-card border border-gray-100 bg-white/80 px-3 backdrop-blur-sm focus-within:border-primary lg:w-80">
          <Search size={15} className="text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by reference, name, phone, city, tracking…"
            className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <GlobalFilterBar
          filterConfigs={filterConfigs}
          showDateRange
          sticky={false}
          className={cn('flex-1 border border-gray-100')}
        />
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <OrdersTable
        orders={orders}
        loading={loading}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        page={page}
        pageSize={pageSize}
        total={pagination.total}
        totalPages={pagination.totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onEdit={handleEdit}
        onArchive={handleArchive}
        onAssign={handleAssignSingle}
        onViewLogs={handleViewLogs}
        onViewCustomer={handleViewCustomer}
        onRefresh={refresh}
        canImport={canImport}
        onSendColiix={canShip ? handleSendColiix : undefined}
        sendingIds={sendingIds}
      />

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {showBulkBar && (
        <BulkBar
          count={selectedIds.length}
          canAssign={canAssign}
          canShip={canShip}
          onAssign={handleBulkAssign}
          onUnassign={handleBulkUnassign}
          onArchive={handleBulkArchive}
          onSendColiix={handleBulkSendColiix}
          onClear={() => setSelectedIds([])}
          loading={bulkLoading}
          shipping={coliixShipping}
        />
      )}

      <ColiixExportResultModal
        open={!!coliixResult}
        onClose={() => setColiixResult(null)}
        results={coliixResult?.results ?? []}
        summary={coliixResult?.summary ?? { total: 0, ok: 0, failed: 0 }}
      />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <OrderEditModal
        order={editOrder}
        onClose={() => setEditOrder(null)}
        onSaved={() => {
          setEditOrder(null);
          refresh();
        }}
      />

      <OrderLogsModal
        orderId={logsOrder?.orderId ?? null}
        orderReference={logsOrder?.reference}
        defaultFilter={logsOrder?.defaultFilter ?? 'all'}
        onClose={() => setLogsOrder(null)}
      />

      <CustomerHistoryModal
        customerId={historyCustomerId}
        onClose={() => setHistoryCustomerId(null)}
      />

      <MergeDuplicatesModal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        onMerged={() => {
          refresh();
        }}
      />

      <OrderCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />

      {/* Single order assign */}
      {assignTargetOrder && (
        <AgentPickerModal
          open={assignPickerOpen}
          onClose={() => {
            setAssignPickerOpen(false);
            setAssignTargetOrder(null);
          }}
          orderId={assignTargetOrder.id}
          onSuccess={() => {
            setAssignTargetOrder(null);
            refresh();
          }}
        />
      )}

      {/* Bulk assign (no assignTargetOrder) */}
      {!assignTargetOrder && assignPickerOpen && (
        <AgentPickerModal
          open={assignPickerOpen}
          onClose={() => setAssignPickerOpen(false)}
          orderIds={selectedIds}
          onSuccess={() => {
            setSelectedIds([]);
            setAssignPickerOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
