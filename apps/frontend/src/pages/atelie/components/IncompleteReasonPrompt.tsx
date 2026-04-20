import { useState } from 'react';
import { GlassModal, CRMInput, CRMButton } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export function IncompleteReasonPrompt({ open, onClose, onSubmit }: Props) {
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
      title="Mark as incomplete"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose}>
            Cancel
          </CRMButton>
          <CRMButton onClick={handleSubmit} disabled={!reason.trim()}>
            Mark incomplete
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-500">Tell the team why this task couldn't be finished.</p>
        <CRMInput
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Missing fabric supplier"
        />
      </div>
    </GlassModal>
  );
}
