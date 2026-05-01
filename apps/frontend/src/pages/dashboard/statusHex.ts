// Hex equivalents of the Tailwind status palette — Recharts can't consume
// Tailwind class names. Keep in sync with @/constants/statusColors.ts.

import type { ConfirmationStatus, ShippingStatus } from '@/constants/statusColors';

export const CONFIRMATION_HEX: Record<ConfirmationStatus, string> = {
  pending: '#6366F1',      // indigo-500
  confirmed: '#22C55E',    // green-500
  cancelled: '#EF4444',    // red-500
  unreachable: '#FF962E',  // brand orange
  callback: '#F59E0B',     // amber-500
  fake: '#8B5CF6',         // violet-500
  out_of_stock: '#F97316', // orange-500
  reported: '#EC4899',     // pink-500
};

export const SHIPPING_HEX: Record<ShippingStatus, string> = {
  not_shipped: '#9CA3AF',       // gray-400
  pushed: '#0EA5E9',            // sky-500
  picked_up: '#06B6D4',         // cyan-500
  in_transit: '#A855F7',        // purple-500
  out_for_delivery: '#3B82F6',  // blue-500
  failed_delivery: '#EAB308',   // yellow-500
  reported: '#D946EF',          // fuchsia-500
  delivered: '#16A34A',         // green-600
  returned: '#EF4444',          // red-500
};
