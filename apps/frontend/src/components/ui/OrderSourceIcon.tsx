import { ShoppingBag, MessageCircle, Instagram, PenLine } from 'lucide-react';
import { cn } from '@/lib/cn';

type OrderSource = 'youcan' | 'whatsapp' | 'instagram' | 'manual';

interface OrderSourceIconProps {
  source: OrderSource;
  showTooltip?: boolean;
  size?: number;
  className?: string;
}

const SOURCE_CONFIG: Record<
  OrderSource,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  youcan: {
    label: 'Youcan',
    icon: ShoppingBag,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
  },
  manual: {
    label: 'Manual',
    icon: PenLine,
    color: 'text-gray-600',
    bg: 'bg-gray-100',
  },
};

const OrderSourceIcon = ({
  source,
  showTooltip = true,
  size = 14,
  className,
}: OrderSourceIconProps) => {
  const config = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.manual;
  const Icon = config.icon;

  return (
    <div className={cn('group relative inline-flex', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full p-1.5',
          config.bg,
          config.color,
        )}
      >
        <Icon size={size} />
      </div>
      {showTooltip && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          {config.label}
        </div>
      )}
    </div>
  );
};

export { OrderSourceIcon };
export type { OrderSource };
