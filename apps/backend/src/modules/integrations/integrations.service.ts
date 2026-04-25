/**
 * Integration service — store management, product/order import, field mapping.
 */

import crypto from 'node:crypto';
import { prisma } from '../../shared/prisma';
import { normalizePhone, isValidMoroccanPhone } from '../../utils/phoneNormalize';
import {
  buildAuthUrl,
  exchangeCode,
  fetchProducts,
  fetchOrders,
  fetchOrder,
  fetchCheckoutFieldsConfig,
  subscribeWebhook,
  unsubscribeWebhook,
  type YoucanOrder,
  type YoucanCheckoutFieldConfig,
} from '../../shared/youcanClient';
import { emitToAll } from '../../shared/socket';
import { createAdminNotification } from '../notifications/notifications.service';
import {
  generateReference,
  healReferenceCounter,
  isReferenceCollision,
} from '../orders/orders.service';

// ─── Store CRUD ─────────────────────────────────────────────────────────────

export async function listStores() {
  return prisma.store.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      isConnected: true,
      lastSyncAt: true,
      lastError: true,
      fieldMapping: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { products: true, orders: true } },
    },
  });
}

export async function getStore(id: string) {
  const store = await prisma.store.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      isConnected: true,
      lastSyncAt: true,
      lastError: true,
      fieldMapping: true,
      webhookId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { products: true, orders: true } },
    },
  });
  if (!store) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Store not found' };
  return store;
}

export async function createStore(input: { name: string }) {
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  return prisma.store.create({
    data: {
      name: input.name,
      webhookSecret,
    },
  });
}

export async function updateStore(id: string, input: Record<string, unknown>) {
  return prisma.store.update({ where: { id }, data: input });
}

export async function deleteStore(id: string) {
  // Unsubscribe webhook if active
  const store = await prisma.store.findUnique({ where: { id } });
  if (store?.webhookId && store.isConnected) {
    try { await unsubscribeWebhook(id, store.webhookId); } catch { /* best effort */ }
  }
  return prisma.store.delete({ where: { id } });
}

export async function toggleStore(id: string) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id } });
  return prisma.store.update({ where: { id }, data: { isActive: !store.isActive } });
}

// ─── OAuth flow ─────────────────────────────────────────────────────────────

export function getOAuthUrl(storeId: string) {
  const state = `${storeId}:${crypto.randomBytes(16).toString('hex')}`;
  const url = buildAuthUrl(state);
  return { url, state };
}

export async function handleOAuthCallback(storeId: string, code: string) {
  await exchangeCode(storeId, code);
  await logImport(storeId, 'connection', 'info', 'Store connected via OAuth');

  // Auto-subscribe webhook for order.create
  try {
    const baseUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
    const targetUrl = `${baseUrl}/api/v1/integrations/youcan/webhook/${storeId}`;
    const webhookId = await subscribeWebhook(storeId, 'order.create', targetUrl);
    await prisma.store.update({ where: { id: storeId }, data: { webhookId } });
    await logImport(storeId, 'connection', 'info', 'Webhook subscribed for order.create');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    await logImport(storeId, 'connection', 'warning', `Webhook subscription failed: ${msg}. Orders won't sync in real-time.`);
  }
}

// ─── Field mapping ──────────────────────────────────────────────────────────

export async function updateFieldMapping(storeId: string, mapping: Record<string, string>) {
  return prisma.store.update({
    where: { id: storeId },
    data: { fieldMapping: mapping },
  });
}

// ─── Product import ─────────────────────────────────────────────────────────

