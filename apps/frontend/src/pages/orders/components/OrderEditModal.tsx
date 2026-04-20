import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, Package, Loader2, Lock, PackageSearch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ordersApi, supportApi, customersApi } from '@/services/ordersApi';
import type { Order, Product, ShippingCity } from '@/types/orders';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';
import { ROUTES } from '@/constants/routes';
import { PERMISSIONS } from '@/constants/permissions';
import { useAuthStore } from '@/store/authStore';

// ─── Local types ─────────────────────────────────────────────────────────────

interface EditItem {
  variantId: string;
  productId: string;
  productName: string;
  color: string | null;
  size: string | null;
  stock: number;
  quantity: number;
  unitPrice: number;
}

interface FormState {
  // Customer
  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  // Items
  items: EditItem[];
  // Pricing
  discountType: '' | 'fixed' | 'percentage';
  discountAmount: string;
  // Notes
  confirmationNote: string;
  shippingInstruction: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTotal(
  items: EditItem[],
  discountType: string,
  discountAmount: string,
): { subtotal: number; discount: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const disc = parseFloat(discountAmount) || 0;
  let discount = 0;
  if (discountType === 'fixed') discount = disc;
  else if (discountType === 'percentage') discount = (subtotal * disc) / 100;
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total };
}

/** Unique colors/sizes derived from a product's variants. */
function getColorOptions(product: Product | undefined): string[] {
  if (!product) return [];
  const set = new Set<string>();
  for (const v of product.variants) if (v.color) set.add(v.color);
  return Array.from(set);
}
function getSizeOptions(product: Product | undefined, color: string | null): string[] {
  if (!product) return [];
  const set = new Set<string>();
  for (const v of product.variants) {
    if (color && v.color !== color) continue;
    if (v.size) set.add(v.size);
  }
  return Array.from(set);
}
/** Pick the variant matching a (product, color, size) combo. */
function findVariant(product: Product | undefined, color: string | null, size: string | null) {
  if (!product) return undefined;
  return product.variants.find(
    (v) => (v.color ?? null) === (color ?? null) && (v.size ?? null) === (size ?? null),
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</h3>
      <div className="flex-1 border-t border-gray-100" />
    </div>
  );
}

// ─── Item row (product / color / size / qty as separate dropdowns) ──────────

