import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Box,
  Coins,
  StickyNote,
  Workflow,
  Power,
  Loader2,
} from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { cn } from '@/lib/cn';
import { productionApi, type RunLog, type ProductionLogTypeKey } from '@/services/productionApi';

interface Props {
  runId: string;
  /** Bump to force refetch — parent passes a key that changes whenever a stage advances or labor is split. */
  refreshKey?: number;
}

const TYPE_META: Record<
  ProductionLogTypeKey,
  { Icon: typeof Activity; tone: string }
> = {
  system:      { Icon: Activity,   tone: 'text-gray-500 bg-gray-50' },
  stage:       { Icon: Workflow,   tone: 'text-violet-700 bg-violet-50' },
  consumption: { Icon: Box,        tone: 'text-blue-700 bg-blue-50' },
  labor:       { Icon: Coins,      tone: 'text-amber-700 bg-amber-50' },
  note:        { Icon: StickyNote, tone: 'text-pink-700 bg-pink-50' },
  status:      { Icon: Power,      tone: 'text-emerald-700 bg-emerald-50' },
};

/**
 * Audit feed for a production run. Shows the latest 50 entries; extends
 * naturally as the run progresses since both the stage timeline and the
 * week-close labor split log here.
 */
export function LogsFeed({ runId, refreshKey }: Props) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    productionApi
      .listLogs(runId, { pageSize: 50 })
      .then((r) => {
        if (!cancelled) setLogs(r.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, refreshKey]);

  return (
    <GlassCard padding="md">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Activity size={14} className="text-gray-400" />
        {t('production.logs.title')}
      </h2>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="animate-spin text-gray-300" />
        </div>
      ) : logs.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">
          {t('production.logs.empty')}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {logs.map((log) => {
            const meta = TYPE_META[log.type] ?? TYPE_META.system;
            return (
              <li key={log.id} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    meta.tone,
                  )}
                >
                  <meta.Icon size={11} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-700">{log.action}</p>
                  <p className="text-[10px] text-gray-400">
                    {log.performedBy ?? t('production.logs.system')}
                    {' · '}
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </GlassCard>
  );
}
