import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  MessageCircle, Check, X, Phone, PhoneOff, Ban, Calendar,
  AlertTriangle, PackageX, Save, Lock, Clock, Plus, Trash2, Truck, Copy,
} from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { CRMButton } from '@/components/ui/CRMButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ordersApi, supportApi, customersApi, type PendingSibling } from '@/services/ordersApi';
import type { Order, Product, ShippingCity } from '@/types/orders';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';
import { useCallCenterStore } from '../callCenterStore';
import { DuplicateOrdersDialog } from './DuplicateOrdersDialog';

// Shipping statuses at or past "picked_up" — Coliix has the parcel, so items
// can no longer be edited and confirmation can't change.
const SHIPPED_OUT = new Set([
  'picked_up', 'in_transit', 'out_for_delivery', 'delivered',
  'attempted', 'returned', 'return_validated', 'return_refused',
  'exchange', 'lost', 'destroyed',
]);

// Moroccan mobile: local 0 + 5/6/7 + 8 digits.
const MA_PHONE_RE = /^0[567]\d{8}$/;

// ─── Item types (mirror OrderCreateModal for UX parity) ─────────────────────

interface DraftItem {
  key: string;
  existingId: string | null;   // OrderItem.id for existing rows, null for newly added
  productId: string;
  variantId: string;
  color: string | null;
  size: string | null;
  stock: number;
  unitPrice: number;
  quantity: number;
}

function randKey() {
  return Math.random().toString(36).slice(2, 10);
}

function colorsOf(p: Product | undefined): string[] {
  if (!p) return [];
  const s = new Set<string>();
  for (const v of p.variants) if (v.color) s.add(v.color);
  return [...s];
}

function sizesOf(p: Product | undefined, color: string | null): string[] {
  if (!p) return [];
  const s = new Set<string>();
  for (const v of p.variants) {
    if (color && v.color !== color) continue;
    if (v.size) s.add(v.size);
  }
  return [...s];
}

function findVariant(p: Product | undefined, color: string | null, size: string | null) {
  if (!p) return undefined;
  return p.variants.find(
    (v) => (v.color ?? null) === (color ?? null) && (v.size ?? null) === (size ?? null),
  );
}

function makeEmptyDraft(product: Product | undefined): DraftItem {
  if (!product) {
    return {
      key: randKey(), existingId: null, productId: '', variantId: '',
      color: null, size: null, stock: 0, unitPrice: 0, quantity: 1,
    };
  }
  const firstColor = colorsOf(product)[0] ?? null;
  const firstSize = sizesOf(product, firstColor)[0] ?? null;
  const v = findVariant(product, firstColor, firstSize) ?? product.variants[0];
  return {
    key: randKey(),
    existingId: null,
    productId: product.id,
    variantId: v?.id ?? '',
    color: v?.color ?? null,
    size: v?.size ?? null,
    stock: v?.stock ?? 0,
    unitPrice: v?.price ?? product.basePrice,
    quantity: 1,
  };
}

