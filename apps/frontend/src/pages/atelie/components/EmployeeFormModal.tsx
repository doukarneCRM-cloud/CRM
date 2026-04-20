import { useEffect, useState } from 'react';
import { GlassModal, CRMInput, CRMButton } from '@/components/ui';
import type { AtelieEmployee, CreateEmployeePayload } from '@/services/atelieApi';
import { atelieApi } from '@/services/atelieApi';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  employee?: AtelieEmployee | null;
}

export function EmployeeFormModal({ open, onClose, onSaved, employee }: Props) {
  const [form, setForm] = useState<CreateEmployeePayload>({
    name: '',
    phone: '',
    role: '',
    baseSalary: 500,
    workingDays: 6,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(
        employee
          ? {
              name: employee.name,
              phone: employee.phone ?? '',
              role: employee.role,
              baseSalary: employee.baseSalary,
              workingDays: employee.workingDays,
            }
          : { name: '', phone: '', role: '', baseSalary: 500, workingDays: 6 },
      );
    }
  }, [open, employee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!form.role.trim()) {
      setError('Role is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (employee) {
        await atelieApi.updateEmployee(employee.id, form);
      } else {
        await atelieApi.createEmployee(form);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
          ?.message ?? 'Failed to save employee';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={employee ? 'Edit employee' : 'New employee'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </CRMButton>
          <CRMButton onClick={handleSubmit} loading={saving}>
            {employee ? 'Save' : 'Create'}
          </CRMButton>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CRMInput
          label="Name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <CRMInput
          label="Phone"
          value={form.phone ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <CRMInput
          label="Role"
          required
          placeholder="e.g. Tailor, Cutter, Finisher…"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Weekly salary (MAD)"
            type="number"
            min={0}
            step={10}
            value={form.baseSalary}
            onChange={(e) => setForm((f) => ({ ...f, baseSalary: Number(e.target.value) }))}
          />
          <CRMInput
            label="Working days / week"
            type="number"
            min={1}
            max={7}
            value={form.workingDays}
            onChange={(e) => setForm((f) => ({ ...f, workingDays: Number(e.target.value) }))}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </GlassModal>
  );
}
