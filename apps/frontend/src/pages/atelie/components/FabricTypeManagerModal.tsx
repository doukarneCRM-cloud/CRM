import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMButton } from '@/components/ui';
import { atelieApi, type FabricType } from '@/services/atelieApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function FabricTypeManagerModal({ open, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const [types, setTypes] = useState<FabricType[]>([]);
  const [newName, setNewName] = useState('');

  async function load() {
    const rows = await atelieApi.listFabricTypes();
    setTypes(rows);
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  async function add() {
    if (!newName.trim()) return;
    await atelieApi.createFabricType({ name: newName.trim() });
    setNewName('');
    load();
    onChanged();
  }

  async function remove(id: string) {
    if (!window.confirm(t('atelie.fabricTypeManager.confirmDeactivate'))) return;
    await atelieApi.deactivateFabricType(id);
    load();
    onChanged();
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('atelie.fabricTypeManager.title')}
      size="sm"
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('atelie.fabricTypeManager.close')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <CRMInput
            label={t('atelie.fabricTypeManager.newType')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('atelie.fabricTypeManager.placeholder')}
          />
          <CRMButton leftIcon={<Plus size={14} />} onClick={add} disabled={!newName.trim()}>
            {t('atelie.fabricTypeManager.add')}
          </CRMButton>
        </div>

        <div className="rounded-input border border-gray-100">
          {types.length === 0 && (
            <p className="py-4 text-center text-xs text-gray-400">
              {t('atelie.fabricTypeManager.empty')}
            </p>
          )}
          {types.map((ft) => (
            <div
              key={ft.id}
              className="flex items-center justify-between border-b border-gray-100 px-3 py-2 last:border-b-0"
            >
              <span className="text-sm text-gray-800">{ft.name}</span>
              <button
                onClick={() => remove(ft.id)}
                className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                aria-label={t('atelie.fabricTypeManager.deactivate')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </GlassModal>
  );
}
