import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMButton } from '@/components/ui/CRMButton';
import { integrationsApi, type Store } from '@/services/integrationsApi';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (store: Store) => void;
}

export function AddStoreModal({ open, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('integrations.addStore.nameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const store = await integrationsApi.createStore({ name: name.trim() });
      reset();
      onCreated(store);
      onClose();
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.addStore.createFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title={t('integrations.addStore.title')} size="md">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray-500">{t('integrations.addStore.intro')}</p>

        <CRMInput
          label={t('integrations.addStore.storeName')}
          placeholder={t('integrations.addStore.placeholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />

        {error && (
          <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <CRMButton variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </CRMButton>
          <CRMButton
            variant="primary"
            size="sm"
            leftIcon={<Link2 size={12} />}
            onClick={handleSubmit}
            loading={saving}
          >
            {t('integrations.addStore.createConnect')}
          </CRMButton>
        </div>
      </div>
    </GlassModal>
  );
}