export async function importProducts(
  storeId: string,
  productIds?: string[],
): Promise<{ imported: number; skipped: number; errors: number; details: string[] }> {
  const details: string[] = [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // Fetch from YouCan
  const rawProducts: any[] = [];

  if (productIds && productIds.length > 0) {
    for (const pid of productIds) {
      try {
        const { fetchProduct } = await import('../../shared/youcanClient');
        const prod = await fetchProduct(storeId, pid);
        if (prod) rawProducts.push(prod);
      } catch (e) {
        errors++;
        details.push(`Failed to fetch product ${pid}: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
    }
  } else {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const result = await fetchProducts(storeId, page, 50);
      for (const p of result.data ?? []) if (p) rawProducts.push(p);
      hasMore = page < (result.pagination?.total_pages ?? 1);
      page++;
      if (page > 200) break; // safety cap
    }
  }

  // Upsert into CRM — normalize each product defensively
  for (const raw of rawProducts) {
    const yp = raw as Record<string, any>;
    const ypName: string = yp.name ?? yp.title ?? 'Untitled Product';
    const ypId: string | null = yp.id ?? null;
    const ypDescription: string | null = yp.description ?? null;
    const ypPrice: number = Number(yp.price ?? 0);
    const ypInventory: number = Number(yp.inventory ?? 0);
    const ypThumbnail: string | null = coerceImage(yp.thumbnail) ?? coerceImage(yp.images?.[0]) ?? null;
    const ypVariants: any[] = Array.isArray(yp.variants) ? yp.variants : [];

    if (!ypId) {
      errors++;
      details.push(`Skipped product with no id: ${ypName}`);
      continue;
    }

    try {
      // Match strategy, in order of confidence:
      //   1. Exact youcanId match (cleanest case — product was imported before).
      //   2. Variant-youcanId match — a placeholder created from an order owns
      //      one of this YouCan product's variants. Promote that placeholder.
      //   3. Placeholder with the exact same name in the same store. Covers the
      //      case where the order-import had no ycVariantId to attach.
      let existing = await prisma.product.findFirst({ where: { youcanId: ypId } });

      if (!existing && ypVariants.length > 0) {
        const variantYcIds = ypVariants
          .map((yv: any) => yv?.id)
          .filter(Boolean)
          .map(String);
        if (variantYcIds.length > 0) {
          const hit = await prisma.productVariant.findFirst({
            where: {
              youcanId: { in: variantYcIds },
              product: { isPlaceholder: true, storeId },
            },
            include: { product: true },
          });
          if (hit) existing = hit.product;
        }
      }

      if (!existing) {
        existing = await prisma.product.findFirst({
          where: { storeId, isPlaceholder: true, name: ypName },
        });
      }

      if (existing) {
        const wasPlaceholder = existing.isPlaceholder;
        await prisma.product.update({
          where: { id: existing.id },
          data: {
            name: ypName,
            description: ypDescription,
            imageUrl: ypThumbnail,
            basePrice: ypPrice,
            storeId,
            youcanId: ypId,
            isPlaceholder: false,
            // Re-importing a previously-deleted product restores it so that
            // linked orders show real stock again and the quick-import icon
            // disappears from the Orders table.
            deletedAt: null,
            isActive: true,
          },
        });

        for (const yv of ypVariants) {
          await upsertVariant(existing.id, yv, { name: ypName });
        }

        if (wasPlaceholder) {
          imported++;
          details.push(`Linked previously-unknown product: ${ypName}`);
        } else {
          skipped++;
          details.push(`Updated: ${ypName}`);
        }
      } else {
        const sku = generateProductSku(ypName);
        const product = await prisma.product.create({
          data: {
            name: ypName,
            sku,
            description: ypDescription,
            imageUrl: ypThumbnail,
            basePrice: ypPrice,
            youcanId: ypId,
            storeId,
          },
        });

        if (ypVariants.length > 0) {
          for (const yv of ypVariants) {
            await upsertVariant(product.id, yv, { name: ypName });
          }
        } else {
          await prisma.productVariant.create({
            data: {
              productId: product.id,
              sku: `${sku}-DEF`,
              price: ypPrice,
              stock: ypInventory,
            },
          });
        }

        imported++;
        details.push(`Imported: ${ypName} (${ypVariants.length} variants)`);
      }
    } catch (e) {
      errors++;
      details.push(`Error importing ${ypName}: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  }

  await logImport(storeId, 'products_import', errors > 0 ? 'warning' : 'info',
    `Products import: ${imported} imported, ${skipped} updated, ${errors} errors`,
    { imported, skipped, errors, details },
  );

  return { imported, skipped, errors, details };
}

// Map YouCan's arbitrary variation option names to our `color` and `size` columns.
// YouCan stores can label options in any language ("Color", "Couleur", "لون",
// "Taille", "Pointure", etc.). We detect by regex first; if nothing matches,
// we fall back to positional mapping (first value → color, second → size) so
// stores using exotic labels still get differentiated variants.
const COLOR_NAME_RE = /^(color|colour|couleur|colors|لون|اللون)$/i;
const SIZE_NAME_RE = /^(size|sizes|taille|tailles|pointure|mesure|talla|tamaño|حجم|المقاس|مقاس)$/i;

function extractColorAndSize(
  variations: Record<string, any> | null | undefined,
): { color: string | null; size: string | null; label: string } {
  if (!variations || typeof variations !== 'object') {
    return { color: null, size: null, label: '' };
  }

  const entries = Object.entries(variations).filter(
    ([, value]) => value != null && String(value).trim().length > 0,
  );
  if (entries.length === 0) return { color: null, size: null, label: '' };

  let color: string | null = null;
  let size: string | null = null;
  const used = new Set<string>();

  for (const [key, value] of entries) {
    const k = key.trim();
    if (!color && COLOR_NAME_RE.test(k)) {
      color = String(value).trim();
      used.add(key);
    } else if (!size && SIZE_NAME_RE.test(k)) {
      size = String(value).trim();
      used.add(key);
    }
  }

  // Positional fallback for any still-empty slot.
  const remaining = entries.filter(([k]) => !used.has(k));
  if (!color && remaining[0]) {
    color = String(remaining[0][1]).trim();
    remaining.shift();
  }
  if (!size && remaining[0]) {
    size = String(remaining[0][1]).trim();
  }

  // Skip the meaningless "default → default" placeholder YouCan emits for
  // single-variant products so our UI doesn't display "Default / Default".
  if (color?.toLowerCase() === 'default' && entries.length === 1) color = null;
  if (size?.toLowerCase() === 'default' && entries.length === 1) size = null;

  const label = entries.map(([, v]) => String(v).trim()).join(' / ');
  return { color, size, label };
}

function generateProductSku(productName: string): string {
  const base = (productName ?? 'PRODUCT')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 20)
    .toUpperCase();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `YC-${base}-${suffix}`;
}

async function upsertVariant(
  productId: string,
  rawVariant: any,
  parent: { name: string },
) {
  const yv = rawVariant as Record<string, any>;
  const ycVariantId: string | null = yv.id ?? null;
  const variations: Record<string, any> =
    (yv.variations && typeof yv.variations === 'object' && !Array.isArray(yv.variations))
      ? yv.variations
      : {};
  const { color, size } = extractColorAndSize(variations);
  const price = Number(yv.price ?? 0);
  const inventory = Number(yv.inventory ?? 0);

  const existing = ycVariantId
    ? await prisma.productVariant.findFirst({ where: { youcanId: ycVariantId } })
    : null;

  if (existing) {
    await prisma.productVariant.update({
      where: { id: existing.id },
      data: { color, size, price, stock: inventory },
    });
  } else {
    const variationTag = Object.values(variations).join('-').slice(0, 10).toUpperCase() || 'V';
    const candidateSku = yv.sku || `${generateProductSku(parent.name)}-${variationTag}`;
    const uniqueSku = await ensureUniqueSku(candidateSku);
    await prisma.productVariant.create({
      data: {
        productId,
        youcanId: ycVariantId,
        color,
        size,
        sku: uniqueSku,
        price,
        stock: inventory,
      },
    });
  }
}

async function ensureUniqueSku(baseSku: string): Promise<string> {
  let sku = baseSku;
  let attempt = 0;
  while (await prisma.productVariant.findUnique({ where: { sku } })) {
    attempt++;
    sku = `${baseSku}-${attempt}`;
  }
  return sku;
}

// YouCan returns image/thumbnail in three shapes across endpoints:
//   - a URL string ("https://...")
//   - an object with url/src/path fields ({ url: "...", name: "..." })
//   - the object with all fields null when no image is set ({ url: null })
// This normalizes any of those into a non-empty string or null.
function coerceImage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidate = obj.url ?? obj.src ?? obj.path ?? obj.thumbnail ?? null;
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

// ─── Reconcile placeholders ─────────────────────────────────────────────────
//
// Heal orders that were imported before the real products existed, including
// orders created under older (buggy) extraction code that stored wrong IDs.
//
// Phase 1 — Direct ID harvest:
//   Placeholder products that already have `youcanId` go straight into the
//   import set.
//
// Phase 2 — Order re-fetch (heals historical breakage):
//   For every placeholder *without* a youcanId, find an OrderItem that points
//   at one of its variants, re-fetch the owning order from YouCan, and pull
//   the real `item.variant.product.id` from the nested line-item shape. This
//   also backfills the placeholder's youcanId, its variant youcanIds (which
//   under the old code were line-item ids instead of variant ids), and
//   refreshes name/image from fresh data.
//
// Phase 3 — Catalog scan fallback:
//   Any variant youcanId that's still not explained gets a bounded sweep of
//   the YouCan catalog to find its parent product.
//
// Phase 4 — importProducts:
//   Run the collected ids through importProducts; the triple-fallback inside
//   handles the actual promotion/relink.
export async function reconcilePlaceholders(
  storeId: string,
): Promise<{ reconciled: number; skipped: number; errors: number; details: string[] }> {
  const details: string[] = [];
  let reconciled = 0;
  let skipped = 0;
  let errors = 0;

  const placeholders = await prisma.product.findMany({
    where: { storeId, isPlaceholder: true },
    include: { variants: { select: { id: true, youcanId: true } } },
  });

  if (placeholders.length === 0) {
    return { reconciled, skipped, errors, details: ['No unlinked products to reconcile.'] };
  }

  const directIds = new Set<string>();

  // ── Phase 1: Placeholders that already know their YouCan product id ──────
  for (const p of placeholders) {
    if (p.youcanId) directIds.add(p.youcanId);
  }

  // ── Phase 2: Heal placeholders with no youcanId by re-fetching orders ────
  const brokenPlaceholders = placeholders.filter((p) => !p.youcanId);
  const variantIdsNeedingLookup = new Set<string>();

  if (brokenPlaceholders.length > 0) {
    // Map variantId → placeholder product id, so we can resolve an OrderItem
    // back to the product we're trying to heal.
    const variantToPlaceholder = new Map<string, string>();
    for (const p of brokenPlaceholders) {
      for (const v of p.variants) variantToPlaceholder.set(v.id, p.id);
    }

    // Find one order per broken placeholder. Older dup-key orders are fine;
    // we just need any order that carries the product, and YouCan returns the
    // full line-item shape on a single-order fetch.
    const orderItems = await prisma.orderItem.findMany({
      where: {
        variantId: { in: [...variantToPlaceholder.keys()] },
        order: { storeId, source: 'youcan', youcanOrderId: { not: null } },
      },
      select: {
        id: true,
        variantId: true,
        order: { select: { id: true, youcanOrderId: true } },
      },
    });

    // One fetch per unique youcanOrderId, capped to avoid runaway cost.
    const MAX_ORDER_FETCHES = 100;
    const seenOrderIds = new Set<string>();
    const uniqueFetches: Array<{ youcanOrderId: string; ourOrderId: string }> = [];
    for (const oi of orderItems) {
      const yid = oi.order.youcanOrderId;
      if (!yid || seenOrderIds.has(yid)) continue;
      seenOrderIds.add(yid);
      uniqueFetches.push({ youcanOrderId: yid, ourOrderId: oi.order.id });
      if (uniqueFetches.length >= MAX_ORDER_FETCHES) break;
    }

    // Track which placeholders we've already resolved so we can stop early.
    const resolvedPlaceholders = new Set<string>();
    let healedFromOrders = 0;
    let orderFetchErrors = 0;

    for (const { youcanOrderId } of uniqueFetches) {
      if (resolvedPlaceholders.size >= brokenPlaceholders.length) break;
      try {
        const freshOrder = await fetchOrder(storeId, youcanOrderId);
        const foAny = freshOrder as any;
        const rawLines: any[] = Array.isArray(foAny.variants)
          ? foAny.variants
          : Array.isArray(foAny.items)
            ? foAny.items
            : Array.isArray(foAny.products)
              ? foAny.products
              : [];

        // Our stored OrderItems for this order, in insertion order so we can
        // match positionally against YouCan's line items (YouCan returns them
        // in the same order they were saved).
        const ourItems = await prisma.orderItem.findMany({
          where: { order: { youcanOrderId } },
          select: { id: true, variantId: true },
          orderBy: { id: 'asc' },
        });

        for (let i = 0; i < rawLines.length && i < ourItems.length; i++) {
          const line = rawLines[i] as Record<string, any>;
          if (!line || typeof line !== 'object') continue;

          const ycVariant: Record<string, any> = (line.variant ?? line) as Record<string, any>;
          const ycProduct: Record<string, any> =
            (ycVariant.product ?? line.product ?? {}) as Record<string, any>;

          const realProductId: string | null = ycProduct.id
            ?? ycVariant.product_id ?? line.product_id ?? line.productId ?? null;
          const realVariantId: string | null = ycVariant.id
            ?? line.variant_id ?? line.productVariantId ?? null;

          if (!realProductId) continue;

          const ourVariantId = ourItems[i].variantId;
          const placeholderId = variantToPlaceholder.get(ourVariantId);
          if (!placeholderId) continue;

          // Backfill the placeholder with the real product id (+ name/image
          // refresh so broken placeholders look right even before full import).
          const placeholderName: string | undefined =
            ycProduct.name ?? line.product_name ?? line.name ?? undefined;
          const placeholderImage: string | null | undefined =
            coerceImage(ycVariant.image)
            ?? coerceImage(ycProduct.thumbnail)
            ?? coerceImage(ycProduct.images?.[0])
            ?? undefined;

          try {
            await prisma.product.update({
              where: { id: placeholderId },
              data: {
                youcanId: realProductId,
                ...(placeholderName ? { name: placeholderName } : {}),
                ...(placeholderImage !== undefined ? { imageUrl: placeholderImage } : {}),
              },
            });
          } catch {
            // If another product already holds this youcanId we leave the
            // placeholder to be merged in Phase 4 via importProducts' fallback
            // matching (which searches by name as well).
          }

          // Fix the variant's youcanId (old code stored the line-item id).
          if (realVariantId) {
            try {
              await prisma.productVariant.updateMany({
                where: { id: ourVariantId },
                data: { youcanId: realVariantId },
              });
            } catch {
              // Unique constraint — a real variant with this youcanId already
              // exists. Safe to ignore; Phase 4 import will merge properly.
            }
          }

          directIds.add(realProductId);
          resolvedPlaceholders.add(placeholderId);
          healedFromOrders++;
        }
      } catch {
        orderFetchErrors++;
      }
    }

    if (healedFromOrders > 0) {
      details.push(`Re-fetched ${uniqueFetches.length} order(s) from YouCan; harvested ${healedFromOrders} real product id(s).`);
    }
    if (orderFetchErrors > 0) {
      details.push(`${orderFetchErrors} order fetch(es) failed — those placeholders will fall through to catalog scan.`);
      errors += orderFetchErrors;
    }

    // Collect variant youcanIds from placeholders that Phase 2 couldn't heal,
    // so Phase 3's catalog scan has something to work with.
    for (const p of brokenPlaceholders) {
      if (resolvedPlaceholders.has(p.id)) continue;
      for (const v of p.variants) {
        if (v.youcanId) variantIdsNeedingLookup.add(v.youcanId);
      }
    }
  }

  // ── Phase 3: Catalog scan fallback for any remaining orphan variant ids ──
  if (variantIdsNeedingLookup.size > 0) {
    const MAX_PAGES = 20;
    const PAGE_SIZE = 50;
    let pageNo = 1;
    while (pageNo <= MAX_PAGES) {
      const res = await fetchProducts(storeId, pageNo, PAGE_SIZE);
      for (const prod of res.data ?? []) {
        const pAny = prod as any;
        const variants: any[] = Array.isArray(pAny.variants) ? pAny.variants : [];
        const hit = variants.some((vv) => vv?.id && variantIdsNeedingLookup.has(String(vv.id)));
        if (hit && pAny.id) directIds.add(String(pAny.id));
      }
      if (pageNo >= (res.pagination?.total_pages ?? 1)) break;
      pageNo++;
    }
  }

  const ids = [...directIds];
  if (ids.length === 0) {
    return {
      reconciled,
      skipped: placeholders.length,
      errors,
      details: [
        ...details,
        'No recoverable unlinked products — could not recover real IDs from orders or catalog.',
      ],
    };
  }

  // ── Phase 4: Run everything through importProducts ───────────────────────
  const result = await importProducts(storeId, ids);

  const stillPlaceholder = await prisma.product.count({
    where: { storeId, isPlaceholder: true },
  });

  reconciled = placeholders.length - stillPlaceholder;
  skipped = stillPlaceholder;
  errors += result.errors;
  details.push(...result.details);
  details.unshift(
    `Scanned ${placeholders.length} unlinked product(s), fetched ${ids.length} from YouCan.`,
  );

  await logImport(storeId, 'reconcile_placeholders', errors > 0 ? 'warning' : 'info',
    `Reconcile: ${reconciled} linked, ${skipped} still unlinked, ${errors} errors`,
    { reconciled, skipped, errors, details },
  );

  return { reconciled, skipped, errors, details };
}

// ─── Order import ───────────────────────────────────────────────────────────

export async function importOrders(
  storeId: string,
  count?: number,
): Promise<{ imported: number; skipped: number; errors: number; details: string[] }> {
  const details: string[] = [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });

  // Fetch orders from YouCan
  const allOrders: YoucanOrder[] = [];
  let page = 1;
  let hasMore = true;
  const maxOrders = count ?? 10000;

  while (hasMore && allOrders.length < maxOrders) {
    const result = await fetchOrders(storeId, page, 50);
    allOrders.push(...result.data);
    hasMore = page < result.pagination.total_pages;
    page++;
  }

  // Trim to requested count
  const toImport = allOrders.slice(0, maxOrders);

  for (const yo of toImport) {
    try {
      const result = await importSingleOrder(storeId, yo, store.fieldMapping as Record<string, string> | null);
      if (result === 'imported') {
        imported++;
        details.push(`Imported: ${yo.ref}`);
      } else {
        skipped++;
        details.push(`Skipped (exists): ${yo.ref}`);
      }
    } catch (e) {
      errors++;
      details.push(`Error importing ${yo.ref}: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  }

  await prisma.store.update({ where: { id: storeId }, data: { lastSyncAt: new Date() } });

  await logImport(storeId, 'orders_import', errors > 0 ? 'warning' : 'info',
    `Orders import: ${imported} imported, ${skipped} skipped, ${errors} errors`,
    { imported, skipped, errors, details },
  );

  return { imported, skipped, errors, details };
}

/**
 * Import a single YouCan order into the CRM. Used by both bulk import and webhooks.
 * Returns 'imported' | 'skipped'.
 */
export async function importSingleOrder(
  storeId: string,
  yo: YoucanOrder,
  fieldMapping?: Record<string, string> | null,
): Promise<'imported' | 'skipped'> {
  // Skip if already imported
  const exists = await prisma.order.findUnique({ where: { youcanOrderId: yo.id } });
  if (exists) return 'skipped';

  // Resolve customer — field mapping first, then fall back to YouCan defaults
  const cust = yo.customer;
  const defaultName = cust?.full_name ?? (`${cust?.first_name ?? ''} ${cust?.last_name ?? ''}`.trim() || 'YouCan Customer');
  const defaultPhone = cust?.phone ?? '';
  const defaultCity = cust?.city ?? 'Unknown';
  // YouCan's checkout puts the street address in `customer.region` (their
  // "region" field is what the merchant labels "Adresse" in the form). The
  // documented `shipping.address.*` shape isn't actually returned by the live
  // API, so treat those as last-resort fallbacks only.
  const custAny = cust as Record<string, unknown> | undefined;
  const defaultAddress =
    (typeof custAny?.region === 'string' && custAny.region.trim()) ||
    (typeof custAny?.location === 'string' && custAny.location.replace(/,\s*$/, '').trim()) ||
    [yo.shipping?.address?.first_line, yo.shipping?.address?.second_line]
      .filter(Boolean)
      .join(', ') ||
    null;

  const name = resolveField('name', yo, fieldMapping) || defaultName;
  const phone = resolveField('phone', yo, fieldMapping) || defaultPhone;
  const city = resolveField('city', yo, fieldMapping) || defaultCity;
  const address = resolveField('address', yo, fieldMapping) || defaultAddress;

  let customerId: string;
  if (phone && isValidMoroccanPhone(phone)) {
    const { normalized, display } = normalizePhone(phone);
    const existing = await prisma.customer.findUnique({ where: { phone: normalized } });
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: { fullName: name, city, address: address ?? existing.address },
      });
      customerId = existing.id;
    } else {
      const created = await prisma.customer.create({
        data: { fullName: name, phone: normalized, phoneDisplay: display, city, address },
      });
      customerId = created.id;
    }
  } else {
    // Non-Moroccan or missing phone — generate a unique placeholder
    const placeholder = `+0000${Date.now()}`;
    const created = await prisma.customer.create({
      data: {
        fullName: name,
        phone: placeholder,
        phoneDisplay: phone || 'N/A',
        city,
        address,
      },
    });
    customerId = created.id;
  }

  // Resolve order items. Per the YouCan API docs, each entry of `order.variants`
  // is a line-item wrapper shaped like:
  //   { id, price, quantity, variant: { id, sku, variations, product: { id, name, ... } } }
  // The top-level `id` is the line-item id (NOT the variant id). The real variant
  // lives at `item.variant.*` and the real product at `item.variant.product.*`.
  // See: https://developer.youcan.shop/store-admin/orders/get
  const yoAny = yo as any;
  const rawItems: any[] = Array.isArray(yoAny.variants)
    ? yoAny.variants
    : Array.isArray(yoAny.items)
      ? yoAny.items
      : Array.isArray(yoAny.products)
        ? yoAny.products
        : [];

  const items: Array<{ variantId: string; quantity: number; unitPrice: number; total: number }> = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;

    const line = raw as Record<string, any>;
    // Prefer the nested shape; fall back to a flat shape for older API versions.
    const ycVariant: Record<string, any> = (line.variant ?? line) as Record<string, any>;
    const ycProduct: Record<string, any> = (ycVariant.product ?? line.product ?? {}) as Record<string, any>;

    const ycVariantId: string | null =
      ycVariant.id
      ?? line.variant_id
      ?? line.productVariantId
      ?? null;
    const ycProductId: string | null =
      ycProduct.id
      ?? ycVariant.product_id
      ?? line.product_id
      ?? line.productId
      ?? null;

    const productName: string =
      ycProduct.name
      ?? line.product_name
      ?? line.name
      ?? ycVariant.name
      ?? ycProduct.title
      ?? line.title
      ?? 'Unknown Product';

    const unitPrice = Number(
      line.price ?? line.unit_price ?? ycVariant.price ?? ycProduct.price ?? 0,
    );
    const quantity = Math.max(1, Number(line.quantity ?? line.qty ?? 1));

    const image: string | null =
      coerceImage(ycVariant.image)
      ?? coerceImage(ycProduct.thumbnail)
      ?? coerceImage(ycProduct.images?.[0])
      ?? coerceImage(line.image)
      ?? coerceImage(line.thumbnail)
      ?? null;

    const variations: Record<string, any> = ycVariant.variations ?? line.variations ?? line.options ?? {};

    // 1) Try match by variant youcanId (fastest path — exact variant)
    let variant = ycVariantId
      ? await prisma.productVariant.findFirst({ where: { youcanId: ycVariantId } })
      : null;

    // 2) Match by parent product youcanId (placeholder or real) — reuse that
    //    product and attach a new variant if we don't already have this one.
    //    This prevents duplicate placeholders when several orders share the
    //    same unlinked YouCan product.
    if (!variant && ycProductId) {
      const product = await prisma.product.findFirst({ where: { youcanId: ycProductId } });
      if (product) {
        const { color, size } = extractColorAndSize(variations);
        // Try matching by color+size within this product before creating a new variant
        variant = await prisma.productVariant.findFirst({
          where: { productId: product.id, color, size },
        });
        if (!variant) {
          const variantSku = await ensureUniqueSku(
            `${product.sku}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          );
          variant = await prisma.productVariant.create({
            data: {
              productId: product.id,
              sku: variantSku,
              price: unitPrice,
              stock: 0,
              color,
              size,
              youcanId: ycVariantId,
            },
          });
        } else if (ycVariantId && !variant.youcanId) {
          // Backfill the youcanId on a previously-created variant so future
          // product imports can find+upgrade it cleanly.
          variant = await prisma.productVariant.update({
            where: { id: variant.id },
            data: { youcanId: ycVariantId },
          });
        }
      }
    }

    // 3) Fall back to creating a placeholder product + variant
    if (!variant) {
      const sku = `YC-IMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const product = await prisma.product.create({
        data: {
          name: productName,
          sku,
          basePrice: unitPrice,
          imageUrl: image,
          storeId,
          youcanId: ycProductId,
          isPlaceholder: true,
        },
      });
      const { color, size } = extractColorAndSize(variations);
      variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `${sku}-DEF`,
          price: unitPrice,
          stock: 0,
          color,
          size,
          youcanId: ycVariantId,
        },
      });
    }

    items.push({
      variantId: variant.id,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    });
  }

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const shippingPrice = yo.shipping?.price ?? 0;
  const total = subtotal + shippingPrice;

  // Reference generation uses an atomic Counter (see orders.service.ts).
  // The previous `prisma.order.count() + 1` approach collided whenever the
  // counter drifted below the live max — manual order inserts, partial
  // import retries, or cross-source creation all create that drift. We
  // retry on P2002 against `reference` and self-heal the counter once
  // per import to jump past stale rows in a single hop.
  const MAX_ATTEMPTS = 5;
  let created:
    | {
        id: string;
        reference: string;
        total: number;
        customer: { fullName: string; city: string };
      }
    | undefined;
  let healedOnce = false;
  // Preserve YouCan's original placement time so the CRM list mirrors the
  // store's chronology. Without this, every batch import collapses to
  // `now()` and the list ends up sorted by Prisma insert order (which
  // reverses YouCan's newest-first response — newest YouCan order ends up
  // at the bottom). Fall back to `now()` if the API ever returns a
  // missing/garbage timestamp so we never block an import.
  const youcanCreatedAt = (() => {
    if (!yo.created_at) return new Date();
    const parsed = new Date(yo.created_at);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  })();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const reference = await generateReference();
    try {
      created = await prisma.order.create({
        data: {
          reference,
          source: 'youcan',
          customerId,
          storeId,
          youcanOrderId: yo.id,
          subtotal,
          shippingPrice,
          total,
          confirmationNote: yo.notes,
          createdAt: youcanCreatedAt,
          items: { create: items },
          logs: {
            create: [{
              type: 'system',
              action: `Imported from YouCan (${yo.ref})`,
              performedBy: 'System',
            }],
          },
        },
        select: {
          id: true,
          reference: true,
          total: true,
          customer: { select: { fullName: true, city: true } },
        },
      });
      break;
    } catch (err) {
      if (isReferenceCollision(err)) {
        if (!healedOnce) {
          await healReferenceCounter();
          healedOnce = true;
        }
        continue;
      }
      throw err;
    }
  }
  if (!created) {
    throw {
      statusCode: 500,
      code: 'REFERENCE_GEN_FAILED',
      message: `Could not generate a unique order reference for ${yo.ref} after ${MAX_ATTEMPTS} attempts`,
    };
  }

  // Notify connected clients so tables refresh live
  emitToAll('order:created', { source: 'youcan', youcanRef: yo.ref });

  // Admin-facing notification (bell panel + toast)
  void createAdminNotification({
    kind: 'order_new',
    title: `New YouCan order #${created.reference}`,
    body: `${created.customer.fullName} · ${created.customer.city}`,
    href: '/orders',
    orderId: created.id,
  });

  return 'imported';
}

