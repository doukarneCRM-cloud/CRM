import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageCircle, Paperclip, Eye, EyeOff, Lock, Users } from 'lucide-react';
import type { Task, TaskStatus } from '@/services/atelieApi';
import { cn } from '@/lib/cn';

interface Props {
  task: Task;
  isMine: boolean;
  onClick: () => void;
  onHide?: () => void;
}

// Keep in sync with the column accent colors in TasksTab.
const STATUS_BORDER: Record<TaskStatus, string> = {
  backlog: '#9CA3AF',     // gray-400
  processing: '#3B82F6',  // blue-500
  done: '#22C55E',        // green-500
  forgotten: '#6B7280',   // gray-500
  incomplete: '#EF4444',  // red-500
};

export function TaskCard({ task, isMine, onClick, onHide }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task, isMine },
    disabled: !isMine, // only the owner can drag their card
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Border color reflects the column (status) the card is in, so drag/drop
  // visibly recolors the card. `task.color` is kept as a subtle left accent
  // on a separate rail so the owner's color tag is not lost.
  const borderStyle: React.CSSProperties = {
    borderLeftColor: STATUS_BORDER[task.status] ?? STATUS_BORDER.backlog,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...borderStyle }}
      {...attributes}
      {...(isMine ? listeners : {})}
      onClick={onClick}
      className={cn(
        'group rounded-xl border border-gray-100 border-l-4 bg-white p-3 shadow-sm transition-all',
        'hover:shadow-md',
        isMine ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {task.color && (
            <span
              className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: task.color }}
              aria-hidden
            />
          )}
          <p className="flex-1 text-sm font-semibold leading-snug text-gray-900 line-clamp-2">
            {task.title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isMine ? (
            task.visibility === 'shared' ? (
              <Users size={12} className="text-blue-500" aria-label="Shared" />
            ) : (
              <Lock size={12} className="text-gray-300" aria-label="Private" />
            )
          ) : (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-600">
              Shared
            </span>
          )}
        </div>
      </div>

      {task.description && (
        <p className="mb-2 text-xs text-gray-500 line-clamp-2">{task.description}</p>
      )}

      {!isMine && task.owner && (
        <p className="mb-1.5 text-[11px] text-gray-400">by {task.owner.name}</p>
      )}

      {task.incompleteReason && (
        <div className="mb-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-600">
          {task.incompleteReason}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <div className="flex items-center gap-2">
          {task._count && task._count.comments > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageCircle size={11} /> {task._count.comments}
            </span>
          )}
          {task._count && task._count.attachments > 0 && (
            <span className="flex items-center gap-0.5">
              <Paperclip size={11} /> {task._count.attachments}
            </span>
          )}
          {task.dueAt && (
            <span className="text-amber-600">
              Due {new Date(task.dueAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {!isMine && onHide && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHide();
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
            aria-label="Hide from my board"
            title="Hide from my board"
          >
            <EyeOff size={12} />
          </button>
        )}
        {isMine && task.visibility === 'private' && (
          <Eye size={11} className="text-gray-300" aria-label="Only you see this" />
        )}
      </div>
    </div>
  );
}