function ItemRow({
  item,
  products,
  onChange,
  onRemove,
  canRemove,
}: {
  item: EditItem;
  products: Product[];
  onChange: (updated: EditItem) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const product = products.find((p) => p.id === item.productId);
  const colorOptions = getColorOptions(product);
  const sizeOptions = getSizeOptions(product, item.color);

  const productOpts = products.map((p) => ({ value: p.id, label: p.name }));
  const colorOpts = colorOptions.map((c) => ({ value: c, label: c }));
  const sizeOpts = sizeOptions.map((s) => ({ value: s, label: s }));

  const handleProductChange = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const firstColor = getColorOptions(p)[0] ?? null;
    const firstSize = getSizeOptions(p, firstColor)[0] ?? null;
    const v = findVariant(p, firstColor, firstSize) ?? p.variants[0];
    onChange({
      ...item,
      productId,
      productName: p.name,
      variantId: v?.id ?? '',
      color: v?.color ?? null,
      size: v?.size ?? null,
      stock: v?.stock ?? 0,
      unitPrice: v?.price ?? p.basePrice,
    });
  };

  const handleColorChange = (color: string) => {
    const nextSize = getSizeOptions(product, color)[0] ?? null;
    const v = findVariant(product, color, nextSize);
    if (!v) return;
    onChange({ ...item, color, size: nextSize, variantId: v.id, stock: v.stock, unitPrice: v.price });
  };

  const handleSizeChange = (size: string) => {
    const v = findVariant(product, item.color, size);
    if (!v) return;
    onChange({ ...item, size, variantId: v.id, stock: v.stock, unitPrice: v.price });
  };

  const stockColor =
    item.stock === 0 ? 'text-red-600' : item.stock <= 3 ? 'text-amber-600' : 'text-green-600';

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
      <div className="grid grid-cols-12 gap-2">
        {/* Product */}
        <div className="col-span-4">
          <CRMSelect
            label="Product"
            options={productOpts}
            value={item.productId}
            onChange={(v) => handleProductChange(v as string)}
            searchable
            placeholder="Select product..."
          />
        </div>

        {/* Color */}
        <div className="col-span-3">
          <CRMSelect
            label="Color"
            options={colorOpts}
            value={item.color ?? ''}
            onChange={(v) => handleColorChange(v as string)}
            placeholder={colorOpts.length === 0 ? '—' : 'Color'}
            disabled={colorOpts.length === 0}
          />
        </div>

        {/* Size */}
        <div className="col-span-2">
          <CRMSelect
            label="Size"
            options={sizeOpts}
            value={item.size ?? ''}
            onChange={(v) => handleSizeChange(v as string)}
            placeholder={sizeOpts.length === 0 ? '—' : 'Size'}
            disabled={sizeOpts.length === 0}
          />
        </div>

        {/* Qty */}
        <div className="col-span-2">
          <CRMInput
            label="Qty"
            type="number"
            min={1}
            max={item.stock || 999}
            value={item.quantity}
            onChange={(e) =>
              onChange({ ...item, quantity: Math.max(1, parseInt(e.target.value) || 1) })
            }
          />
        </div>

        {/* Remove */}
        <div className="col-span-1 flex items-end pb-1">
          <button
            type="button"
            disabled={!canRemove}
            onClick={onRemove}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Stock + price meta */}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span className={cn('font-medium', stockColor)}>
          {item.stock === 0 ? 'Out of stock' : `${item.stock} in stock`}
        </span>
        <span>
          Unit:{' '}
          <span className="font-semibold text-gray-700">
            {item.unitPrice.toLocaleString('fr-MA')} MAD
          </span>
          <span className="mx-2 text-gray-300">·</span>
          Subtotal:{' '}
          <span className="font-semibold text-gray-900">
            {(item.quantity * item.unitPrice).toLocaleString('fr-MA')} MAD
          </span>
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OrderEditModalProps {
  order: Order | null;
  onClose: () => void;
  onSaved: (updated: Order) => void;
}

