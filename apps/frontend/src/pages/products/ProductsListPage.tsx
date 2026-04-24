import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Grid3x3 } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { PERMISSIONS } from '@/constants/permissions';
import { useAuthStore } from '@/store/authStore';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { useProducts } from './hooks/useProducts';
import { ProductCard } from './components/ProductCard';
import { ProductEditModal } from './components/ProductEditModal';
import { productsApi, type ProductDetail } from '@/services/productsApi';
import { apiErrorMessage } from '@/lib/apiError';

export default function ProductsListPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission(PERMISSIONS.PRODUCTS_CREATE);
  const canEdit = hasPermission(PERMISSIONS.PRODUCTS_EDIT);
  const canDelete = hasPermission(PERMISSIONS.PRODUCTS_DELETE);

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const { products, loading, refresh } = useProducts({
    includeInactive: showInactive,
    search: search.trim() || undefined,
  });

  const [editing, setEditing] = useState<ProductDetail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (product: ProductDetail) => {
    setEditing(product);
    setModalOpen(true);
  };

  const handleDelete = async (product: ProductDetail) => {
    try {
      await productsApi.remove(product.id);
    } catch (e) {
      window.alert(apiErrorMessage(e, t('products.list.deleteFailed')));
      return;
    }
    await refresh();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('products.list.title')}</h1>
          <p className="text-xs text-gray-400">{t('products.list.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <NavLink
            to={ROUTES.PRODUCTS_STOCK}
            className="flex items-center gap-1.5 rounded-btn border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-primary hover:text-primary"
          >
            <Grid3x3 size={14} />
            {t('products.list.stockMatrix')}
          </NavLink>
          {canCreate && (
            <CRMButton leftIcon={<Plus size={14} />} onClick={openCreate}>
              {t('products.list.addProduct')}
            </CRMButton>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white/80 px-4 py-3 backdrop-blur-sm">
        <CRMInput
          wrapperClassName="w-full sm:max-w-xs"
          leftIcon={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('products.list.searchPlaceholder')}
        />
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          {t('products.list.showInactive')}
        </label>
        <div className="ml-auto text-xs text-gray-400">
          {loading ? t('products.list.loading') : t('products.list.count', { count: products.length })}
        </div>
      </div>

      {loading && products.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-[280px] w-full rounded-card" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-gray-200 bg-white/60 text-center">
          <p className="text-sm font-semibold text-gray-700">{t('products.list.emptyTitle')}</p>
          <p className="text-xs text-gray-400">
            {search ? t('products.list.emptySearch') : t('products.list.emptyCta')}
          </p>
          {canCreate && !search && (
            <CRMButton leftIcon={<Plus size={14} />} onClick={openCreate} className="mt-2">
              {t('products.list.addProduct')}
            </CRMButton>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}

      <ProductEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void refresh();
        }}
        product={editing}
      />
    </div>
  );
}
