// Hex equivalents of the Tailwind status palette — used by Recharts which
// cannot consume Tailwind class names directly. Keep in sync with
// @/constants/statusColors.ts.

import type { ConfirmationStatus, ShippingStatus } from '@/constants/statusColors';

export const CONFIRMATION_HEX: Record<ConfirmationStatus, string> = {
  pending: '#6366F1',      // indigo-500
  awaiting: '#3B82F6',     // blue-500
  confirmed: '#22C55E',    // green-500
  cancelled: '#9CA3AF',    // gray-400
  unreachable: '#EF4444',  // red-500
  callback: '#F59E0B',     // amber-500
  fake: '#8B5CF6',         // violet-500
  out_of_stock: '#F97316', // orange-500
  reported: '#EC4899',     // pink-500
};

export const SHIPPING_HEX: Record<ShippingStatus, string> = {
  not_shipped: '#9CA3AF',
  label_created: '#0EA5E9',
  picked_up: '#06B6D4',
  in_transit: '#A855F7',
  out_for_delivery: '#3B82F6',
  delivered: '#16A34A',
  attempted: '#F59E0B',
  returned: '#F43F5E',
  return_validated: '#BE185D',
  return_refused: '#E11D48',
  exchange: '#8B5CF6',
  lost: '#64748B',
  destroyed: '#111827',
};
