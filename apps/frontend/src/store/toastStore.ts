import { create } from 'zustand';

export type ToastKind = 'assignment' | 'confirmed' | 'new_order' | 'info' | 'success' | 'error';

export interface ToastProductMeta {
  name: string;
  extraCount: number;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  href?: string; // optional click-through route
  product?: ToastProductMeta | null;
  createdAt: number;
  durationMs: number;
}

interface ToastState {
  toasts: Toast[];
  enabled: boolean;
  push: (t: Omit<Toast, 'id' | 'createdAt' | 'durationMs'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
  setEnabled: (enabled: boolean) => void;
}

const PREFS_KEY = 'anaqatoki.toast.prefs';

function readEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { enabled?: boolean };
    return parsed.enabled ?? true;
  } catch {
    return true;
  }
}

const MAX_TOASTS = 4;
const DEFAULT_DURATION = 5000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  enabled: readEnabled(),

  push: (input) => {
    if (!get().enabled) return '';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: Toast = {
      id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
      product: input.product,
      createdAt: Date.now(),
      durationMs: input.durationMs ?? DEFAULT_DURATION,
    };
    set((s) => {
      // Cap the stack — oldest falls off first so bursts don't pile up.
      const next = [...s.toasts, toast];
      if (next.length > MAX_TOASTS) next.splice(0, next.length - MAX_TOASTS);
      return { toasts: next };
    });
    return id;
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  setEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled }));
    }
    set({ enabled });
  },
}));
