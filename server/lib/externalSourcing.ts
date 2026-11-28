import { execute, queryAll, queryOne, type Db } from '../db.js';
import {
  EXTERNAL_FIXED_MARKUP_PAISE,
  type ImageAuthorizationStatus,
  type ProductSourcingSummary,
  type ProductVariant,
  type ReturnShippingBearer,
} from '../../shared/types.js';
import { countDescriptionWords, findProtectedClaimViolations, validateProductCompliance } from './productCompliance.js';
import { badRequest } from './http.js';

export interface ExternalPricingInput {
  supplierPricePaise: number;
  supplierShippingPaise?: number;
  otherSourcingCostPaise?: number;
  markupPaise?: number;
}

export interface ExternalPricingBreakdown {
  supplierPricePaise: number;
  supplierShippingPaise: number;
  otherSourcingCostPaise: number;
  landedCostPaise: number;
  markupPaise: number;
  recommendedSellingPricePaise: number;
}

export function calculateExternalPricing(input: ExternalPricingInput): ExternalPricingBreakdown {
  const supplierPricePaise = Math.max(0, Math.round(input.supplierPricePaise || 0));
  const supplierShippingPaise = Math.max(0, Math.round(input.supplierShippingPaise || 0));
  const otherSourcingCostPaise = Math.max(0, Math.round(input.otherSourcingCostPaise || 0));
  const markupPaise = Math.max(EXTERNAL_FIXED_MARKUP_PAISE, Math.round(input.markupPaise ?? EXTERNAL_FIXED_MARKUP_PAISE));
  const landedCostPaise = supplierPricePaise + supplierShippingPaise + otherSourcingCostPaise;
  return {
    supplierPricePaise,
    supplierShippingPaise,
    otherSourcingCostPaise,
    landedCostPaise,
    markupPaise,
    recommendedSellingPricePaise: landedCostPaise + markupPaise,
  };
}

export function parseProductVariants(raw: string | null | undefined): ProductVariant[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const list: ProductVariant[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const v = item as Record<string, unknown>;
      const id = typeof v.id === 'string' && v.id.trim() ? v.id.trim().slice(0, 60) : '';
      const label = typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 80) : '';
      if (!id || !label) continue;
      list.push({
        id,
        label,
        color: typeof v.color === 'string' && v.color.trim() ? v.color.trim().slice(0, 40) : null,
        colorHex: typeof v.colorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.colorHex.trim()) ? v.colorHex.trim() : null,
        size: typeof v.size === 'string' && v.size.trim() ? v.size.trim().slice(0, 40) : null,
        material: typeof v.material === 'string' && v.material.trim() ? v.material.trim().slice(0, 80) : null,
        skuSuffix: typeof v.skuSuffix === 'string' && v.skuSuffix.trim() ? v.skuSuffix.trim().slice(0, 24) : null,
        priceDeltaPaise:
          typeof v.priceDeltaPaise === 'number' && Number.isFinite(v.priceDeltaPaise)
            ? Math.round(v.priceDeltaPaise)
            : 0,
        available: v.available !== false,
        stockQty:
          typeof v.stockQty === 'number' && Number.isFinite(v.stockQty) && v.stockQty >= 0
            ? Math.round(v.stockQty)
            : null,
      });
    }
    return list;
  } catch {
    return [];
  }
}

export interface ProductSourcingRow {
  product_id: string;
  sourcing_channel: string;
  source_url: string | null;
  supplier_name: string | null;
  supplier_catalog_id: string | null;
  supplier_sku_ref: string | null;
  supplier_price_paise: number;
  supplier_shipping_paise: number;
  other_sourcing_cost_paise: number;
  landed_cost_paise: number;
  markup_paise: number;
  price_floor_locked: number;
  price_verified: number;
  last_price_verified_at: string | null;
  supplier_available: number;
  availability_verified: number;
  last_availability_verified_at: string | null;
  image_authorization_status: string;
  image_authorization_note: string | null;
  supplier_return_policy_note: string | null;
  internal_notes: string | null;
}

