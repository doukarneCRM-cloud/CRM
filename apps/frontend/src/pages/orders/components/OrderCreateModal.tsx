import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { Loader2, Plus, Trash2, Check } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { CRMButton } from '@/components/ui/CRMButton';
import { ordersApi, supportApi, customersApi, type ClientListItem } from '@/services/ordersApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/lib/cn';
import { SOURCE_OPTIONS } from '@/constants/statusColors';
import type { Product, ShippingCity, OrderSource } from '@/types/orders';

// YouCan orders are imported via OAuth — they can never be CREATED
// manually, so the create modal hides 'youcan' from the source dropdown.
// (Source is fixed to 'youcan' on those orders by the import service and
// locked in the edit modal.)
const MANUAL_SOURCE_OPTIONS = SOURCE_OPTIONS.filter((s) => s.value !== 'youcan');

interface Props {
  open: boolean;
  onClose: () => void;
  // Optional — the backend's order:created socket event already arrives at
  // every list page and refetches. Pass this only when the caller needs an
  // extra side-effect (e.g. tracking a one-off "created by me" highlight).
  onCreated?: () => void;
}

interface DraftItem {
  key: string;
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

function makeDraft(product: Product | undefined): DraftItem {
  if (!product) {
    return {
      key: randKey(),
      productId: '',
      variantId: '',
      color: null,
      size: null,
      stock: 0,
      unitPrice: 0,
      quantity: 1,
    };
  }
  const firstColor = colorsOf(product)[0] ?? null;
  const firstSize = sizesOf(product, firstColor)[0] ?? null;
  const v = findVariant(product, firstColor, firstSize) ?? product.variants[0];
  return {
    key: randKey(),
    productId: product.id,
    variantId: v?.id ?? '',
    color: v?.color ?? null,
    size: v?.size ?? null,
    stock: v?.stock ?? 0,
    unitPrice: v?.price ?? product.basePrice,
    quantity: 1,
  };
}

export function OrderCreateModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [cities, setCities] = useState<ShippingCity[]>([]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  // When the user picks an existing client from the suggestion dropdown we
  // send `customerId` so the backend reuses that record verbatim — no upsert,
  // no silent merge with a name-matching customer who has a different phone.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [activeLookup, setActiveLookup] = useState<'name' | 'phone' | null>(null);
  const [suggestions, setSuggestions] = useState<ClientListItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);

  useClickOutside(customerRef, () => setActiveLookup(null));

  // Debounce whichever field the user is typing into, then fetch matches.
  const lookupValue = activeLookup === 'name' ? customerName : activeLookup === 'phone' ? customerPhone : '';
  const debouncedLookup = useDebounce(lookupValue.trim(), 250);

  useEffect(() => {
    if (!activeLookup || debouncedLookup.length < 2) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    customersApi
      .list({ search: debouncedLookup, pageSize: 8, page: 1 })
      .then((res) => { if (!cancelled) setSuggestions(res.data); })
      .catch(() => { if (!cancelled) setSuggestions([]); })
      .finally(() => { if (!cancelled) setSuggestLoading(false); });
    return () => { cancelled = true; };
  }, [activeLookup, debouncedLookup]);

  const [items, setItems] = useState<DraftItem[]>([]);

