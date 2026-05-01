// Hex colour for a ShippingStatus value — used by raw <div style="..."> dots
// and chart cells where a Tailwind class won't fit. Falls back to neutral gray
// for unknown / null values so the UI never crashes on stale data.

import { SHIPPING_HEX } from '@/pages/dashboard/statusHex';
import type { ShippingStatus } from '@/constants/statusColors';

const FALLBACK = '#9CA3AF'; // gray-400

export function colourForShippingStatus(status: string | null | undefined): string {
  if (!status) return FALLBACK;
  return SHIPPING_HEX[status as ShippingStatus] ?? FALLBACK;
}