/**
 * Resolve a CRM field value from YouCan order using field mapping.
 * fieldMapping: { "city": "shipping.address.city", "address": "extra_fields.address" }
 */
function resolveField(
  crmField: string,
  order: YoucanOrder,
  mapping?: Record<string, string> | null,
): string | null {
  if (!mapping?.[crmField]) return null;
  const path = mapping[crmField];
  // Navigate the order object by dot-path
  let value: unknown = order;
  for (const key of path.split('.')) {
    if (value == null || typeof value !== 'object') return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'string' ? value : null;
}

// ─── Webhook processing ─────────────────────────────────────────────────────

export async function processWebhookOrder(storeId: string, payload: YoucanOrder) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || !store.isActive) {
    await logImport(storeId, 'webhook_order', 'warning', 'Webhook received but store is inactive');
    return;
  }
  // Webhook is the real-time channel for *new* orders placed after the
  // OAuth link — it's exactly what the admin wants when they say "auto
  // import in instant". So the autoSyncEnabled flag does NOT gate this
  // path. That flag only controls the periodic background poller, which
  // is what would otherwise mass-pull historical orders on link.

  try {
    const result = await importSingleOrder(storeId, payload, store.fieldMapping as Record<string, string> | null);
    await logImport(storeId, 'webhook_order', 'info',
      result === 'imported'
        ? `Order ${payload.ref} imported via webhook`
        : `Order ${payload.ref} skipped (already exists)`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    await logImport(storeId, 'webhook_order', 'error',
      `Failed to import order ${payload.ref} via webhook: ${msg}`,
      { error: msg, orderRef: payload.ref },
    );
    // Surface the failure live — admins/supervisors get a bell + toast
    // pointing at the integrations page so they can investigate before
    // more orders arrive and fail for the same reason.
    void createAdminNotification({
      kind: 'integration_error',
      title: `YouCan auto-import failed (${store.name})`,
      body: `Order ${payload.ref}: ${msg}`,
      href: '/integrations',
    });
  }
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ─── Logs ───────────────────────────────────────────────────────────────────

export async function getStoreLogs(storeId: string, page = 1, pageSize = 50) {
  const [data, total] = await Promise.all([
    prisma.importLog.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.importLog.count({ where: { storeId } }),
  ]);
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

async function logImport(
  storeId: string,
  type: string,
  level: 'info' | 'warning' | 'error',
  message: string,
  meta?: Record<string, unknown>,
) {
  await prisma.importLog.create({
    data: {
      storeId,
      type,
      level,
      message,
      imported: (meta?.imported as number) ?? 0,
      skipped: (meta?.skipped as number) ?? 0,
      errors: (meta?.errors as number) ?? 0,
      meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
    },
  });
}

// ─── Checkout field detection ───────────────────────────────────────────────
//
// Source of truth is YouCan's checkout settings endpoint:
//   GET /settings/checkout/fields/
// That returns *the form fields the merchant enabled on their checkout* —
// not sample values scraped from past orders. Each entry looks like:
//   { custom, name, display_name, placeholder, type, options, required, enabled }
//
// We translate every enabled field's `name` into the dot-path where its value
// will actually show up inside an incoming order, so the field-mapping UI
// shows the merchant exactly the fields a customer fills in and lets them
// map those to CRM columns.

export interface CheckoutField {
  path: string;       // dot-path in a YouCan order, e.g. "shipping.address.city"
  label: string;      // human-readable, from YouCan's display_name
  sample: string;     // always '' — sample values are not from real orders
}

// Map a YouCan checkout-field `name` → JSON dot-path inside an order payload.
// The live YouCan API returns address-ish fields flattened under `customer.*`
// (e.g. customer.city, customer.region — their "region" is actually the free-
// text street/address line). The documented nested `shipping.address.*` shape
// isn't returned in practice, so we map built-ins to customer.* paths.
// Custom checkout fields still come through under extra_fields.*.
const STANDARD_FIELD_PATHS: Record<string, string> = {
  full_name: 'customer.full_name',
  first_name: 'customer.first_name',
  last_name: 'customer.last_name',
  phone: 'customer.phone',
  phone_number: 'customer.phone',
  email: 'customer.email',
  company: 'customer.company',

  address: 'customer.region',
  address_1: 'customer.region',
  address1: 'customer.region',
  first_line: 'customer.region',

  address_2: 'customer.location',
  address2: 'customer.location',
  second_line: 'customer.location',

  city: 'customer.city',
  region: 'customer.region',
  state: 'customer.region',
  province: 'customer.region',

  zip_code: 'customer.zip_code',
  zipcode: 'customer.zip_code',
  postal_code: 'customer.zip_code',
  postcode: 'customer.zip_code',
  zip: 'customer.zip_code',

  country: 'customer.country',
  shipping_phone: 'customer.phone',

  note: 'notes',
  notes: 'notes',
  order_note: 'notes',
  comment: 'notes',
  comments: 'notes',
};

function labelFromPath(path: string): string {
  return path
    .split('.')
    .map((s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(' → ');
}

function pathForCheckoutField(field: YoucanCheckoutFieldConfig): string {
  const raw = (field.name ?? '').trim();
  if (!raw) return '';
  if (field.custom) return `extra_fields.${raw}`;
  const lower = raw.toLowerCase();
  return STANDARD_FIELD_PATHS[lower] ?? `customer.${lower}`;
}

function labelForCheckoutField(field: YoucanCheckoutFieldConfig, path: string): string {
  const display = (field.display_name ?? '').trim();
  if (display) return field.custom ? `Custom → ${display}` : display;
  return labelFromPath(path);
}

// Fallback list used when YouCan's endpoint returns nothing (brand-new store
// or a token without the `view-checkout-fields` scope). Kept generic so the
// mapping UI isn't empty.
const DEFAULT_CHECKOUT_FIELDS: CheckoutField[] = [
  { path: 'customer.full_name', label: 'Customer → Full Name', sample: '' },
  { path: 'customer.first_name', label: 'Customer → First Name', sample: '' },
  { path: 'customer.last_name', label: 'Customer → Last Name', sample: '' },
  { path: 'customer.phone', label: 'Customer → Phone', sample: '' },
  { path: 'customer.email', label: 'Customer → Email', sample: '' },
  { path: 'customer.region', label: 'Customer → Address (region)', sample: '' },
  { path: 'customer.city', label: 'Customer → City', sample: '' },
  { path: 'customer.country', label: 'Customer → Country', sample: '' },
  { path: 'notes', label: 'Notes', sample: '' },
];

export async function detectCheckoutFields(storeId: string): Promise<CheckoutField[]> {
  let configs: YoucanCheckoutFieldConfig[] = [];
  try {
    configs = await fetchCheckoutFieldsConfig(storeId);
  } catch {
    // Falls through to defaults below.
  }

  const deduped = new Map<string, CheckoutField>();
  for (const field of configs) {
    // Only surface fields the merchant actually keeps turned on. Anything
    // disabled in the YouCan admin never reaches the customer, so it's not
    // worth offering as a mapping choice.
    if (field.enabled === false) continue;

    const path = pathForCheckoutField(field);
    if (!path) continue;
    if (deduped.has(path)) continue;
    deduped.set(path, {
      path,
      label: labelForCheckoutField(field, path),
      sample: '',
    });
  }

  if (deduped.size === 0) return DEFAULT_CHECKOUT_FIELDS;

  return [...deduped.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// ─── Preview YouCan products (for selective import UI) ──────────────────────

export async function previewYoucanProducts(
  storeId: string,
  page = 1,
  search?: string,
) {
  const PAGE_SIZE = 20;

  // Normalize each raw YouCan product into the preview shape once.
  const normalize = (p: any) => ({
    id: String(p.id ?? ''),
    name: String(p.name ?? p.title ?? 'Untitled'),
    price: Number(p.price ?? 0),
    thumbnail: coerceImage(p.thumbnail) ?? coerceImage(p.images?.[0]) ?? null,
    variants_count: Number(p.variants_count ?? (Array.isArray(p.variants) ? p.variants.length : 0)),
    inventory: Number(p.inventory ?? 0),
    already_imported: false,
  });

  const trimmedSearch = search?.trim().toLowerCase();

  if (!trimmedSearch) {
    const result = await fetchProducts(storeId, page, PAGE_SIZE);
    const raw: any[] = result.data ?? [];
    return {
      products: raw.filter((p) => p && typeof p === 'object').map(normalize),
      pagination: result.pagination,
    };
  }

  // Search path: sweep up to MAX_PAGES pages from YouCan (50 per page), filter
  // client-side by name substring, then paginate the filtered list locally.
  // This gives fast "find by name" across the whole store without asking the
  // YouCan API for a filter parameter that isn't officially documented.
  const MAX_SWEEP_PAGES = 20;        // = 1,000 products sampled max
  const SERVER_PAGE_SIZE = 50;
  const collected: any[] = [];
  let serverPage = 1;
  let totalPages = 1;
  while (serverPage <= MAX_SWEEP_PAGES) {
    const res = await fetchProducts(storeId, serverPage, SERVER_PAGE_SIZE);
    for (const p of res.data ?? []) if (p && typeof p === 'object') collected.push(p);
    totalPages = res.pagination?.total_pages ?? 1;
    if (serverPage >= totalPages) break;
    serverPage++;
  }

  const matches = collected
    .map(normalize)
    .filter((p) => p.name.toLowerCase().includes(trimmedSearch));

  const filteredTotalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const clampedPage = Math.min(page, filteredTotalPages);
  const start = (clampedPage - 1) * PAGE_SIZE;
  const pageSlice = matches.slice(start, start + PAGE_SIZE);

  return {
    products: pageSlice,
    pagination: {
      total: matches.length,
      count: pageSlice.length,
      per_page: PAGE_SIZE,
      current_page: clampedPage,
      total_pages: filteredTotalPages,
      links: {},
    },
  };
}

// ─── One-shot backfill: re-fetch every imported YouCan order and patch ──────
// `Order.createdAt` to the original placement timestamp from YouCan.
//
// Why this exists: a previous version of `importSingleOrder()` didn't pass a
// `createdAt` so every imported order got Prisma's default (`now()`). That
// collapsed batches to one moment and reversed YouCan's chronology in the
// CRM list. The current code preserves `yo.created_at`, but historical rows
// still have wrong dates. This function repairs them.
//
// Strategy:
// - Group orders by storeId so we can use the right OAuth token.
// - For each order, hit YouCan's single-order endpoint and read `created_at`.
// - Skip rows whose stored `createdAt` already matches (within 1s) — it's
//   either already correct or someone manually adjusted it.
// - Fail-soft per row: a single 404 / network blip doesn't kill the run.
//
// Returns per-store counters so the UI can show what happened.
export interface BackfillResult {
  scanned: number;
  updated: number;
  unchanged: number;
  failed: number;
  perStore: Array<{
    storeId: string;
    storeName: string;
    scanned: number;
    updated: number;
    unchanged: number;
    failed: number;
  }>;
}

export async function backfillYoucanOrderCreatedAt(): Promise<BackfillResult> {
  const orders = await prisma.order.findMany({
    where: { source: 'youcan', youcanOrderId: { not: null } },
    select: {
      id: true,
      youcanOrderId: true,
      storeId: true,
      createdAt: true,
    },
  });

  // Bucket by store so we can label results and reuse one OAuth context.
  const byStore = new Map<string, typeof orders>();
  for (const o of orders) {
    if (!o.storeId) continue;
    const list = byStore.get(o.storeId) ?? [];
    list.push(o);
    byStore.set(o.storeId, list);
  }

  const stores = await prisma.store.findMany({
    where: { id: { in: [...byStore.keys()] } },
    select: { id: true, name: true },
  });
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  const result: BackfillResult = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    perStore: [],
  };

  for (const [storeId, group] of byStore) {
    const perStore = {
      storeId,
      storeName: storeNameById.get(storeId) ?? storeId,
      scanned: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    };

    for (const o of group) {
      if (!o.youcanOrderId) continue;
      perStore.scanned += 1;
      try {
        const fresh = await fetchOrder(storeId, o.youcanOrderId);
        const raw = (fresh as { created_at?: string | number | null })?.created_at;
        if (!raw) {
          perStore.failed += 1;
          continue;
        }
        const youcanCreatedAt = new Date(raw);
        if (Number.isNaN(youcanCreatedAt.getTime())) {
          perStore.failed += 1;
          continue;
        }
        // Skip if the existing value is already within 1 second of YouCan's
        // — saves a write and surfaces "already correct" in the report.
        const diff = Math.abs(o.createdAt.getTime() - youcanCreatedAt.getTime());
        if (diff < 1000) {
          perStore.unchanged += 1;
          continue;
        }
        await prisma.order.update({
          where: { id: o.id },
          data: { createdAt: youcanCreatedAt },
        });
        perStore.updated += 1;
      } catch (err) {
        perStore.failed += 1;
        console.error(
          `[backfill] order ${o.id} (yc:${o.youcanOrderId}) failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    result.scanned += perStore.scanned;
    result.updated += perStore.updated;
    result.unchanged += perStore.unchanged;
    result.failed += perStore.failed;
    result.perStore.push(perStore);
  }

  return result;
}