export function mapSourcingSummary(row: ProductSourcingRow): ProductSourcingSummary {
  const landed = Number(row.landed_cost_paise ?? 0);
  const markup = Math.max(EXTERNAL_FIXED_MARKUP_PAISE, Number(row.markup_paise ?? EXTERNAL_FIXED_MARKUP_PAISE));
  return {
    productId: row.product_id,
    sourcingChannel: row.sourcing_channel || 'external',
    sourceUrl: row.source_url ?? null,
    supplierName: row.supplier_name ?? null,
    supplierCatalogId: row.supplier_catalog_id ?? null,
    supplierSkuRef: row.supplier_sku_ref ?? null,
    supplierPricePaise: Number(row.supplier_price_paise ?? 0),
    supplierShippingPaise: Number(row.supplier_shipping_paise ?? 0),
    otherSourcingCostPaise: Number(row.other_sourcing_cost_paise ?? 0),
    landedCostPaise: landed,
    markupPaise: markup,
    recommendedSellingPricePaise: landed + markup,
    priceFloorLocked: row.price_floor_locked === 1,
    priceVerified: row.price_verified === 1,
    lastPriceVerifiedAt: row.last_price_verified_at ?? null,
    supplierAvailable: row.supplier_available === 1,
    availabilityVerified: row.availability_verified === 1,
    lastAvailabilityVerifiedAt: row.last_availability_verified_at ?? null,
    imageAuthorizationStatus: (row.image_authorization_status as ImageAuthorizationStatus) || 'pending_authorization',
    imageAuthorizationNote: row.image_authorization_note ?? null,
    supplierReturnPolicyNote: row.supplier_return_policy_note ?? null,
    internalNotes: row.internal_notes ?? null,
  };
}

export function getProductSourcing(db: Db, productId: string): ProductSourcingSummary | null {
  const row = queryOne<ProductSourcingRow>(db, 'SELECT * FROM product_sourcing WHERE product_id = ?', productId);
  return row ? mapSourcingSummary(row) : null;
}

export function upsertProductSourcing(
  db: Db,
  productId: string,
  input: {
    sourcingChannel?: string;
    sourceUrl?: string | null;
    supplierName?: string | null;
    supplierCatalogId?: string | null;
    supplierSkuRef?: string | null;
    supplierPricePaise?: number;
    supplierShippingPaise?: number;
    otherSourcingCostPaise?: number;
    markupPaise?: number;
    priceFloorLocked?: boolean;
    priceVerified?: boolean;
    supplierAvailable?: boolean;
    availabilityVerified?: boolean;
    imageAuthorizationStatus?: ImageAuthorizationStatus;
    imageAuthorizationNote?: string | null;
    supplierReturnPolicyNote?: string | null;
    internalNotes?: string | null;
    verifiedBy?: string | null;
  },
): ProductSourcingSummary {
  const existing = queryOne<ProductSourcingRow>(db, 'SELECT * FROM product_sourcing WHERE product_id = ?', productId);
  const now = new Date().toISOString();

  const supplierPricePaise = input.supplierPricePaise ?? existing?.supplier_price_paise ?? 0;
  const supplierShippingPaise = input.supplierShippingPaise ?? existing?.supplier_shipping_paise ?? 0;
  const otherSourcingCostPaise = input.otherSourcingCostPaise ?? existing?.other_sourcing_cost_paise ?? 0;
  const markupPaise = Math.max(
    EXTERNAL_FIXED_MARKUP_PAISE,
    input.markupPaise ?? existing?.markup_paise ?? EXTERNAL_FIXED_MARKUP_PAISE,
  );
  const calc = calculateExternalPricing({
    supplierPricePaise,
    supplierShippingPaise,
    otherSourcingCostPaise,
    markupPaise,
  });

  const nextPriceVerified =
    input.priceVerified !== undefined ? (input.priceVerified ? 1 : 0) : (existing?.price_verified ?? 0);
  const nextAvailVerified =
    input.availabilityVerified !== undefined ? (input.availabilityVerified ? 1 : 0) : (existing?.availability_verified ?? 0);
  const nextLastPriceAt =
    input.priceVerified === true ? now : input.priceVerified === false ? null : (existing?.last_price_verified_at ?? null);
  const nextLastAvailAt =
    input.availabilityVerified === true
      ? now
      : input.availabilityVerified === false
        ? null
        : (existing?.last_availability_verified_at ?? null);

  execute(
    db,
    `INSERT INTO product_sourcing (
       product_id, sourcing_channel, source_url, supplier_name, supplier_catalog_id, supplier_sku_ref,
       supplier_price_paise, supplier_shipping_paise, other_sourcing_cost_paise, landed_cost_paise, markup_paise,
       price_floor_locked, price_verified, last_price_verified_at, supplier_available, availability_verified,
       last_availability_verified_at, image_authorization_status, image_authorization_note,
       supplier_return_policy_note, internal_notes, verified_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       sourcing_channel = excluded.sourcing_channel,
       source_url = excluded.source_url,
       supplier_name = excluded.supplier_name,
       supplier_catalog_id = excluded.supplier_catalog_id,
       supplier_sku_ref = excluded.supplier_sku_ref,
       supplier_price_paise = excluded.supplier_price_paise,
       supplier_shipping_paise = excluded.supplier_shipping_paise,
       other_sourcing_cost_paise = excluded.other_sourcing_cost_paise,
       landed_cost_paise = excluded.landed_cost_paise,
       markup_paise = excluded.markup_paise,
       price_floor_locked = excluded.price_floor_locked,
       price_verified = excluded.price_verified,
       last_price_verified_at = excluded.last_price_verified_at,
       supplier_available = excluded.supplier_available,
       availability_verified = excluded.availability_verified,
       last_availability_verified_at = excluded.last_availability_verified_at,
       image_authorization_status = excluded.image_authorization_status,
       image_authorization_note = excluded.image_authorization_note,
       supplier_return_policy_note = excluded.supplier_return_policy_note,
       internal_notes = excluded.internal_notes,
       verified_by = COALESCE(excluded.verified_by, product_sourcing.verified_by),
       updated_at = excluded.updated_at`,
    productId,
    input.sourcingChannel ?? existing?.sourcing_channel ?? 'external',
    input.sourceUrl !== undefined ? input.sourceUrl : (existing?.source_url ?? null),
    input.supplierName !== undefined ? input.supplierName : (existing?.supplier_name ?? null),
    input.supplierCatalogId !== undefined ? input.supplierCatalogId : (existing?.supplier_catalog_id ?? null),
    input.supplierSkuRef !== undefined ? input.supplierSkuRef : (existing?.supplier_sku_ref ?? null),
    calc.supplierPricePaise,
    calc.supplierShippingPaise,
    calc.otherSourcingCostPaise,
    calc.landedCostPaise,
    calc.markupPaise,
    input.priceFloorLocked !== undefined ? (input.priceFloorLocked ? 1 : 0) : (existing?.price_floor_locked ?? 1),
    nextPriceVerified,
    nextLastPriceAt,
    input.supplierAvailable !== undefined ? (input.supplierAvailable ? 1 : 0) : (existing?.supplier_available ?? 0),
    nextAvailVerified,
    nextLastAvailAt,
    input.imageAuthorizationStatus ?? existing?.image_authorization_status ?? 'pending_authorization',
    input.imageAuthorizationNote !== undefined ? input.imageAuthorizationNote : (existing?.image_authorization_note ?? null),
    input.supplierReturnPolicyNote !== undefined
      ? input.supplierReturnPolicyNote
      : (existing?.supplier_return_policy_note ?? null),
    input.internalNotes !== undefined ? input.internalNotes : (existing?.internal_notes ?? null),
    input.verifiedBy ?? null,
    now,
    now,
  );

  // Sync summarized cost columns on products table cleanly for legacy cost calculators without overwriting packaging cost
  execute(
    db,
    'UPDATE products SET estimated_cost_paise = ?, updated_at = ? WHERE id = ?',
    calc.landedCostPaise,
    now,
    productId,
  );

  return getProductSourcing(db, productId)!;
}

