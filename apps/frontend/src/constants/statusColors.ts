// ─── Canonical status types — match backend enums exactly ────────────────────

export type ConfirmationStatus =
  | 'pending'
  | 'awaiting'
  | 'confirmed'
  | 'cancelled'
  | 'unreachable'
  | 'callback'
  | 'fake'
  | 'out_of_stock'
  | 'reported';

export type ShippingStatus =
  | 'not_shipped'
  | 'label_created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'attempted'
  | 'returned'
  | 'return_validated'
  | 'return_refused'
  | 'exchange'
  | 'lost'
  | 'destroyed';

export type OrderStatus = ConfirmationStatus | ShippingStatus;

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
  awaiting: {
    label: 'Awaiting',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  confirmed: {
    label: 'Confirmed',
    bg: 'bg-green-100',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  unreachable: {
    label: 'Unreachable',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
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

export const SHIPPING_STATUS_COLORS: Record<ShippingStatus, StatusConfig> = {
  not_shipped: {
    label: 'Not Shipped',
    bg: 'bg-gray-100',
    text: 'text-gray-500',
    dot: 'bg-gray-400',
  },
  label_created: {
    label: 'Label Created',
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
  delivered: {
    label: 'Delivered',
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-600',
  },
  attempted: {
    label: 'Attempted',
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    dot: 'bg-yellow-500',
  },
  returned: {
    label: 'Returned',
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
  return_validated: {
    label: 'Return Validated',
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  return_refused: {
    label: 'Return Refused',
    bg: 'bg-rose-100',
    text: 'text-rose-700',
    dot: 'bg-rose-500',
  },
  exchange: {
    label: 'Exchange',
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    dot: 'bg-teal-500',
  },
  lost: {
    label: 'Lost',
    bg: 'bg-stone-200',
    text: 'text-stone-700',
    dot: 'bg-stone-500',
  },
  destroyed: {
    label: 'Destroyed',
    bg: 'bg-zinc-800',
    text: 'text-white',
    dot: 'bg-zinc-300',
  },
};

export const ALL_STATUS_COLORS: Record<OrderStatus, StatusConfig> = {
  ...CONFIRMATION_STATUS_COLORS,
  ...SHIPPING_STATUS_COLORS,
};

export function getStatusConfig(status: string): StatusConfig {
  return (
    ALL_STATUS_COLORS[status as OrderStatus] ?? {
      label: status.replace(/_/g, ' '),
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      dot: 'bg-gray-400',
    }
  );
}

// ─── Filter options for GlobalFilterBar ───────────────────────────────────────

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
