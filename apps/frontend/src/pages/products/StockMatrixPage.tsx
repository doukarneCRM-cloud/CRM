import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Grid2x2, List, Search } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { PERMISSIONS } from '@/constants/permissions';
import { useAuthStore } from '@/store/authStore';
import { CRMInput } from '@/components/ui/CRMInput';
import { useProducts } from './hooks/useProducts';
import { ProductStockMatrix } from './components/ProductStockMatrix';

export default function StockMatrixPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission(PERMISSIONS.PRODUCTS_EDIT);

  const [search, setSearch] = useState('');
  const { products, loading } = useProducts({ search: search.trim() || undefined });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('products.stockMatrix.title')}</h1>
          <p className="text-xs text-gray-400">{t('products.stockMatrix.subtitle')}</p>
        </div>

        <NavLink
          to={ROUTES.PRODUCTS_LIST}
          className="flex items-center gap-1.5 rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-primary hover:text-primary"
        >
          <List size={14} />
          {t('products.stockMatrix.productList')}
        </NavLink>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-sm">
        <CRMInput
          wrapperClassName="w-full sm:max-w-xs"
          leftIcon={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('products.list.searchPlaceholder')}
        />
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <Grid2x2 size={13} />
          <span>
            {loading ? t('products.list.loading') : t('products.list.count', { count: products.length })}
          </span>
        </div>
      </div>

      {loading && products.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-48 w-full rounded-card" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center rounded-card border border-dashed border-gray-200 bg-white/60 text-xs text-gray-400">
          {t('products.stockMatrix.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((p) => (
            <ProductStockMatrix key={p.id} product={p} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
