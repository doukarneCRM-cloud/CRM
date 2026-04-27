import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Video,
  CheckCircle2,
  FlaskConical,
  Pencil,
  Archive,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import {
  productionApi,
  type ProductTest,
  type SampleCostBreakdown,
  type SampleStatus,
} from '@/services/productionApi';
import { useAuthStore } from '@/store/authStore';
import { resolveImageUrl } from '@/lib/imageUrl';
import { apiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/store/toastStore';
import { SampleStatusPill } from './components/SampleStatusPill';
import { SampleCostPanel } from './components/SampleCostPanel';

// Forward-only by default — these match ALLOWED_TRANSITIONS in the backend
// service. Order here drives button display order.
const TRANSITIONS: Record<SampleStatus, Array<{ to: SampleStatus; icon: typeof Pencil }>> = {
  draft:    [{ to: 'tested',   icon: FlaskConical }, { to: 'archived', icon: Archive }],
  tested:   [{ to: 'approved', icon: CheckCircle2 }, { to: 'draft', icon: Pencil }, { to: 'archived', icon: Archive }],
  approved: [{ to: 'archived', icon: Archive },      { to: 'tested',   icon: FlaskConical }],
  archived: [{ to: 'draft',    icon: Pencil }],
};

export default function ProductTestDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [test, setTest] = useState<ProductTest | null>(null);
  const [breakdown, setBreakdown] = useState<SampleCostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitionTo, setTransitionTo] = useState<SampleStatus | null>(null);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canViewVideo = hasPermission('atelie:tests:view_video');
  const canManage = hasPermission('atelie:tests:manage');
  const pushToast = useToastStore((s) => s.push);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const [t, c] = await Promise.all([
        productionApi.getTest(id),
        productionApi.getCost(id).catch(() => null),
      ]);
      setTest(t);
      setBreakdown(c);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleTransition = async (to: SampleStatus) => {
    if (!id) return;
    setTransitionTo(to);
    try {
      const updated = await productionApi.transitionSample(id, to);
      setTest(updated);
      pushToast({
        kind: 'confirmed',
        title: t('production.samples.transition.successTitle'),
        body: t('production.samples.transition.successBody', { to: t(`production.samples.status.${to}`) }),
      });
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.samples.transition.errorTitle'),
        body: apiErrorMessage(err, t('production.samples.transition.errorBody')),
      });
    } finally {
      setTransitionTo(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">{t('production.testDetail.loading')}</div>;
  }
  if (!test) {
    return <div className="p-6 text-sm text-gray-400">{t('production.testDetail.notFound')}</div>;
  }

  const allowedTransitions = TRANSITIONS[test.status];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Link
        to={ROUTES.PRODUCTION_TESTS}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary"
      >
        <ArrowLeft size={12} /> {t('production.testDetail.backToTests')}
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{test.name}</h1>
            <SampleStatusPill status={test.status} />
          </div>
          <p className="text-xs text-gray-400">
            {t('production.testDetail.createdOn', {
              date: new Date(test.createdAt).toLocaleDateString(),
            })}
            {test.product && (
              <>
                {' • '}
                {t('production.testDetail.productLabel', { name: test.product.name })}
              </>
            )}
            {test.status === 'approved' && test.approvedBy && test.approvedAt && (
              <>
                {' • '}
                {t('production.samples.approvedMeta', {
                  name: test.approvedBy.name,
                  date: new Date(test.approvedAt).toLocaleDateString(),
                })}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          {canManage && allowedTransitions.map(({ to, icon: Icon }) => (
            <CRMButton
              key={to}
              variant={to === 'approved' ? 'primary' : 'secondary'}
              size="sm"
              leftIcon={
                transitionTo === to ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Icon size={12} />
                )
              }
              onClick={() => void handleTransition(to)}
              disabled={transitionTo !== null}
            >
              {t(`production.samples.transition.to.${to}`)}
            </CRMButton>
          ))}
        </div>
      </div>

      {/* ── Two-column layout: main content (left) + cost panel (right) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* MAIN — fabrics, sizes, accessories, photos, description */}
        <div className="flex flex-col gap-4">
          {test.photos.length > 0 && (
            <GlassCard padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ImageIcon size={14} className="text-gray-400" />
                {t('production.samples.photos')}
                <span className="rounded-badge bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
                  {test.photos.length}
                </span>
              </h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {test.photos.map((p) => (
                  <a
                    key={p.id}
                    href={resolveImageUrl(p.url) || p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-md bg-gray-50"
                  >
                    <img
                      src={resolveImageUrl(p.url) || p.url}
                      alt={p.caption ?? ''}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            </GlassCard>
          )}

          {test.description && (
            <GlassCard padding="md">
              <h2 className="mb-2 text-sm font-semibold text-gray-900">
                {t('production.samples.description')}
              </h2>
              <p className="whitespace-pre-wrap text-xs text-gray-600">{test.description}</p>
            </GlassCard>
          )}

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
          </div>

          <GlassCard padding="md">
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
                    <th className="py-1.5 text-right font-medium">
                      {t('production.samples.col.unitCost')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {test.accessories.map((a) => (
                    <tr key={a.id} className="border-t border-gray-100">
                      <td className="py-1.5 text-gray-900">{a.material?.name ?? a.materialId}</td>
                      <td className="py-1.5 text-right text-gray-700">{a.quantityPerPiece}</td>
                      <td className="py-1.5 text-gray-500">{a.material?.unit ?? '—'}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-700">
                        {a.unitCostSnapshot != null
                          ? `${Number(a.unitCostSnapshot).toFixed(2)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </GlassCard>
        </div>

        {/* ── Right rail: live cost breakdown ─────────────────────────── */}
        <SampleCostPanel
          breakdown={breakdown}
          loading={loading}
          markupPercent={test.markupPercent}
          className="lg:sticky lg:top-20 lg:self-start"
        />
      </div>
    </div>
  );
}
