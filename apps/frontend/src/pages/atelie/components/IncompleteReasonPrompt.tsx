import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMButton } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export function IncompleteReasonPrompt({ open, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  function handleSubmit() {
    const v = reason.trim();
    if (!v) return;
    onSubmit(v);
    setReason('');
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('atelie.incompleteReason.title')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </CRMButton>
          <CRMButton onClick={handleSubmit} disabled={!reason.trim()}>
            {t('atelie.incompleteReason.submit')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-500">{t('atelie.incompleteReason.body')}</p>
        <CRMInput
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('atelie.incompleteReason.placeholder')}
        />
      </div>
    </GlassModal>
  );
}