/**
 * Enforces fixed ₹100 minimum markup whenever a curated/external product has verified landed cost.
 */
export function enforceExternalPriceFloor(
  db: Db,
  productId: string,
  sellingPricePaise: number,
  overrideLandedPaise?: number,
): void {
  const sourcing = getProductSourcing(db, productId);
  if (!sourcing || !sourcing.priceFloorLocked) return;
  const landed = overrideLandedPaise ?? sourcing.landedCostPaise;
  if (landed <= 0 && !sourcing.priceVerified) return;
  const minAllowed = landed + Math.max(EXTERNAL_FIXED_MARKUP_PAISE, sourcing.markupPaise);
  if (sellingPricePaise < minAllowed) {
    throw badRequest(
      `Selling price cannot be below total landed sourcing cost + ₹100 markup (minimum ₹${(minAllowed / 100).toFixed(2)}).`,
      {
        pricePaise: `Must be at least ₹${(minAllowed / 100).toFixed(2)} (landed ₹${(landed / 100).toFixed(2)} + ₹100 markup).`,
      },
    );
  }
}

export interface ExternalPublishGateResult {
  ready: boolean;
  blockers: string[];
  fieldErrors: Record<string, string>;
}

/**
 * Evaluates full verification readiness before an EXTERNAL_SUPPLIER listing can be submitted or published.
 */
