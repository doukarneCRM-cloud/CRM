import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Scissors,
  Sparkles,
  Wand2,
  CheckCircle2,
  PackageCheck,
  Loader2,
  Check,
} from 'lucide-react';
import { GlassCard } from '@/components/ui';
import { cn } from '@/lib/cn';
import { productionApi, type RunStage, type ProductionStageKey } from '@/services/productionApi';
import { apiErrorMessage } from '@/lib/apiError';
import { useToastStore } from '@/store/toastStore';

interface Props {
  runId: string;
  stages: RunStage[];
  order: ProductionStageKey[];
  canManage: boolean;
  onAdvanced: (next: RunStage[]) => void;
}

const STAGE_META: Record<
  ProductionStageKey,
  { Icon: typeof Scissors; tone: string }
> = {
  cut:    { Icon: Scissors,     tone: 'bg-violet-50 text-violet-700' },
  sew:    { Icon: Sparkles,     tone: 'bg-blue-50 text-blue-700' },
  finish: { Icon: Wand2,        tone: 'bg-pink-50 text-pink-700' },
  qc:     { Icon: CheckCircle2, tone: 'bg-amber-50 text-amber-700' },
  packed: { Icon: PackageCheck, tone: 'bg-emerald-50 text-emerald-700' },
};

/**
 * Cut → sew → finish → qc → packed pipeline. Each card lets a supervisor
 * record input/output/rejected counts and tick "Complete" — completing a
 * stage carries the good-piece yield (output - rejected) into the next
 * stage's input automatically.
 */
export function StagesTimeline({ runId, stages, order, canManage, onAdvanced }: Props) {
  const { t } = useTranslation();
  return (
    <GlassCard padding="md">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">
        {t('production.stages.title')}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {order.map((key) => {
          const row = stages.find((s) => s.stage === key);
          if (!row) return null;
          return (
            <StageCard
              key={key}
              runId={runId}
              row={row}
              canManage={canManage}
              onUpdated={onAdvanced}
            />
          );
        })}
      </div>
    </GlassCard>
  );
}

function StageCard({
  runId,
  row,
  canManage,
  onUpdated,
}: {
  runId: string;
  row: RunStage;
  canManage: boolean;
  onUpdated: (next: RunStage[]) => void;
}) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const meta = STAGE_META[row.stage];
  const completed = row.completedAt != null;
  const started = row.startedAt != null;

  const [input, setInput] = useState(row.inputPieces);
  const [output, setOutput] = useState(row.outputPieces);
  const [rejected, setRejected] = useState(row.rejectedPieces);
  const [saving, setSaving] = useState(false);

  const yieldGood = Math.max(0, output - rejected);

  async function save(complete: boolean) {
    setSaving(true);
    try {
      const next = await productionApi.advanceStage(runId, row.stage, {
        inputPieces: input,
        outputPieces: output,
        rejectedPieces: rejected,
        complete,
      });
      onUpdated(next);
      pushToast({
        kind: 'confirmed',
        title: t('production.stages.toast.savedTitle'),
      });
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.stages.toast.errorTitle'),
        body: apiErrorMessage(err, t('production.stages.toast.errorBody')),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-white p-3',
        completed ? 'border-emerald-200' : started ? 'border-primary/30' : 'border-gray-100',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-badge px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            meta.tone,
          )}
        >
          <meta.Icon size={10} />
          {t(`production.stages.label.${row.stage}`)}
        </span>
        {completed ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <Check size={10} /> {t('production.stages.complete')}
          </span>
        ) : started ? (
          <span className="text-[10px] font-medium text-primary">
            {t('production.stages.inProgress')}
          </span>
        ) : (
          <span className="text-[10px] text-gray-400">{t('production.stages.idle')}</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <NumberRow
          label={t('production.stages.input')}
          value={input}
          disabled={!canManage || completed || saving}
          onChange={setInput}
        />
        <NumberRow
          label={t('production.stages.output')}
          value={output}
          disabled={!canManage || completed || saving}
          onChange={setOutput}
        />
        <NumberRow
          label={t('production.stages.rejected')}
          value={rejected}
          disabled={!canManage || completed || saving}
          onChange={setRejected}
        />
      </div>

      <div className="flex items-baseline justify-between rounded-input bg-gray-50 px-2 py-1.5 text-[10px]">
        <span className="text-gray-500">{t('production.stages.yield')}</span>
        <span className="text-sm font-bold text-gray-900">{yieldGood}</span>
      </div>

      {!completed && canManage && (
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={saving}
            className="flex-1 rounded-btn border border-gray-200 bg-white py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? <Loader2 size={11} className="mx-auto animate-spin" /> : t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saving}
            className="flex-1 rounded-btn bg-emerald-600 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {t('production.stages.completeBtn')}
          </button>
        </div>
      )}
    </div>
  );
}

function NumberRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-gray-600">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-20 rounded-input border border-gray-200 px-2 py-1 text-right text-xs font-semibold text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-gray-50 disabled:text-gray-400"
      />
    </label>
  );
}
