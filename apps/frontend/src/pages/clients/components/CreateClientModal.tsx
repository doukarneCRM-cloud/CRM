import { useEffect, useState } from 'react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { CRMButton } from '@/components/ui/CRMButton';
import { customersApi, supportApi } from '@/services/ordersApi';
import { apiErrorMessage } from '@/lib/apiError';
import type { ShippingCity } from '@/types/orders';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const TAG_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'vip', label: 'VIP' },
  { value: 'blacklisted', label: 'Blacklisted' },
];

export function CreateClientModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [tag, setTag] = useState<'normal' | 'vip' | 'blacklisted'>('normal');
  const [notes, setNotes] = useState('');

  const [cities, setCities] = useState<ShippingCity[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setCity('');
    setAddress('');
    setTag('normal');
    setNotes('');
    setError(null);
    supportApi.shippingCities().then(setCities).catch(() => setCities([]));
  }, [open]);

  const cityOptions = cities.map((c) => ({ value: c.name, label: `${c.name} (${c.price} MAD)` }));

  const canSave =
    name.trim().length >= 2 && phone.trim().length >= 8 && city.trim().length >= 2;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await customersApi.create({
        fullName: name.trim(),
        phone: phone.trim(),
        city: city.trim(),
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        tag,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create client'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="New client"
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {error ? (
            <p className="flex-1 text-xs font-medium text-red-500">{error}</p>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-2">
            <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </CRMButton>
            <CRMButton onClick={handleSave} loading={saving} disabled={!canSave}>
              Create client
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label="Full name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sara El Amrani"
        />
        <CRMInput
          label="Phone"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="06XXXXXXXX"
        />
        <CRMSelect
          label="City"
          options={cityOptions}
          value={city}
          onChange={(v) => setCity(v as string)}
          searchable
          placeholder="Select city..."
        />
        <CRMInput
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, building, etc. (optional)"
        />
        <CRMSelect
          label="Tag"
          options={TAG_OPTIONS}
          value={tag}
          onChange={(v) => setTag(v as typeof tag)}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes (optional)"
            className="w-full resize-none rounded-input border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>
    </GlassModal>
  );
}
