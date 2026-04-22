import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  MessageCircle, Check, X, Phone, PhoneOff, Ban, Calendar,
  AlertTriangle, PackageX, Save, Lock, Clock, Plus, Trash2, Truck,
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
  customerCity: string;
  customerAddress: string;
  discountType: '' | 'fixed' | 'percentage';
  discountAmount: string;
  confirmationNote: string;     // doubles as cancellation reason
  shippingInstruction: string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function CallCenterOrderModal() {
  const selectedOrder = useCallCenterStore((s) => s.selectedOrder);
  const closeOrder = useCallCenterStore((s) => s.closeOrder);
  const triggerRefresh = useCallCenterStore((s) => s.triggerRefresh);
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

  const phoneValid = useMemo(() => {
    if (!order) return null;
    return MA_PHONE_RE.test(order.customer.phoneDisplay.replace(/\s/g, ''));
  }, [order]);

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
    if (!form || !order) return { ok: false, reasons: ['Loading…'] };
    const reasons: string[] = [];
    if (!form.customerName.trim()) reasons.push('Customer name is required.');
    if (phoneValid === false) reasons.push('Customer phone is not a valid Moroccan mobile.');
    if (items.length === 0) reasons.push('Order must contain at least one product.');
    for (const it of items) {
      if (!it.variantId) {
        reasons.push('Every product must have a selected variant.');
        break;
      }
      if (it.quantity < 1) {
        reasons.push('Every product must have quantity ≥ 1.');
        break;
      }
    }
    return { ok: reasons.length === 0, reasons };
  }, [form, order, items, phoneValid]);

  // Stricter check for the "Confirm" transition — once an order is confirmed
  // it goes to shipping, so we must have a deliverable address, a valid
  // shipping city, and enough stock for every line.
  const confirmReadiness = useMemo(() => {
    if (!baseReadiness.ok) return baseReadiness;
    if (!form || !order) return { ok: false, reasons: ['Loading…'] };
    const reasons: string[] = [];
    if (!form.customerCity.trim()) reasons.push('Customer city is required to confirm.');
    if (!form.customerAddress.trim()) reasons.push('Customer address is required to confirm.');
    if (cityValid === false) reasons.push('Customer city is not in the shipping list.');
    for (const it of items) {
      if (it.stock < it.quantity) {
        reasons.push(`"${products.find((p) => p.id === it.productId)?.name ?? 'Product'}" is out of stock.`);
        break;
      }
    }
    return { ok: reasons.length === 0, reasons };
  }, [baseReadiness, form, order, items, cityValid, products]);

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
      setError('Order must contain at least one product');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await persistDraft();
      triggerRefresh();
      closeOrder();
    } catch (e) {
      setError(apiErrorMessage(e, 'Failed to save'));
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
      triggerRefresh();
      closeOrder();
    } catch (e) {
      setError(apiErrorMessage(e, 'Failed to update status'));
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
        setError('Write the cancellation reason in the note field below.');
        return;
      }
    }

    setPendingAction(action);
  };

  const confirmPending = () => {
    if (!pendingAction) return;
    if (pendingAction === 'callback') {
      if (!callbackAt) {
        setError('Pick a callback date & time.');
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

  const phoneDigits = order.customer.phoneDisplay.replace(/\D/g, '');
  const tagBadge = {
    normal: { label: 'Normal', className: 'bg-gray-100 text-gray-600' },
    vip: { label: 'VIP', className: 'bg-amber-100 text-amber-700' },
    blacklisted: { label: 'Blacklisted', className: 'bg-red-100 text-red-700' },
  }[order.customer.tag];

  const pendingCopy: Record<NonNullable<typeof pendingAction>, { title: string; variant: 'primary' | 'danger' }> = {
    confirm: { title: 'Confirm this order?', variant: 'primary' },
    cancel: { title: 'Cancel this order?', variant: 'danger' },
    callback: { title: 'Schedule callback?', variant: 'primary' },
    unreachable: { title: 'Mark as unreachable?', variant: 'primary' },
    fake: { title: 'Mark as fake order?', variant: 'danger' },
    'no-stock': { title: 'Mark as out of stock?', variant: 'primary' },
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
            {dirty ? 'You have unsaved changes' : 'No pending changes'}
          </p>
          <div className="order-1 ml-auto flex items-center gap-2 sm:order-2 sm:ml-0">
            <CRMButton variant="ghost" size="sm" onClick={closeOrder} disabled={saving}>
              Close
            </CRMButton>
            {dirty && (
              <CRMButton
                variant="primary"
                size="sm"
                leftIcon={<Save size={14} />}
                onClick={handleSave}
                loading={saving}
              >
                Save changes
              </CRMButton>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Status strip */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.confirmationStatus} size="sm" showDot />
          <StatusBadge status={order.shippingStatus} size="sm" showDot />
          <span className={cn('rounded-badge px-2 py-0.5 text-[10px] font-semibold', tagBadge.className)}>
            {tagBadge.label}
          </span>
          {order.unreachableCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-badge bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              <PhoneOff size={10} /> Unreachable ×{order.unreachableCount}
            </span>
          )}
          {isLocked && (
            <span className="inline-flex items-center gap-1 rounded-badge bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
              <Lock size={10} /> Locked — shipped
            </span>
          )}
        </div>

        {/* ── TWO-COLUMN GRID ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* LEFT COLUMN — Customer + Products */}
          <div className="flex flex-col gap-3">
            {/* Customer */}
            <div className="rounded-card border border-gray-100 bg-white/60 p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                Customer
              </h3>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <CRMInput
                      label="Name *"
                      value={form.customerName}
                      onChange={(e) => patch({ customerName: e.target.value })}
                    />
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-gray-600">Phone *</label>
                      <div className="flex items-center gap-1">
                        <div
                          className={cn(
                            'flex-1 min-w-0 truncate rounded-input border px-2 py-1.5 font-mono text-[12px]',
                            phoneValid === false
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : 'border-gray-200 bg-gray-50 text-gray-700',
                          )}
                        >
                          {order.customer.phoneDisplay}
                        </div>
                        <a
                          href={`tel:${phoneDigits}`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-primary text-white hover:bg-primary-dark"
                          title="Call"
                        >
                          <Phone size={12} />
                        </a>
                        <a
                          href={`https://wa.me/${phoneDigits}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-emerald-500 text-white hover:bg-emerald-600"
                          title="WhatsApp"
                        >
                          <MessageCircle size={12} />
                        </a>
                      </div>
                    </div>
                    <CRMSelect
                      label="City *"
                      options={cities.map((c) => ({ value: c.name, label: c.name }))}
                      value={form.customerCity}
                      onChange={(v) => patch({ customerCity: v as string })}
                      searchable
                      placeholder="Select a city"
                    />
                    <CRMInput
                      label="Address *"
                      value={form.customerAddress}
                      onChange={(e) => patch({ customerAddress: e.target.value })}
                    />
                  </div>
                </div>

                {/* QR — scan with phone to dial customer directly */}
                {phoneValid !== false && phoneDigits && (
                  <div className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-btn border border-primary/10 bg-gradient-to-br from-white to-accent/30 p-2">
                    <div className="rounded-md bg-white p-1 ring-1 ring-gray-100">
                      <QRCodeSVG
                        value={`tel:+212${phoneDigits.replace(/^0/, '')}`}
                        size={76}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#1e293b"
                      />
                    </div>
                    <span className="text-center text-[8px] font-bold uppercase tracking-wider text-gray-500">
                      Scan to call
                    </span>
                  </div>
                )}
              </div>
              {(cityValid === false || phoneValid === false) && (
                <div className="mt-2 flex items-start gap-1.5 rounded-btn bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  <div>
                    {cityValid === false && <div>City not in Coliix list — fix before confirming.</div>}
                    {phoneValid === false && (
                      <div>Invalid Moroccan mobile — expected 10 digits starting with 05 / 06 / 07.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Products */}
            <div className="rounded-card border border-gray-100 bg-white/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Products
                </h3>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                    <Lock size={10} /> Locked
                  </span>
                ) : (
                  <span className="rounded-badge bg-accent/50 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>

              {products.length === 0 ? (
                <p className="text-[11px] text-gray-400">Loading catalogue…</p>
              ) : items.length === 0 ? (
                <p className="text-[11px] text-gray-400">No products on this order.</p>
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
                            placeholder="Select product"
                            disabled={isLocked}
                          />
                        </div>
                        {/* Row 2 — Color + Size */}
                        <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                          <CRMSelect
                            options={colorOpts}
                            value={it.color ?? ''}
                            onChange={(v) => handleColorChange(it.key, v as string)}
                            placeholder={colorOpts.length === 0 ? '—' : 'Color'}
                            disabled={isLocked || colorOpts.length === 0}
                          />
                          <CRMSelect
                            options={sizeOpts}
                            value={it.size ?? ''}
                            onChange={(v) => handleSizeChange(it.key, v as string)}
                            placeholder={sizeOpts.length === 0 ? '—' : 'Size'}
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
                              title="Decrease"
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
                              title="Increase"
                            >
                              +
                            </button>
                          </div>
                          {!isLocked && (
                            <button
                              type="button"
                              onClick={() => removeItem(it.key)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-btn text-red-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        {/* Footer — stock + subtotal */}
                        <div className="mt-1.5 flex items-center justify-between text-[10px]">
                          <span className={cn('font-semibold', stockTone(it.stock))}>
                            {it.stock === 0 ? 'Out of stock' : `${it.stock} in stock`}
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
                  <Plus size={12} /> Add product
                </button>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — Pricing, Note, Actions, History */}
          <div className="flex flex-col gap-3">
            {/* Pricing summary */}
            <div className="rounded-card border border-gray-100 bg-accent/30 p-3">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                Pricing
              </h3>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div>
                  <label className="block text-[10px] font-medium text-gray-600">Discount type</label>
                  <div className="mt-0.5 flex rounded-input border border-gray-200 bg-white p-0.5">
                    {(['', 'fixed', 'percentage'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => patch({ discountType: t })}
                        className={cn(
                          'flex-1 rounded-btn py-1 text-[10px] font-medium transition',
                          form.discountType === t
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700',
                        )}
                      >
                        {t === '' ? 'None' : t === 'fixed' ? 'MAD' : '%'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-600">Amount</label>
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
                  <span>Subtotal: <b className="text-gray-800">{totals.subtotal.toLocaleString('fr-MA')} MAD</b></span>
                  <span>Discount: <b className="text-gray-800">{totals.discount.toLocaleString('fr-MA')} MAD</b></span>
                  <span>Shipping: <b className="text-gray-800">{order.shippingPrice.toLocaleString('fr-MA')} MAD</b></span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">Total</p>
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
                    Confirmation Note
                    <span className="ml-2 text-[9px] font-normal normal-case text-gray-400">
                      · also used as cancellation reason
                    </span>
                  </label>
                  <textarea
                    rows={2}
                    value={form.confirmationNote}
                    onChange={(e) => patch({ confirmationNote: e.target.value })}
                    placeholder="Call context, cancellation reason, anything relevant…"
                    className="w-full resize-none rounded-input border border-gray-200 bg-white px-2 py-1.5 text-[12px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <Truck size={10} />
                    Delivery Note
                  </label>
                  <textarea
                    rows={2}
                    value={form.shippingInstruction}
                    onChange={(e) => patch({ shippingInstruction: e.target.value })}
                    placeholder="Delivery instructions, address details, preferred time…"
                    className="w-full resize-none rounded-input border border-gray-200 bg-white px-2 py-1.5 text-[12px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-card border border-gray-100 bg-white/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Actions
                </h3>
                {!baseReadiness.ok && !isLocked && (
                  <span className="inline-flex items-center gap-1 rounded-badge bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                    <AlertTriangle size={9} /> Blocked
                  </span>
                )}
              </div>
              {isLocked ? (
                <div className="flex items-center gap-2 rounded-btn bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                  <Lock size={12} />
                  Order is shipped — confirmation actions are locked.
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
                      Confirm
                    </CRMButton>
                    <CRMButton variant="danger" size="sm" leftIcon={<X size={12} />} onClick={() => triggerStatus('cancel')} disabled={statusBusy || !baseReadiness.ok}>
                      Cancel
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<Calendar size={12} />} onClick={() => { if (!baseReadiness.ok) { setError(baseReadiness.reasons[0]); return; } setPendingAction('callback'); setError(null); }} disabled={statusBusy || !baseReadiness.ok}>
                      Callback
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<PhoneOff size={12} />} onClick={() => triggerStatus('unreachable')} disabled={statusBusy || !baseReadiness.ok}>
                      Unreachable
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<Ban size={12} />} onClick={() => triggerStatus('fake')} disabled={statusBusy || !baseReadiness.ok}>
                      Fake
                    </CRMButton>
                    <CRMButton variant="secondary" size="sm" leftIcon={<PackageX size={12} />} onClick={() => triggerStatus('no-stock')} disabled={statusBusy || !baseReadiness.ok}>
                      No Stock
                    </CRMButton>
                  </div>

                  {!baseReadiness.ok && baseReadiness.reasons[0] ? (
                    <p className="mt-1.5 text-[10px] text-amber-700">{baseReadiness.reasons[0]}</p>
                  ) : !confirmReadiness.ok && confirmReadiness.reasons[0] ? (
                    <p className="mt-1.5 text-[10px] text-amber-700">
                      Confirm requires: {confirmReadiness.reasons[0]}
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
                            Callback date &amp; time *
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
                              Note saved with this action
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
                              Delivery note
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
                        Cancel
                      </CRMButton>
                      <CRMButton
                        variant={pendingCopy[pendingAction].variant}
                        size="sm"
                        onClick={confirmPending}
                        loading={statusBusy}
                        disabled={pendingAction === 'callback' && !callbackAt}
                      >
                        {pendingAction === 'callback' ? 'Schedule' : 'Confirm'}
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
                  Client history ({history.length})
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
          // Items on the keeper have changed server-side. Close and refresh so
          // the agent re-opens the combined order with fresh state before
          // confirming — prevents confirming with stale items in the form.
          triggerRefresh();
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
