import { Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';

// Placeholder until the carrier integration is rebuilt. The Coliix V1/V2
// modules were removed during the status refactor; once a new carrier
// integration lands, this card will track unpaid carrier payouts (the
// money the carrier owes us for delivered, COD-collected orders).
export function CarrierUnpaidPlaceholderCard() {
  const { t } = useTranslation();
  return (
    <GlassCard className="flex flex-col gap-2 p-4 opacity-60">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-600">
        <Truck size={14} />
        {t('dashboard.cards.carrierUnpaid')}
      </div>
      <div className="text-2xl font-bold text-gray-400">—</div>
      <div className="text-[11px] italic text-gray-400">
        {t('dashboard.cards.carrierUnpaidPending')}
      </div>
    </GlassCard>
  );
}
