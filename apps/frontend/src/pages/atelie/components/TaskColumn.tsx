import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task, TaskStatus } from '@/services/atelieApi';
import { TaskCard } from './TaskCard';
import { cn } from '@/lib/cn';

interface Props {
  status: TaskStatus;
  title: string;
  accent: string;
  tasks: Task[];
  myUserId: string;
  onCreate?: () => void;
  onOpen: (task: Task) => void;
  onHide: (task: Task) => void;
}

export function TaskColumn({ status, title, accent, tasks, myUserId, onCreate, onOpen, onHide }: Props) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, data: { status } });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', accent)} />
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
            {tasks.length}
          </span>
        </div>
        {onCreate && (
          <button
            onClick={onCreate}
            className="flex h-6 w-6 items-center justify-center rounded-btn text-gray-400 hover:bg-accent hover:text-primary"
            aria-label={t('atelie.tasks.addTask')}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 rounded-xl p-2 transition-colors',
          isOver ? 'bg-primary/5 ring-2 ring-primary/20' : 'bg-gray-50/60',
        )}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              isMine={task.ownerId === myUserId}
              onClick={() => onOpen(task)}
              onHide={task.ownerId === myUserId ? undefined : () => onHide(task)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="py-6 text-center text-xs text-gray-400">{t('atelie.tasks.dropHere')}</p>
        )}
      </div>
    </div>
  );
}
