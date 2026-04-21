import { useState } from 'react';
import {
  ShoppingBag,
  Package,
  TrendingUp,
  Users,
  Phone,
  Trash2,
  Download,
} from 'lucide-react';
import {
  GlassCard,
  KPICard,
  TrendBadge,
  StatusBadge,
  PillTabGroup,
  GlassModal,
  CRMButton,
  CRMInput,
  CRMSelect,
  AvatarChip,
  CircleProgress,
  AgentMiniCard,
  OrderSourceIcon,
  HistoryIcon,
  CRMTable,
} from '@/components/ui';
import { GlobalFilterBar } from '@/components/ui/GlobalFilterBar';
import { CONFIRMATION_STATUS_COLORS, SHIPPING_STATUS_COLORS } from '@/constants/statusColors';
import type { ColumnDef } from '@tanstack/react-table';

// ─── Mock Data ────────────────────────────────────────────────────────────────

interface MockOrder {
  id: string;
  ref: string;
  customer: string;
  city: string;
  total: number;
  status: string;
  source: string;
}

const MOCK_ORDERS: MockOrder[] = Array.from({ length: 100 }, (_, i) => ({
  id: String(i),
  ref: `ORD-${String(i + 1).padStart(4, '0')}`,
  customer: ['Omar Alami', 'Fatima Benali', 'Youssef Idrissi', 'Khadija Tazi', 'Hamid El Fassi'][
    i % 5
  ],
  city: ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger'][i % 5],
  total: Math.floor(Math.random() * 800) + 100,
  status: ['new', 'confirmed', 'callback', 'unreachable', 'cancelled'][i % 5],
  source: ['youcan', 'whatsapp', 'instagram', 'manual'][i % 4],
}));

