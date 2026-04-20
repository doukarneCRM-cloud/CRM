import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Trash2, Zap } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import {
  productsApi,
  type ProductDetail,
  type ProductMeasurements,
  type VariantInput,
} from '@/services/productsApi';
import { supportApi } from '@/services/ordersApi';
import type { AgentOption } from '@/types/orders';
import { apiErrorMessage } from '@/lib/apiError';
import { TagInput } from './TagInput';
import { ImageUploader } from './ImageUploader';
import { MeasurementEditor } from './MeasurementEditor';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  product: ProductDetail | null;
}

interface VariantDraft extends VariantInput {
  key: string;
}

function randKey() {
  return Math.random().toString(36).slice(2, 10);
}

function slugPart(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const up = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return up ? up.slice(0, 4) : fallback;
}

function buildSku(productSku: string, color: string | null, size: string | null) {
  const parts = [productSku.trim().toUpperCase() || 'SKU'];
  if (color) parts.push(slugPart(color, 'CLR'));
  if (size) parts.push(slugPart(size, 'SZ'));
  return parts.join('-');
}

function toDrafts(product: ProductDetail | null): VariantDraft[] {
  if (!product) return [];
  return product.variants.map((v) => ({
    key: v.id,
    id: v.id,
    color: v.color ?? '',
    size: v.size ?? '',
    sku: v.sku,
    price: v.price,
    stock: v.stock,
  }));
}

