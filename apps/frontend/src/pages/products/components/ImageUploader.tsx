import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/cn';
import { productsApi } from '@/services/productsApi';
import { resolveImageUrl } from '@/lib/imageUrl';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  className?: string;
}

const MAX_MB = 8;

export function ImageUploader({ value, onChange, className }: Props) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError(t('products.image.notAnImage'));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(t('products.image.tooLarge', { mb: MAX_MB }));
      return;
    }
    setUploading(true);
    try {
      const { url } = await productsApi.uploadImage(file);
      onChange(url);
    } catch (err) {
      setError(apiErrorMessage(err, t('products.image.uploadFailed')));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPick = () => inputRef.current?.click();

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const preview = resolveImageUrl(value);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value ? (
        <div className="group relative aspect-square w-full overflow-hidden rounded-card border border-gray-200 bg-gradient-to-br from-gray-50 to-white">
          <img
            src={preview}
            alt={t('products.image.alt')}
            className="h-full w-full object-contain p-2"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/50 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={onPick}
              disabled={uploading}
              className="flex items-center gap-1 rounded-btn bg-white/90 px-2 py-1 text-[11px] font-medium text-gray-800 shadow-sm transition-colors hover:bg-white"
            >
              <UploadCloud size={12} />
              {t('products.image.replace')}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={uploading}
              className="flex items-center gap-1 rounded-btn bg-red-500/90 px-2 py-1 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-red-600"
              aria-label={t('products.image.remove')}
            >
              <Trash2 size={12} />
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 size={20} className="animate-spin text-primary" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          disabled={uploading}
          className={cn(
            'flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed bg-gray-50 p-3 text-gray-400 transition-all',
            dragOver
              ? 'border-primary bg-accent/50 text-primary'
              : 'border-gray-200 hover:border-primary hover:bg-accent/30 hover:text-primary',
          )}
        >
          {uploading ? (
            <Loader2 size={22} className="animate-spin" />
          ) : (
            <ImagePlus size={22} />
          )}
          <span className="text-center text-[11px] font-medium leading-tight">
            {uploading ? t('products.image.uploading') : t('products.image.clickOrDrop')}
          </span>
          <span className="text-[10px] text-gray-400">{t('products.image.sizeHint', { mb: MAX_MB })}</span>
        </button>
      )}

      {error && <p className="text-[11px] font-medium text-red-500">{error}</p>}
    </div>
  );
}
