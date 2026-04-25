import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { Package, Check, Download, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { integrationsApi, type YoucanProductPreview, type ImportResult } from '@/services/integrationsApi';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  storeId: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function ImportProductsModal({ storeId, open, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<YoucanProductPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProducts = useCallback(async (p: number, q: string) => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await integrationsApi.previewYoucanProducts(storeId, p, q || undefined);
      setProducts(data.products);
      setPage(data.pagination.current_page);
      setTotalPages(data.pagination.total_pages);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.importProducts.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [storeId, t]);

  useEffect(() => {
    if (open && storeId) {
      setSelected(new Set());
      setResult(null);
      setError(null);
      setSearchInput('');
      setSearch('');
      loadProducts(1, '');
    }
  }, [open, storeId, loadProducts]);

  // Debounce search input → fire a load with the query
  useEffect(() => {
    if (!open) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(searchInput);
      loadProducts(1, searchInput);
    }, 350);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchInput, open, loadProducts]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  const handleImport = async (mode: 'selected' | 'all') => {
    if (!storeId) return;
    setImporting(true);
    setError(null);
    try {
      const r = await integrationsApi.importProducts(
        storeId,
        mode === 'selected' ? Array.from(selected) : undefined,
      );
      setResult(r);
      onDone();
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.importProducts.importFailed')));
    } finally {
      setImporting(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title={t('integrations.importProducts.title')} size="xl">
      <div className="flex flex-col gap-4">
        {/* Result summary */}
        {result && (
          <div className={cn(
            'rounded-xl border p-4',
            result.errors > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50',
          )}>
            <p className="text-sm font-bold text-gray-900">{t('integrations.importProducts.importComplete')}</p>
            <div className="mt-2 flex gap-4 text-xs">
              <span className="text-emerald-700">{t('integrations.importProducts.importedLabel', { count: result.imported })}</span>
              <span className="text-gray-500">{t('integrations.importProducts.updatedLabel', { count: result.skipped })}</span>
              <span className="text-red-600">{t('integrations.importProducts.errorsLabel', { count: result.errors })}</span>
            </div>
            {result.details.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-btn bg-white/80 p-2 text-[11px] text-gray-600">
                {result.details.map((d, i) => <p key={i}>{d}</p>)}
              </div>
            )}
            <CRMButton variant="ghost" size="sm" onClick={onClose} className="mt-3">
              {t('integrations.importProducts.close')}
            </CRMButton>
          </div>
        )}

        {/* Import buttons */}
        {!result && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">{t('integrations.importProducts.intro')}</p>
              <div className="flex items-center gap-2">
                <CRMButton
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download size={12} />}
                  onClick={() => handleImport('all')}
                  loading={importing}
                  disabled={loading}
                >
                  {t('integrations.importProducts.importAll')}
                </CRMButton>
                {selected.size > 0 && (
                  <CRMButton
                    variant="primary"
                    size="sm"
                    leftIcon={<Download size={12} />}
                    onClick={() => handleImport('selected')}
                    loading={importing}
                  >
                    {t('integrations.importProducts.importSelected', { count: selected.size })}
                  </CRMButton>
                )}
              </div>
            </div>

            {error && (
              <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">{error}</p>
            )}

            {/* Search bar */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('integrations.importProducts.searchPlaceholder')}
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title={t('integrations.importProducts.clearSearch')}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Product list */}
            {loading ? (
              <div className="flex items-center justify-center py-12 text-xs text-gray-400">
                {search
                  ? t('integrations.importProducts.searching', { query: search })
                  : t('integrations.importProducts.loadingProducts')}
              </div>
            ) : products.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-xs text-gray-400">
                {search
                  ? t('integrations.importProducts.noMatch', { query: search })
                  : t('integrations.importProducts.noProducts')}
              </div>
            ) : (
              <>
                {/* Select all */}
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-xs font-medium text-primary"
                >
                  <div className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    selected.size === products.length
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-300',
                  )}>
                    {selected.size === products.length && <Check size={10} />}
                  </div>
                  {t('integrations.importProducts.selectAll')}
                </button>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => toggleSelect(p.id)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition',
                        selected.has(p.id)
                          ? 'border-primary bg-accent/40 ring-1 ring-primary/20'
                          : 'border-gray-100 hover:border-gray-200',
                      )}
                    >
                      <div className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                        selected.has(p.id) ? 'border-primary bg-primary text-white' : 'border-gray-300',
                      )}>
                        {selected.has(p.id) && <Check size={10} />}
                      </div>
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                          <Package size={16} className="text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-gray-900">{p.name}</p>
                        <div className="flex gap-2 text-[10px] text-gray-400">
                          <span>{t('integrations.importProducts.priceMad', { price: p.price })}</span>
                          <span>{t('integrations.importProducts.variantsCount', { count: p.variants_count })}</span>
                          <span>{t('integrations.importProducts.stock', { count: p.inventory })}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <CRMButton variant="ghost" size="sm" disabled={page <= 1} onClick={() => loadProducts(page - 1, search)} leftIcon={<ChevronLeft size={12} />}>
                      {t('integrations.importProducts.prev')}
                    </CRMButton>
                    <span className="text-[11px] text-gray-400">{page} / {totalPages}</span>
                    <CRMButton variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => loadProducts(page + 1, search)} leftIcon={<ChevronRight size={12} />}>
                      {t('integrations.importProducts.next')}
                    </CRMButton>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </GlassModal>
  );
}