export function ProductEditModal({ open, onClose, onSaved, product }: Props) {
  const isEdit = product != null;

  // ── Core product fields ─────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [basePrice, setBasePrice] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [assignedAgentId, setAssignedAgentId] = useState<string>('');
  const [agents, setAgents] = useState<AgentOption[]>([]);

  // ── Variant builder ─────────────────────────────────────────────────────
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [bulkPrice, setBulkPrice] = useState<number | ''>('');
  const [bulkStock, setBulkStock] = useState<number | ''>('');
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [measurements, setMeasurements] = useState<ProductMeasurements | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? '');
    setSku(product?.sku ?? '');
    setDescription(product?.description ?? '');
    setImageUrl(product?.imageUrl ?? '');
    setBasePrice(product?.basePrice ?? 0);
    setIsActive(product?.isActive ?? true);
    setAssignedAgentId(product?.assignedAgentId ?? '');
    setVariants(toDrafts(product));
    // Pre-populate options from existing variants so edit mode keeps context
    const uniqSizes = new Set<string>();
    const uniqColors = new Set<string>();
    for (const v of product?.variants ?? []) {
      if (v.size) uniqSizes.add(v.size);
      if (v.color) uniqColors.add(v.color);
    }
    setSizes([...uniqSizes]);
    setColors([...uniqColors]);
    setBulkPrice('');
    setBulkStock('');
    setMeasurements(product?.measurements ?? null);
    setError(null);
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    supportApi.agents().then(setAgents).catch(() => setAgents([]));
  }, [open]);

  // ── Generate: cartesian product of sizes × colors ─────────────────────
  const handleGenerate = () => {
    const combos: Array<{ size: string; color: string }> = [];
    const s = sizes.length ? sizes : [''];
    const c = colors.length ? colors : [''];
    if (s.length === 1 && s[0] === '' && c.length === 1 && c[0] === '') return;
    for (const color of c) {
      for (const size of s) combos.push({ size, color });
    }

    // Keep existing variants that already match a combo; add new combos only.
    const existingKey = new Set(
      variants.map((v) => `${(v.color ?? '').toLowerCase()}::${(v.size ?? '').toLowerCase()}`),
    );
    const additions: VariantDraft[] = [];
    for (const { size, color } of combos) {
      const key = `${color.toLowerCase()}::${size.toLowerCase()}`;
      if (existingKey.has(key)) continue;
      additions.push({
        key: randKey(),
        color: color || null,
        size: size || null,
        sku: buildSku(sku || 'SKU', color || null, size || null),
        price: typeof bulkPrice === 'number' && bulkPrice >= 0 ? bulkPrice : basePrice,
        stock: typeof bulkStock === 'number' && bulkStock >= 0 ? bulkStock : 0,
      });
    }
    if (additions.length === 0) return;
    setVariants((prev) => [...prev, ...additions]);
  };

  // ── Bulk apply price / stock to all variants ─────────────────────────
  const applyBulkPrice = () => {
    if (typeof bulkPrice !== 'number' || bulkPrice < 0) return;
    setVariants((prev) => prev.map((v) => ({ ...v, price: bulkPrice })));
  };
  const applyBulkStock = () => {
    if (typeof bulkStock !== 'number' || bulkStock < 0) return;
    setVariants((prev) => prev.map((v) => ({ ...v, stock: bulkStock })));
  };

  // ── Row editing ─────────────────────────────────────────────────────────
  const updateVariant = (key: string, patch: Partial<VariantDraft>) => {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  };

  const removeVariant = (key: string) => {
    setVariants((prev) => prev.filter((v) => v.key !== key));
  };

  const canSave = useMemo(() => {
    if (!name.trim() || !sku.trim() || basePrice < 0) return false;
    if (variants.length === 0) return false;
    return variants.every(
      (v) => v.sku.trim().length > 0 && v.price >= 0 && v.stock >= 0,
    );
  }, [name, sku, basePrice, variants]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payloadVariants: VariantInput[] = variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        color: (v.color ?? '').toString().trim() || null,
        size: (v.size ?? '').toString().trim() || null,
        sku: v.sku.trim(),
        price: Number(v.price),
        stock: Number(v.stock),
      }));

      const cleanedMeasurements =
        measurements && measurements.columns.length > 0 && measurements.rows.length > 0
          ? measurements
          : null;

      if (isEdit && product) {
        await productsApi.update(product.id, {
          name: name.trim(),
          sku: sku.trim(),
          description: description.trim() || null,
          imageUrl: imageUrl.trim() || null,
          basePrice: Number(basePrice),
          isActive,
          assignedAgentId: assignedAgentId || null,
          measurements: cleanedMeasurements,
          variants: payloadVariants,
        });
      } else {
        await productsApi.create({
          name: name.trim(),
          sku: sku.trim(),
          description: description.trim() || null,
          imageUrl: imageUrl.trim() || null,
          basePrice: Number(basePrice),
          assignedAgentId: assignedAgentId || null,
          measurements: cleanedMeasurements,
          variants: payloadVariants,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save product'));
    } finally {
      setSaving(false);
    }
  };

  const generateDisabled = sizes.length === 0 && colors.length === 0;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit product' : 'New product'}
      size="2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {error ? (
            <p className="flex-1 text-xs font-medium text-red-500">{error}</p>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex items-center gap-2">
            <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </CRMButton>
            <CRMButton onClick={handleSave} loading={saving} disabled={!canSave}>
              {isEdit ? 'Save changes' : 'Create product'}
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* ── Top row: image preview + basics ───────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
          <ImageUploader value={imageUrl || null} onChange={(u) => setImageUrl(u ?? '')} />

          <div className="flex flex-col gap-3">
            <CRMInput
              label="Product name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Anaqa Tee"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CRMInput
                label="SKU"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="TEE-001"
              />
              <CRMInput
                label="Base price (MAD)"
                required
                type="number"
                min={0}
                step={1}
                value={basePrice}
                onChange={(e) => setBasePrice(Number(e.target.value))}
              />
            </div>
            {isEdit && (
              <label className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                Active (uncheck to hide this product)
              </label>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">
                Default agent
                <span className="ml-1 text-[10px] font-normal text-gray-400">
                  · used when auto-assign is set to "By Product"
                </span>
              </label>
              <select
                value={assignedAgentId}
                onChange={(e) => setAssignedAgentId(e.target.value)}
                className="rounded-input border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">None (fall back to round-robin)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-input border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Short description (optional)"
          />
        </div>

        {/* ── Variant builder ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 rounded-card border border-gray-100 bg-accent/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Variants</h4>
              <p className="text-[11px] text-gray-500">
                Add options and generate combinations automatically.
              </p>
            </div>
            <span className="rounded-badge bg-white px-2 py-0.5 text-[10px] font-semibold text-primary">
              {variants.length} total
            </span>
          </div>

          {/* Options row */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
            <TagInput
              label="Option 1 (e.g. Size)"
              placeholder="S, M, L…"
              values={sizes}
              onChange={setSizes}
            />
            <TagInput
              label="Option 2 (e.g. Color)"
              placeholder="Red, Blue…"
              values={colors}
              onChange={setColors}
            />
            <div className="flex items-end">
              <CRMButton
                variant="secondary"
                leftIcon={<Sparkles size={14} />}
                onClick={handleGenerate}
                disabled={generateDisabled}
                className="w-full md:w-auto"
              >
                Generate
              </CRMButton>
            </div>
          </div>

          {/* Bulk apply row */}
          {variants.length > 0 && (
            <div className="grid grid-cols-1 gap-3 border-t border-gray-200/70 pt-3 md:grid-cols-[1fr_1fr]">
              <div className="flex items-end gap-2">
                <CRMInput
                  wrapperClassName="flex-1"
                  label="Bulk price (MAD)"
                  type="number"
                  min={0}
                  value={bulkPrice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBulkPrice(v === '' ? '' : Number(v));
                  }}
                  placeholder="Apply to all variants"
                />
                <CRMButton
                  variant="ghost"
                  size="sm"
                  leftIcon={<Zap size={12} />}
                  onClick={applyBulkPrice}
                  disabled={typeof bulkPrice !== 'number' || bulkPrice < 0}
                >
                  Apply
                </CRMButton>
              </div>
              <div className="flex items-end gap-2">
                <CRMInput
                  wrapperClassName="flex-1"
                  label="Bulk stock"
                  type="number"
                  min={0}
                  value={bulkStock}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBulkStock(v === '' ? '' : Number(v));
                  }}
                  placeholder="Apply to all variants"
                />
                <CRMButton
                  variant="ghost"
                  size="sm"
                  leftIcon={<Zap size={12} />}
                  onClick={applyBulkStock}
                  disabled={typeof bulkStock !== 'number' || bulkStock < 0}
                >
                  Apply
                </CRMButton>
              </div>
            </div>
          )}

          {/* Variant rows */}
          {variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 rounded-card border border-dashed border-gray-200 bg-white/50 py-6 text-center">
              <p className="text-xs font-semibold text-gray-600">No variants yet</p>
              <p className="text-[11px] text-gray-400">
                Add one or both option lists above, then click <span className="font-medium text-primary">Generate</span>.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-gray-100 bg-white">
              <div className="grid grid-cols-12 gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <div className="col-span-3">Size</div>
                <div className="col-span-3">Color</div>
                <div className="col-span-3">SKU</div>
                <div className="col-span-1 text-right">Price</div>
                <div className="col-span-1 text-right">Stock</div>
                <div className="col-span-1" />
              </div>
              <ul className="max-h-[280px] overflow-y-auto">
                {variants.map((v) => (
                  <li
                    key={v.key}
                    className="grid grid-cols-12 items-center gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0"
                  >
                    <input
                      className="col-span-3 rounded-input border border-gray-200 px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      value={v.size ?? ''}
                      onChange={(e) => updateVariant(v.key, { size: e.target.value })}
                      placeholder="L"
                    />
                    <input
                      className="col-span-3 rounded-input border border-gray-200 px-2 py-1.5 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      value={v.color ?? ''}
                      onChange={(e) => updateVariant(v.key, { color: e.target.value })}
                      placeholder="Black"
                    />
                    <input
                      className="col-span-3 rounded-input border border-gray-200 px-2 py-1.5 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      value={v.sku}
                      onChange={(e) => updateVariant(v.key, { sku: e.target.value })}
                      placeholder="TEE-001-BLK-L"
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-1 rounded-input border border-gray-200 px-2 py-1.5 text-right text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      value={v.price}
                      onChange={(e) => updateVariant(v.key, { price: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      min={0}
                      className="col-span-1 rounded-input border border-gray-200 px-2 py-1.5 text-right text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                      value={v.stock}
                      onChange={(e) => updateVariant(v.key, { stock: Number(e.target.value) })}
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(v.key)}
                      className="col-span-1 flex h-7 w-7 items-center justify-center justify-self-end rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label="Remove variant"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Measurements chart (free-form) ───────────────────────────── */}
        <MeasurementEditor value={measurements} onChange={setMeasurements} />

      </div>
    </GlassModal>
  );
}
