import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, ArchiveX, X, GitMerge, Plus, Search, Send } from 'lucide-react';
import { GlobalFilterBar, type FilterChipConfig } from '@/components/ui/GlobalFilterBar';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { ordersApi, supportApi } from '@/services/ordersApi';
import { coliixApi } from '@/services/coliixApi';
import {
  CONFIRMATION_STATUS_OPTIONS,
  SHIPPING_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from '@/constants/statusColors';
import { PERMISSIONS } from '@/constants/permissions';
import type { Order, Product, AgentOption } from '@/types/orders';
import { cn } from '@/lib/cn';
import { getSocket } from '@/services/socket';
import { useToastStore } from '@/store/toastStore';

import { useOrders } from './hooks/useOrders';
import { OrderSummaryCards } from './components/OrderSummaryCards';
import { OrdersTable, type OrderColiixError } from './components/OrdersTable';
import { OrderEditModal } from './components/OrderEditModal';
import { OrderPreviewModal } from './components/OrderPreviewModal';
import { OrderLogsModal } from './components/OrderLogsModal';
import { CustomerHistoryModal } from './components/CustomerHistoryModal';
import { AgentPickerModal } from './components/AgentPickerModal';
import { MergeDuplicatesModal } from './components/MergeDuplicatesModal';
import { OrderCreateModal } from './components/OrderCreateModal';

// ─── Bulk action bar ──────────────────────────────────────────────────────────

interface BulkBarProps {
  count: number;
  canAssign: boolean;
  canSendColiix: boolean;
  onAssign: () => void;
  onUnassign: () => void;
  onSendColiix: () => void;
  onArchive: () => void;
  onClear: () => void;
  loading: boolean;
}

function BulkBar({
  count,
  canAssign,
  canSendColiix,
  onAssign,
  onUnassign,
  onSendColiix,
  onArchive,
  onClear,
  loading,
}: BulkBarProps) {
  const { t } = useTranslation();
  return (
    <div className="slide-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="glass flex items-center gap-3 px-5 py-3 shadow-hover">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
            {count}
          </span>
          <span className="text-sm font-semibold text-gray-700">
            {t('orders.selected', { count })}
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
            {t('orders.bulkAssign')}
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
            {t('orders.bulkUnassign')}
          </CRMButton>
        )}
        {canSendColiix && (
          <CRMButton
            variant="secondary"
            size="sm"
            leftIcon={<Send size={13} />}
            onClick={onSendColiix}
            loading={loading}
          >
            {t('orders.bulkSendColiix')}
          </CRMButton>
        )}
        <CRMButton
          variant="danger"
          size="sm"
          leftIcon={<ArchiveX size={13} />}
          onClick={onArchive}
          loading={loading}
        >
          {t('orders.bulkArchive')}
        </CRMButton>
        <button
          onClick={onClear}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600"
        >
          {t('orders.bulkClear')}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canAssign = hasPermission(PERMISSIONS.ORDERS_ASSIGN);
  const canDelete = hasPermission(PERMISSIONS.ORDERS_DELETE);
  const canCreate = hasPermission(PERMISSIONS.ORDERS_CREATE);
  const canImport = hasPermission(PERMISSIONS.INTEGRATIONS_MANAGE);
  const canSendColiix = hasPermission(PERMISSIONS.SHIPPING_PUSH);

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
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
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
  // Per-order spinner state for the row-level "Send to Coliix" button.
  // We let multiple sends fire concurrently — Bull serialises the
  // backend side, the UI just shows which rows are in flight.
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  // Synchronous mirror of sendingIds for the click handler — React state
  // updates are async, so a fast double-click can fire two POSTs before
  // setSendingIds has flushed. The ref lets the handler short-circuit
  // immediately on the second click.
  const sendingIdsRef = useRef<Set<string>>(new Set());
  // Latest unresolved Coliix error per orderId. The Send column reads
  // from here to render the red retry-flavoured button + hover tooltip.
  const [coliixErrorByOrder, setColiixErrorByOrder] = useState<Record<string, OrderColiixError>>({});
  const toast = useToastStore((s) => s.push);

  // Product + agent filter options — loaded once for the filter chips.
  const [products, setProducts] = useState<Product[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
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
    supportApi
      .agents()
      .then((res) => {
        if (!cancelled) setAgents(res);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Initial pull of unresolved Coliix errors → keep one row per orderId
  // (most recent wins). After mount we don't refetch — coliix:error and
  // coliix:error:resolved patch the map surgically.
  useEffect(() => {
    let cancelled = false;
    coliixApi
      .listErrors({ resolved: false, pageSize: 100 })
      .then((result) => {
        if (cancelled) return;
        const map: Record<string, OrderColiixError> = {};
        for (const e of result.data) {
          if (!e.orderId) continue;
          if (!map[e.orderId]) {
            map[e.orderId] = { id: e.id, type: e.type, message: e.message };
          }
        }
        setColiixErrorByOrder(map);
      })
      .catch(() => {
        /* permission or network — leave map empty */
      });
    return () => { cancelled = true; };
  }, []);

  // Live patches: new error arrives → add; resolved → drop. No full refetch
  // anymore (the old "refetch on every order:updated" caused a /coliix/errors
  // round-trip on every status change in the system).
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const onError = (payload: unknown) => {
      const e = payload as { id?: string; orderId?: string | null; type?: string; message?: string; resolved?: boolean } | undefined;
      if (!e?.id || !e.orderId || e.resolved) return;
      setColiixErrorByOrder((prev) => ({
        ...prev,
        [e.orderId!]: { id: e.id!, type: e.type ?? '', message: e.message ?? '' },
      }));
    };

    const onResolved = (payload: unknown) => {
      const id = (payload as { id?: string })?.id;
      if (!id) return;
      setColiixErrorByOrder((prev) => {
        // Drop the entry whose error id matches.
        const next: Record<string, OrderColiixError> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.id !== id) next[k] = v;
        }
        return next;
      });
    };

    socket.on('coliix:error', onError);
    socket.on('coliix:error:resolved', onResolved);
    return () => {
      socket?.off('coliix:error', onError);
      socket?.off('coliix:error:resolved', onResolved);
    };
  }, []);

  const filterConfigs = useMemo<FilterChipConfig[]>(() => {
    const base: FilterChipConfig[] = [
      {
        key: 'confirmationStatuses',
        label: t('orders.filterConfirmation'),
        options: CONFIRMATION_STATUS_OPTIONS,
      },
      {
        key: 'shippingStatuses',
        label: t('orders.filterShipping'),
        options: SHIPPING_STATUS_OPTIONS,
      },
      {
        key: 'sources',
        label: t('orders.filterSource'),
        options: SOURCE_OPTIONS,
      },
    ];
    const extras: FilterChipConfig[] = [];
    if (products.length > 0) {
      extras.push({
        key: 'productIds',
        label: t('orders.filterProduct'),
        options: products.map((p) => ({ value: p.id, label: p.name })),
      });
    }
    if (agents.length > 0) {
      extras.push({
        key: 'agentIds',
        label: t('orders.filterAgent'),
        options: agents.map((a) => ({ value: a.id, label: a.name })),
      });
    }
    return [...base, ...extras];
  }, [products, agents, t]);

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

  const handleView = useCallback((order: Order) => {
    setPreviewOrder(order);
  }, []);

  const handleEdit = useCallback((order: Order) => {
    setEditOrder(order);
  }, []);

  const handleArchive = useCallback(
    async (order: Order) => {
      if (!canDelete) return;
      if (!window.confirm(t('orders.confirmArchiveOne', { reference: order.reference }))) return;
      try {
        await ordersApi.archive(order.id);
        refresh();
      } catch {
        // ignore
      }
    },
    [canDelete, refresh, t],
  );

  const handleAssignSingle = useCallback((order: Order) => {
    setAssignTargetOrder(order);
    setAssignPickerOpen(true);
  }, []);

  const handleViewLogs = useCallback(
    (order: Order, type: 'all' | 'confirmation' | 'shipping') => {
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

  // Direct one-click "Send to Coliix": no modal, no extra steps. The
  // backend POSTs to Coliix's add-parcel API, gets the tracking code
  // back, persists the Shipment row, and emits order:updated so the
  // row patches in place to its new "Sent" badge.
  const handleSendColiix = useCallback(
    async (order: Order) => {
      // Guard: a rapid double-click used to fire two POSTs to Coliix
      // before sendingIds had flushed → two parcels created on Coliix's
      // side. The ref tracks in-flight ids synchronously so the second
      // click no-ops immediately.
      if (sendingIdsRef.current.has(order.id)) return;
      sendingIdsRef.current.add(order.id);
      setSendingIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
      try {
        const res = await coliixApi.createShipment(order.id);
        toast({
          kind: 'success',
          title: t('orders.sendSuccessTitle', { reference: order.reference }),
          body: t('orders.sendSuccessBody', { tracking: res.trackingCode }),
          durationMs: 6000,
        });
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: { message?: string; code?: string } } } };
        const message = e.response?.data?.error?.message ?? t('orders.sendErrFallback');
        toast({
          kind: 'error',
          title: t('orders.sendErrTitle', { reference: order.reference }),
          body: message,
          durationMs: 12_000,
        });
      } finally {
        sendingIdsRef.current.delete(order.id);
        setSendingIds((prev) => prev.filter((id) => id !== order.id));
      }
    },
    [t, toast],
  );

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

  // Bulk "Send to Coliix": fans the per-order createShipment call across
  // every selected row with bounded concurrency (3 in flight at once) so a
  // 50-order selection finishes in seconds without saturating Coliix's
  // API. Each call is independent — failures don't block successes — and
  // the final summary toast tells the agent how many landed and how many
  // need a retry. The per-row error indicator (coliixErrorByOrder) still
  // surfaces on each failed row via the existing socket-driven refresh.
  const handleBulkSendColiix = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(t('orders.confirmSendColiix', { count: selectedIds.length }))) return;
    setBulkLoading(true);
    selectedIds.forEach((id) => sendingIdsRef.current.add(id));
    setSendingIds((prev) => Array.from(new Set([...prev, ...selectedIds])));
    let ok = 0;
    let failed = 0;
    const queue = [...selectedIds];
    const concurrency = 3;
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift();
        if (!id) break;
        try {
          await coliixApi.createShipment(id);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
    });
    try {
      await Promise.all(workers);
      toast({
        kind: failed === 0 ? 'success' : 'error',
        title:
          failed === 0
            ? t('orders.bulkSendOkTitle', { count: ok })
            : t('orders.bulkSendPartialTitle', { ok, failed }),
        durationMs: 8000,
      });
      setSelectedIds([]);
      refresh();
    } finally {
      selectedIds.forEach((id) => sendingIdsRef.current.delete(id));
      setSendingIds((prev) => prev.filter((id) => !selectedIds.includes(id)));
      setBulkLoading(false);
    }
  }, [selectedIds, setSelectedIds, refresh, t, toast]);

  const handleBulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(t('orders.confirmArchiveMany', { count: selectedIds.length }))) return;
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
  }, [selectedIds, setSelectedIds, refresh, t]);

  const showBulkBar = selectedIds.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header with "new order" action ─────────────────────────────────── */}
      {canCreate && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('orders.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('orders.subtitle')}
            </p>
          </div>
          <CRMButton
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
          >
            {t('orders.newOrder')}
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
                {t('orders.duplicatesBanner', { count: duplicateCount })}
              </p>
              <p className="text-[11px] text-amber-700/80">
                {t('orders.duplicatesBannerSub')}
              </p>
            </div>
          </div>
          <span className="rounded-btn bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors group-hover:bg-amber-700">
            {t('orders.review')}
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
            placeholder={t('orders.searchPlaceholder')}
            className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder-gray-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-gray-400 hover:text-gray-600"
              aria-label={t('orders.clearSearch')}
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
        onView={handleView}
        onEdit={handleEdit}
        onArchive={handleArchive}
        onAssign={handleAssignSingle}
        onViewLogs={handleViewLogs}
        onViewCustomer={handleViewCustomer}
        onRefresh={refresh}
        canImport={canImport}
        // Direct fire — Coliix add-parcel runs server-side, no modal.
        onSendColiix={handleSendColiix}
        sendingIds={sendingIds}
        coliixErrorByOrder={coliixErrorByOrder}
      />

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {showBulkBar && (
        <BulkBar
          count={selectedIds.length}
          canAssign={canAssign}
          canSendColiix={canSendColiix}
          onAssign={handleBulkAssign}
          onUnassign={handleBulkUnassign}
          onSendColiix={handleBulkSendColiix}
          onArchive={handleBulkArchive}
          onClear={() => setSelectedIds([])}
          loading={bulkLoading}
        />
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <OrderPreviewModal
        order={previewOrder}
        onClose={() => setPreviewOrder(null)}
        onEdit={(order) => {
          setPreviewOrder(null);
          setEditOrder(order);
        }}
      />

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
          orderSummaries={orders
            .filter((o) => selectedIds.includes(o.id))
            .map((o) => ({
              id: o.id,
              reference: o.reference,
              agentName: o.agent?.name ?? null,
            }))}
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