const TABLE_COLUMNS: ColumnDef<MockOrder, unknown>[] = [
  {
    accessorKey: 'ref',
    header: 'Reference',
    cell: (info) => (
      <span className="font-mono text-xs font-semibold text-primary">
        {info.getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: 'customer',
    header: 'Customer',
    cell: (info) => (
      <AvatarChip name={info.getValue() as string} size="sm" />
    ),
  },
  {
    accessorKey: 'city',
    header: 'City',
    cell: (info) => <span className="text-gray-600">{info.getValue() as string}</span>,
  },
  {
    accessorKey: 'total',
    header: 'Total',
    cell: (info) => (
      <span className="font-semibold text-gray-900">
        {(info.getValue() as number).toLocaleString()} MAD
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue() as string} showDot />,
  },
  {
    accessorKey: 'source',
    header: 'Source',
    cell: (info) => (
      <OrderSourceIcon source={info.getValue() as 'youcan' | 'whatsapp' | 'instagram' | 'manual'} />
    ),
  },
  {
    id: 'history',
    header: '',
    cell: () => <HistoryIcon onClick={() => alert('History clicked')} />,
  },
];

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-gray-200 pb-2 text-base font-bold text-gray-800">{title}</h2>
      {children}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComponentsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [selectVal, setSelectVal] = useState<string>('');
  const [multiVal, setMultiVal] = useState<string[]>([]);

  const sparkline = [
    { value: 40 }, { value: 55 }, { value: 48 }, { value: 62 },
    { value: 58 }, { value: 70 }, { value: 75 },
  ];

  const confirmationStatuses = Object.keys(CONFIRMATION_STATUS_COLORS);
  const shippingStatuses = Object.keys(SHIPPING_STATUS_COLORS);

  const FILTER_CONFIGS = [
    {
      key: 'cities' as const,
      label: 'City',
      options: ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger'].map((c) => ({
        value: c,
        label: c,
      })),
    },
    {
      key: 'sources' as const,
      label: 'Source',
      options: ['youcan', 'whatsapp', 'instagram', 'manual'].map((s) => ({
        value: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
      })),
    },
  ];

  return (
    <div className="min-h-screen bg-bg px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-12">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-primary">
            Anaqatoki CRM — Component Library
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Phase 0 design system verification. All components must render correctly before Phase 1.
          </p>
        </div>

        {/* ── KPI Cards ── */}
        <Section title="KPI Cards">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              title="Total Orders"
              value={2847}
              percentageChange={4.2}
              icon={ShoppingBag}
              sparklineData={sparkline}
            />
            <KPICard
              title="Confirmed"
              value={1523}
              percentageChange={-2.1}
              icon={Package}
              iconColor="#22C55E"
              sparklineData={sparkline}
            />
            <KPICard
              title="Revenue"
              value="142,300"
              unit="MAD"
              percentageChange={8.7}
              icon={TrendingUp}
              iconColor="#6366F1"
            />
            <KPICard
              title="Active Agents"
              value={12}
              percentageChange={0}
              icon={Users}
              iconColor="#F59E0B"
            />
          </div>
        </Section>

        {/* ── Trend Badges ── */}
        <Section title="Trend Badges">
          <div className="flex flex-wrap items-center gap-3">
            <TrendBadge value={4.2} />
            <TrendBadge value={-3.0} />
            <TrendBadge value={0} />
            <TrendBadge value={12.5} size="sm" />
            <TrendBadge value={-1.8} size="sm" />
          </div>
        </Section>

        {/* ── Status Badges — Confirmation ── */}
        <Section title="Status Badges — Confirmation">
          <div className="flex flex-wrap gap-2">
            {confirmationStatuses.map((s) => (
              <StatusBadge key={s} status={s} showDot />
            ))}
          </div>
        </Section>

        {/* ── Status Badges — Shipping ── */}
        <Section title="Status Badges — Shipping">
          <div className="flex flex-wrap gap-2">
            {shippingStatuses.map((s) => (
              <StatusBadge key={s} status={s} showDot />
            ))}
          </div>
        </Section>

        {/* ── Pill Tabs ── */}
        <Section title="Pill Tabs">
          <PillTabGroup
            tabs={[
              { id: 'all', label: 'All Orders', count: 2847 },
              { id: 'new', label: 'New', count: 342 },
              { id: 'confirmed', label: 'Confirmed', count: 1523 },
              { id: 'callback', label: 'Callback', count: 187 },
              { id: 'shipped', label: 'Shipped', count: 614 },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </Section>

        {/* ── Buttons ── */}
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <CRMButton variant="primary">Primary</CRMButton>
            <CRMButton variant="secondary">Secondary</CRMButton>
            <CRMButton variant="ghost">Ghost</CRMButton>
            <CRMButton variant="danger" leftIcon={<Trash2 size={14} />}>
              Delete
            </CRMButton>
            <CRMButton variant="primary" size="sm">
              Small
            </CRMButton>
            <CRMButton variant="primary" size="lg">
              Large
            </CRMButton>
            <CRMButton variant="primary" loading>
              Loading
            </CRMButton>
            <CRMButton variant="primary" disabled>
              Disabled
            </CRMButton>
            <CRMButton variant="secondary" rightIcon={<Download size={14} />}>
              Export
            </CRMButton>
          </div>
        </Section>

        {/* ── Inputs ── */}
        <Section title="Inputs">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <CRMInput
              label="Phone Number"
              placeholder="+212 600 000 000"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              leftIcon={<Phone size={14} />}
            />
            <CRMInput label="Email" placeholder="agent@anaqatoki.ma" type="email" required />
            <CRMInput
              label="With Error"
              placeholder="Enter value"
              error="This field is required"
            />
            <CRMInput label="Disabled" placeholder="Disabled" disabled />
            <CRMInput label="With Hint" placeholder="Search..." hint="Press Enter to search" />
          </div>
        </Section>

        {/* ── Selects ── */}
        <Section title="Selects">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <CRMSelect
              label="Single Select"
              placeholder="Choose city..."
              value={selectVal}
              onChange={(v) => setSelectVal(v as string)}
              options={['Casablanca', 'Rabat', 'Marrakech', 'Fès'].map((c) => ({
                value: c,
                label: c,
              }))}
            />
            <CRMSelect
              label="Multi Select"
              placeholder="Select agents..."
              multi
              value={multiVal}
              onChange={(v) => setMultiVal(v as string[])}
              options={['Omar', 'Fatima', 'Youssef', 'Khadija', 'Hamid'].map((n) => ({
                value: n.toLowerCase(),
                label: n,
              }))}
            />
            <CRMSelect
              label="Searchable"
              placeholder="Search & select..."
              searchable
              value={selectVal}
              onChange={(v) => setSelectVal(v as string)}
              options={Array.from({ length: 20 }, (_, i) => ({
                value: `opt-${i}`,
                label: `Option ${i + 1}`,
              }))}
            />
          </div>
        </Section>

        {/* ── Avatar Chips ── */}
        <Section title="Avatar Chips">
          <div className="flex flex-wrap gap-4">
            <AvatarChip name="Omar Alami" subtitle="Agent" online />
            <AvatarChip name="Fatima Benali" subtitle="Supervisor" online={false} />
            <AvatarChip name="Youssef Idrissi" subtitle="Shipping" />
            <AvatarChip name="Khadija Tazi" size="sm" />
          </div>
        </Section>

        {/* ── Circle Progress ── */}
        <Section title="Circle Progress (Agent Performance)">
          <div className="flex items-center gap-6">
            <CircleProgress value={82} color="#56351E" size={80} label="82%" sublabel="Score" />
            <CircleProgress value={65} color="#6366F1" size={80} label="65%" sublabel="Rate" />
            <CircleProgress value={93} color="#22C55E" size={80} label="93%" sublabel="Confirm" />
            <CircleProgress value={40} color="#EF4444" size={80} label="40%" sublabel="Return" />
            <CircleProgress value={75} color="#F59E0B" size={64} label="75%" sublabel="KPI" />
          </div>
        </Section>

        {/* ── Agent Mini Cards ── */}
        <Section title="Agent Mini Cards">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <AgentMiniCard
              name="Omar Alami"
              kpiValue={142}
              kpiLabel="Confirmations"
              progressValue={82}
              progressColor="#56351E"
              percentageChange={4.2}
            />
            <AgentMiniCard
              name="Fatima Benali"
              kpiValue={98}
              kpiLabel="Confirmations"
              progressValue={65}
              progressColor="#6366F1"
              percentageChange={-1.3}
            />
            <AgentMiniCard
              name="Youssef Idrissi"
              kpiValue={176}
              kpiLabel="Confirmations"
              progressValue={93}
              progressColor="#22C55E"
              percentageChange={12.1}
            />
            <AgentMiniCard
              name="Khadija Tazi"
              kpiValue={64}
              kpiLabel="Confirmations"
              progressValue={40}
              progressColor="#F59E0B"
              percentageChange={0}
            />
          </div>
        </Section>

        {/* ── Order Source Icons ── */}
        <Section title="Order Source Icons">
          <div className="flex items-center gap-4">
            <OrderSourceIcon source="youcan" />
            <OrderSourceIcon source="whatsapp" />
            <OrderSourceIcon source="instagram" />
            <OrderSourceIcon source="manual" />
          </div>
        </Section>

        {/* ── History Icon ── */}
        <Section title="History Icon">
          <div className="flex items-center gap-4">
            <HistoryIcon onClick={() => alert('View order history')} />
          </div>
        </Section>

        {/* ── Glass Modal ── */}
        <Section title="Glass Modal">
          <div className="flex gap-3">
            <CRMButton variant="primary" onClick={() => setModalOpen(true)}>
              Open Modal
            </CRMButton>
            <CRMButton
              variant="primary"
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 2000);
              }}
            >
              Test Loading State
            </CRMButton>
          </div>
          <GlassModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Order Details"
            size="md"
          >
            <div className="flex flex-col gap-4">
              <CRMInput label="Customer Name" placeholder="Enter name" />
              <CRMInput label="Phone" placeholder="+212 600 000 000" />
              <CRMSelect
                label="City"
                placeholder="Select city..."
                options={['Casablanca', 'Rabat', 'Marrakech'].map((c) => ({
                  value: c,
                  label: c,
                }))}
                value=""
                onChange={() => {}}
              />
              <div className="flex justify-end gap-2 pt-2">
                <CRMButton variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </CRMButton>
                <CRMButton variant="primary" onClick={() => setModalOpen(false)}>
                  Save
                </CRMButton>
              </div>
            </div>
          </GlassModal>
        </Section>

        {/* ── Global Filter Bar ── */}
        <Section title="Global Filter Bar (URL-synced)">
          <GlobalFilterBar filterConfigs={FILTER_CONFIGS} showDateRange sticky={false} />
          <p className="text-xs text-gray-400">
            Apply filters above and watch the URL update. Refresh to verify they restore.
          </p>
        </Section>

        {/* ── CRM Table ── */}
        <Section title="CRM Table (100 rows, pagination, bulk actions, skeleton)">
          <GlassCard padding="none">
            <CRMTable
              columns={TABLE_COLUMNS}
              data={MOCK_ORDERS}
              selectable
              bulkActions={[
                {
                  label: 'Export',
                  variant: 'secondary',
                  icon: <Download size={12} />,
                  onClick: (ids) => alert(`Export ${ids.length} rows`),
                },
                {
                  label: 'Delete',
                  variant: 'danger',
                  icon: <Trash2 size={12} />,
                  onClick: (ids) => alert(`Delete ${ids.length} rows`),
                },
              ]}
              emptyMessage="No orders found"
              defaultPageSize={20}
            />
          </GlassCard>
        </Section>
      </div>
    </div>
  );
}
