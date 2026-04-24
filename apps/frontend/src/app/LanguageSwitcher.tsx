import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { SupportedLanguage } from '@/lib/i18n';

// One-click toggle between EN and FR. The currently-active language is
// highlighted; clicking the pill flips to the other one.
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2) as SupportedLanguage;
  const next: SupportedLanguage = current === 'fr' ? 'en' : 'fr';

  return (
    <button
      onClick={() => void i18n.changeLanguage(next)}
      className="flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 text-[11px] font-bold uppercase text-gray-500 transition-colors hover:border-primary/40 hover:text-primary"
      aria-label={t('common.language')}
      title={t('common.language')}
    >
      <Languages size={14} className="text-gray-400" />
      <span
        className={cn(
          'flex h-6 w-7 items-center justify-center rounded-full transition-colors',
          current === 'en' ? 'bg-primary text-white' : 'text-gray-500',
        )}
      >
        EN
      </span>
      <span
        className={cn(
          'flex h-6 w-7 items-center justify-center rounded-full transition-colors',
          current === 'fr' ? 'bg-primary text-white' : 'text-gray-500',
        )}
      >
        FR
      </span>
    </button>
  );
}
