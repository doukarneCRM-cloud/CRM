import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus, Search } from 'lucide-react';
import { CRMButton, CRMInput } from '@/components/ui';
import { atelieApi, type Task, type TaskStatus } from '@/services/atelieApi';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/services/socket';
import { TaskColumn } from './TaskColumn';
import { TaskCard } from './TaskCard';
import { TaskFormModal } from './TaskFormModal';
import { TaskDetailModal } from './TaskDetailModal';
import { IncompleteReasonPrompt } from './IncompleteReasonPrompt';

const COLUMNS: Array<{ status: TaskStatus; title: string; accent: string }> = [
  { status: 'backlog', title: 'Backlog', accent: 'bg-gray-400' },
  { status: 'processing', title: 'Processing', accent: 'bg-blue-500' },
  { status: 'done', title: 'Done', accent: 'bg-green-500' },
  { status: 'forgotten', title: 'Forgotten', accent: 'bg-gray-500' },
  { status: 'incomplete', title: 'Incomplete', accent: 'bg-red-500' },
];

const POS_STEP = 1024;

type TabFilter = 'all' | 'mine' | 'shared';

export function TasksTab() {
  const me = useAuthStore((s) => s.user);
  const [mine, setMine] = useState<Task[]>([]);
  const [shared, setShared] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TabFilter>('all');
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [incompletePrompt, setIncompletePrompt] = useState<{
    taskId: string;
    targetPos: number;
  } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await atelieApi.listTasks();
      setMine(r.mine);
      setShared(r.shared);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Subscribe to live updates — any task change triggers a reload. Cheap + correct.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }
    const refresh = () => load();
    const events = [
      'task:created',
      'task:updated',
      'task:moved',
      'task:deleted',
      'task:comment_added',
      'task:comment_deleted',
      'task:attachment_added',
    ];
    events.forEach((e) => socket!.on(e, refresh));
    return () => {
      events.forEach((e) => socket!.off(e, refresh));
    };
  }, [load]);

  const allVisible = useMemo(() => {
    const combined: Task[] = [];
    if (filter !== 'shared') combined.push(...mine);
    if (filter !== 'mine') combined.push(...shared);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return combined.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q),
      );
    }
    return combined;
  }, [mine, shared, filter, search]);

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      backlog: [],
      processing: [],
      done: [],
      forgotten: [],
      incomplete: [],
    };
    for (const t of allVisible) map[t.status].push(t);
    for (const k of Object.keys(map) as TaskStatus[]) {
      map[k].sort((a, b) => a.position - b.position);
    }
    return map;
  }, [allVisible]);

  function computeTargetPosition(
    targetStatus: TaskStatus,
    insertAtId: string | null,
    activeId: string,
  ): number {
    const column = byStatus[targetStatus].filter((t) => t.id !== activeId);
    if (column.length === 0) return POS_STEP;
    if (!insertAtId) {
      // Dropped on column container → append
      return column[column.length - 1].position + POS_STEP;
    }
    const idx = column.findIndex((t) => t.id === insertAtId);
    if (idx === -1) return column[column.length - 1].position + POS_STEP;
    if (idx === 0) return column[0].position - POS_STEP;
    return (column[idx - 1].position + column[idx].position) / 2;
  }

  function handleDragStart(e: DragStartEvent) {
    const t = [...mine, ...shared].find((x) => x.id === e.active.id);
    if (t && me && t.ownerId === me.id) setActiveTask(t);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = e;
    if (!over || !me) return;

    const task = [...mine, ...shared].find((t) => t.id === active.id);
    if (!task || task.ownerId !== me.id) return;

    // Drop target could be a card or a column
    const overData = over.data.current as { status?: TaskStatus; task?: Task } | undefined;
    const targetStatus: TaskStatus =
      overData?.status ?? overData?.task?.status ?? task.status;

    const insertAtId = overData?.task?.id ?? null;
    const targetPos = computeTargetPosition(targetStatus, insertAtId, task.id);

    if (targetStatus === task.status && insertAtId === task.id) return;

    if (targetStatus === 'incomplete' && !task.incompleteReason) {
      setIncompletePrompt({ taskId: task.id, targetPos });
      return;
    }

    // Optimistic update
    const patch = (arr: Task[]) =>
      arr.map((t) =>
        t.id === task.id ? { ...t, status: targetStatus, position: targetPos } : t,
      );
    setMine((cur) => patch(cur));
    setShared((cur) => patch(cur));

    try {
      await atelieApi.moveTask(task.id, { status: targetStatus, position: targetPos });
    } catch {
      load();
    }
  }

  async function confirmIncomplete(reason: string) {
    if (!incompletePrompt) return;
    const { taskId, targetPos } = incompletePrompt;
    setIncompletePrompt(null);
    try {
      await atelieApi.moveTask(taskId, {
        status: 'incomplete',
        position: targetPos,
        incompleteReason: reason,
      });
    } finally {
      load();
    }
  }

  async function hideTask(task: Task) {
    await atelieApi.hideTask(task.id);
    load();
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['all', 'mine', 'shared'] as TabFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? 'rounded-badge bg-primary px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-badge bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-200'
              }
            >
              {f === 'all' ? 'All' : f === 'mine' ? 'My tasks' : 'Shared'}
            </button>
          ))}
          <div className="w-56">
            <CRMInput
              leftIcon={<Search size={14} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
            />
          </div>
        </div>
        <CRMButton leftIcon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
          New task
        </CRMButton>
      </div>

      {loading && allVisible.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-2">
            {COLUMNS.map((c) => (
              <TaskColumn
                key={c.status}
                status={c.status}
                title={c.title}
                accent={c.accent}
                tasks={byStatus[c.status]}
                myUserId={me?.id ?? ''}
                onCreate={c.status === 'backlog' ? () => setCreateOpen(true) : undefined}
                onOpen={(t) => setDetailId(t.id)}
                onHide={hideTask}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && me ? (
              <TaskCard
                task={activeTask}
                isMine={activeTask.ownerId === me.id}
                onClick={() => {}}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={load}
      />

      <TaskDetailModal
        open={!!detailId}
        taskId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
      />

      <IncompleteReasonPrompt
        open={!!incompletePrompt}
        onClose={() => setIncompletePrompt(null)}
        onSubmit={confirmIncomplete}
      />
    </div>
  );
}
