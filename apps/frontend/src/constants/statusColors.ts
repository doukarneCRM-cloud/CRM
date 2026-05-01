// Canonical status types — must mirror the backend Prisma enums in
// `apps/backend/prisma/schema.prisma`. If you add/remove a value here,
// update the schema and re-run migrations.

export type ConfirmationStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'unreachable'
  | 'callback'
  | 'fake'
  | 'out_of_stock'
  | 'reported';

export type ShippingStatus =
  | 'not_shipped'
  | 'pushed'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'failed_delivery'
  | 'reported'
  | 'delivered'
  | 'returned';

export type OrderStatus = ConfirmationStatus | ShippingStatus;

export type ReturnOutcome = 'good' | 'damaged';

export interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  dot: string;
}

export const CONFIRMATION_STATUS_COLORS: Record<ConfirmationStatus, StatusConfig> = {
  pending: {
    label: 'Pending',
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    dot: 'bg-indigo-500',
  },
  confirmed: {
    label: 'Confirmed',
    bg: 'bg-green-100',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  unreachable: {
    label: 'Unreachable',
    bg: 'bg-[#FF962E]/15',
    text: 'text-[#FF962E]',
    dot: 'bg-[#FF962E]',
  },
  callback: {
    label: 'Callback',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  fake: {
    label: 'Fake',
    bg: 'bg-violet-100',
    text: 'text-violet-700',
    dot: 'bg-violet-500',
  },
  out_of_stock: {
    label: 'Out of Stock',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
  },
  reported: {
    label: 'Reported',
    bg: 'bg-pink-100',
    text: 'text-pink-700',
    dot: 'bg-pink-500',
  },
};

// Note: shipping `reported` shares its name with confirmation `reported` because
// the wire-level enums are the same string. The dictionaries below use distinct
// labels and colors so the UI badges always look different.
export const SHIPPING_STATUS_COLORS: Record<ShippingStatus, StatusConfig> = {
  not_shipped: {
    label: 'Not Shipped',
    bg: 'bg-gray-100',
    text: 'text-gray-500',
    dot: 'bg-gray-400',
  },
  pushed: {
    label: 'Pushed',
    bg: 'bg-sky-100',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  picked_up: {
    label: 'Picked Up',
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    dot: 'bg-cyan-500',
  },
  in_transit: {
    label: 'In Transit',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    dot: 'bg-purple-500',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  failed_delivery: {
    label: 'Failed Delivery',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-500',
  },
  reported: {
    label: 'Delivery Postponed',
    bg: 'bg-fuchsia-100',
    text: 'text-fuchsia-700',
    dot: 'bg-fuchsia-500',
  },
  delivered: {
    label: 'Delivered',
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-600',
  },
  returned: {
    label: 'Returned',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
};

// Confirmation values win on key collision (e.g. shipping `reported` is
// shadowed). Do not rely on ALL_STATUS_COLORS for shipping `reported` — read
// from SHIPPING_STATUS_COLORS directly when the context is shipping.
export const ALL_STATUS_COLORS: Record<string, StatusConfig> = {
  ...SHIPPING_STATUS_COLORS,
  ...CONFIRMATION_STATUS_COLORS,
};

export function getStatusConfig(
  status: string,
  type: 'confirmation' | 'shipping' | 'auto' = 'auto',
): StatusConfig {
  if (type === 'shipping' && status in SHIPPING_STATUS_COLORS) {
    return SHIPPING_STATUS_COLORS[status as ShippingStatus];
  }
  if (type === 'confirmation' && status in CONFIRMATION_STATUS_COLORS) {
    return CONFIRMATION_STATUS_COLORS[status as ConfirmationStatus];
  }
  return (
    ALL_STATUS_COLORS[status] ?? {
      label: status.replace(/_/g, ' '),
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      dot: 'bg-gray-400',
    }
  );
}

// Filter dropdown options for GlobalFilterBar — preserve declaration order.
export const CONFIRMATION_STATUS_OPTIONS = (
  Object.keys(CONFIRMATION_STATUS_COLORS) as ConfirmationStatus[]
).map((key) => ({
  value: key,
  label: CONFIRMATION_STATUS_COLORS[key].label,
}));

export const SHIPPING_STATUS_OPTIONS = (
  Object.keys(SHIPPING_STATUS_COLORS) as ShippingStatus[]
).map((key) => ({
  value: key,
  label: SHIPPING_STATUS_COLORS[key].label,
}));

export const SOURCE_OPTIONS = [
  { value: 'youcan', label: 'Youcan' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'manual', label: 'Manual' },
];

export const RETURN_OUTCOME_OPTIONS: { value: ReturnOutcome; label: string }[] = [
  { value: 'good', label: 'Good (restock)' },
  { value: 'damaged', label: 'Damaged (loss)' },
];
