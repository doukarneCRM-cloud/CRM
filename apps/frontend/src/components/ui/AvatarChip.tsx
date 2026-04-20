import { cn } from '@/lib/cn';

interface AvatarChipProps {
  name: string;
  subtitle?: string;
  avatarUrl?: string;
  online?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getAvatarColor(name: string) {
  const colors = [
    'bg-indigo-100 text-indigo-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-pink-100 text-pink-700',
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-teal-100 text-teal-700',
  ];
  const idx =
    name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[idx];
}

const AvatarChip = ({
  name,
  subtitle,
  avatarUrl,
  online,
  size = 'md',
  className,
}: AvatarChipProps) => {
  const avatarSize = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-xs';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* Avatar */}
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className={cn('rounded-full object-cover', avatarSize)}
          />
        ) : (
          <div
            className={cn(
              'flex items-center justify-center rounded-full font-semibold',
              avatarSize,
              getAvatarColor(name),
            )}
          >
            {getInitials(name)}
          </div>
        )}
        {online !== undefined && (
          <span
            className={cn(
              'absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-white',
              online ? 'bg-green-500' : 'bg-gray-300',
            )}
          />
        )}
      </div>

      {/* Text */}
      <div className="min-w-0">
        <p
          className={cn(
            'truncate font-semibold text-gray-900 leading-tight',
            size === 'sm' ? 'text-xs' : 'text-sm',
          )}
        >
          {name}
        </p>
        {subtitle && (
          <p className="truncate text-[11px] text-gray-400">{subtitle}</p>
        )}
      </div>
    </div>
  );
};

export { AvatarChip };