  const [discountType, setDiscountType] = useState<'' | 'fixed' | 'percentage'>('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [confirmationNote, setConfirmationNote] = useState('');
  // Source defaults to manual (most common for hand-entered orders). YouCan
  // is filtered out of the picker because YouCan orders only enter the CRM
  // via the OAuth import path — never manually.
  const [source, setSource] = useState<OrderSource>('manual');

  // Load supporting data each time modal opens; reset form state
  useEffect(() => {
    if (!open) return;
    setError(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerCity('');
    setCustomerAddress('');
    setSelectedCustomerId(null);
    setSuggestions([]);
    setActiveLookup(null);
    setItems([]);
    setDiscountType('');
    setDiscountAmount('');
    setConfirmationNote('');
    setSource('manual');

    setLoadingData(true);
    Promise.all([supportApi.products(), supportApi.shippingCities()])
      .then(([prods, cityList]) => {
        setProducts(prods);
        setCities(cityList);
        // Pre-seed one empty item row so the user can start filling immediately
        if (prods.length > 0) setItems([makeDraft(prods[0])]);
      })
      .catch(() => {
        setError(t('orders.create.failedToLoad'));
      })
      .finally(() => setLoadingData(false));
  }, [open, t]);

  const cityOptions = useMemo(
    () => cities.map((c) => ({ value: c.name, label: t('orders.create.cityWithPrice', { name: c.name, price: c.price }) })),
    [cities, t],
  );
  const isCityValid =
    !customerCity ||
    cities.length === 0 ||
    cities.some((c) => c.name.toLowerCase() === customerCity.toLowerCase());

  const { subtotal, discount, total } = useMemo(() => {
    const sub = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const raw = parseFloat(discountAmount) || 0;
    let disc = 0;
    if (discountType === 'fixed') disc = raw;
    else if (discountType === 'percentage') disc = (sub * raw) / 100;
    return { subtotal: sub, discount: disc, total: Math.max(0, sub - disc) };
  }, [items, discountType, discountAmount]);

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

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
    setItems((prev) => [...prev, makeDraft(products[0])]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const canSave =
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 8 &&
    customerCity.trim().length >= 2 &&
    items.length > 0 &&
    items.every((i) => i.variantId && i.quantity >= 1 && i.unitPrice >= 0);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await ordersApi.create({
        source,
        ...(selectedCustomerId
          ? { customerId: selectedCustomerId }
          : {
              customerName: customerName.trim(),
              customerPhone: customerPhone.trim(),
              customerCity: customerCity.trim(),
              customerAddress: customerAddress.trim() || undefined,
            }),
        discountType: discountType || undefined,
        discountAmount: discountAmount ? parseFloat(discountAmount) : undefined,
        shippingPrice: 0,
        confirmationNote: confirmationNote.trim() || undefined,
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });
      onCreated?.();
      onClose();
    } catch (err) {
      if (isAxiosError(err)) {
        const data = err.response?.data as { error?: { message?: string } } | undefined;
        setError(data?.error?.message ?? t('orders.create.failedToCreate'));
      } else {
        setError(t('orders.create.failedToCreate'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('orders.newManualOrder')}
      size="2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 text-xs">
            {error ? (
              <span className="font-medium text-red-500">{error}</span>
            ) : (
              <span className="text-gray-400">
                {t('orders.create.subtotal')}{' '}
                <b className="text-gray-700">{subtotal.toLocaleString('fr-MA')} MAD</b>
                {discount > 0 && (
                  <>
                    {' · '}{t('orders.create.discount')}{' '}
                    <b className="text-red-500">-{discount.toLocaleString('fr-MA')} MAD</b>
                  </>
                )}
                {' · '}{t('orders.create.total')}{' '}
                <b className="text-gray-900">{total.toLocaleString('fr-MA')} MAD</b>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </CRMButton>
            <CRMButton onClick={handleSave} loading={saving} disabled={!canSave}>
              {t('orders.createOrder')}
            </CRMButton>
          </div>
        </div>
      }
    >
      {loadingData ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* ── Customer ────────────────────────────────────────────── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t('orders.create.customer')}
              </h3>
              {selectedCustomerId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(null);
                    setCustomerName('');
                    setCustomerPhone('');
                    setCustomerCity('');
                    setCustomerAddress('');
                  }}
                  className="inline-flex items-center gap-1 rounded-badge bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                  title={t('orders.create.clearAndStartFresh')}
                >
                  <Check size={10} />
                  {t('orders.create.existingClientClear')}
                </button>
              )}
            </div>
            <div ref={customerRef} className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="relative">
                <CRMInput
                  label={t('orders.create.fullName')}
                  required
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (selectedCustomerId) setSelectedCustomerId(null);
                  }}
                  onFocus={() => setActiveLookup('name')}
                  placeholder={t('orders.create.typeToSearchClients')}
                />
              </div>
              <div className="relative">
                <CRMInput
                  label={t('common.phone')}
                  required
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (selectedCustomerId) setSelectedCustomerId(null);
                  }}
                  onFocus={() => setActiveLookup('phone')}
                  placeholder={t('orders.create.phonePlaceholder')}
                />
              </div>

              {activeLookup && debouncedLookup.length >= 2 && !selectedCustomerId && (
                <div
                  className={cn(
                    'absolute z-20 mt-1 w-full overflow-hidden rounded-input border border-gray-200 bg-white shadow-hover sm:w-[calc(50%-0.375rem)]',
                    'top-full',
                    activeLookup === 'phone' ? 'right-0 sm:right-0' : 'left-0',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {suggestLoading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-xs text-gray-400">
                      <Loader2 size={12} className="animate-spin" />
                      {t('orders.create.searchingClients')}
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-gray-400">
                      {t('orders.create.noMatchingClient')}
                    </div>
                  ) : (
                    <ul className="max-h-[260px] overflow-y-auto py-1">
                      {suggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerName(c.fullName);
                              setCustomerPhone(c.phoneDisplay);
                              setCustomerCity(c.city);
                              setCustomerAddress(c.address ?? '');
                              setActiveLookup(null);
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-gray-900">{c.fullName}</p>
                              <p className="truncate text-[11px] text-gray-500">
                                <span className="font-mono">{c.phoneDisplay}</span>
                                <span className="mx-1 text-gray-300">·</span>
                                {c.city}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                              {t('orders.create.orderCount', { count: c.totalOrders })}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div>
                <CRMSelect
                  label={t('common.city')}
                  options={cityOptions}
                  value={customerCity}
                  onChange={(v) => {
                    setCustomerCity(v as string);
                    if (selectedCustomerId) setSelectedCustomerId(null);
                  }}
                  searchable
                  placeholder={t('orders.create.selectCity')}
                />
                {customerCity && !isCityValid && (
                  <p className="mt-1 text-xs text-amber-600">{t('orders.create.cityNotInShipping')}</p>
                )}
              </div>
              <CRMInput
                label={t('common.address')}
                value={customerAddress}
                onChange={(e) => {
                  setCustomerAddress(e.target.value);
                  if (selectedCustomerId) setSelectedCustomerId(null);
                }}
                placeholder={t('orders.create.addressPlaceholder')}
              />

              <CRMSelect
                label={t('orders.create.source')}
                options={MANUAL_SOURCE_OPTIONS}
                value={source}
                onChange={(v) => setSource((typeof v === 'string' ? v : v[0]) as OrderSource)}
                placeholder={t('orders.create.sourcePlaceholder')}
              />
            </div>
          </section>

          {/* ── Items ────────────────────────────────────────────────── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t('orders.create.items')}
              </h3>
              <span className="rounded-badge bg-accent/50 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {t('orders.create.itemCount', { count: items.length })}
              </span>
            </div>

            {products.length === 0 ? (
              <div className="rounded-card border border-dashed border-gray-200 bg-gray-50 py-6 text-center text-xs text-gray-500">
                {t('orders.create.noActiveProducts')}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((it) => {
                  const product = products.find((p) => p.id === it.productId);
                  const productOpts = products.map((p) => ({ value: p.id, label: p.name }));
                  const colorOpts = colorsOf(product).map((c) => ({ value: c, label: c }));
                  const sizeOpts = sizesOf(product, it.color).map((s) => ({ value: s, label: s }));
                  const stockTone =
                    it.stock === 0
                      ? 'text-red-600'
                      : it.stock <= 3
                        ? 'text-amber-600'
                        : 'text-emerald-600';

                  return (
                    <div key={it.key} className="rounded-card border border-gray-100 bg-gray-50/60 p-3">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 md:col-span-4">
                          <CRMSelect
                            label={t('orders.create.productLabel')}
                            options={productOpts}
                            value={it.productId}
                            onChange={(v) => handleProductChange(it.key, v as string)}
                            searchable
                            placeholder={t('orders.create.selectProduct')}
                          />
                        </div>
                        <div className="col-span-6 md:col-span-3">
                          <CRMSelect
                            label={t('orders.create.color')}
                            options={colorOpts}
                            value={it.color ?? ''}
                            onChange={(v) => handleColorChange(it.key, v as string)}
                            placeholder={colorOpts.length === 0 ? '—' : t('orders.create.color')}
                            disabled={colorOpts.length === 0}
                          />
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <CRMSelect
                            label={t('orders.create.size')}
                            options={sizeOpts}
                            value={it.size ?? ''}
                            onChange={(v) => handleSizeChange(it.key, v as string)}
                            placeholder={sizeOpts.length === 0 ? '—' : t('orders.create.size')}
                            disabled={sizeOpts.length === 0}
                          />
                        </div>
                        <div className="col-span-10 md:col-span-2">
                          <CRMInput
                            label={t('orders.create.qty')}
                            type="number"
                            min={1}
                            max={Math.max(1, it.stock || 999)}
                            value={it.quantity}
                            onChange={(e) =>
                              updateItem(it.key, {
                                quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                              })
                            }
                          />
                        </div>
                        <div className="col-span-2 md:col-span-1 flex items-end justify-end pb-1">
                          <button
                            type="button"
                            disabled={items.length === 1}
                            onClick={() => removeItem(it.key)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                            aria-label={t('orders.removeItem')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                        <span className={cn('font-medium', stockTone)}>
                          {it.stock === 0 ? t('orders.create.outOfStock') : t('orders.create.inStock', { count: it.stock })}
                        </span>
                        <span>
                          {t('orders.create.unit')}{' '}
                          <b className="text-gray-700">{it.unitPrice.toLocaleString('fr-MA')} MAD</b>
                          <span className="mx-2 text-gray-300">·</span>
                          {t('orders.create.subtotal')}{' '}
                          <b className="text-gray-900">
                            {(it.quantity * it.unitPrice).toLocaleString('fr-MA')} MAD
                          </b>
                        </span>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addItem}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-gray-200 py-2.5 text-sm text-gray-400 transition-colors hover:border-primary hover:text-primary"
                >
                  <Plus size={14} />
                  {t('orders.create.addItem')}
                </button>
              </div>
            )}
          </section>

          {/* ── Pricing & notes ──────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t('orders.create.pricingNotes')}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">{t('orders.create.discountLabel')}</label>
                <div className="flex rounded-input border border-gray-200 bg-gray-50 p-0.5">
                  {(['', 'fixed', 'percentage'] as const).map((dt) => (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => setDiscountType(dt)}
                      className={cn(
                        'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all',
                        discountType === dt
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-400 hover:text-gray-600',
                      )}
                    >
                      {dt === '' ? t('orders.create.none') : dt === 'fixed' ? 'MAD' : '%'}
                    </button>
                  ))}
                </div>
              </div>
              <CRMInput
                label={t('orders.create.discountAmount')}
                type="number"
                min={0}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                disabled={!discountType}
                placeholder={t('orders.create.discountAmountPlaceholder')}
              />
            </div>
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('orders.create.confirmationNote')}
              </label>
              <textarea
                rows={2}
                value={confirmationNote}
                onChange={(e) => setConfirmationNote(e.target.value)}
                placeholder={t('orders.create.confirmationNotePlaceholder')}
                className="w-full resize-none rounded-input border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </section>
        </div>
      )}
    </GlassModal>
  );
}
