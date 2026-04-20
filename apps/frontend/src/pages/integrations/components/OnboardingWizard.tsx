import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronRight, ChevronLeft, Download, Package,
  Search, X, Save, AlertCircle, Sparkles, CheckCircle2,
} from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMSelect } from '@/components/ui/CRMSelect';
import {
  integrationsApi,
  type Store,
  type YoucanProductPreview,
  type ImportResult,
} from '@/services/integrationsApi';
import { cn } from '@/lib/cn';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  store: Store | null;
  open: boolean;
  onClose: () => void;
  onFinished: () => void;
}

interface CheckoutField {
  path: string;
  label: string;
  sample: string;
}

type StepKey = 'mapping' | 'orders' | 'products' | 'done';

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: 'mapping', label: 'Map Fields' },
  { key: 'orders', label: 'Import Orders' },
  { key: 'products', label: 'Import Products' },
  { key: 'done', label: 'Done' },
];

const CRM_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'name', label: 'Customer Name', hint: 'Full name used on call sheets' },
  { key: 'phone', label: 'Customer Phone', hint: 'Primary callback number' },
  { key: 'city', label: 'Customer City', hint: 'Drives shipping cost lookup' },
  { key: 'address', label: 'Customer Address', hint: 'Street / delivery point' },
];

const ORDER_PRESETS: Array<{ label: string; value: number | 'all' | 'skip' }> = [
  { label: 'Skip', value: 'skip' },
  { label: 'Last 10', value: 10 },
  { label: 'Last 50', value: 50 },
  { label: 'Last 100', value: 100 },
  { label: 'All', value: 'all' },
];

// ─── Main ────────────────────────────────────────────────────────────────────