export function evaluateExternalProductReadiness(
  db: Db,
  productId: string,
): ExternalPublishGateResult {
  const product = queryOne<{
    id: string;
    name: string;
    short_description: string;
    description: string;
    price_paise: number;
    weight_g: number | null;
    dimensions: string | null;
    materials: string | null;
    care_instructions: string | null;
    compliance_json: string | null;
    variety_grade: string | null;
    harvest_info: string | null;
    dispatch_conditions: string | null;
    fulfilment_method: string | null;
    origin_verified: number;
    gi_tagged: number;
    return_policy_override: string | null;
    category_slug: string | null;
    category_name: string | null;
  }>(
    db,
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?`,
    productId,
  );
  if (!product) {
    return { ready: false, blockers: ['Product record not found.'], fieldErrors: { product: 'Not found' } };
  }

  const blockers: string[] = [];
  const fieldErrors: Record<string, string> = {};

  if (product.fulfilment_method !== 'EXTERNAL_SUPPLIER') {
    return { ready: true, blockers, fieldErrors };
  }

  const sourcing = getProductSourcing(db, productId);
  if (!sourcing || !sourcing.priceVerified || sourcing.landedCostPaise <= 0) {
    const msg = 'Supplier base price and landed sourcing cost must be verified before publishing.';
    blockers.push(msg);
    fieldErrors.priceVerified = msg;
  } else {
    const minRequired = sourcing.landedCostPaise + Math.max(EXTERNAL_FIXED_MARKUP_PAISE, sourcing.markupPaise);
    if (product.price_paise < minRequired) {
      const msg = `Customer selling price (₹${(product.price_paise / 100).toFixed(2)}) must be at least Total Landed Cost + ₹100 (₹${(minRequired / 100).toFixed(2)}).`;
      blockers.push(msg);
      fieldErrors.pricePaise = msg;
    }
  }

  if (!sourcing || !sourcing.availabilityVerified || !sourcing.supplierAvailable) {
    const msg = 'Live supplier stock/availability must be verified before publishing.';
    blockers.push(msg);
    fieldErrors.availabilityVerified = msg;
  }

  const images = queryAll<{ url: string; alt: string; credit: string | null }>(
    db,
    'SELECT url, alt, credit FROM product_images WHERE product_id = ?',
    productId,
  );
  if (images.length === 0) {
    const msg = 'Upload at least one verified product photograph before publishing.';
    blockers.push(msg);
    fieldErrors.images = msg;
  } else if (images.some((img) => /meesho\.(com|in|io)/i.test(img.url))) {
    const msg = 'Third-party marketplace CDN image URLs are not permitted. Upload authorized local media instead.';
    blockers.push(msg);
    fieldErrors.images = msg;
  }

  if (!sourcing || sourcing.imageAuthorizationStatus !== 'authorized') {
    const msg = 'Product photographs must have confirmed commercial usage authorization before publishing.';
    blockers.push(msg);
    fieldErrors.imageAuthorizationStatus = msg;
  }

  if (countDescriptionWords(product.description) < 30 || product.description.trim().length < 80) {
    const msg = 'Add an original, verified Dear Hills product description (at least 80 characters).';
    blockers.push(msg);
    fieldErrors.description = msg;
  }

  const compliance = validateProductCompliance({
    categorySlug: product.category_slug,
    categoryName: product.category_name,
    product,
  });
  for (const [k, v] of Object.entries(compliance.errors)) {
    blockers.push(v);
    fieldErrors[k] = v;
  }

  const claimCheck = findProtectedClaimViolations({
    texts: [
      product.name,
      product.short_description,
      product.description,
      product.materials,
      product.care_instructions,
      product.return_policy_override,
      ...images.flatMap((i) => [i.alt, i.credit]),
    ],
    hasAcceptedOriginOrCraftProof: product.origin_verified === 1,
    giVerifiedByAdmin: product.gi_tagged === 1,
    isExternalSourced: true,
  });
  for (const [k, v] of Object.entries(claimCheck.errors)) {
    blockers.push(v);
    fieldErrors[k] = v;
  }

  return {
    ready: blockers.length === 0,
    blockers,
    fieldErrors,
  };
}

export function formatPublicReturnPolicy(product: {
  return_policy_override?: string | null;
  return_window_days?: number | null;
  return_shipping_bearer?: string | null;
}): string {
  if (product.return_policy_override && product.return_policy_override.trim()) {
    return product.return_policy_override.trim();
  }
  const days = typeof product.return_window_days === 'number' ? product.return_window_days : 7;
  const bearer = product.return_shipping_bearer as ReturnShippingBearer | null | undefined;
  if (bearer === 'non_returnable' || days === 0) {
    return 'Eligible for replacement or refund only if the delivered item arrives damaged, defective, or incorrect.';
  }
  if (bearer === 'partner_defective_only') {
    return `${days}-day return or replacement window for unused items with original tags if damaged, defective, or incorrect upon delivery.`;
  }
  if (bearer === 'customer') {
    return `${days}-day return window for unused items in original condition with tags intact. Return shipping is free for damaged/incorrect items and customer-paid for preference returns.`;
  }
  return `${days}-day return window for unused, unopened items in original packaging. Perishable food and personalised items are not returnable unless damaged or incorrect. Return shipping is covered when the fault is ours.`;
}
