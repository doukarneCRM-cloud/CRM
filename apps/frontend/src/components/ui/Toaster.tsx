import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  UserPlus,
  Info,
  AlertCircle,
  X,
  ShoppingBag,
  Package,
} from 'lucide-react';
import { useToastStore, type Toast, type ToastKind } from '@/store/toastStore';

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  assignment: UserPlus,
  confirmed: CheckCircle2,
  new_order: ShoppingBag,
  success: CheckCircle2,
  info: Info,
  error: AlertCircle,
};

const ACCENTS: Record<ToastKind, { bar: string; icon: string; iconBg: string }> = {
  assignment: { bar: 'bg-amber-500', icon: 'text-amber-600', iconBg: 'bg-amber-50' },
  confirmed:  { bar: 'bg-emerald-500', icon: 'text-emerald-600', iconBg: 'bg-emerald-50' },
  new_order:  { bar: 'bg-sky-500', icon: 'text-sky-600', iconBg: 'bg-sky-50' },
  success:    { bar: 'bg-emerald-500', icon: 'text-emerald-600', iconBg: 'bg-emerald-50' },
  info:       { bar: 'bg-sky-500', icon: 'text-sky-600', iconBg: 'bg-sky-50' },
  error:      { bar: 'bg-rose-500', icon: 'text-rose-600', iconBg: 'bg-rose-50' },
};

export function Toaster() {
  const { t } = useTranslation();
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      aria-live="polite"
      aria-label={t('shared.toaster.ariaLabel')}
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const dismiss = useToastStore((s) => s.dismiss);
  const navigate = useNavigate();
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const Icon = ICONS[toast.kind];
  const accent = ACCENTS[toast.kind];

  // Trigger enter animation on next frame so the initial state is rendered first
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-dismiss after the configured duration — slide out, then remove from the store
  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), toast.durationMs);
    const removeTimer = setTimeout(() => dismiss(toast.id), toast.durationMs + 250);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.durationMs, toast.id, dismiss]);

  const handleClick = () => {
    if (toast.href) {
      navigate(toast.href);
      dismiss(toast.id);
    }
  };

  const transform = leaving
    ? 'translate-x-6 opacity-0'
    : entered
      ? 'translate-y-0 opacity-100'
      : 'translate-y-4 opacity-0';

  return (
    <div
      role="status"
      onClick={handleClick}
      className={[
        'pointer-events-auto relative w-[320px] overflow-hidden rounded-2xl border border-gray-100',
        'bg-white/95 shadow-[0_8px_32px_rgba(16,24,40,0.14)] backdrop-blur-md',
        'transition-all duration-200 ease-out',
        toast.href ? 'cursor-pointer hover:shadow-[0_10px_40px_rgba(16,24,40,0.20)]' : '',
        transform,
      ].join(' ')}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${accent.bar}`} aria-hidden />
      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${accent.iconBg}`}>
          <Icon size={16} className={accent.icon} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{toast.title}</p>
          {toast.body && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{toast.body}</p>}
          {toast.product && (
            <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5">
              <Package size={10} className="shrink-0 text-primary" />
              <span className="truncate text-[11px] font-semibold text-primary">
                {toast.product.name}
              </span>
              {toast.product.extraCount > 0 && (
                <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                  +{toast.product.extraCount}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss(toast.id);
          }}
          className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label={t('shared.toaster.dismiss')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
