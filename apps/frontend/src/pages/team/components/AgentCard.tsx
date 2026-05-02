import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit2, Power, Mail, Phone as PhoneIcon, Wallet, CheckCircle2, Clock, Truck } from 'lucide-react';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { teamApi, type TeamUser } from '@/services/teamApi';
import { cn } from '@/lib/cn';

interface Props {
  user: TeamUser;
  canEdit: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onChanged?: () => void;
}

// Role badges drawn from the dashboard tone palette so the team page reads
// as one set with the rest of the UI.
const ROLE_COLORS: Record<string, string> = {
  admin:      'bg-tone-lavender-100 text-tone-lavender-500',
  supervisor: 'bg-tone-sky-100 text-tone-sky-500',
  agent:      'bg-tone-mint-100 text-tone-mint-500',
  shipping:   'bg-tone-amber-100 text-tone-amber-500',
  atelie:     'bg-tone-rose-100 text-tone-rose-500',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return DAY_LABELS[d.getDay()] ?? '';
}

function formatMAD(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function AgentCard({ user, canEdit, onEdit, onToggleActive, onChanged }: Props) {
  const { t } = useTranslation();
  const roleClass = ROLE_COLORS[user.role.name] ?? 'bg-gray-100 text-gray-700';
  const [payingOut, setPayingOut] = useState(false);

  const handlePayout = async () => {
    if (user.commission.unpaid <= 0) return;
    const ok = window.confirm(
      t('team.agentCard.payoutConfirm', {
        amount: formatMAD(user.commission.unpaid),
        name: user.name,
      }),
    );
    if (!ok) return;
    setPayingOut(true);
    try {
      await teamApi.payoutCommission(user.id);
      onChanged?.();
    } catch {
      window.alert(t('team.agentCard.payoutFailed'));
    } finally {
      setPayingOut(false);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-white p-4 transition-shadow hover:shadow-card',
        user.isActive ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-70',
      )}
    >
      {/* Top row: avatar + role badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarChip
            name={user.name}
            avatarUrl={user.avatarUrl ?? undefined}
            online={user.isOnline}
            size="md"
          />
        </div>
        <span
          className={cn(
            'shrink-0 rounded-badge px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            roleClass,
          )}
        >
          {user.role.label}
        </span>
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-1 text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <Mail size={11} className="shrink-0 text-gray-300" />
          <span className="truncate">{user.email}</span>
        </div>
        {user.phone && (
          <div className="flex items-center gap-1.5">
            <PhoneIcon size={11} className="shrink-0 text-gray-300" />
            <span className="font-mono">{user.phone}</span>
          </div>
        )}
      </div>

      {/* Stats — same formulas as Dashboard / Reports (lifetime, non-archived). */}
      <div className="grid grid-cols-4 gap-2 border-t border-gray-100 pt-3">
        <Stat label={t('team.agentCard.stats.today')} value={user.stats.todayAssigned} />
        <Stat label={t('team.agentCard.stats.confirmed')} value={user.stats.confirmed} color="text-emerald-600" />
        <Stat label={t('team.agentCard.stats.delivered')} value={user.stats.delivered} color="text-indigo-600" icon={Truck} />
        <Stat
          label={t('team.agentCard.stats.deliveryRate')}
          value={`${Math.round(user.stats.deliveryRate)}%`}
          color={
            user.stats.deliveryRate >= 70 ? 'text-emerald-600'
              : user.stats.deliveryRate >= 40 ? 'text-amber-600'
              : 'text-gray-400'
          }
        />
      </div>

      {/* 7-day performance */}
      <div className="border-t border-gray-100 pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {t('team.agentCard.last7days')}
          </span>
          <span className="text-[10px] font-medium text-gray-500">
            {t('team.agentCard.ordersCount', { count: user.performance7d.reduce((s, p) => s + p.orders, 0) })}
          </span>
        </div>
        <PerformanceChart points={user.performance7d} />
      </div>

      {/* Commission */}
      <div className="rounded-card border border-primary/10 bg-gradient-to-br from-accent/40 to-accent/10 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Wallet size={11} /> {t('team.agentCard.commission.title')}
          </span>
          <span className="text-sm font-bold text-primary">
            {formatMAD(user.commission.earned)} <span className="text-[10px] font-medium text-gray-500">MAD</span>
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <CommissionCell
            icon={<CheckCircle2 size={10} />}
            label={t('team.agentCard.commission.paid')}
            value={user.commission.paid}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <CommissionCell
            icon={<Clock size={10} />}
            label={t('team.agentCard.commission.unpaid')}
            value={user.commission.unpaid}
            color="text-amber-600"
            bg="bg-amber-50"
          />
        </div>
        {canEdit && user.commission.unpaid > 0 && (
          <button
            onClick={handlePayout}
            disabled={payingOut}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-btn bg-gradient-to-br from-tone-lavender-500 to-[#5E3FE6] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_3px_10px_rgba(124,92,255,0.30)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {payingOut
              ? t('team.agentCard.commission.processing')
              : t('team.agentCard.commission.payoutButton', { amount: formatMAD(user.commission.unpaid) })}
          </button>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-2">
          <button
            onClick={onEdit}
            title={t('team.agentCard.editTooltip')}
            className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium text-gray-500 transition-colors hover:bg-accent hover:text-primary"
          >
            <Edit2 size={12} />
            {t('team.agentCard.edit')}
          </button>
          <button
            onClick={onToggleActive}
            title={user.isActive ? t('team.agentCard.deactivate') : t('team.agentCard.reactivate')}
            className={cn(
              'flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium transition-colors',
              user.isActive
                ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
                : 'text-emerald-600 hover:bg-emerald-50',
            )}
          >
            <Power size={12} />
            {user.isActive ? t('team.agentCard.deactivate') : t('team.agentCard.reactivate')}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color = 'text-gray-900',
  icon: Icon,
}: {
  label: string;
  value: number | string;
  color?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className={cn('inline-flex items-center gap-1 text-sm font-bold', color)}>
        {Icon && <Icon size={11} className="opacity-80" />}
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
    </div>
  );
}

function CommissionCell({
  icon, label, value, color, bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={cn('flex flex-col rounded-btn px-2 py-1.5', bg)}>
      <span className={cn('flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide', color)}>
        {icon} {label}
      </span>
      <span className={cn('text-xs font-bold', color)}>
        {formatMAD(value)} <span className="text-[9px] font-medium opacity-70">MAD</span>
      </span>
    </div>
  );
}

/**
 * Tiny bar chart — one bar per day, scaled to the week's max. Each bar shows
 * the order count on top when non-zero. The weekday initial sits underneath.
 */
function PerformanceChart({ points }: { points: TeamUser['performance7d'] }) {
  const max = Math.max(1, ...points.map((p) => p.orders));

  return (
    <div className="flex items-end gap-1.5">
      {points.map((p, i) => {
        const heightPct = (p.orders / max) * 100;
        const intensity = p.orders === 0 ? 'bg-gray-100'
          : p.orders >= max * 0.66 ? 'bg-tone-lavender-500'
          : p.orders >= max * 0.33 ? 'bg-tone-lavender-300'
          : 'bg-tone-lavender-100';
        return (
          <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex h-10 w-full items-end">
              {p.orders > 0 && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-tone-lavender-500">
                  {p.orders}
                </span>
              )}
              <div
                className={cn('w-full rounded-t-sm transition-all', intensity)}
                style={{ height: `${Math.max(heightPct, p.orders > 0 ? 8 : 4)}%` }}
              />
            </div>
            <span
              className={cn(
                'text-[9px] font-medium',
                i === points.length - 1 ? 'text-primary' : 'text-gray-400',
              )}
            >
              {dayLabel(p.date)[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