function serializeItems(items: DraftItem[]): string {
  return items
    .map((it) => `${it.variantId}:${it.quantity}:${it.unitPrice}`)
    .sort()
    .join('|');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stockTone(stock: number): string {
  if (stock === 0) return 'text-red-600';
  if (stock <= 3) return 'text-amber-600';
  return 'text-emerald-600';
}

function computeTotal(
  subtotal: number,
  shippingPrice: number,
  discountType: string,
  discountAmount: string,
): { subtotal: number; discount: number; total: number } {
  const disc = parseFloat(discountAmount) || 0;
  let discount = 0;
  if (discountType === 'fixed') discount = disc;
  else if (discountType === 'percentage') discount = (subtotal * disc) / 100;
  const total = Math.max(0, subtotal - discount) + shippingPrice;
  return { subtotal, discount, total };
}

// ─── Local form types ────────────────────────────────────────────────────────

interface FormState {
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  discountType: '' | 'fixed' | 'percentage';
  discountAmount: string;
  confirmationNote: string;     // doubles as cancellation reason
  shippingInstruction: string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function CallCenterOrderModal() {
  const { t } = useTranslation();
  const selectedOrder = useCallCenterStore((s) => s.selectedOrder);
  const closeOrder = useCallCenterStore((s) => s.closeOrder);
  const dismissedDuplicateOrderIds = useCallCenterStore((s) => s.dismissedDuplicateOrderIds);
  const dismissDuplicatesFor = useCallCenterStore((s) => s.dismissDuplicatesFor);

  const [order, setOrder] = useState<Order | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cities, setCities] = useState<ShippingCity[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [originalItemsKey, setOriginalItemsKey] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy-phone transient feedback — flips for ~1.2s after the Copy icon fires
  // so the agent sees confirmation without a toast system.
  const [phoneCopied, setPhoneCopied] = useState(false);

  // Callback prompt state (only thing besides note that's needed for actions)
  const [callbackAt, setCallbackAt] = useState('');
  const [pendingAction, setPendingAction] =
    useState<null | 'confirm' | 'cancel' | 'callback' | 'unreachable' | 'fake' | 'no-stock'>(null);

  // Duplicate-detection state — popped as soon as the modal opens when the
  // client has other unshipped orders from the last 3 days, so the agent
  // deals with duplicates *before* touching Confirm.
  const [siblings, setSiblings] = useState<PendingSibling[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const isOpen = !!selectedOrder;

  // Hydrate on selection
  useEffect(() => {
    if (!selectedOrder) {
      setOrder(null);
      setForm(null);
      setHistory([]);
      setItems([]);
      setError(null);
      setPendingAction(null);
      setCallbackAt('');
      setSiblings([]);
      setShowDuplicates(false);
      return;
    }

    setOrder(selectedOrder);
    setForm({
      customerName: selectedOrder.customer.fullName,
      customerPhone: selectedOrder.customer.phoneDisplay,
      customerCity: selectedOrder.customer.city,
      customerAddress: selectedOrder.customer.address ?? '',
      discountType: (selectedOrder.discountType ?? '') as FormState['discountType'],
      discountAmount: selectedOrder.discountAmount != null ? String(selectedOrder.discountAmount) : '',
      confirmationNote: selectedOrder.confirmationNote ?? '',
      shippingInstruction: selectedOrder.shippingInstruction ?? '',
    });

    // Surface duplicates up-front, before the agent interacts with anything —
    // but only once per session: if the agent already dismissed the popup for
    // this order (Skip/Cancel), don't nag them again every re-open.
    if (!dismissedDuplicateOrderIds.has(selectedOrder.id)) {
      ordersApi.pendingSiblings(selectedOrder.id).then((found) => {
        if (found.length > 0) {
          setSiblings(found);
          setShowDuplicates(true);
        }
      }).catch(() => {});
    }

    Promise.all([
      ordersApi.getById(selectedOrder.id).catch(() => null),
      supportApi.products().catch(() => []),
      supportApi.shippingCities().catch(() => []),
      customersApi.history(selectedOrder.customer.id).catch(() => null),
    ]).then(([fresh, prods, cts, hist]) => {
      const src = fresh ?? selectedOrder;
      if (fresh) setOrder(fresh);
      setProducts(prods);
      setCities(cts);
      if (hist) setHistory(hist.data.filter((o) => o.id !== src.id).slice(0, 5));

      // Build drafts from order items using the loaded product catalogue so
      // color/size selectors have the full variant grid.
      const drafts: DraftItem[] = src.items.map((it) => {
        const prod = prods.find((p) => p.id === it.variant.product.id);
        const variant = prod?.variants.find((v) => v.id === it.variant.id);
        return {
          key: randKey(),
          existingId: it.id,
          productId: it.variant.product.id,
          variantId: it.variant.id,
          color: it.variant.color,
          size: it.variant.size,
          stock: variant?.stock ?? it.variant.stock ?? 0,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
        };
      });
      setItems(drafts);
      setOriginalItemsKey(serializeItems(drafts));
    });
  }, [selectedOrder]);

  // ── Derivations ──────────────────────────────────────────────────────────

  const cityValid = useMemo(() => {
    if (!form?.customerCity) return null;
    return cities.some((c) => c.name.toLowerCase() === form.customerCity.toLowerCase());
  }, [form?.customerCity, cities]);

  // Always surface the order's current city in the dropdown so the field
  // never shows the placeholder while a value is silently stuck in form
  // state. Three cases:
  //   1. Exact match in the Coliix list → use the list as-is (no prepend).
  //   2. Case-only mismatch (e.g. saved "casablanca", list has "Casablanca")
  //      → prepend with the saved casing AND drop the Coliix-cased duplicate.
  //      Otherwise CRMSelect's strict `===` lookup would fail to find the
  //      label even though cityValid (case-insensitive) is true, so the
  //      field would render empty with no warning — agents reported this
  //      as "sometimes the city just doesn't show up".
  //   3. No match at all → prepend so the saved value is visible. The
  //      warning (cityValid === false) tells the agent to fix it.
  const cityOptions = useMemo(() => {
    const opts = cities.map((c) => ({ value: c.name, label: c.name }));
    const current = form?.customerCity?.trim();
    if (!current) return opts;
    if (opts.some((o) => o.value === current)) return opts;
    const lower = current.toLowerCase();
    const deduped = opts.filter((o) => o.value.toLowerCase() !== lower);
    return [{ value: current, label: current }, ...deduped];
  }, [cities, form?.customerCity]);

  const phoneValid = useMemo(() => {
    if (!form) return null;
    return MA_PHONE_RE.test(form.customerPhone.replace(/\s/g, ''));
  }, [form?.customerPhone]);

  const totals = useMemo(() => {
    if (!form || !order) return { subtotal: 0, discount: 0, total: 0 };
    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    return computeTotal(subtotal, order.shippingPrice, form.discountType, form.discountAmount);
  }, [form, order, items]);

  const itemsDirty = useMemo(() => serializeItems(items) !== originalItemsKey, [items, originalItemsKey]);

  const dirty = useMemo(() => {
    if (!order || !form) return false;
    return (
      form.customerName !== order.customer.fullName ||
      form.customerPhone !== order.customer.phoneDisplay ||
      form.customerCity !== order.customer.city ||
      form.customerAddress !== (order.customer.address ?? '') ||
      form.discountType !== ((order.discountType ?? '') as FormState['discountType']) ||
      form.discountAmount !== (order.discountAmount != null ? String(order.discountAmount) : '') ||
      form.confirmationNote !== (order.confirmationNote ?? '') ||
      form.shippingInstruction !== (order.shippingInstruction ?? '') ||
      itemsDirty
    );
  }, [order, form, itemsDirty]);

  // Baseline required to log ANY confirmation transition other than "confirm".
  // We only need enough to identify the customer and know what the order is —
  // address/city/stock may still be missing when the agent marks the order as
  // callback, unreachable, fake, or no-stock. This lets the agent record the
  // outcome without first chasing a complete profile.
  const baseReadiness = useMemo(() => {
    if (!form || !order) return { ok: false, reasons: [t('callCenter.modal.reasons.loading')] };
    const reasons: string[] = [];
    if (!form.customerName.trim()) reasons.push(t('callCenter.modal.reasons.customerNameRequired'));
    if (phoneValid === false) reasons.push(t('callCenter.modal.reasons.phoneInvalid'));
    if (items.length === 0) reasons.push(t('callCenter.modal.reasons.atLeastOneProduct'));
    for (const it of items) {
      if (!it.variantId) {
        reasons.push(t('callCenter.modal.reasons.variantRequired'));
        break;
      }
      if (it.quantity < 1) {
        reasons.push(t('callCenter.modal.reasons.quantityRequired'));
        break;
      }
    }
    return { ok: reasons.length === 0, reasons };
  }, [form, order, items, phoneValid, t]);

  // Stricter check for the "Confirm" transition — once an order is confirmed
  // it goes to shipping, so we must have a deliverable address, a valid
  // shipping city, and enough stock for every line.
  const confirmReadiness = useMemo(() => {
    if (!baseReadiness.ok) return baseReadiness;
    if (!form || !order) return { ok: false, reasons: [t('callCenter.modal.reasons.loading')] };
    const reasons: string[] = [];
    if (!form.customerCity.trim()) reasons.push(t('callCenter.modal.reasons.cityRequired'));
    if (!form.customerAddress.trim()) reasons.push(t('callCenter.modal.reasons.addressRequired'));
    if (cityValid === false) reasons.push(t('callCenter.modal.reasons.cityNotInShipping'));
    for (const it of items) {
      if (it.stock < it.quantity) {
        reasons.push(t('callCenter.modal.reasons.outOfStockProduct', {
          product: products.find((p) => p.id === it.productId)?.name ?? t('callCenter.modal.reasons.product'),
        }));
        break;
      }
    }
    return { ok: reasons.length === 0, reasons };
  }, [baseReadiness, form, order, items, cityValid, products, t]);

  const readinessFor = (action: typeof pendingAction) =>
    action === 'confirm' ? confirmReadiness : baseReadiness;

  if (!isOpen || !order || !form) return null;

  const isLocked = SHIPPED_OUT.has(order.shippingStatus);
  const patch = (updates: Partial<FormState>) => setForm((f) => (f ? { ...f, ...updates } : f));

  // ── Item handlers (mirror OrderCreateModal) ──────────────────────────────

  const updateItem = (key: string, p: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const handleProductChange = (key: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const firstColor = colorsOf(p)[0] ?? null;
    const firstSize = sizesOf(p, firstColor)[0] ?? null;
    const v = findVariant(p, firstColor, firstSize) ?? p.variants[0];
    updateItem(key, {
      productId,
      variantId: v?.id ?? '',
      color: v?.color ?? null,
      size: v?.size ?? null,
      stock: v?.stock ?? 0,
      unitPrice: v?.price ?? p.basePrice,
    });
  };

  const handleColorChange = (key: string, color: string) => {
    const item = items.find((i) => i.key === key);
    if (!item) return;
    const p = products.find((x) => x.id === item.productId);
    const nextSize = sizesOf(p, color)[0] ?? null;
    const v = findVariant(p, color, nextSize);
    if (!v) return;
    updateItem(key, { color, size: nextSize, variantId: v.id, stock: v.stock ?? 0, unitPrice: v.price ?? 0 });
  };

  const handleSizeChange = (key: string, size: string) => {
    const item = items.find((i) => i.key === key);
    if (!item) return;
    const p = products.find((x) => x.id === item.productId);
    const v = findVariant(p, item.color, size);
    if (!v) return;
    updateItem(key, { size, variantId: v.id, stock: v.stock ?? 0, unitPrice: v.price ?? 0 });
  };

  const addItem = () => {
    setItems((prev) => [...prev, makeEmptyDraft(products[0])]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  // ── Save (customer + items + fields) ─────────────────────────────────────

  const persistDraft = async (opts: { skipItems?: boolean } = {}) => {
    if (!order || !form) return;
    const customerDirty =
      form.customerName !== order.customer.fullName ||
      form.customerPhone !== order.customer.phoneDisplay ||
      form.customerCity !== order.customer.city ||
      form.customerAddress !== (order.customer.address ?? '');
    const fieldsDirty =
      form.discountType !== ((order.discountType ?? '') as FormState['discountType']) ||
      form.discountAmount !== (order.discountAmount != null ? String(order.discountAmount) : '') ||
      form.confirmationNote !== (order.confirmationNote ?? '') ||
      form.shippingInstruction !== (order.shippingInstruction ?? '');
    const includeItems = itemsDirty && !opts.skipItems;

    const tasks: Promise<unknown>[] = [];
    if (customerDirty) {
      tasks.push(
        customersApi.update(order.customer.id, {
          fullName: form.customerName,
          phone: form.customerPhone,
          city: form.customerCity,
          address: form.customerAddress || null,
        }),
      );
    }
    if (fieldsDirty || includeItems) {
      const payload: Record<string, unknown> = {
        discountType: form.discountType || null,
        discountAmount: form.discountAmount ? parseFloat(form.discountAmount) : null,
        confirmationNote: form.confirmationNote || null,
        shippingInstruction: form.shippingInstruction || null,
      };
      if (includeItems) {
        payload.items = items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        }));
      }
      tasks.push(ordersApi.update(order.id, payload));
    }
    await Promise.all(tasks);
  };

  const handleSave = async () => {
    if (!order || !form) return;
    if (items.length === 0) {
      setError(t('callCenter.modal.atLeastOneProduct'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
      // No triggerRefresh — the backend's order:updated socket event
      // patches the row in place. Bumping the table's refresh key on
      // top of that re-renders the list with stale state for a frame
      // and resets selection / scroll.
      closeOrder();
    } catch (e) {
      setError(apiErrorMessage(e, t('callCenter.modal.failedToSave')));
    } finally {
      setSaving(false);
    }
  };

  // ── Status transitions ───────────────────────────────────────────────────

  // Persist any pending edits, then apply the status change. Status actions
  // carry the confirmation note through so it lands on the log too.
  // For non-fulfillment transitions (out_of_stock, cancelled, fake, unreachable)
  // we skip item persistence: the agent only needs to flag the order, and a
  // dirty item row that picked an OOS variant would otherwise be rejected by
  // the stock-gated decrement in updateOrder.
  const NON_FULFILLMENT = new Set(['out_of_stock', 'cancelled', 'fake', 'unreachable']);
  const runStatusUpdate = async (payload: Parameters<typeof ordersApi.updateStatus>[1]) => {
    if (!order) return;
    setStatusBusy(true);
    setError(null);
    try {
      const skipItems = payload.confirmationStatus
        ? NON_FULFILLMENT.has(payload.confirmationStatus)
        : false;
      if (dirty) await persistDraft({ skipItems });
      await ordersApi.updateStatus(order.id, payload);
      // Surgical socket update handles the row patch; just close.
      closeOrder();
    } catch (e) {
      setError(apiErrorMessage(e, t('callCenter.modal.failedToUpdateStatus')));
    } finally {
      setStatusBusy(false);
    }
  };

  const triggerStatus = (action: typeof pendingAction) => {
    const check = readinessFor(action);
    if (!check.ok) {
      setError(check.reasons[0]);
      return;
    }
    setError(null);

    if (action === 'cancel') {
      // Cancellation reason now reuses the confirmation note — bail if empty.
      if (!form.confirmationNote.trim()) {
        setError(t('callCenter.modal.reasons.writeCancelReason'));
        return;
      }
    }

    setPendingAction(action);
  };

  const confirmPending = () => {
    if (!pendingAction) return;
    if (pendingAction === 'callback') {
      if (!callbackAt) {
        setError(t('callCenter.modal.reasons.pickCallback'));
        return;
      }
      runStatusUpdate({
        confirmationStatus: 'callback',
        callbackAt: new Date(callbackAt).toISOString(),
        note: form.confirmationNote || undefined,
      });
      return;
    }
    if (pendingAction === 'cancel') {
      runStatusUpdate({
        confirmationStatus: 'cancelled',
        cancellationReason: form.confirmationNote.trim(),
        note: form.confirmationNote || undefined,
      });
      return;
    }
    const statusMap: Record<string, string> = {
      confirm: 'confirmed',
      unreachable: 'unreachable',
      fake: 'fake',
      'no-stock': 'out_of_stock',
    };
    runStatusUpdate({
      confirmationStatus: statusMap[pendingAction],
      note: form.confirmationNote || undefined,
    });
  };

  // ── UI ───────────────────────────────────────────────────────────────────

  const phoneDigits = (form?.customerPhone ?? order.customer.phoneDisplay).replace(/\D/g, '');
  const tagBadge = {
    normal: { label: t('callCenter.modal.tagNormal'), className: 'bg-gray-100 text-gray-600' },
    vip: { label: t('callCenter.modal.tagVip'), className: 'bg-amber-100 text-amber-700' },
    blacklisted: { label: t('callCenter.modal.tagBlacklisted'), className: 'bg-red-100 text-red-700' },
  }[order.customer.tag];

  const pendingCopy: Record<NonNullable<typeof pendingAction>, { title: string; variant: 'primary' | 'danger' }> = {
    confirm: { title: t('callCenter.modal.pending.confirm'), variant: 'primary' },
    cancel: { title: t('callCenter.modal.pending.cancel'), variant: 'danger' },
    callback: { title: t('callCenter.modal.pending.callback'), variant: 'primary' },
    unreachable: { title: t('callCenter.modal.pending.unreachable'), variant: 'primary' },
    fake: { title: t('callCenter.modal.pending.fake'), variant: 'danger' },
    'no-stock': { title: t('callCenter.modal.pending.noStock'), variant: 'primary' },
  };

  return (
    <GlassModal
      open={isOpen}
      onClose={closeOrder}
      size="3xl"
      title={`${order.reference} · ${order.customer.fullName}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <p className="order-2 text-[11px] text-gray-400 sm:order-1">
            {dirty ? t('callCenter.modal.unsavedChanges') : t('callCenter.modal.noPendingChanges')}
          </p>
          <div className="order-1 ml-auto flex items-center gap-2 sm:order-2 sm:ml-0">
            <CRMButton variant="ghost" size="sm" onClick={closeOrder} disabled={saving}>
              {t('common.close')}
            </CRMButton>
            {dirty && (
              <CRMButton
                variant="primary"
                size="sm"
                leftIcon={<Save size={14} />}
                onClick={handleSave}
                loading={saving}
              >
                {t('callCenter.modal.saveChanges')}
              </CRMButton>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Status strip */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.confirmationStatus} type="confirmation" size="sm" showDot />
          <StatusBadge status={order.shippingStatus} type="shipping" size="sm" showDot />
          <span className={cn('rounded-badge px-2 py-0.5 text-[10px] font-semibold', tagBadge.className)}>
            {tagBadge.label}
          </span>
          {order.unreachableCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-badge bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              <PhoneOff size={10} /> {t('callCenter.modal.unreachableBadge', { count: order.unreachableCount })}
            </span>
          )}
          {isLocked && (
            <span className="inline-flex items-center gap-1 rounded-badge bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
              <Lock size={10} /> {t('callCenter.modal.lockedShipped')}
            </span>
          )}
        </div>

        {/* Stock-short warning strip — pending orders only. Under the new
            policy the order stays pending even when its variant runs out;
            we just tell the agent so they can wait, restock, or pick
            "No stock" from the confirmation popup instead of confirming
            and getting a 422. */}
        {order.hasStockWarning && order.confirmationStatus === 'pending' && !isLocked && (
          <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="leading-snug">
              <span className="font-semibold">{t('callCenter.modal.stockShortTitle')}</span>{' '}
              <Trans
                i18nKey="callCenter.modal.stockShortBody"
                components={{ b: <span className="font-semibold" /> }}
              />
            </p>
          </div>
        )}

        {/* ── TWO-COLUMN GRID ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* LEFT COLUMN — Customer + Products */}
          <div className="flex flex-col gap-3">
            {/* Customer */}
            <div className="rounded-card border border-gray-100 bg-white/60 p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                {t('callCenter.modal.customer')}
              </h3>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
                {/* Fields — stack vertically so values stay readable even when the
                    modal splits into two columns and the QR sits alongside. */}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <CRMInput
                    label={t('callCenter.modal.name')}
                    value={form.customerName}
                    onChange={(e) => patch({ customerName: e.target.value })}
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-gray-600">{t('callCenter.modal.phone')}</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="tel"
                        inputMode="tel"
                        value={form.customerPhone}
                        onChange={(e) => patch({ customerPhone: e.target.value })}
                        placeholder={t('callCenter.modal.phonePlaceholder')}
                        className={cn(
                          'h-8 flex-1 min-w-0 rounded-input border px-2 font-mono text-[12px] focus:outline-none focus:ring-2',
                          phoneValid === false
                            ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200'
                            : 'border-gray-200 bg-white text-gray-800 focus:border-primary focus:ring-primary/20',
                        )}
                      />
                      <a
                        href={`tel:${phoneDigits}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-primary text-white hover:bg-primary-dark"
                        title={t('callCenter.modal.call')}
                      >
                        <Phone size={12} />
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!form.customerPhone) return;
                          try {
                            await navigator.clipboard.writeText(form.customerPhone);
                            setPhoneCopied(true);
                            setTimeout(() => setPhoneCopied(false), 1200);
                          } catch {
                            // Silent — clipboard API may be blocked on insecure
                            // contexts; no fallback needed for call-center use.
                          }
                        }}
                        className={cn(
                          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn transition',
                          phoneCopied
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800',
                        )}
                        title={phoneCopied ? t('callCenter.modal.copied') : t('callCenter.modal.copyPhone')}
                      >
                        {phoneCopied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                  <CRMSelect
                    label={t('callCenter.modal.city')}
                    options={cityOptions}
                    value={form.customerCity}
                    onChange={(v) => patch({ customerCity: v as string })}
                    searchable
                    placeholder={t('callCenter.modal.selectCity')}
                  />
                  <CRMInput
                    label={t('callCenter.modal.address')}
                    value={form.customerAddress}
                    onChange={(e) => patch({ customerAddress: e.target.value })}
                  />
                </div>

                {/* Right rail — big WhatsApp CTA + QR-to-call. Both require a
                    valid phone; they stack horizontally on mobile, vertically
                    beside the customer fields on desktop. */}
                {phoneValid !== false && phoneDigits && (
                  <div className="flex w-full shrink-0 flex-row items-stretch justify-center gap-2 sm:w-[104px] sm:flex-col sm:self-stretch">
                    <a
                      href={`https://wa.me/212${phoneDigits.replace(/^0/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-1 flex-col items-center justify-center gap-1 rounded-btn bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-2 text-white shadow-sm transition hover:from-emerald-600 hover:to-emerald-700 hover:shadow-md sm:flex-initial sm:py-3"
                      title={t('callCenter.modal.openWhatsapp')}
                    >
                      <MessageCircle size={32} strokeWidth={2.2} className="transition group-hover:scale-110" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">
                        {t('callCenter.modal.whatsapp')}
                      </span>
                    </a>
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-btn border border-primary/10 bg-gradient-to-br from-white to-accent/30 p-2 sm:flex-initial">
                      <div className="rounded-md bg-white p-1 ring-1 ring-gray-100">
                        <QRCodeSVG
                          value={`tel:+212${phoneDigits.replace(/^0/, '')}`}
                          size={72}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#1e293b"
                        />
                      </div>
                      <span className="text-center text-[9px] font-bold uppercase tracking-wider text-gray-500">
                        {t('callCenter.modal.scanToCall')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {(cityValid === false || phoneValid === false) && (
                <div className="mt-2 flex items-start gap-1.5 rounded-btn bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  <div>
                    {cityValid === false && <div>{t('callCenter.modal.cityNotInColiix')}</div>}
                    {phoneValid === false && (
                      <div>{t('callCenter.modal.invalidMoroccanMobile')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Products */}
            <div className="rounded-card border border-gray-100 bg-white/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {t('callCenter.modal.products')}
                </h3>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                    <Lock size={10} /> {t('callCenter.modal.locked')}
                  </span>
                ) : (
                  <span className="rounded-badge bg-accent/50 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {t('callCenter.modal.itemCount', { count: items.length })}
                  </span>
                )}
              </div>

              {products.length === 0 ? (
                <p className="text-[11px] text-gray-400">{t('callCenter.modal.loadingCatalogue')}</p>
              ) : items.length === 0 ? (
                <p className="text-[11px] text-gray-400">{t('callCenter.modal.noProductsOnOrder')}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {items.map((it) => {
                    const product = products.find((p) => p.id === it.productId);
                    const productOpts = products.map((p) => ({ value: p.id, label: p.name }));
                    const colorOpts = colorsOf(product).map((c) => ({ value: c, label: c }));
                    const sizeOpts = sizesOf(product, it.color).map((s) => ({ value: s, label: s }));
                    return (
                      <div key={it.key} className="rounded-btn border border-gray-100 bg-white/70 p-2">
                        {/* Row 1 — Product (full width, searchable) */}
                        <div className="mb-1.5">
                          <CRMSelect
                            options={productOpts}
                            value={it.productId}
                            onChange={(v) => handleProductChange(it.key, v as string)}
                            searchable
                            placeholder={t('callCenter.modal.selectProduct')}
                            disabled={isLocked}
                          />
                        </div>
                        {/* Row 2 — Color + Size */}
                        <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                          <CRMSelect
                            options={colorOpts}
                            value={it.color ?? ''}
                            onChange={(v) => handleColorChange(it.key, v as string)}
                            placeholder={colorOpts.length === 0 ? '—' : t('callCenter.modal.color')}
                            disabled={isLocked || colorOpts.length === 0}
                          />
                          <CRMSelect
                            options={sizeOpts}
                            value={it.size ?? ''}
                            onChange={(v) => handleSizeChange(it.key, v as string)}
                            placeholder={sizeOpts.length === 0 ? '—' : t('callCenter.modal.size')}
                            disabled={isLocked || sizeOpts.length === 0}
                          />
                        </div>
                        {/* Row 3 — Qty stepper + Remove */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              disabled={isLocked || it.quantity <= 1}
                              onClick={() =>
                                updateItem(it.key, { quantity: Math.max(1, it.quantity - 1) })
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-btn border border-gray-200 bg-white text-[14px] font-bold text-gray-500 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              title={t('callCenter.modal.decrease')}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={Math.max(1, it.stock || 999)}
                              value={it.quantity}
                              disabled={isLocked}
                              onChange={(e) =>
                                updateItem(it.key, {
                                  quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                                })
                              }
                              className="h-8 w-12 rounded-input border border-gray-200 bg-white text-center text-[13px] font-bold text-gray-800 focus:border-primary focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={isLocked || it.quantity >= (it.stock || 999)}
                              onClick={() =>
                                updateItem(it.key, {
                                  quantity: Math.min(it.stock || 999, it.quantity + 1),
                                })
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-btn border border-gray-200 bg-white text-[14px] font-bold text-gray-500 hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              title={t('callCenter.modal.increase')}
                            >
                              +
                            </button>
                          </div>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => removeItem(it.key)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn text-red-400 hover:bg-red-50 hover:text-red-600"
                              title={t('callCenter.modal.remove')}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        {/* Footer — stock + subtotal */}
                        <div className="mt-1.5 flex items-center justify-between text-[10px]">
                          <span className={cn('font-semibold', stockTone(it.stock))}>
                            {it.stock === 0 ? t('callCenter.modal.outOfStock') : t('callCenter.modal.inStock', { count: it.stock })}
                          </span>
                          <span className="text-gray-500">
                            {it.unitPrice.toLocaleString('fr-MA')} MAD ·{' '}
                            <b className="text-gray-800">
                              {(it.quantity * it.unitPrice).toLocaleString('fr-MA')} MAD
                            </b>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!isLocked && products.length > 0 && (
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-btn border border-dashed border-gray-200 py-1.5 text-[11px] text-gray-400 hover:border-primary hover:text-primary"
                >
                  <Plus size={12} /> {t('callCenter.modal.addProduct')}
                </button>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — Pricing, Note, Actions, History */}
          <div className="flex flex-col gap-3">
            {/* Pricing summary */}
            <div className="rounded-card border border-gray-100 bg-accent/30 p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                {t('callCenter.modal.pricing')}
              </h3>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div>
                  <label className="block text-[10px] font-medium text-gray-600">{t('callCenter.modal.discountType')}</label>
                  <div className="mt-0.5 flex rounded-input border border-gray-200 bg-white p-0.5">
                    {(['', 'fixed', 'percentage'] as const).map((dt) => (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => patch({ discountType: dt })}
                        className={cn(
                          'flex-1 rounded-btn py-1 text-[10px] font-medium transition',
                          form.discountType === dt
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700',
                        )}
                      >
                        {dt === '' ? t('callCenter.modal.none') : dt === 'fixed' ? 'MAD' : '%'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-600">{t('callCenter.modal.discountAmount')}</label>
                  <input
                    type="number"
                    min={0}
                    value={form.discountAmount}
                    disabled={!form.discountType}
                    onChange={(e) => patch({ discountAmount: e.target.value })}
                    className="mt-0.5 h-[29px] w-full rounded-input border border-gray-200 bg-white px-2 text-sm focus:border-primary focus:outline-none disabled:bg-gray-50"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-end justify-between border-t border-primary/10 pt-2 text-[11px]">
                <div className="flex flex-col text-gray-500">
                  <span>{t('callCenter.modal.subtotal')} <b className="text-gray-800">{totals.subtotal.toLocaleString('fr-MA')} MAD</b></span>
                  <span>{t('callCenter.modal.discount')} <b className="text-gray-800">{totals.discount.toLocaleString('fr-MA')} MAD</b></span>
                  <span>{t('callCenter.modal.shipping')} <b className="text-gray-800">{order.shippingPrice.toLocaleString('fr-MA')} MAD</b></span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">{t('callCenter.modal.total')}</p>
                  <p className="text-lg font-bold text-primary leading-none">
                    {totals.total.toLocaleString('fr-MA')}
                    <span className="ml-1 text-[10px] font-medium text-gray-400">MAD</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-card border border-gray-100 bg-white/60 p-3">
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-primary">
                    {t('callCenter.modal.confirmationNote')}
                    <span className="ml-2 text-[9px] font-normal normal-case text-gray-400">
                      {t('callCenter.modal.alsoCancellationReason')}
                    </span>
                  </label>
                  <textarea
                    rows={2}
                    value={form.confirmationNote}
                    onChange={(e) => patch({ confirmationNote: e.target.value })}
                    placeholder={t('callCenter.modal.confirmationNotePlaceholder')}
                    className="w-full resize-none rounded-input border border-gray-200 bg-white px-2 py-1.5 text-[12px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <Truck size={10} />
                    {t('callCenter.modal.deliveryNote')}
                  </label>
                  <textarea
                    rows={2}
                    value={form.shippingInstruction}
                    onChange={(e) => patch({ shippingInstruction: e.target.value })}
                    placeholder={t('callCenter.modal.deliveryNotePlaceholder')}
                    className="w-full resize-none rounded-input border border-gray-200 bg-white px-2 py-1.5 text-[12px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-card border border-gray-100 bg-white/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {t('callCenter.modal.actions')}
                </h3>
                {!baseReadiness.ok && !isLocked && (
                  <span className="inline-flex items-center gap-1 rounded-badge bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                    <AlertTriangle size={9} /> {t('callCenter.modal.blocked')}
                  </span>
                )}
              </div>
              {isLocked ? (
                <div className="flex items-center gap-2 rounded-btn bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                  <Lock size={12} />
                  {t('callCenter.modal.orderShippedLocked')}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <CRMButton
                      variant="primary"
                      size="sm"
                      leftIcon={<Check size={12} />}
                      onClick={() => triggerStatus('confirm')}
                      disabled={statusBusy || !confirmReadiness.ok}
                      title={!confirmReadiness.ok ? confirmReadiness.reasons[0] : undefined}
                    >
                      {t('callCenter.modal.actionConfirm')}
                    </CRMButton>
                    <CRMButton variant="danger" size="sm" leftIcon={<X size={12} />} onClick={() => triggerStatus('cancel')} disabled={statusBusy || !baseReadiness.ok}>
                      {t('callCenter.modal.actionCancel')}
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<Calendar size={12} />} onClick={() => { if (!baseReadiness.ok) { setError(baseReadiness.reasons[0]); return; } setPendingAction('callback'); setError(null); }} disabled={statusBusy || !baseReadiness.ok}>
                      {t('callCenter.modal.actionCallback')}
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<PhoneOff size={12} />} onClick={() => triggerStatus('unreachable')} disabled={statusBusy || !baseReadiness.ok}>
                      {t('callCenter.modal.actionUnreachable')}
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<Ban size={12} />} onClick={() => triggerStatus('fake')} disabled={statusBusy || !baseReadiness.ok}>
                      {t('callCenter.modal.actionFake')}
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<PackageX size={12} />} onClick={() => triggerStatus('no-stock')} disabled={statusBusy || !baseReadiness.ok}>
                      {t('callCenter.modal.actionNoStock')}
                    </CRMButton>
                  </div>

                  {!baseReadiness.ok && baseReadiness.reasons[0] ? (
                    <p className="mt-1.5 text-[10px] text-amber-700">{baseReadiness.reasons[0]}</p>
                  ) : !confirmReadiness.ok && confirmReadiness.reasons[0] ? (
                    <p className="mt-1.5 text-[10px] text-amber-700">
                      {t('callCenter.modal.confirmRequires', { reason: confirmReadiness.reasons[0] })}
                    </p>
                  ) : null}
                </>
              )}

              {/* Status confirmation overlay — rendered via portal over the entire page */}
              {pendingAction && createPortal(
                <div
                  className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                  style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
                  onClick={() => { if (!statusBusy) setPendingAction(null); }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'w-full max-w-sm rounded-2xl border bg-white p-5 shadow-2xl',
                      'animate-in fade-in zoom-in-95 duration-150',
                      pendingCopy[pendingAction].variant === 'danger'
                        ? 'border-red-200'
                        : 'border-gray-200',
                    )}
                  >
                    <p className="text-base font-bold text-gray-900">
                      {pendingCopy[pendingAction].title}
                    </p>

                    <div className="mt-4 flex flex-col gap-2.5">
                      {/* Callback date picker */}
                      {pendingAction === 'callback' && (
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-amber-700">
                            {t('callCenter.modal.pending.callbackLabel')}
                          </label>
                          <div className="relative flex items-center">
                            <Clock size={12} className="absolute left-2.5 text-gray-400" />
                            <input
                              type="datetime-local"
                              value={callbackAt}
                              onChange={(e) => setCallbackAt(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        </div>
                      )}

                      {/* Show confirmation note */}
                      {form.confirmationNote.trim() && (
                        <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3.5 py-2.5">
                          <MessageCircle size={14} className="mt-0.5 shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              {t('callCenter.modal.pending.noteSaved')}
                            </span>
                            <p className="mt-1 text-sm text-gray-700">{form.confirmationNote}</p>
                          </div>
                        </div>
                      )}

                      {/* Show delivery note */}
                      {form.shippingInstruction.trim() && (
                        <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 px-3.5 py-2.5">
                          <Truck size={14} className="mt-0.5 shrink-0 text-blue-400" />
                          <div className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-400">
                              {t('callCenter.modal.pending.deliveryNote')}
                            </span>
                            <p className="mt-1 text-sm text-blue-700">{form.shippingInstruction}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-end gap-2">
                      <CRMButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingAction(null)}
                        disabled={statusBusy}
                      >
                        {t('common.cancel')}
                      </CRMButton>
                      <CRMButton
                        variant={pendingCopy[pendingAction].variant}
                        size="sm"
                        onClick={confirmPending}
                        loading={statusBusy}
                        disabled={pendingAction === 'callback' && !callbackAt}
                      >
                        {pendingAction === 'callback' ? t('callCenter.modal.pending.schedule') : t('callCenter.modal.pending.confirm_cta')}
                      </CRMButton>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
            </div>

            {/* Client history (compact) */}
            {history.length > 0 && (
              <div className="rounded-card border border-gray-100 bg-white/60 p-3">
                <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {t('callCenter.modal.clientHistory', { count: history.length })}
                </h3>
                <div className="flex flex-col gap-1">
                  {history.slice(0, 3).map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-gray-800">{h.reference}</span>
                        <span className="text-gray-400">
                          {new Date(h.createdAt).toLocaleDateString('fr-MA')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <StatusBadge status={h.confirmationStatus} size="sm" />
                        <span className="font-semibold text-gray-700">
                          {h.total.toLocaleString('fr-MA')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-1.5 rounded-btn bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-700">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <DuplicateOrdersDialog
        open={showDuplicates}
        keeperOrderId={order.id}
        keeperReference={order.reference}
        keeperAgentName={order.agent?.name ?? null}
        siblings={siblings}
        onMerged={() => {
          setShowDuplicates(false);
          setSiblings([]);
          // Items on the keeper changed server-side; the merge endpoint
          // emits order:updated for the keeper + order:archived for the
          // siblings. The table patches in place, so just close — the
          // agent reopens the combined order with fresh state.
          closeOrder();
        }}
        onSkip={() => {
          setShowDuplicates(false);
          setSiblings([]);
          if (order) dismissDuplicatesFor(order.id);
        }}
        onCancel={() => {
          setShowDuplicates(false);
          setSiblings([]);
          if (order) dismissDuplicatesFor(order.id);
        }}
      />
    </GlassModal>
  );
}
