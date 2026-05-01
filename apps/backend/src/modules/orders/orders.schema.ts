import { z } from 'zod';

// ─── Item ─────────────────────────────────────────────────────────────────────
export const CreateOrderItemSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

// ─── Create Order ─────────────────────────────────────────────────────────────
export const CreateOrderSchema = z
  .object({
    // Customer — either existing customerId or inline new customer
    customerId: z.string().cuid().optional(),
    customerName: z.string().min(2).max(100).optional(),
    customerPhone: z.string().min(8).max(20).optional(),
    customerCity: z.string().min(2).max(100).optional(),
    customerAddress: z.string().max(200).optional(),
    // Order fields
    source: z.enum(['youcan', 'whatsapp', 'instagram', 'manual']).default('manual'),
    storeId: z.string().cuid().optional(),
    agentId: z.string().cuid().optional(),
    discountType: z.enum(['fixed', 'percentage']).optional(),
    discountAmount: z.number().nonnegative().optional(),
    shippingPrice: z.number().nonnegative().default(0),
    confirmationNote: z.string().max(500).optional(),
    shippingInstruction: z.string().max(500).optional(),
    items: z.array(CreateOrderItemSchema).min(1),
  })
  .refine(
    (d) => d.customerId || (d.customerName && d.customerPhone && d.customerCity),
    { message: 'Provide customerId OR customerName + customerPhone + customerCity' },
  );

// ─── Update Order (patch fields — items replacement optional) ─────────────────
export const UpdateOrderSchema = z.object({
  agentId: z.string().cuid().nullable().optional(),
  discountType: z.enum(['fixed', 'percentage']).nullable().optional(),
  discountAmount: z.number().nonnegative().nullable().optional(),
  shippingPrice: z.number().nonnegative().optional(),
  confirmationNote: z.string().max(500).nullable().optional(),
  shippingInstruction: z.string().max(500).nullable().optional(),
  cancellationReason: z.string().max(500).nullable().optional(),
  callbackAt: z.string().datetime().nullable().optional(),
  reportedAt: z.string().datetime().nullable().optional(),
  // Full items replacement — when provided, old items are discarded, old stock
  // is restored, and new items + their stock deductions are applied atomically.
  items: z.array(CreateOrderItemSchema).min(1).optional(),
});

// ─── Status Update ────────────────────────────────────────────────────────────
export const UpdateStatusSchema = z
  .object({
    confirmationStatus: z
      .enum([
        'pending',
        'confirmed',
        'cancelled',
        'unreachable',
        'callback',
        'fake',
        'out_of_stock',
        'reported',
      ])
      .optional(),
    shippingStatus: z
      .enum([
        'not_shipped',
        'pushed',
        'picked_up',
        'in_transit',
        'out_for_delivery',
        'failed_delivery',
        'reported',
        'delivered',
        'returned',
      ])
      .optional(),
    note: z.string().max(500).optional(),
    callbackAt: z.string().datetime().optional(),
    reportedAt: z.string().datetime().optional(),
    cancellationReason: z.string().max(500).optional(),
  })
  .refine((d) => d.confirmationStatus || d.shippingStatus, {
    message: 'Either confirmationStatus or shippingStatus is required',
  });

// ─── Assign ──────────────────────────────────────────────────────────────────
export const AssignOrderSchema = z.object({
  agentId: z.string().cuid().nullable(), // null = unassign
});

// ─── Bulk Actions ─────────────────────────────────────────────────────────────
export const BulkActionSchema = z
  .object({
    orderIds: z.array(z.string().cuid()).min(1).max(100),
    action: z.enum(['assign', 'unassign', 'archive', 'unarchive']),
    agentId: z.string().cuid().optional(),
  })
  .refine((d) => d.action !== 'assign' || d.agentId, {
    message: 'agentId is required for bulk assign',
  });

// ─── Merge Duplicates ─────────────────────────────────────────────────────────
export const MergeOrdersSchema = z
  .object({
    keepOrderId: z.string().cuid(),
    mergeOrderIds: z.array(z.string().cuid()).min(1).max(20),
  })
  .refine((d) => !d.mergeOrderIds.includes(d.keepOrderId), {
    message: 'keepOrderId cannot also appear in mergeOrderIds',
  });

export type MergeOrdersInput = z.infer<typeof MergeOrdersSchema>;

// ─── List Query ──────────────────────────────────────────────────────────────
export const OrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  agentIds: z.string().optional(),
  productIds: z.string().optional(),
  cities: z.string().optional(),
  confirmationStatuses: z.string().optional(),
  shippingStatuses: z.string().optional(),
  sources: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  isArchived: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>;
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;
export type AssignOrderInput = z.infer<typeof AssignOrderSchema>;
export type BulkActionInput = z.infer<typeof BulkActionSchema>;
export type OrderQueryInput = z.infer<typeof OrderQuerySchema>;
