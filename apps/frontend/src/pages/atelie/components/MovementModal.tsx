import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMButton, CRMSelect } from '@/components/ui';
import { atelieApi, type Material, type MovementType, type MaterialMovement } from '@/services/atelieApi';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  onClose: () => void;
  material: Material | null;
  onSaved: () => void;
}

export function MovementModal({ open, onClose, material, onSaved }: Props) {
  const { t } = useTranslation();
  const [type, setType] = useState<MovementType>('in');
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MaterialMovement[]>([]);

  const TYPE_OPTIONS = useMemo(
    () => [
      { value: 'in', label: t('atelie.movement.typeIn') },
      { value: 'out', label: t('atelie.movement.typeOut') },
      { value: 'adjustment', label: t('atelie.movement.typeAdjustment') },
    ],
    [t],
  );

  useEffect(() => {
    if (!open || !material) return;
    setType('in');
    setQty(0);
    setReason('');
    setError(null);
    atelieApi.listMovements(material.id, 20).then(setHistory).catch(() => setHistory([]));
  }, [open, material]);

  if (!material) return null;

  async function submit() {
    if (qty <= 0) {
      setError(t('atelie.movement.qtyError'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await atelieApi.recordMovement(material!.id, { type, quantity: qty, reason: reason.trim() || undefined });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t('atelie.movement.failedRecord')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('atelie.movement.title', { name: material.name })}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            {t('atelie.movement.close')}
          </CRMButton>
          <CRMButton onClick={submit} loading={saving}>
            {t('atelie.movement.record')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
              {t('atelie.movement.currentStock')}
            </p>
            <p className="text-xl font-bold text-gray-900">
              {material.stock} <span className="text-sm font-normal text-gray-500">{material.unit}</span>
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
              {t('atelie.movement.lowThreshold')}
            </p>
            <p className="text-sm font-semibold text-gray-700">{material.lowStockThreshold}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <CRMSelect
            label={t('atelie.movement.type')}
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => setType(v as MovementType)}
            className="col-span-2"
          />
          <CRMInput
            label={t('atelie.movement.quantity')}
            type="number"
            min={0}
            step={0.01}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </div>
        <CRMInput
          label={t('atelie.movement.reasonOptional')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            {t('atelie.movement.recentMovements')}
          </h3>
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('atelie.movement.columns.date')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('atelie.movement.columns.type')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('atelie.movement.columns.qty')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('atelie.movement.columns.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-center text-sm text-gray-400">
                      {t('atelie.movement.empty')}
                    </td>
                  </tr>
                )}
                {history.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <TypeTag type={m.type} />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{m.quantity}</td>
                    <td className="px-3 py-2 text-gray-500">{m.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}

function TypeTag({ type }: { type: MovementType }) {
  const { t } = useTranslation();
  const map = {
    in: 'bg-green-50 text-green-600',
    out: 'bg-red-50 text-red-600',
    adjustment: 'bg-blue-50 text-blue-600',
  } as const;
  const label = {
    in: t('atelie.movement.badgeIn'),
    out: t('atelie.movement.badgeOut'),
    adjustment: t('atelie.movement.badgeAdjustment'),
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[type]}`}>
      {label[type]}
    </span>
  );
}
