import { cn } from '@/lib/cn';

interface Props {
  /** Total orders this customer has placed with us. */
  count: number | undefined;
  className?: string;
}

/**
 * Tiny "3×" pill shown next to a customer name in order lists so the agent
 * can tell at a glance whether this is a returning customer. Hidden for
 * first-time customers (count ≤ 1) to keep list rows uncluttered — the badge
 * only carries signal when there's repeat business. The parent is responsible
 * for making the name itself clickable (opening CustomerHistoryModal).
 */
export function CustomerOrdersBadge({ count, className }: Props) {
  if (!count || count <= 1) return null;
  return (
    <span
      className={cn(
        'inline-flex h-4 shrink-0 items-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold leading-none text-primary',
        className,
      )}
      title={`${count} orders placed — click the name to view history`}
    >
      {count}×
    </span>
  );
}
