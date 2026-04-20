import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { emitToRoom } from '../../shared/socket';
import { triggerOutOfStock } from '../../utils/stockEffects';
import type {
  CreateProductInput,
  UpdateProductInput,
  ProductQueryInput,
  UpdateStockInput,
} from './products.schema';

const PRODUCT_INCLUDE = {
  variants: {
    select: { id: true, color: true, size: true, sku: true, stock: true, price: true },
    orderBy: [{ color: 'asc' }, { size: 'asc' }] as const,
  },
} satisfies Prisma.ProductInclude;

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listProducts(query: ProductQueryInput) {
  // Hide placeholder products auto-created during YouCan order import — they represent
  // unlinked YouCan items awaiting a real product import, not real catalog entries.
  // Also hide soft-deleted products (deletedAt set). The row itself sticks around so
  // historical orders still render with product name/image, but the catalog ignores it.
  const where: Prisma.ProductWhereInput = { isPlaceholder: false, deletedAt: null };
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    const q = query.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: 'asc' },
    include: PRODUCT_INCLUDE,
  });
  return { data: products };
}

// ─── Single ───────────────────────────────────────────────────────────────────

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Product not found' };
  return product;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createProduct(input: CreateProductInput) {
  const variantSkus = input.variants.map((v) => v.sku);
  if (new Set(variantSkus).size !== variantSkus.length) {
    throw {
      statusCode: 400,
      code: 'DUPLICATE_VARIANT_SKU',
      message: 'Variant SKUs must be unique within the product',
    };
  }

  const [existing, skuClash] = await Promise.all([
    prisma.product.findUnique({ where: { sku: input.sku }, select: { id: true } }),
    prisma.productVariant.findFirst({
      where: { sku: { in: variantSkus } },
      select: { sku: true },
    }),
  ]);
  if (existing) {
    throw {
      statusCode: 409,
      code: 'DUPLICATE_SKU',
      message: 'A product with this SKU already exists',
    };
  }
  if (skuClash) {
    throw {
      statusCode: 409,
      code: 'DUPLICATE_VARIANT_SKU',
      message: `Variant SKU "${skuClash.sku}" already exists`,
    };
  }

  return prisma.product.create({
    data: {
      name: input.name,
      sku: input.sku,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      basePrice: input.basePrice,
      assignedAgentId: input.assignedAgentId ?? null,
      measurements: input.measurements ?? Prisma.JsonNull,
      variants: {
        create: input.variants.map((v) => ({
          color: v.color ?? null,
          size: v.size ?? null,
          sku: v.sku,
          price: v.price,
          stock: v.stock,
        })),
      },
    },
    include: PRODUCT_INCLUDE,
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { id },
    include: { variants: { select: { id: true, sku: true, stock: true } } },
  });
  if (!existing) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Product not found' };

  const { variants, assignedAgentId, measurements, ...productFields } = input;

  const stockTriggers: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...(productFields.name !== undefined && { name: productFields.name }),
        ...(productFields.sku !== undefined && { sku: productFields.sku }),
        ...(productFields.description !== undefined && { description: productFields.description }),
        ...(productFields.imageUrl !== undefined && { imageUrl: productFields.imageUrl }),
        ...(productFields.basePrice !== undefined && { basePrice: productFields.basePrice }),
        ...(productFields.isActive !== undefined && { isActive: productFields.isActive }),
        ...(assignedAgentId !== undefined && { assignedAgentId }),
        ...(measurements !== undefined && { measurements: measurements ?? Prisma.JsonNull }),
      },
    });

    if (!variants) return;

    const stockById = new Map(existing.variants.map((v) => [v.id, v.stock]));
    const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id as string));
    const existingIds = new Set(existing.variants.map((v) => v.id));

    // Variants present before but missing from the payload → remove (only if unused).
    const toRemove = [...existingIds].filter((vid) => !incomingIds.has(vid));
    if (toRemove.length) {
      const referenced = await tx.orderItem.findMany({
        where: { variantId: { in: toRemove } },
        select: { variantId: true },
        take: 1,
      });
      if (referenced.length > 0) {
        throw {
          statusCode: 409,
          code: 'VARIANT_IN_USE',
          message: 'Cannot remove a variant that has order history — set its stock to 0 instead',
        };
      }
      await tx.productVariant.deleteMany({ where: { id: { in: toRemove } } });
    }

    // Pre-check SKU clashes for all new variants in one query.
    const newSkus = variants.filter((v) => !v.id || !existingIds.has(v.id)).map((v) => v.sku);
    if (newSkus.length) {
      const clash = await tx.productVariant.findFirst({
        where: { sku: { in: newSkus } },
        select: { sku: true },
      });
      if (clash) {
        throw {
          statusCode: 409,
          code: 'DUPLICATE_VARIANT_SKU',
          message: `Variant SKU "${clash.sku}" already exists`,
        };
      }
    }

    for (const v of variants) {
      if (v.id && existingIds.has(v.id)) {
        const beforeStock = stockById.get(v.id) ?? 0;
        await tx.productVariant.update({
          where: { id: v.id },
          data: {
            color: v.color ?? null,
            size: v.size ?? null,
            sku: v.sku,
            price: v.price,
            stock: v.stock,
          },
        });
        if (beforeStock > 0 && v.stock === 0) stockTriggers.push(v.id);
      } else {
        await tx.productVariant.create({
          data: {
            productId: id,
            color: v.color ?? null,
            size: v.size ?? null,
            sku: v.sku,
            price: v.price,
            stock: v.stock,
          },
        });
      }
    }
  });

  for (const variantId of stockTriggers) {
    await triggerOutOfStock(variantId);
  }

  return getProductById(id);
}

// ─── Delete (tombstone) ───────────────────────────────────────────────────────
//
// "Hard-delete" from the user's perspective: the product disappears from the
// catalog immediately. Under the hood it's a tombstone — we set `deletedAt` and
// flip `isActive` false. The row stays so historical orders keep rendering
// with the original product name/image; the UI paints those orders red as
// "not tracked" because the product is no longer maintained.
//
// Confirmed/delivered orders are not touched — status, totals, and line items
// all stay exactly as they were.
export async function deactivateProduct(id: string) {
  const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Product not found' };
  return prisma.product.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
    include: PRODUCT_INCLUDE,
  });
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export async function updateVariantStock(
  productId: string,
  variantId: string,
  input: UpdateStockInput,
) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, productId: true, stock: true },
  });
  if (!variant || variant.productId !== productId) {
    throw { statusCode: 404, code: 'NOT_FOUND', message: 'Variant not found' };
  }

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock: input.stock },
    select: { id: true, color: true, size: true, sku: true, stock: true, price: true },
  });

  // Broadcast to dashboards / stock matrix views regardless of value.
  emitToRoom('orders:all', 'stock:updated', { variantId, stock: updated.stock });

  // Cascade: if stock just hit 0, flip pending orders to out_of_stock.
  if (variant.stock > 0 && updated.stock === 0) {
    await triggerOutOfStock(variantId);
  }

  return updated;
}