export function OrderEditModal({ order, onClose, onSaved }: OrderEditModalProps) {
  const navigate = useNavigate();
  const canVerifyReturns = useAuthStore((s) => s.hasPermission(PERMISSIONS.RETURNS_VERIFY));
  const [products, setProducts] = useState<Product[]>([]);
  const [cities, setCities] = useState<ShippingCity[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    customerName: '',
    customerPhone: '',
    customerCity: '',
    customerAddress: '',
    items: [],
    discountType: '',
    discountAmount: '',
    confirmationNote: '',
    shippingInstruction: '',
  });

  useEffect(() => {
    if (!order) return;
    setLoadingData(true);
    Promise.all([supportApi.products(), supportApi.shippingCities()])
      .then(([prods, cityList]) => {
        setProducts(prods);
        setCities(cityList);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [order?.id]);

  useEffect(() => {
    if (!order) return;
    setForm({
      customerName: order.customer.fullName,
      customerPhone: order.customer.phoneDisplay,
      customerCity: order.customer.city,
      customerAddress: order.customer.address ?? '',
      items: order.items.map((item) => ({
        variantId: item.variant.id,
        productId: item.variant.product.id,
        productName: item.variant.product.name,
        color: item.variant.color,
        size: item.variant.size,
        stock: 99,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      discountType: (order.discountType as FormState['discountType']) ?? '',
      discountAmount: order.discountAmount != null ? String(order.discountAmount) : '',
      confirmationNote: order.confirmationNote ?? '',
      shippingInstruction: order.shippingInstruction ?? '',
    });
  }, [order]);

  // Update stock values once products load
  useEffect(() => {
    if (products.length === 0) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const p = products.find((x) => x.id === item.productId);
        const v = p?.variants.find((x) => x.id === item.variantId);
        return { ...item, stock: v?.stock ?? item.stock };
      }),
    }));
  }, [products]);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateItem = useCallback((index: number, updated: EditItem) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? updated : item)),
    }));
  }, []);

  const removeItem = useCallback((index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }, []);

  const addItem = useCallback(() => {
    const firstProduct = products[0];
    const firstVariant = firstProduct?.variants[0];
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          variantId: firstVariant?.id ?? '',
          productId: firstProduct?.id ?? '',
          productName: firstProduct?.name ?? '',
          color: firstVariant?.color ?? null,
          size: firstVariant?.size ?? null,
          stock: firstVariant?.stock ?? 0,
          quantity: 1,
          unitPrice: firstVariant?.price ?? firstProduct?.basePrice ?? 0,
        },
      ],
    }));
  }, [products]);

  const { subtotal, discount, total } = useMemo(
    () => computeTotal(form.items, form.discountType, form.discountAmount),
    [form.items, form.discountType, form.discountAmount],
  );

  // Once the parcel is sent to Coliix the order is packed & labeled — the
  // backend rejects edits, so reflect that in the UI as a read-only view.
  const isLocked = !!order?.labelSent;

  const cityOptions = cities.map((c) => ({ value: c.name, label: `${c.name} (${c.price} MAD)` }));
  const isCityValid =
    cities.length === 0 || cities.some((c) => c.name.toLowerCase() === form.customerCity.toLowerCase());

  // Detect what actually changed so we don't send redundant updates
  const customerDirty = !!order && (
    form.customerName !== order.customer.fullName
    || form.customerPhone !== order.customer.phoneDisplay
    || form.customerCity !== order.customer.city
    || (form.customerAddress ?? '') !== (order.customer.address ?? '')
  );

  const itemsDirty = !!order && (
    form.items.length !== order.items.length
    || form.items.some((it, i) => {
      const orig = order.items[i];
      return !orig
        || orig.variant.id !== it.variantId
        || orig.quantity !== it.quantity
        || orig.unitPrice !== it.unitPrice;
    })
  );

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (customerDirty) {
        await customersApi.update(order.customer.id, {
          fullName: form.customerName,
          phone: form.customerPhone,
          city: form.customerCity,
          address: form.customerAddress || null,
        });
      }
      const updated = await ordersApi.update(order.id, {
        discountType: form.discountType || null,
        discountAmount: form.discountAmount ? parseFloat(form.discountAmount) : null,
        shippingPrice: 0, // free delivery
        confirmationNote: form.confirmationNote || null,
        shippingInstruction: form.shippingInstruction || null,
        ...(itemsDirty
          ? {
              items: form.items.map((it) => ({
                variantId: it.variantId,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
              })),
            }
          : {}),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Failed to save changes'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open={!!order}
      onClose={onClose}
      title={`Edit Order${order ? ` — ${order.reference}` : ''}`}
      size="xl"
    >
      {loadingData ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : (
        <fieldset
          disabled={isLocked}
          className="flex flex-col gap-5 overflow-y-auto disabled:opacity-90"
          style={{ maxHeight: 'calc(80vh - 140px)' }}
        >
          {isLocked && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <Lock size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
              <div className="text-xs text-amber-800">
                <p className="font-semibold">Locked — sent to Coliix</p>
                <p className="text-amber-700">
                  The parcel is packed and labeled. Order details and status can no longer be
                  edited.
                </p>
              </div>
            </div>
          )}
          {/* ── Section 1: Customer (fully editable) ──────────────────────── */}
          <div>
            <SectionHeader label="Customer" />
            <div className="grid grid-cols-2 gap-3">
              <CRMInput
                label="Full Name"
                value={form.customerName}
                onChange={(e) => setField('customerName', e.target.value)}
              />
              <CRMInput
                label="Phone"
                value={form.customerPhone}
                onChange={(e) => setField('customerPhone', e.target.value)}
              />
              <div>
                <CRMSelect
                  label="City"
                  options={cityOptions}
                  value={form.customerCity}
                  onChange={(v) => setField('customerCity', v as string)}
                  searchable
                  placeholder="Select city..."
                />
                {form.customerCity && !isCityValid && (
                  <p className="mt-1 text-xs text-amber-600">⚠ City not in shipping list</p>
                )}
              </div>
              <CRMInput
                label="Address"
                value={form.customerAddress}
                onChange={(e) => setField('customerAddress', e.target.value)}
              />
            </div>
          </div>

          {/* ── Section 2: Items ──────────────────────────────────────────── */}
          <div>
            <SectionHeader label="Items" />
            <div className="flex flex-col gap-2">
              {form.items.map((item, i) => (
                <ItemRow
                  key={i}
                  item={item}
                  products={products}
                  onChange={(updated) => updateItem(i, updated)}
                  onRemove={() => removeItem(i)}
                  canRemove={form.items.length > 1}
                />
              ))}
            </div>
            {products.length > 0 && (
              <button
                type="button"
                onClick={addItem}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-2.5 text-sm text-gray-400 transition-colors hover:border-primary hover:text-primary"
              >
                <Plus size={14} />
                Add item
              </button>
            )}
          </div>

          {/* ── Section 3: Pricing (free delivery — no shipping field) ────── */}
          <div>
            <SectionHeader label="Pricing" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Discount</label>
                <div className="flex rounded-input border border-gray-200 bg-gray-50 p-0.5">
                  {(['', 'fixed', 'percentage'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setField('discountType', type)}
                      className={cn(
                        'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
                        form.discountType === type
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-400 hover:text-gray-600',
                      )}
                    >
                      {type === '' ? 'None' : type === 'fixed' ? 'MAD' : '%'}
                    </button>
                  ))}
                </div>
              </div>

              <CRMInput
                label="Discount Amount"
                type="number"
                min={0}
                value={form.discountAmount}
                onChange={(e) => setField('discountAmount', e.target.value)}
                disabled={!form.discountType}
                placeholder="0"
              />
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
              <div className="flex gap-6 text-gray-400">
                <span>
                  Subtotal: <b className="text-gray-700">{subtotal.toLocaleString('fr-MA')} MAD</b>
                </span>
                {discount > 0 && (
                  <span>
                    Discount: <b className="text-red-500">-{discount.toLocaleString('fr-MA')} MAD</b>
                  </span>
                )}
                <span className="text-emerald-600">Free delivery</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-400">Total</span>
                <p className="text-xl font-bold text-gray-900">
                  {total.toLocaleString('fr-MA')} MAD
                </p>
              </div>
            </div>
          </div>

          {/* ── Section 4: Notes ─────────────────────────────────────────── */}
          <div>
            <SectionHeader label="Notes" />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Confirmation Note</label>
                <textarea
                  rows={3}
                  value={form.confirmationNote}
                  onChange={(e) => setField('confirmationNote', e.target.value)}
                  placeholder="Agent notes..."
                  className="w-full resize-none rounded-input border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Shipping Instruction</label>
                <textarea
                  rows={3}
                  value={form.shippingInstruction}
                  onChange={(e) => setField('shippingInstruction', e.target.value)}
                  placeholder="Delivery instructions..."
                  className="w-full resize-none rounded-input border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>

          {/* ── Section 5: Status (read-only) ────────────────────────────── */}
          {order && (
            <div>
              <SectionHeader label="Status" />
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Confirmation</span>
                  <StatusBadge status={order.confirmationStatus} />
                </div>
                <div className="h-3 w-px bg-gray-200" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Shipping</span>
                  <StatusBadge status={order.shippingStatus} />
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {canVerifyReturns &&
                    (['returned', 'attempted', 'lost'] as const).includes(
                      order.shippingStatus as 'returned' | 'attempted' | 'lost',
                    ) && (
                      <button
                        type="button"
                        onClick={() => navigate(`${ROUTES.RETURNS}?q=${encodeURIComponent(order.reference)}`)}
                        className="inline-flex items-center gap-1 rounded-btn bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200 transition-colors hover:bg-amber-100"
                      >
                        <PackageSearch size={11} />
                        Verify return
                      </button>
                    )}
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Package size={11} />
                    Change via status button
                  </span>
                </div>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {!loadingData && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          {saveError && (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {saveError}
            </p>
          )}
          <div className="flex gap-3">
            <CRMButton variant="secondary" className="flex-1" onClick={onClose}>
              {isLocked ? 'Close' : 'Cancel'}
            </CRMButton>
            {!isLocked && (
              <CRMButton variant="primary" className="flex-1" loading={saving} onClick={handleSave}>
                Save Changes
              </CRMButton>
            )}
          </div>
        </div>
      )}
    </GlassModal>
  );
}
