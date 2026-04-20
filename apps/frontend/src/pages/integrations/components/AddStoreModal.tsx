import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMButton } from '@/components/ui/CRMButton';
import { integrationsApi, type Store } from '@/services/integrationsApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (store: Store) => void;
}

export function AddStoreModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Store name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const store = await integrationsApi.createStore({ name: name.trim() });
      reset();
      onCreated(store);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to create store');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title="Add YouCan Store" size="md">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray-500">
          Give this connection a name, then you'll be taken to YouCan in a popup window to
          authorize access. Have multiple brands? Create one entry per YouCan store — you can
          link as many as you need.
        </p>

        <CRMInput
          label="Store Name"
          placeholder="My YouCan Store"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />

        {error && (
          <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <CRMButton variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </CRMButton>
          <CRMButton
            variant="primary"
            size="sm"
            leftIcon={<Link2 size={12} />}
            onClick={handleSubmit}
            loading={saving}
          >
            Create & Connect
          </CRMButton>
        </div>
      </div>
    </GlassModal>
  );
}
