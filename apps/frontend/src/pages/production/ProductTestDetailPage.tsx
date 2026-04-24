import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { productionApi, type ProductTest } from '@/services/productionApi';
import { useAuthStore } from '@/store/authStore';

export default function ProductTestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [test, setTest] = useState<ProductTest | null>(null);
  const [loading, setLoading] = useState(true);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canViewVideo = hasPermission('atelie:tests:view_video');

  useEffect(() => {
    if (!id) return;
    productionApi
      .getTest(id)
      .then(setTest)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">{t('production.testDetail.loading')}</div>;
  }
  if (!test) {
    return <div className="p-6 text-sm text-gray-400">{t('production.testDetail.notFound')}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        to={ROUTES.PRODUCTION_TESTS}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary"
      >
        <ArrowLeft size={12} /> {t('production.testDetail.backToTests')}
      </Link>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{test.name}</h1>
          <p className="text-xs text-gray-400">
            {t('production.testDetail.createdOn', {
              date: new Date(test.createdAt).toLocaleDateString(),
            })}
            {test.product && (
              <>
                {' \u2022 '}
                {t('production.testDetail.productLabel', { name: test.product.name })}
              </>
            )}
          </p>
        </div>
        {canViewVideo && test.videoUrl && (
          <a
            href={test.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-btn bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <Video size={12} /> {t('production.testDetail.watchReference')}
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GlassCard padding="md">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            {t('production.testDetail.fabrics')}
          </h2>
          {test.fabrics.length === 0 ? (
            <p className="text-xs text-gray-400">{t('production.testDetail.noFabrics')}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {test.fabrics.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-input bg-gray-50 px-3 py-2"
                >
                  <span className="text-gray-900">{f.fabricType?.name ?? f.fabricTypeId}</span>
                  <span className="text-xs capitalize text-gray-500">{f.role}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard padding="md">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            {t('production.testDetail.sizesAndTracing')}
          </h2>
          {test.sizes.length === 0 ? (
            <p className="text-xs text-gray-400">{t('production.testDetail.noSizes')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="py-1.5 text-left font-medium">
                    {t('production.testDetail.colSize')}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {t('production.testDetail.colTracing')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {test.sizes.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-900">{s.size}</td>
                    <td className="py-1.5 text-right text-gray-700">
                      {s.tracingMeters.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassCard>

        <GlassCard padding="md" className="md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            {t('production.testDetail.accessoriesPerPiece')}
          </h2>
          {test.accessories.length === 0 ? (
            <p className="text-xs text-gray-400">{t('production.testDetail.noAccessories')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="py-1.5 text-left font-medium">
                    {t('production.testDetail.colItem')}
                  </th>
                  <th className="py-1.5 text-right font-medium">
                    {t('production.testDetail.colQtyPerPiece')}
                  </th>
                  <th className="py-1.5 text-left font-medium">
                    {t('production.testDetail.colUnit')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {test.accessories.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="py-1.5 text-gray-900">{a.material?.name ?? a.materialId}</td>
                    <td className="py-1.5 text-right text-gray-700">{a.quantityPerPiece}</td>
                    <td className="py-1.5 text-gray-500">{a.material?.unit ?? '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassCard>

        {test.estimatedCostPerPiece != null && (
          <GlassCard padding="md" className="md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                {t('production.testDetail.estimatedMadPerPiece')}
              </span>
              <span className="text-lg font-bold text-primary">
                {t('production.testDetail.valueMad', {
                  value: test.estimatedCostPerPiece.toFixed(2),
                })}
              </span>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
