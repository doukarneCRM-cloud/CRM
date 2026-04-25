import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, X, Loader2, Package, User, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDebounce } from '@/hooks/useDebounce';
import { useClickOutside } from '@/hooks/useClickOutside';
import { ROUTES } from '@/constants/routes';
import { ordersApi, customersApi, type ClientListItem } from '@/services/ordersApi';
import { productsApi } from '@/services/productsApi';
import type { Order } from '@/types/orders';
import type { ProductDetail } from '@/services/productsApi';

interface Results {
  orders: Order[];
  clients: ClientListItem[];
  products: ProductDetail[];
}

const EMPTY: Results = { orders: [], clients: [], products: [] };
const PER_SECTION = 5;
const MIN_QUERY_LEN = 2;

export function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results>(EMPTY);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debounced = useDebounce(value.trim(), 300);

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  useEffect(() => {
    if (!open || debounced.length < MIN_QUERY_LEN) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      ordersApi.list({ search: debounced, pageSize: PER_SECTION, page: 1 }),
      customersApi.list({ search: debounced, pageSize: PER_SECTION, page: 1 }),
      productsApi.list({ search: debounced }),
    ]).then(([o, c, p]) => {
      if (cancelled) return;
      setResults({
        orders: o.status === 'fulfilled' ? o.value.data : [],
        clients: c.status === 'fulfilled' ? c.value.data : [],
        products:
          p.status === 'fulfilled' ? p.value.slice(0, PER_SECTION) : [],
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  useEffect(() => {
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', escHandler);
    return () => document.removeEventListener('keydown', escHandler);
  }, []);

  const closeAndGo = (path: string) => {
    setOpen(false);
    setValue('');
    navigate(path);
  };

  const totalResults =
    results.orders.length + results.clients.length + results.products.length;
  const hasQuery = debounced.length >= MIN_QUERY_LEN;

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          'hidden w-full items-center gap-2 rounded-input border border-white/10 bg-white/95 px-3 py-1.5 md:flex',
          'focus-within:border-white focus-within:bg-white focus-within:shadow-sm',
        )}
      >
        <Search size={14} className="text-gray-400" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('shared.search.placeholder')}
          className="w-full min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder-gray-400"
        />
        {loading ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : value ? (
          <button
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
            className="text-gray-400 hover:text-gray-600"
            aria-label={t('shared.search.clear')}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {open && hasQuery && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[420px] max-h-[520px] overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-hover">
          {loading && totalResults === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              {t('shared.search.searching')}
            </div>
          )}

          {!loading && totalResults === 0 && (
            <div className="px-4 py-8 text-center text-xs text-gray-400">
              {t('shared.search.noResults', { query: debounced })}
            </div>
          )}

          {results.orders.length > 0 && (
            <Section icon={ShoppingBag} title={t('shared.search.orders')}>
              {results.orders.map((o) => (
                <ResultRow
                  key={o.id}
                  title={`#${o.reference}`}
                  subtitle={`${o.customer.fullName} · ${o.customer.phoneDisplay} · ${o.customer.city}`}
                  meta={o.total.toLocaleString('fr-MA', { maximumFractionDigits: 0 }) + ' MAD'}
                  onClick={() => closeAndGo(ROUTES.ORDERS)}
                />
              ))}
            </Section>
          )}

          {results.clients.length > 0 && (
            <Section icon={User} title={t('shared.search.clients')}>
              {results.clients.map((c) => (
                <ResultRow
                  key={c.id}
                  title={c.fullName}
                  subtitle={`${c.phoneDisplay} · ${c.city}`}
                  meta={t('shared.search.orderCount', { count: c.totalOrders })}
                  onClick={() => closeAndGo(ROUTES.CLIENTS)}
                />
              ))}
            </Section>
          )}

          {results.products.length > 0 && (
            <Section icon={Package} title={t('shared.search.products')}>
              {results.products.map((p) => (
                <ResultRow
                  key={p.id}
                  title={p.name}
                  subtitle={p.sku ? t('shared.search.skuLabel', { sku: p.sku }) : t('shared.search.noSku')}
                  onClick={() => closeAndGo(ROUTES.PRODUCTS_LIST)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Search;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-50 last:border-b-0">
      <div className="flex items-center gap-2 border-b border-gray-50 bg-gray-50/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        <Icon size={11} />
        {title}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function ResultRow({
  title,
  subtitle,
  meta,
  onClick,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>}
        </div>
        {meta && <span className="shrink-0 text-xs font-medium text-gray-600">{meta}</span>}
      </button>
    </li>
  );
}