export function OnboardingWizard({ store, open, onClose, onFinished }: Props) {
  const [step, setStep] = useState<StepKey>('mapping');

  // Step 1 — mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<CheckoutField[] | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  // Step 2 — orders
  const [orderChoice, setOrderChoice] = useState<number | 'all' | 'skip' | null>(null);
  const [orderImporting, setOrderImporting] = useState(false);
  const [orderResult, setOrderResult] = useState<ImportResult | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Step 3 — products
  const [productChoice, setProductChoice] = useState<'skip' | 'all' | 'pick' | null>(null);
  const [products, setProducts] = useState<YoucanProductPreview[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [productsTotalPages, setProductsTotalPages] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [productSearchInput, setProductSearchInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const productSearchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [productImporting, setProductImporting] = useState(false);
  const [productResult, setProductResult] = useState<ImportResult | null>(null);
  const [productError, setProductError] = useState<string | null>(null);

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !store) return;
    setStep('mapping');
    setMapping(store.fieldMapping ?? {});
    setFields(null);
    setFieldsError(null);
    setMappingError(null);
    setOrderChoice(null);
    setOrderResult(null);
    setOrderError(null);
    setProductChoice(null);
    setProducts([]);
    setSelectedProducts(new Set());
    setProductSearchInput('');
    setProductSearch('');
    setProductResult(null);
    setProductError(null);
  }, [open, store]);

  // ── Step 1: load checkout fields ─────────────────────────────────────────
  const loadFields = useCallback(async () => {
    if (!store) return;
    setFieldsLoading(true);
    setFieldsError(null);
    try {
      const detected = await integrationsApi.detectCheckoutFields(store.id);
      setFields(detected);
    } catch (e: any) {
      setFields([]);
      setFieldsError(
        e?.response?.data?.error?.message
          ?? 'Could not detect checkout fields from YouCan. You can still map manually below.',
      );
    } finally {
      setFieldsLoading(false);
    }
  }, [store]);

  useEffect(() => {
    if (open && store && step === 'mapping' && fields === null) {
      loadFields();
    }
  }, [open, store, step, fields, loadFields]);

  const handleSaveMapping = async () => {
    if (!store) return;
    setMappingSaving(true);
    setMappingError(null);
    try {
      await integrationsApi.updateFieldMapping(store.id, mapping);
      setStep('orders');
    } catch (e: any) {
      setMappingError(e?.response?.data?.error?.message ?? 'Failed to save mapping');
    } finally {
      setMappingSaving(false);
    }
  };

  // ── Step 2: import orders ────────────────────────────────────────────────
  const handleImportOrders = async () => {
    if (!store || orderChoice === null) return;
    if (orderChoice === 'skip') {
      setStep('products');
      return;
    }
    setOrderImporting(true);
    setOrderError(null);
    try {
      const count = orderChoice === 'all' ? undefined : orderChoice;
      const r = await integrationsApi.importOrders(store.id, count);
      setOrderResult(r);
    } catch (e: any) {
      setOrderError(e?.response?.data?.error?.message ?? 'Import failed');
    } finally {
      setOrderImporting(false);
    }
  };

  // ── Step 3: product preview + import ─────────────────────────────────────
  const loadProducts = useCallback(
    async (p: number, q: string) => {
      if (!store) return;
      setProductsLoading(true);
      setProductError(null);
      try {
        const data = await integrationsApi.previewYoucanProducts(store.id, p, q || undefined);
        setProducts(data.products);
        setProductsPage(data.pagination.current_page);
        setProductsTotalPages(data.pagination.total_pages);
      } catch (e: any) {
        setProductError(e?.response?.data?.error?.message ?? 'Failed to load products');
      } finally {
        setProductsLoading(false);
      }
    },
    [store],
  );

  // When user picks "pick from list", fetch the first page.
  useEffect(() => {
    if (step === 'products' && productChoice === 'pick' && products.length === 0 && !productsLoading) {
      loadProducts(1, '');
    }
  }, [step, productChoice, products.length, productsLoading, loadProducts]);

  // Debounced search inside the product picker.
  useEffect(() => {
    if (step !== 'products' || productChoice !== 'pick') return;
    if (productSearchDebounce.current) clearTimeout(productSearchDebounce.current);
    productSearchDebounce.current = setTimeout(() => {
      setProductSearch(productSearchInput);
      loadProducts(1, productSearchInput);
    }, 350);
    return () => {
      if (productSearchDebounce.current) clearTimeout(productSearchDebounce.current);
    };
  }, [productSearchInput, step, productChoice, loadProducts]);

  const toggleProduct = (id: string) => {
    const next = new Set(selectedProducts);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProducts(next);
  };

  const handleImportProducts = async () => {
    if (!store || !productChoice) return;
    if (productChoice === 'skip') {
      setStep('done');
      onFinished();
      return;
    }
    setProductImporting(true);
    setProductError(null);
    try {
      const productIds =
        productChoice === 'pick'
          ? Array.from(selectedProducts)
          : undefined;
      const r = await integrationsApi.importProducts(store.id, productIds);
      setProductResult(r);
      onFinished();
    } catch (e: any) {
      setProductError(e?.response?.data?.error?.message ?? 'Import failed');
    } finally {
      setProductImporting(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const mappingOptions = useMemo(() => {
    const detected = fields ?? [];
    return [
      { value: '', label: '— Auto-detect —' },
      ...detected.map((f) => ({
        value: f.path,
        label: f.sample ? `${f.label}  ·  "${f.sample}"` : f.label,
      })),
    ];
  }, [fields]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (!store) return null;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={`Set up: ${store.name}`}
      size="2xl"
    >
      <div className="flex flex-col gap-5">
        {/* Step indicator */}
        <StepBar steps={STEPS} currentIndex={stepIndex} />

        {/* STEP 1 — MAPPING */}
        {step === 'mapping' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-700">
                Match YouCan checkout fields to your CRM fields
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                We scanned your store's recent orders and found {fields?.length ?? '…'} active
                checkout field{fields?.length === 1 ? '' : 's'}. Pick the best match for each CRM
                field, or leave on "Auto-detect" to use sensible defaults.
              </p>
            </div>

            {fieldsError && (
              <div className="rounded-btn bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
                {fieldsError}
              </div>
            )}

            {fieldsLoading ? (
              <div className="rounded-btn bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-500">
                Scanning YouCan orders to find active checkout fields…
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {CRM_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-start gap-3">
                    <div className="w-36 shrink-0 pt-1.5">
                      <p className="text-xs font-semibold text-gray-700">{field.label}</p>
                      <p className="text-[10px] text-gray-400">{field.hint}</p>
                    </div>
                    <span className="pt-2 text-gray-300">←</span>
                    <div className="flex-1">
                      <CRMSelect
                        value={mapping[field.key] ?? ''}
                        onChange={(val) =>
                          setMapping({
                            ...mapping,
                            [field.key]: Array.isArray(val) ? val[0] : val,
                          })
                        }
                        options={mappingOptions}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mappingError && (
              <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
                {mappingError}
              </p>
            )}

            <FooterRow>
              <CRMButton variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </CRMButton>
              <CRMButton
                variant="primary"
                size="sm"
                leftIcon={<Save size={12} />}
                loading={mappingSaving}
                onClick={handleSaveMapping}
              >
                Save & Continue
              </CRMButton>
            </FooterRow>
          </div>
        )}

        {/* STEP 2 — ORDERS */}
        {step === 'orders' && (
          <div className="flex flex-col gap-4">
            {!orderResult ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Import past orders from YouCan?
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    New orders arrive automatically via webhook. You can also pull existing orders
                    to get started. Duplicates are skipped.
                  </p>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {ORDER_PRESETS.map((p) => {
                    const active = orderChoice === p.value;
                    return (
                      <button
                        key={String(p.value)}
                        type="button"
                        onClick={() => setOrderChoice(p.value)}
                        className={cn(
                          'rounded-xl border py-3 text-center text-xs font-semibold transition',
                          active
                            ? 'border-primary bg-accent/50 text-primary ring-1 ring-primary/20'
                            : 'border-gray-100 text-gray-600 hover:border-gray-200',
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {orderError && (
                  <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
                    {orderError}
                  </p>
                )}

                <FooterRow>
                  <CRMButton variant="ghost" size="sm" onClick={() => setStep('mapping')} leftIcon={<ChevronLeft size={12} />}>
                    Back
                  </CRMButton>
                  <CRMButton
                    variant="primary"
                    size="sm"
                    leftIcon={orderChoice === 'skip' ? <ChevronRight size={12} /> : <Download size={12} />}
                    disabled={orderChoice === null}
                    loading={orderImporting}
                    onClick={handleImportOrders}
                  >
                    {orderChoice === 'skip' ? 'Skip & Continue' : 'Import & Continue'}
                  </CRMButton>
                </FooterRow>
              </>
            ) : (
              <>
                <ResultPanel result={orderResult} label="Order import complete" />
                <FooterRow>
                  <CRMButton
                    variant="primary"
                    size="sm"
                    rightIcon={<ChevronRight size={12} />}
                    onClick={() => setStep('products')}
                  >
                    Continue
                  </CRMButton>
                </FooterRow>
              </>
            )}
          </div>
        )}

        {/* STEP 3 — PRODUCTS */}
        {step === 'products' && (
          <div className="flex flex-col gap-4">
            {!productResult && (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Import products from YouCan?
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Importing links products to orders so stock is tracked. Orders referencing
                    unknown products stay in red until you import them.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'skip', label: 'Skip for now', desc: 'Do it later' },
                    { key: 'all', label: 'Import All', desc: 'Everything at once' },
                    { key: 'pick', label: 'Pick from list', desc: 'Choose specific products' },
                  ] as const).map((opt) => {
                    const active = productChoice === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setProductChoice(opt.key)}
                        className={cn(
                          'flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition',
                          active
                            ? 'border-primary bg-accent/50 ring-1 ring-primary/20'
                            : 'border-gray-100 hover:border-gray-200',
                        )}
                      >
                        <span className={cn('text-xs font-semibold', active ? 'text-primary' : 'text-gray-800')}>
                          {opt.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Pick-from-list UI */}
                {productChoice === 'pick' && (
                  <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50/40 p-3">
                    {/* Search */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={productSearchInput}
                        onChange={(e) => setProductSearchInput(e.target.value)}
                        placeholder="Search products by name…"
                        className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      {productSearchInput && (
                        <button
                          type="button"
                          onClick={() => setProductSearchInput('')}
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Clear search"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {productsLoading ? (
                      <div className="py-6 text-center text-[11px] text-gray-400">
                        {productSearch ? `Searching for "${productSearch}"…` : 'Loading products…'}
                      </div>
                    ) : products.length === 0 ? (
                      <div className="py-6 text-center text-[11px] text-gray-400">
                        {productSearch ? `No products match "${productSearch}"` : 'No products in this store yet'}
                      </div>
                    ) : (
                      <>
                        <div className="grid max-h-[260px] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                          {products.map((p) => {
                            const checked = selectedProducts.has(p.id);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => toggleProduct(p.id)}
                                className={cn(
                                  'flex items-center gap-2.5 rounded-lg border bg-white p-2 text-left transition',
                                  checked
                                    ? 'border-primary ring-1 ring-primary/20'
                                    : 'border-gray-100 hover:border-gray-200',
                                )}
                              >
                                <div className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                  checked ? 'border-primary bg-primary text-white' : 'border-gray-300',
                                )}>
                                  {checked && <Check size={10} />}
                                </div>
                                {p.thumbnail ? (
                                  <img src={p.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
                                    <Package size={12} className="text-gray-400" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-semibold text-gray-900">{p.name}</p>
                                  <p className="text-[9px] text-gray-400">
                                    {p.price} MAD · {p.variants_count} var · stock {p.inventory}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {productsTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 pt-1">
                            <CRMButton
                              variant="ghost"
                              size="sm"
                              disabled={productsPage <= 1}
                              onClick={() => loadProducts(productsPage - 1, productSearch)}
                              leftIcon={<ChevronLeft size={12} />}
                            >
                              Prev
                            </CRMButton>
                            <span className="text-[10px] text-gray-400">{productsPage} / {productsTotalPages}</span>
                            <CRMButton
                              variant="ghost"
                              size="sm"
                              disabled={productsPage >= productsTotalPages}
                              onClick={() => loadProducts(productsPage + 1, productSearch)}
                              rightIcon={<ChevronRight size={12} />}
                            >
                              Next
                            </CRMButton>
                          </div>
                        )}

                        <p className="text-center text-[10px] text-gray-400">
                          {selectedProducts.size} selected
                        </p>
                      </>
                    )}
                  </div>
                )}

                {productError && (
                  <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
                    {productError}
                  </p>
                )}

                <FooterRow>
                  <CRMButton variant="ghost" size="sm" onClick={() => setStep('orders')} leftIcon={<ChevronLeft size={12} />}>
                    Back
                  </CRMButton>
                  <CRMButton
                    variant="primary"
                    size="sm"
                    leftIcon={productChoice === 'skip' ? <ChevronRight size={12} /> : <Download size={12} />}
                    disabled={
                      productChoice === null
                      || (productChoice === 'pick' && selectedProducts.size === 0)
                    }
                    loading={productImporting}
                    onClick={handleImportProducts}
                  >
                    {productChoice === 'skip'
                      ? 'Skip & Finish'
                      : productChoice === 'pick'
                        ? `Import ${selectedProducts.size || ''} & Finish`
                        : 'Import All & Finish'}
                  </CRMButton>
                </FooterRow>
              </>
            )}

            {productResult && (
              <>
                <ResultPanel result={productResult} label="Product import complete" />
                <FooterRow>
                  <CRMButton
                    variant="primary"
                    size="sm"
                    leftIcon={<CheckCircle2 size={12} />}
                    onClick={() => {
                      setStep('done');
                    }}
                  >
                    Finish
                  </CRMButton>
                </FooterRow>
              </>
            )}
          </div>
        )}

        {/* STEP 4 — DONE */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Sparkles size={22} />
            </div>
            <p className="text-sm font-bold text-gray-900">You're all set!</p>
            <p className="max-w-md text-xs text-gray-500">
              {store.name} is connected. New orders will arrive automatically. Any order
              referencing a product that isn't in your catalog will appear in red — you can
              import it from the Integrations page at any time.
            </p>
            <CRMButton variant="primary" size="sm" onClick={onClose}>
              Close
            </CRMButton>
          </div>
        )}
      </div>
    </GlassModal>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepBar({ steps, currentIndex }: { steps: typeof STEPS; currentIndex: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={s.key} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                done
                  ? 'bg-emerald-500 text-white'
                  : active
                    ? 'bg-primary text-white'
                    : 'bg-gray-200 text-gray-500',
              )}
            >
              {done ? <Check size={12} /> : i + 1}
            </div>
            <span
              className={cn(
                'flex-1 truncate text-[10px] font-semibold uppercase tracking-wider',
                active ? 'text-primary' : done ? 'text-emerald-600' : 'text-gray-400',
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={cn('h-px flex-shrink-0 w-6', done ? 'bg-emerald-300' : 'bg-gray-200')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FooterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
      {children}
    </div>
  );
}

function ResultPanel({ result, label }: { result: ImportResult; label: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        result.errors > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50',
      )}
    >
      <div className="flex items-center gap-2">
        {result.errors > 0 ? (
          <AlertCircle size={16} className="text-amber-500" />
        ) : (
          <CheckCircle2 size={16} className="text-emerald-500" />
        )}
        <p className="text-xs font-bold text-gray-900">{label}</p>
      </div>
      <div className="mt-2 flex gap-4 text-[11px]">
        <span className="text-emerald-700">{result.imported} imported</span>
        <span className="text-gray-500">{result.skipped} skipped</span>
        <span className="text-red-600">{result.errors} errors</span>
      </div>
      {result.details.length > 0 && (
        <div className="mt-2 max-h-32 overflow-y-auto rounded-btn bg-white/80 p-2 text-[10px] text-gray-600">
          {result.details.slice(0, 40).map((d, i) => <p key={i}>{d}</p>)}
          {result.details.length > 40 && (
            <p className="text-gray-400">…and {result.details.length - 40} more</p>
          )}
        </div>
      )}
    </div>
  );
}
