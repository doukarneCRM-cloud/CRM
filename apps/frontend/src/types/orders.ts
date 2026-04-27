// ─── Canonical order types — match backend schema exactly ─────────────────────

export type OrderSource = 'youcan' | 'whatsapp' | 'instagram' | 'manual';
export type CustomerTag = 'normal' | 'vip' | 'blacklisted';
export type DiscountType = 'fixed' | 'percentage';
export type LogType = 'confirmation' | 'shipping' | 'system';

export interface OrderCustomer {
  id: string;
  fullName: string;
  phoneDisplay: string;
  city: string;
  address: string | null;
  tag: CustomerTag;
  /** Total orders this customer has placed with us (across all statuses).
   *  Shipped by the order-list endpoints so every row can show a "N orders"
   *  badge next to the name without N+1 queries. Optional because not every
   *  endpoint projects it. */
  _count?: { orders: number };
}

export interface OrderAgent {
  id: string;
  name: string;
  email?: string;
  role?: { name: string; label: string };
}

export interface ProductVariant {
  id: string;
  color: string | null;
  size: string | null;
  sku?: string;
  stock?: number;
  price?: number;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    isPlaceholder?: boolean;
    deletedAt?: string | null;
    youcanId?: string | null;
    storeId?: string | null;
  };
}

export interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  total: number;
  variant: ProductVariant;
}

export interface OrderLog {
  id: string;
  type: LogType;
  action: string;
  performedBy: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface Order {
  id: string;
  reference: string;
  source: OrderSource;
  confirmationStatus: string;
  shippingStatus: string;
  subtotal: number;
  discountType: DiscountType | null;
  discountAmount: number | null;
  total: number;
  shippingPrice: number;
  confirmationNote: string | null;
  shippingInstruction: string | null;
  cancellationReason: string | null;
  callbackAt: string | null;
  coliixTrackingId: string | null;
  // Literal status string Coliix returned on its most recent webhook /
  // poller hit. UI prefers this over the enum-based label so admins see
  // exactly what Coliix is reporting ("Ramassé", "Attente De Ramassage",
  // …). Null until the first Coliix update lands.
  coliixRawState: string | null;
  labelSent: boolean;
  isArchived: boolean;
  unreachableCount: number;
  createdAt: string;
  updatedAt: string;
  customer: OrderCustomer;
  agent: OrderAgent | null;
  items: OrderItem[];
  logs?: OrderLog[];
  /**
   * Derived server-side: true when any item's variant.stock is below the
   * requested quantity. Under the new stock policy, pending orders that run
   * short on stock stay pending and surface this flag so the UI can show a
   * "Stock short" badge — nothing is auto-flipped to out_of_stock anymore.
   */
  hasStockWarning?: boolean;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedOrders {
  data: Order[];
  pagination: Pagination;
}

export interface OrdersSummary {
  pending: { total: number; assigned: number; unassigned: number };
  confirmed: { total: number };
  outForDelivery: { total: number };
  delivered: { total: number; revenue: number };
}

export interface OrderFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  confirmationStatuses?: string;
  shippingStatuses?: string;
  coliixRawStates?: string;
  agentIds?: string;
  cities?: string;
  productIds?: string;
  sources?: string;
  dateFrom?: string;
  dateTo?: string;
  isArchived?: string;
}

// ─── Product types (for item selection in edit modal) ─────────────────────────

export interface Product {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  basePrice: number;
  variants: Array<{
    id: string;
    color: string | null;
    size: string | null;
    sku: string;
    stock: number;
    price: number;
  }>;
}

export interface ShippingCity {
  id: string;
  name: string;
  price: number;
  zone: string | null;
}

export interface AgentOption {
  id: string;
  name: string;
  email: string;
  role: { name: string; label: string };
}

// ─── Customer history ─────────────────────────────────────────────────────────

export interface CustomerDetail {
  id: string;
  fullName: string;
  phone: string;
  phoneDisplay: string;
  city: string;
  address: string | null;
  tag: CustomerTag;
  notes: string | null;
  createdAt: string;
  _count?: { orders: number };
}
