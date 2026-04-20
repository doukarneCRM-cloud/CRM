import { Download, ExternalLink, FileText, ImageOff } from 'lucide-react';
import { GlassModal } from './GlassModal';
import { CRMButton } from './CRMButton';

interface Props {
  open: boolean;
  onClose: () => void;
  url: string;
  filename?: string;
  title?: string;
}

function detectKind(url: string): 'image' | 'pdf' | 'other' {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

export function FilePreviewModal({ open, onClose, url, filename, title }: Props) {
  const kind = detectKind(url);
  const displayName = filename ?? url.split('/').pop() ?? 'Attachment';

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={title ?? displayName}
      size="2xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-gray-400" title={displayName}>
            {displayName}
          </span>
          <div className="flex items-center gap-2">
            <CRMButton
              variant="ghost"
              size="sm"
              leftIcon={<ExternalLink size={13} />}
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            >
              Open in tab
            </CRMButton>
            <CRMButton
              size="sm"
              leftIcon={<Download size={13} />}
              onClick={() => {
                const a = document.createElement('a');
                a.href = url;
                a.download = displayName;
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
            >
              Download
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex min-h-[60vh] items-center justify-center">
        {kind === 'image' ? (
          <img
            src={url}
            alt={displayName}
            className="max-h-[72vh] max-w-full rounded-card object-contain shadow-sm"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : kind === 'pdf' ? (
          <iframe
            src={url}
            title={displayName}
            className="h-[72vh] w-full rounded-card border border-gray-100 bg-white"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <FileText size={40} className="text-gray-300" />
            <p className="text-sm">Preview not supported for this file type.</p>
            <p className="text-[11px]">Use the buttons below to open or download.</p>
          </div>
        )}
        {kind === 'image' && (
          <div
            className="hidden flex-col items-center gap-2 text-gray-400"
            style={{ display: 'none' }}
          >
            <ImageOff size={40} className="text-gray-300" />
            <p className="text-sm">Couldn't load the image.</p>
          </div>
        )}
      </div>
    </GlassModal>
  );
}
