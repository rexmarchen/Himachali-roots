import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryAll, queryOne, tx, type Db } from '../db.js';
import {
  FULFILMENT_METHOD_LABELS,
  type FulfilmentMethod,
  type OrderAddress,
  type OrderFulfilmentEventView,
  type OrderFulfilmentItemView,
  type OrderFulfilmentView,
  type OwnDeliveryProductConfig,
  type ExternalSupplierProductConfig,
  type SellerPickupLocation,
  type SessionUser,
  type ShiprocketProductConfig,
} from '../../shared/types.js';
import { audit } from './audit.js';
import { notify, escapeHtml } from './email.js';
import { AppError, badRequest, conflict, notFound, safeJsonParse, safeTrackingUrlSchema } from './http.js';
import { newId } from './ids.js';
import { markCodDeliveredIfSettled, recordOrderEvent, refreshOrderStatus } from './orderLifecycle.js';
import { allocate } from './pricing.js';
import {
  assignShiprocketAwb,
  cancelShiprocketPickupOrOrder,
  createShiprocketOrderOnly,
  fetchShiprocketTracking,
  generateShiprocketLabel,
  requestShiprocketPickup,
  sanitizeShiprocketMessage,
} from './shiprocketService.js';

/* ------------------------------------------------------------------ */
/* Validation & Mapping Helpers                                        */
/* ------------------------------------------------------------------ */

export const pickupLocationSchema = z.object({
  nickname: z.string().trim().min(2, 'Enter a short label for this pickup address.').max(60),
  shiprocketLocationName: z
    .string()
    .trim()
    .min(2, 'Enter the pickup location name registered in Shiprocket.')
    .max(40)
    .regex(/^[A-Za-z0-9_\- ]+$/, 'Use only letters, numbers, spaces, hyphens or underscores.')
    .optional(),
  contactName: z.string().trim().min(2, 'Enter pickup contact person name.').max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.'),
  email: z.string().trim().email('Enter a valid email address.').max(120).optional().or(z.literal('')),
  line1: z.string().trim().min(4, 'Enter the street/workshop address.').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, 'Enter the city or town.').max(80),
  state: z.string().trim().min(2, 'Enter the state.').max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.'),
  isDefault: z.boolean().optional(),
  registerWithShiprocket: z.boolean().optional(),
});

export const shiprocketShippingInputSchema = z.object({
  fulfilmentMethod: z.literal('SHIPROCKET'),
  pickupLocationId: z.string().trim().min(4, 'Select a verified Shiprocket pickup location.'),
  packageWeightG: z.number().int().min(10, 'Weight must be at least 10 g.').max(100_000),
  packageLengthCm: z.number().min(1, 'Package length must be at least 1 cm.').max(200),
  packageBreadthCm: z.number().min(1, 'Package width must be at least 1 cm.').max(200),
  packageHeightCm: z.number().min(1, 'Package height must be at least 1 cm.').max(200),
  handlingDays: z.number().int().min(0).max(30).default(2),
  shippingNotes: z.string().trim().max(400).optional(),
});

export const ownDeliveryShippingInputSchema = z
  .object({
    fulfilmentMethod: z.literal('OWN_DELIVERY'),
    deliveryArea: z.string().trim().min(2, 'Enter the own-delivery area or district.').max(200),
    serviceablePincodes: z
      .array(z.string().trim().regex(/^\d{6}$/, 'Each PIN code must be 6 digits.'))
      .max(200)
      .default([]),
    deliveryRadiusKm: z.number().min(1).max(1000).nullable().optional(),
    deliveryChargePaise: z.number().int().min(0).max(500_000).default(0),
    estimatedDeliveryDays: z.string().trim().min(1, 'Enter estimated delivery window.').max(80),
    contactName: z.string().trim().min(2, 'Enter delivery coordinator name.').max(120),
    contactPhone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.'),
    deliveryInstructions: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) => v.serviceablePincodes.length > 0 || (v.deliveryRadiusKm !== null && v.deliveryRadiusKm !== undefined),
    { message: 'Provide at least one serviceable 6-digit PIN code or a delivery radius in km.', path: ['serviceablePincodes'] },
  );

export const externalSupplierShippingInputSchema = z.object({
  fulfilmentMethod: z.literal('EXTERNAL_SUPPLIER'),
  supplierName: z.string().trim().min(2, 'Enter external supplier or source name.').max(140),
  supplierReference: z.string().trim().max(120).optional(),
  processingTimeDays: z.number().int().min(0).max(60).default(2),
  estimatedDeliveryDays: z.string().trim().min(1, 'Enter estimated delivery window.').max(80),
  fulfilmentInstructions: z.string().trim().max(500).optional(),
});

export interface PickupLocationRow {
  id: string;
  seller_id: string;
  nickname: string;
  shiprocket_location_name: string;
  shiprocket_pickup_id: string | null;
  contact_name: string;
  phone: string;
  email: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_verified: number;
  is_approved: number;
  is_default: number;
  is_active: number;
  verification_note: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapPickupLocationRow(row: PickupLocationRow): SellerPickupLocation {
  return {
    id: row.id,
    sellerId: row.seller_id,
    nickname: row.nickname,
    shiprocketLocationName: row.shiprocket_location_name,
    shiprocketPickupId: row.shiprocket_pickup_id,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    country: row.country,
    isVerified: row.is_verified === 1,
    isApproved: row.is_approved === 1,
    isDefault: row.is_default === 1,
    isActive: row.is_active === 1,
    verificationNote: row.verification_note,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSellerPickupLocations(db: Db, sellerId: string): SellerPickupLocation[] {
  const rows = queryAll<PickupLocationRow>(
    db,
    'SELECT * FROM seller_pickup_locations WHERE seller_id = ? ORDER BY is_default DESC, is_approved DESC, created_at ASC',
    sellerId,
  );
  return rows.map(mapPickupLocationRow);
}

/**
 * Validates product shipping method and configuration on create/edit.
 * Strictly requires a registered, verified & approved seller pickup location
 * whenever `SHIPROCKET` is selected — never permits unverified/admin fallback.
 */
export function validateAndBuildProductShipping(
  db: Db,
  sellerId: string,
  params: {
    fulfilmentMethod: FulfilmentMethod;
    pickupLocationId?: string | null;
    weightG?: number | null;
    packageLengthCm?: number | null;
    packageBreadthCm?: number | null;
    packageHeightCm?: number | null;
    handlingDays?: number | null;
    shippingConfig?: Record<string, unknown> | null;
  },
): {
  fulfilmentMethod: FulfilmentMethod;
  pickupLocationId: string | null;
  weightG: number;
  packageLengthCm: number;
  packageBreadthCm: number;
  packageHeightCm: number;
  handlingDays: number;
  dimensionsText: string;
  shippingConfigJson: string;
} {
  const method = params.fulfilmentMethod;
  const rawCfg = params.shippingConfig ?? {};
  const weightG = Number(params.weightG ?? rawCfg.packageWeightG ?? 500);
  const lengthCm = Number(params.packageLengthCm ?? rawCfg.packageLengthCm ?? 15);
  const breadthCm = Number(params.packageBreadthCm ?? rawCfg.packageBreadthCm ?? 12);
  const heightCm = Number(params.packageHeightCm ?? rawCfg.packageHeightCm ?? 8);
  const handlingDays = Number(params.handlingDays ?? rawCfg.handlingDays ?? 2);

  if (method === 'SHIPROCKET') {
    const pickupId = (params.pickupLocationId ?? (typeof rawCfg.pickupLocationId === 'string' ? rawCfg.pickupLocationId : ''))?.trim();
    if (!pickupId) {
      throw badRequest('Select an approved Shiprocket pickup address before choosing Shiprocket fulfilment.', {
        pickupLocationId: 'Approved pickup location required for Shiprocket.',
      });
    }
    const pickup = queryOne<PickupLocationRow>(
      db,
      'SELECT * FROM seller_pickup_locations WHERE id = ? AND seller_id = ?',
      pickupId,
      sellerId,
    );
    if (!pickup) {
      throw badRequest('The selected pickup address does not belong to your seller account.', {
        pickupLocationId: 'Invalid pickup location for seller.',
      });
    }
    if (pickup.is_active !== 1 || pickup.is_verified !== 1 || pickup.is_approved !== 1) {
      throw badRequest(
        'Selected Shiprocket pickup location must be active, verified with Shiprocket, and approved before enabling Shiprocket shipping.',
        { pickupLocationId: 'Pickup address is not verified and approved yet.' },
      );
    }

    const parsed = shiprocketShippingInputSchema.parse({
      fulfilmentMethod: 'SHIPROCKET',
      pickupLocationId: pickup.id,
      packageWeightG: Math.round(weightG),
      packageLengthCm: lengthCm,
      packageBreadthCm: breadthCm,
      packageHeightCm: heightCm,
      handlingDays: Math.round(handlingDays),
      shippingNotes: typeof rawCfg.shippingNotes === 'string' ? rawCfg.shippingNotes : undefined,
    });

    const configObj: ShiprocketProductConfig = {
      fulfilmentMethod: 'SHIPROCKET',
      pickupLocationId: parsed.pickupLocationId,
      packageWeightG: parsed.packageWeightG,
      packageLengthCm: parsed.packageLengthCm,
      packageBreadthCm: parsed.packageBreadthCm,
      packageHeightCm: parsed.packageHeightCm,
      handlingDays: parsed.handlingDays,
      ...(parsed.shippingNotes ? { shippingNotes: parsed.shippingNotes } : {}),
    };

    return {
      fulfilmentMethod: 'SHIPROCKET',
      pickupLocationId: pickup.id,
      weightG: parsed.packageWeightG,
      packageLengthCm: parsed.packageLengthCm,
      packageBreadthCm: parsed.packageBreadthCm,
      packageHeightCm: parsed.packageHeightCm,
      handlingDays: parsed.handlingDays,
      dimensionsText: `${parsed.packageLengthCm} × ${parsed.packageBreadthCm} × ${parsed.packageHeightCm} cm`,
      shippingConfigJson: JSON.stringify(configObj),
    };
  }

  if (method === 'OWN_DELIVERY') {
    const rawPincodes = Array.isArray(rawCfg.serviceablePincodes)
      ? rawCfg.serviceablePincodes.map((v) => String(v).trim()).filter(Boolean)
      : typeof rawCfg.serviceablePincodes === 'string'
        ? rawCfg.serviceablePincodes
            .split(/[\s,;]+/)
            .map((v) => v.trim())
            .filter(Boolean)
        : [];

    const parsed = ownDeliveryShippingInputSchema.parse({
      fulfilmentMethod: 'OWN_DELIVERY',
      deliveryArea: rawCfg.deliveryArea ?? '',
      serviceablePincodes: rawPincodes,
      deliveryRadiusKm:
        rawCfg.deliveryRadiusKm !== undefined && rawCfg.deliveryRadiusKm !== null && rawCfg.deliveryRadiusKm !== ''
          ? Number(rawCfg.deliveryRadiusKm)
          : null,
      deliveryChargePaise: Number(rawCfg.deliveryChargePaise ?? 0),
      estimatedDeliveryDays: rawCfg.estimatedDeliveryDays ?? '2–4 days',
      contactName: rawCfg.contactName ?? '',
      contactPhone: rawCfg.contactPhone ?? '',
      deliveryInstructions: typeof rawCfg.deliveryInstructions === 'string' ? rawCfg.deliveryInstructions : undefined,
    });

    const configObj: OwnDeliveryProductConfig = {
      fulfilmentMethod: 'OWN_DELIVERY',
      deliveryArea: parsed.deliveryArea,
      serviceablePincodes: parsed.serviceablePincodes,
      deliveryRadiusKm: parsed.deliveryRadiusKm ?? null,
      deliveryChargePaise: parsed.deliveryChargePaise,
      estimatedDeliveryDays: parsed.estimatedDeliveryDays,
      contactName: parsed.contactName,
      contactPhone: parsed.contactPhone,
      ...(parsed.deliveryInstructions ? { deliveryInstructions: parsed.deliveryInstructions } : {}),
    };

    const safeWeight = Number.isFinite(weightG) && weightG >= 10 ? Math.round(weightG) : 500;
    const safeL = Number.isFinite(lengthCm) && lengthCm >= 1 ? lengthCm : 15;
    const safeB = Number.isFinite(breadthCm) && breadthCm >= 1 ? breadthCm : 12;
    const safeH = Number.isFinite(heightCm) && heightCm >= 1 ? heightCm : 8;

    return {
      fulfilmentMethod: 'OWN_DELIVERY',
      pickupLocationId: null,
      weightG: safeWeight,
      packageLengthCm: safeL,
      packageBreadthCm: safeB,
      packageHeightCm: safeH,
      handlingDays: Math.max(0, Math.min(30, Math.round(handlingDays || 1))),
      dimensionsText: `${safeL} × ${safeB} × ${safeH} cm`,
      shippingConfigJson: JSON.stringify(configObj),
    };
  }

  // EXTERNAL_SUPPLIER
  const parsed = externalSupplierShippingInputSchema.parse({
    fulfilmentMethod: 'EXTERNAL_SUPPLIER',
    supplierName: rawCfg.supplierName ?? '',
    supplierReference: typeof rawCfg.supplierReference === 'string' ? rawCfg.supplierReference : undefined,
    processingTimeDays: Number(rawCfg.processingTimeDays ?? handlingDays ?? 2),
    estimatedDeliveryDays: rawCfg.estimatedDeliveryDays ?? '5–8 days',
    fulfilmentInstructions: typeof rawCfg.fulfilmentInstructions === 'string' ? rawCfg.fulfilmentInstructions : undefined,
  });

  const configObj: ExternalSupplierProductConfig = {
    fulfilmentMethod: 'EXTERNAL_SUPPLIER',
    supplierName: parsed.supplierName,
    ...(parsed.supplierReference ? { supplierReference: parsed.supplierReference } : {}),
    processingTimeDays: parsed.processingTimeDays,
    estimatedDeliveryDays: parsed.estimatedDeliveryDays,
    ...(parsed.fulfilmentInstructions ? { fulfilmentInstructions: parsed.fulfilmentInstructions } : {}),
  };

  const safeWeight = Number.isFinite(weightG) && weightG >= 10 ? Math.round(weightG) : 500;
  const safeL = Number.isFinite(lengthCm) && lengthCm >= 1 ? lengthCm : 15;
  const safeB = Number.isFinite(breadthCm) && breadthCm >= 1 ? breadthCm : 12;
  const safeH = Number.isFinite(heightCm) && heightCm >= 1 ? heightCm : 8;

  return {
    fulfilmentMethod: 'EXTERNAL_SUPPLIER',
    pickupLocationId: null,
    weightG: safeWeight,
    packageLengthCm: safeL,
    packageBreadthCm: safeB,
    packageHeightCm: safeH,
    handlingDays: parsed.processingTimeDays,
    dimensionsText: `${safeL} × ${safeB} × ${safeH} cm`,
    shippingConfigJson: JSON.stringify(configObj),
  };
}

export function buildPublicProductShippingSummary(product: {
  fulfilment_method?: string | null;
  handling_days?: number | null;
  shipping_config_json?: string | null;
}): {
  fulfilmentMethod: FulfilmentMethod;
  methodLabel: string;
  estimatedDeliveryText: string | null;
  deliveryArea?: string | null;
  serviceablePincodes?: string[];
  deliveryChargePaise?: number | null;
  supplierName?: string | null;
} {
  const rawMethod = product.fulfilment_method;
  const method: FulfilmentMethod =
    rawMethod === 'OWN_DELIVERY' || rawMethod === 'EXTERNAL_SUPPLIER' ? rawMethod : 'SHIPROCKET';
  const cfg = safeJsonParse<Record<string, unknown>>(product.shipping_config_json, {});

  if (method === 'OWN_DELIVERY') {
    const etd = typeof cfg.estimatedDeliveryDays === 'string' ? cfg.estimatedDeliveryDays : null;
    const area = typeof cfg.deliveryArea === 'string' ? cfg.deliveryArea : null;
    const pins = Array.isArray(cfg.serviceablePincodes) ? cfg.serviceablePincodes.map(String) : [];
    const charge = typeof cfg.deliveryChargePaise === 'number' ? cfg.deliveryChargePaise : null;
    return {
      fulfilmentMethod: method,
      methodLabel: FULFILMENT_METHOD_LABELS[method],
      estimatedDeliveryText: etd ? `${etd}${area ? ` · ${area}` : ''}` : area,
      deliveryArea: area,
      serviceablePincodes: pins,
      deliveryChargePaise: charge,
    };
  }
  if (method === 'EXTERNAL_SUPPLIER') {
    const etd = typeof cfg.estimatedDeliveryDays === 'string' ? cfg.estimatedDeliveryDays : null;
    const supplier = typeof cfg.supplierName === 'string' ? cfg.supplierName : null;
    return {
      fulfilmentMethod: method,
      methodLabel: FULFILMENT_METHOD_LABELS[method],
      estimatedDeliveryText: etd,
      supplierName: supplier,
    };
  }
  const handling = Number(product.handling_days ?? 2);
  return {
    fulfilmentMethod: 'SHIPROCKET',
    methodLabel: FULFILMENT_METHOD_LABELS.SHIPROCKET,
    estimatedDeliveryText: `Dispatched in ${handling}–${handling + 1} days via Shiprocket courier`,
  };
}

/* ------------------------------------------------------------------ */
/* Checkout Immutable Shipping Snapshot                                */
/* ------------------------------------------------------------------ */

export interface OrderItemShippingSnapshot {
  fulfilmentMethod: string;
  pickupLocationId: string | null;
  weightG: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  snapshotJson: string;
}

function parseDimensionsFallback(dimensionsText: string | null | undefined): { l: number; b: number; h: number } {
  if (dimensionsText) {
    const nums = dimensionsText.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 3) {
      return {
        l: Math.max(1, Math.min(200, Number(nums[0]))),
        b: Math.max(1, Math.min(200, Number(nums[1]))),
        h: Math.max(1, Math.min(200, Number(nums[2]))),
      };
    }
  }
  return { l: 15, b: 12, h: 8 };
}

export function snapshotOrderItemShipping(
  db: Db,
  product: {
    seller_id: string;
    fulfilment_method?: string | null;
    pickup_location_id?: string | null;
    weight_g?: number | null;
    package_length_cm?: number | null;
    package_breadth_cm?: number | null;
    package_height_cm?: number | null;
    handling_days?: number | null;
    shipping_config_json?: string | null;
    dimensions?: string | null;
  },
  deliveryAddress?: OrderAddress,
  productName?: string,
): OrderItemShippingSnapshot {
  const method = product.fulfilment_method || 'SHIPROCKET';
  const parsedCfg = safeJsonParse<Record<string, unknown>>(product.shipping_config_json, {});
  const dimsFallback = parseDimensionsFallback(product.dimensions);
  const weightG = Math.max(10, Number(product.weight_g ?? 500));
  const lengthCm = Math.max(1, Number(product.package_length_cm ?? dimsFallback.l));
  const breadthCm = Math.max(1, Number(product.package_breadth_cm ?? dimsFallback.b));
  const heightCm = Math.max(1, Number(product.package_height_cm ?? dimsFallback.h));
  const handlingDays = Math.max(0, Number(product.handling_days ?? 2));

  // Enforce PIN code serviceability if Own Delivery explicitly specified serviceablePincodes
  if (method === 'OWN_DELIVERY' && deliveryAddress) {
    const pins = Array.isArray(parsedCfg.serviceablePincodes)
      ? parsedCfg.serviceablePincodes.map((p) => String(p).trim()).filter((p) => /^\d{6}$/.test(p))
      : [];
    if (pins.length > 0 && !pins.includes(deliveryAddress.pincode.trim())) {
      throw badRequest(
        `${productName ?? 'This item'} uses seller own delivery and is only available in PIN codes: ${pins.slice(0, 6).join(', ')}.`,
        { pincode: 'PIN code not serviceable by seller own delivery.' },
      );
    }
  }

  let pickupSnapshot: Record<string, unknown> | null = null;
  const resolvedPickupId: string | null = product.pickup_location_id ?? null;

  if (resolvedPickupId) {
    const pickupRow = queryOne<PickupLocationRow>(
      db,
      'SELECT * FROM seller_pickup_locations WHERE id = ?',
      resolvedPickupId,
    );
    if (pickupRow) {
      pickupSnapshot = {
        id: pickupRow.id,
        sellerId: pickupRow.seller_id,
        nickname: pickupRow.nickname,
        shiprocketLocationName: pickupRow.shiprocket_location_name,
        shiprocketPickupId: pickupRow.shiprocket_pickup_id,
        contactName: pickupRow.contact_name,
        phone: pickupRow.phone,
        email: pickupRow.email,
        line1: pickupRow.line1,
        line2: pickupRow.line2,
        city: pickupRow.city,
        state: pickupRow.state,
        pincode: pickupRow.pincode,
        country: pickupRow.country,
        isVerified: pickupRow.is_verified === 1,
        isApproved: pickupRow.is_approved === 1,
        isActive: pickupRow.is_active === 1,
      };
    }
  }

  return {
    fulfilmentMethod: method,
    pickupLocationId: resolvedPickupId,
    weightG,
    lengthCm,
    breadthCm,
    heightCm,
    snapshotJson: JSON.stringify({
      fulfilmentMethod: method,
      sellerId: product.seller_id,
      pickupLocationId: resolvedPickupId,
      pickupLocation: pickupSnapshot,
      packageWeightG: weightG,
      packageLengthCm: lengthCm,
      packageBreadthCm: breadthCm,
      packageHeightCm: heightCm,
      handlingDays,
      config: parsedCfg,
      capturedAt: new Date().toISOString(),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Central Fulfilment Router (Runs on Confirmation)                    */
/* ------------------------------------------------------------------ */

interface SnapshotOrderItemRow {
  id: string;
  order_id: string;
  seller_order_id: string;
  product_id: string;
  seller_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price_paise: number;
  line_subtotal_paise: number;
  discount_paise: number;
  fulfilment_method: string;
  pickup_location_id: string | null;
  package_weight_g: number | null;
  package_length_cm: number | null;
  package_breadth_cm: number | null;
  package_height_cm: number | null;
  shipping_snapshot_json: string | null;
  fulfilment_id: string | null;
}

function recordFulfilmentEvent(
  db: Db,
  params: {
    fulfilmentId: string;
    eventId?: string | null;
    source: 'system' | 'shiprocket_api' | 'shiprocket_webhook' | 'seller' | 'admin';
    status: string;
    description: string;
    actor?: Pick<SessionUser, 'id' | 'roles'> | null;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  },
): void {
  const actorRole = params.actor
    ? params.actor.roles.includes('admin')
      ? 'admin'
      : params.actor.roles.includes('seller')
        ? 'seller'
        : 'customer'
    : 'system';
  execute(
    db,
    `INSERT OR IGNORE INTO fulfilment_events
       (id, fulfilment_id, event_id, source, status, description, actor_id, actor_role, metadata_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('fev_'),
    params.fulfilmentId,
    params.eventId ?? null,
    params.source,
    params.status,
    params.description.slice(0, 500),
    params.actor?.id ?? null,
    actorRole,
    params.metadata ? JSON.stringify(params.metadata).slice(0, 2000) : null,
    params.occurredAt ?? new Date().toISOString(),
  );
}

/**
 * Inspects immutable `order_items` snapshots and creates separate `order_fulfilments`
 * records inside the payment confirmation transaction. Strictly routes:
 * - SHIPROCKET -> `pending_sync` + durable `shipping_sync_outbox` job (never premature pickup)
 * - OWN_DELIVERY -> `order_confirmed` (zero Shiprocket interaction)
 * - EXTERNAL_SUPPLIER -> `order_confirmed` (zero Shiprocket interaction)
 * - Unrecognized -> `flagged_admin_review`
 */
export function routeOrderFulfilmentsOnConfirmation(db: Db, orderId: string): string[] {
  const existing = queryAll<{ id: string }>(
    db,
    'SELECT id FROM order_fulfilments WHERE order_id = ? ORDER BY created_at',
    orderId,
  );
  if (existing.length > 0) {
    return existing.map((r) => r.id);
  }

  const items = queryAll<SnapshotOrderItemRow>(
    db,
    'SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at, id',
    orderId,
  );
  if (items.length === 0) return [];

  const groups = new Map<string, { method: FulfilmentMethod | 'UNKNOWN'; items: SnapshotOrderItemRow[] }>();

  for (const item of items) {
    const snap = safeJsonParse<Record<string, unknown>>(item.shipping_snapshot_json, {});
    const rawMethod = (item.fulfilment_method || (typeof snap.fulfilmentMethod === 'string' ? snap.fulfilmentMethod : '')).toUpperCase();
    let method: FulfilmentMethod | 'UNKNOWN' = 'UNKNOWN';
    let groupKey: string;

    if (rawMethod === 'SHIPROCKET') {
      method = 'SHIPROCKET';
      const pickupKey = item.pickup_location_id || (typeof snap.pickupLocationId === 'string' ? snap.pickupLocationId : 'NONE');
      groupKey = `${item.seller_order_id}::SHIPROCKET::${pickupKey}`;
    } else if (rawMethod === 'OWN_DELIVERY') {
      method = 'OWN_DELIVERY';
      groupKey = `${item.seller_order_id}::OWN_DELIVERY`;
    } else if (rawMethod === 'EXTERNAL_SUPPLIER') {
      method = 'EXTERNAL_SUPPLIER';
      const cfg = (snap.config && typeof snap.config === 'object' ? snap.config : {}) as Record<string, unknown>;
      const supplierKey = typeof cfg.supplierName === 'string' ? cfg.supplierName.trim().toLowerCase() : 'default';
      groupKey = `${item.seller_order_id}::EXTERNAL_SUPPLIER::${supplierKey}`;
    } else {
      method = 'UNKNOWN';
      groupKey = `${item.seller_order_id}::UNKNOWN::${item.id}`;
    }

    const bucket = groups.get(groupKey) ?? { method, items: [] };
    bucket.items.push(item);
    groups.set(groupKey, bucket);
  }

  const now = new Date().toISOString();
  const createdIds: string[] = [];

  for (const [, group] of groups) {
    const fulfilmentId = newId('ful_');
    const first = group.items[0];
    const snap = safeJsonParse<Record<string, unknown>>(first.shipping_snapshot_json, {});
    const cfg = (snap.config && typeof snap.config === 'object' ? snap.config : {}) as Record<string, unknown>;
    const pickupSnap =
      snap.pickupLocation && typeof snap.pickupLocation === 'object' ? (snap.pickupLocation as Record<string, unknown>) : null;

    let totalWeightG = 0;
    let maxL = 10;
    let maxB = 10;
    let sumH = 0;
    for (const item of group.items) {
      const qty = Math.max(1, item.quantity);
      const w = Math.max(10, Number(item.package_weight_g ?? 500));
      const l = Math.max(1, Number(item.package_length_cm ?? 15));
      const b = Math.max(1, Number(item.package_breadth_cm ?? 12));
      const h = Math.max(1, Number(item.package_height_cm ?? 8));
      totalWeightG += w * qty;
      maxL = Math.max(maxL, l);
      maxB = Math.max(maxB, b);
      sumH += h * qty;
    }
    const boundedH = Math.max(1, Math.min(200, sumH));

    let initialStatus = 'order_confirmed';
    let provider = 'manual';
    let syncStatus: 'not_applicable' | 'pending' | 'synced' | 'failed' | 'flagged_admin_review' = 'not_applicable';
    let estimatedDeliveryText: string | null = null;
    let externalSupplierName: string | null = null;
    let adminReviewReason: string | null = null;

    if (group.method === 'SHIPROCKET') {
      initialStatus = 'pending_sync';
      provider = 'shiprocket';
      syncStatus = 'pending';
      const handling = Number(snap.handlingDays ?? 2);
      estimatedDeliveryText = `Dispatched in ${handling}–${handling + 1} days via Shiprocket`;
    } else if (group.method === 'OWN_DELIVERY') {
      initialStatus = 'order_confirmed';
      provider = 'own_delivery';
      syncStatus = 'not_applicable';
      const etd = typeof cfg.estimatedDeliveryDays === 'string' ? cfg.estimatedDeliveryDays : '2–4 days';
      const area = typeof cfg.deliveryArea === 'string' ? cfg.deliveryArea : '';
      estimatedDeliveryText = area ? `${etd} (${area})` : etd;
    } else if (group.method === 'EXTERNAL_SUPPLIER') {
      initialStatus = 'order_confirmed';
      provider = 'external_supplier';
      syncStatus = 'not_applicable';
      externalSupplierName = typeof cfg.supplierName === 'string' ? cfg.supplierName : 'External Supplier';
      estimatedDeliveryText = typeof cfg.estimatedDeliveryDays === 'string' ? cfg.estimatedDeliveryDays : '5–8 days';
    } else {
      initialStatus = 'flagged_admin_review';
      provider = 'manual';
      syncStatus = 'flagged_admin_review';
      adminReviewReason = `Unrecognized shipping method '${first.fulfilment_method}'. Automatic fulfilment rejected.`;
    }

    execute(
      db,
      `INSERT INTO order_fulfilments
         (id, order_id, seller_order_id, seller_id, fulfilment_method, status, provider,
          pickup_location_id, pickup_snapshot_json, shipping_config_snapshot_json,
          package_weight_g, package_length_cm, package_breadth_cm, package_height_cm,
          shiprocket_sync_status, external_supplier_name, estimated_delivery_text, admin_review_reason,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fulfilmentId,
      orderId,
      first.seller_order_id,
      first.seller_id,
      group.method,
      initialStatus,
      provider,
      first.pickup_location_id ?? null,
      pickupSnap ? JSON.stringify(pickupSnap) : null,
      JSON.stringify(cfg),
      totalWeightG,
      maxL,
      maxB,
      boundedH,
      syncStatus,
      externalSupplierName,
      estimatedDeliveryText,
      adminReviewReason,
      now,
      now,
    );

    for (const item of group.items) {
      execute(db, 'UPDATE order_items SET fulfilment_id = ? WHERE id = ?', fulfilmentId, item.id);
    }

    if (group.method === 'SHIPROCKET') {
      execute(
        db,
        `INSERT OR IGNORE INTO shipping_sync_outbox
           (id, fulfilment_id, order_id, seller_order_id, dedupe_key, job_type, status, attempts, max_attempts, next_retry_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'create_shiprocket_order', 'pending', 0, 5, ?, ?, ?)`,
        newId('sso_'),
        fulfilmentId,
        orderId,
        first.seller_order_id,
        `sr_order:${fulfilmentId}`,
        now,
        now,
        now,
      );
      recordFulfilmentEvent(db, {
        fulfilmentId,
        eventId: `init:${fulfilmentId}`,
        source: 'system',
        status: 'pending_sync',
        description: 'Routed to Shiprocket fulfilment queue for automatic order creation.',
        occurredAt: now,
      });
    } else if (group.method === 'OWN_DELIVERY') {
      recordFulfilmentEvent(db, {
        fulfilmentId,
        eventId: `init:${fulfilmentId}`,
        source: 'system',
        status: 'order_confirmed',
        description: 'Routed to Seller Own Delivery. Shiprocket integration intentionally bypassed.',
        occurredAt: now,
      });
    } else if (group.method === 'EXTERNAL_SUPPLIER') {
      recordFulfilmentEvent(db, {
        fulfilmentId,
        eventId: `init:${fulfilmentId}`,
        source: 'system',
        status: 'order_confirmed',
        description: `Routed to External Supplier Direct Delivery (${externalSupplierName}). Shiprocket integration intentionally bypassed.`,
        occurredAt: now,
      });
    } else {
      recordFulfilmentEvent(db, {
        fulfilmentId,
        eventId: `init:${fulfilmentId}`,
        source: 'system',
        status: 'flagged_admin_review',
        description: adminReviewReason ?? 'Flagged for admin review.',
        occurredAt: now,
      });
      recordOrderEvent(db, {
        orderId,
        sellerOrderId: first.seller_order_id,
        type: 'fulfilment.flagged_admin_review',
        description: adminReviewReason ?? 'A line item had an unrecognized fulfilment method and requires admin review.',
      });
    }

    createdIds.push(fulfilmentId);
  }

  return createdIds;
}

/* ------------------------------------------------------------------ */
/* Automatic Shiprocket Order Sync (NO premature pickup!)              */
/* ------------------------------------------------------------------ */

interface FulfilmentRow {
  id: string;
  order_id: string;
  seller_order_id: string;
  seller_id: string;
  fulfilment_method: string;
  status: string;
  provider: string;
  pickup_location_id: string | null;
  pickup_snapshot_json: string | null;
  shipping_config_snapshot_json: string | null;
  package_weight_g: number;
  package_length_cm: number;
  package_breadth_cm: number;
  package_height_cm: number;
  shiprocket_order_id: number | null;
  shiprocket_shipment_id: number | null;
  shiprocket_sync_status: string;
  sync_attempts: number;
  last_sync_error: string | null;
  last_synced_at: string | null;
  courier_company_id: number | null;
  courier_name: string | null;
  awb_code: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  label_url: string | null;
  pickup_scheduled_at: string | null;
  pickup_token: string | null;
  ready_to_ship_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  external_supplier_name: string | null;
  external_order_ref: string | null;
  own_delivery_evidence_json: string | null;
  estimated_delivery_text: string | null;
  admin_review_reason: string | null;
  created_at: string;
  updated_at: string;
}

function resolveValidatedPickupForFulfilment(
  db: Db,
  fulfilment: FulfilmentRow,
): { ok: true; shiprocketLocationName: string; pincode: string; summary: Record<string, unknown> } | { ok: false; reason: string } {
  const pickupSnap = safeJsonParse<Record<string, unknown> | null>(fulfilment.pickup_snapshot_json, null);

  if (fulfilment.pickup_location_id) {
    const dbPickup = queryOne<PickupLocationRow>(
      db,
      'SELECT * FROM seller_pickup_locations WHERE id = ?',
      fulfilment.pickup_location_id,
    );
    if (dbPickup) {
      if (dbPickup.seller_id !== fulfilment.seller_id) {
        return {
          ok: false,
          reason: `Pickup location ${dbPickup.id} belongs to another seller and cannot be used for this fulfilment.`,
        };
      }
      if (dbPickup.is_active !== 1 || dbPickup.is_verified !== 1 || dbPickup.is_approved !== 1) {
        return {
          ok: false,
          reason: `Seller pickup location "${dbPickup.nickname}" is not verified and approved for Shiprocket pickup.`,
        };
      }
      if (!dbPickup.shiprocket_location_name.trim()) {
        return {
          ok: false,
          reason: `Seller pickup location "${dbPickup.nickname}" has no registered Shiprocket location name.`,
        };
      }
      return {
        ok: true,
        shiprocketLocationName: dbPickup.shiprocket_location_name.trim(),
        pincode: dbPickup.pincode,
        summary: {
          id: dbPickup.id,
          nickname: dbPickup.nickname,
          shiprocketLocationName: dbPickup.shiprocket_location_name,
          city: dbPickup.city,
          state: dbPickup.state,
          pincode: dbPickup.pincode,
        },
      };
    }
  }

  // Fallback ONLY to the immutable pickup snapshot captured at checkout for THIS seller
  // (never substituting another seller's or admin's pickup address).
  if (
    pickupSnap &&
    pickupSnap.sellerId === fulfilment.seller_id &&
    pickupSnap.isVerified === true &&
    pickupSnap.isApproved === true &&
    pickupSnap.isActive !== false &&
    typeof pickupSnap.shiprocketLocationName === 'string' &&
    pickupSnap.shiprocketLocationName.trim()
  ) {
    return {
      ok: true,
      shiprocketLocationName: pickupSnap.shiprocketLocationName.trim(),
      pincode: String(pickupSnap.pincode ?? ''),
      summary: pickupSnap,
    };
  }

  return {
    ok: false,
    reason:
      'No verified and approved seller pickup address is configured for this product. Shiprocket order creation blocked to prevent invalid or substituted pickup locations.',
  };
}

function formatShiprocketDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export async function syncShiprocketFulfilment(
  db: Db,
  fulfilmentId: string,
  options: { forceRetry?: boolean; actor?: SessionUser | null } = {},
): Promise<{
  synced: boolean;
  alreadySynced?: boolean;
  shiprocketOrderId?: number | null;
  shiprocketShipmentId?: number | null;
  error?: string;
}> {
  const row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', fulfilmentId);
  if (!row) throw notFound('Fulfilment record not found.');

  // Strict routing rule: NEVER send OWN_DELIVERY or EXTERNAL_SUPPLIER to Shiprocket
  if (row.fulfilment_method !== 'SHIPROCKET') {
    throw conflict(
      `Fulfilment ${fulfilmentId} uses ${row.fulfilment_method}. Shiprocket synchronization is strictly blocked.`,
      'shipping_method_mismatch',
    );
  }
  if (row.status === 'cancelled') {
    return { synced: false, error: 'Fulfilment is cancelled.' };
  }

  // Idempotency check: never create duplicate Shiprocket order for the same fulfilment
  if (row.shiprocket_order_id && row.shiprocket_shipment_id) {
    execute(
      db,
      `UPDATE shipping_sync_outbox SET status = 'succeeded', completed_at = COALESCE(completed_at, ?), updated_at = ?
        WHERE fulfilment_id = ?`,
      new Date().toISOString(),
      new Date().toISOString(),
      fulfilmentId,
    );
    return {
      synced: true,
      alreadySynced: true,
      shiprocketOrderId: row.shiprocket_order_id,
      shiprocketShipmentId: row.shiprocket_shipment_id,
    };
  }

  // Claim job atomically
  const nowIso = new Date().toISOString();
  const allowedStatuses = options.forceRetry ? "('pending','failed','dead_letter')" : "('pending','failed')";
  const claimed = execute(
    db,
    `UPDATE shipping_sync_outbox
        SET status = 'processing', updated_at = ?
      WHERE fulfilment_id = ? AND status IN ${allowedStatuses}`,
    nowIso,
    fulfilmentId,
  );
  if (Number(claimed.changes) === 0 && !options.forceRetry) {
    // Another worker is currently processing or already succeeded.
    const latest = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', fulfilmentId);
    if (latest?.shiprocket_order_id && latest.shiprocket_shipment_id) {
      return {
        synced: true,
        alreadySynced: true,
        shiprocketOrderId: latest.shiprocket_order_id,
        shiprocketShipmentId: latest.shiprocket_shipment_id,
      };
    }
    return { synced: false, error: 'Sync already in progress or waiting retry.' };
  }

  const pickupCheck = resolveValidatedPickupForFulfilment(db, row);
  if (!pickupCheck.ok) {
    const errMsg = pickupCheck.reason;
    tx(db, () => {
      execute(
        db,
        `UPDATE order_fulfilments
            SET status = 'sync_failed', shiprocket_sync_status = 'failed',
                sync_attempts = sync_attempts + 1, last_sync_error = ?, updated_at = ?
          WHERE id = ?`,
        errMsg,
        new Date().toISOString(),
        fulfilmentId,
      );
      execute(
        db,
        `UPDATE shipping_sync_outbox
            SET status = 'dead_letter', attempts = attempts + 1, last_error = ?, updated_at = ?
          WHERE fulfilment_id = ?`,
        errMsg,
        new Date().toISOString(),
        fulfilmentId,
      );
      recordFulfilmentEvent(db, {
        fulfilmentId,
        source: 'system',
        status: 'sync_failed',
        description: errMsg,
        actor: options.actor,
      });
      audit(db, options.actor ?? null, 'fulfilment.shiprocket_pickup_invalid', 'order_fulfilment', fulfilmentId, null, {
        error: errMsg,
      });
    });
    return { synced: false, error: errMsg };
  }

  if (!env.shiprocket.configured) {
    const errMsg = 'Shiprocket API credentials are not configured on the backend server.';
    const nextRetry = new Date(Date.now() + 60_000).toISOString();
    tx(db, () => {
      execute(
        db,
        `UPDATE order_fulfilments
            SET status = 'sync_failed', shiprocket_sync_status = 'failed',
                sync_attempts = sync_attempts + 1, last_sync_error = ?, updated_at = ?
          WHERE id = ?`,
        errMsg,
        new Date().toISOString(),
        fulfilmentId,
      );
      execute(
        db,
        `UPDATE shipping_sync_outbox
            SET status = 'failed', attempts = attempts + 1, next_retry_at = ?, last_error = ?, updated_at = ?
          WHERE fulfilment_id = ?`,
        nextRetry,
        errMsg,
        new Date().toISOString(),
        fulfilmentId,
      );
    });
    return { synced: false, error: errMsg };
  }

  const order = queryOne<{
    id: string;
    order_number: string;
    email: string;
    shipping_address: string;
    placed_at: string;
    payment_method: string;
    shipping_paise: number;
    cod_fee_paise: number;
  }>(
    db,
    `SELECT id, order_number, email, shipping_address, placed_at, payment_method, shipping_paise, cod_fee_paise
       FROM orders WHERE id = ?`,
    row.order_id,
  );
  if (!order) throw notFound('Parent order not found.');

  const address = safeJsonParse<OrderAddress>(order.shipping_address, {
    fullName: 'Customer',
    phone: '9876543210',
    line1: '',
    city: '',
    state: '',
    pincode: '',
  });
  const items = queryAll<{
    name: string;
    sku: string;
    quantity: number;
    unit_price_paise: number;
    line_subtotal_paise: number;
    discount_paise: number;
  }>(
    db,
    'SELECT name, sku, quantity, unit_price_paise, line_subtotal_paise, discount_paise FROM order_items WHERE fulfilment_id = ?',
    fulfilmentId,
  );
  if (items.length === 0) {
    return { synced: false, error: 'No items attached to this fulfilment record.' };
  }

  const nameParts = address.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || '.';
  const grossPaise = items.reduce((sum, i) => sum + Math.max(0, i.line_subtotal_paise), 0);
  const discountPaise = items.reduce((sum, i) => sum + Math.max(0, i.discount_paise), 0);
  const netPaise = Math.max(0, grossPaise - discountPaise);

  const payment = queryOne<{ provider: string; status: string }>(
    db,
    'SELECT provider, status FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
    order.id,
  );
  const isCod = order.payment_method === 'cod' || payment?.provider === 'cod';

  // Allocate shipping and COD fee across Shiprocket parcels on this order so
  // Shiprocket's COD collectible amount matches the customer's checkout total.
  let parcelShippingPaise = 0;
  let parcelCodFeePaise = 0;
  if (isCod) {
    const orderFulfilments = queryAll<{ id: string; fulfilment_method: string; status: string }>(
      db,
      "SELECT id, fulfilment_method, status FROM order_fulfilments WHERE order_id = ? AND status != 'cancelled' ORDER BY created_at, id",
      order.id,
    );
    const allWeights = orderFulfilments.map((f) => {
      const sumRow = queryOne<{ total: number }>(
        db,
        'SELECT COALESCE(SUM(MAX(0, line_subtotal_paise - discount_paise)), 0) AS total FROM order_items WHERE fulfilment_id = ?',
        f.id,
      );
      return Math.max(1, sumRow?.total ?? 0);
    });
    const idxAll = orderFulfilments.findIndex((f) => f.id === fulfilmentId);
    if (idxAll >= 0) {
      parcelShippingPaise = allocate(order.shipping_paise ?? 0, allWeights)[idxAll] ?? 0;
    }

    const srFulfilments = orderFulfilments.filter((f) => f.fulfilment_method === 'SHIPROCKET');
    const srWeights = srFulfilments.map((f) => {
      const idx = orderFulfilments.findIndex((o) => o.id === f.id);
      return idx >= 0 ? allWeights[idx] : 1;
    });
    const idxSr = srFulfilments.findIndex((f) => f.id === fulfilmentId);
    if (idxSr >= 0) {
      parcelCodFeePaise = allocate(order.cod_fee_paise ?? 0, srWeights)[idxSr] ?? 0;
    }
  }

  const grossRupees = Math.max(1, Math.round(grossPaise / 100));
  const discountRupees = Math.max(0, Math.round(discountPaise / 100));
  const useDiscountField = discountRupees > 0 && grossRupees > discountRupees;
  const subTotalRupees = useDiscountField ? grossRupees : Math.max(1, Math.round(netPaise / 100));
  const totalDiscountRupees = useDiscountField ? discountRupees : 0;

  const channelOrderId = `${order.order_number}-${fulfilmentId.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;

  try {
    const srResult = await createShiprocketOrderOnly({
      channelOrderId,
      orderDate: formatShiprocketDate(new Date(order.placed_at || Date.now())),
      pickupLocation: pickupCheck.shiprocketLocationName,
      customer: {
        firstName,
        lastName,
        email: order.email,
        phone: address.phone.replace(/\D/g, '').slice(-10),
        address: address.line1,
        address2: address.line2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      items: items.map((i) => ({
        name: i.name,
        sku: i.sku,
        units: i.quantity,
        sellingPriceRupees: Math.max(1, Math.round(i.unit_price_paise / 100)),
      })),
      paymentMethod: isCod ? 'COD' : 'Prepaid',
      subTotalRupees,
      shippingChargesRupees: isCod ? Math.round(parcelShippingPaise / 100) : 0,
      transactionChargesRupees: isCod ? Math.round(parcelCodFeePaise / 100) : 0,
      totalDiscountRupees,
      lengthCm: row.package_length_cm,
      breadthCm: row.package_breadth_cm,
      heightCm: row.package_height_cm,
      weightKg: Math.max(0.05, Number((row.package_weight_g / 1000).toFixed(2))),
    });

    const syncedAt = new Date().toISOString();
    // Guard against simultaneous cancellation while the Shiprocket HTTP call was in-flight
    const latestBeforeCommit = queryOne<{ status: string }>(
      db,
      'SELECT status FROM order_fulfilments WHERE id = ?',
      fulfilmentId,
    );
    if (latestBeforeCommit?.status === 'cancelled') {
      try {
        await cancelShiprocketPickupOrOrder({ shiprocketOrderId: srResult.shiprocketOrderId });
      } catch {
        // Best-effort remote cleanup logged below
      }
      execute(
        db,
        `UPDATE order_fulfilments
            SET shiprocket_order_id = ?, shiprocket_shipment_id = ?, updated_at = ?
          WHERE id = ?`,
        srResult.shiprocketOrderId,
        srResult.shiprocketShipmentId,
        syncedAt,
        fulfilmentId,
      );
      recordFulfilmentEvent(db, {
        fulfilmentId,
        eventId: `sr-cancel-race:${srResult.shiprocketOrderId}`,
        source: 'shiprocket_api',
        status: 'cancelled',
        description: `Order cancelled locally while Shiprocket sync finished; cancelled Shiprocket order #${srResult.shiprocketOrderId} automatically.`,
        occurredAt: syncedAt,
      });
      return { synced: false, error: 'Fulfilment cancelled while syncing; remote Shiprocket order cancelled automatically.' };
    }

    tx(db, () => {
      execute(
        db,
        `UPDATE order_fulfilments
            SET shiprocket_order_id = ?,
                shiprocket_shipment_id = ?,
                shiprocket_sync_status = 'synced',
                status = 'shiprocket_order_created',
                sync_attempts = sync_attempts + 1,
                last_sync_error = NULL,
                last_synced_at = ?,
                updated_at = ?
          WHERE id = ?`,
        srResult.shiprocketOrderId,
        srResult.shiprocketShipmentId,
        syncedAt,
        syncedAt,
        fulfilmentId,
      );
      execute(
        db,
        `UPDATE shipping_sync_outbox
            SET status = 'succeeded', attempts = attempts + 1, last_error = NULL, completed_at = ?, updated_at = ?
          WHERE fulfilment_id = ?`,
        syncedAt,
        syncedAt,
        fulfilmentId,
      );
      recordFulfilmentEvent(db, {
        fulfilmentId,
        eventId: `sr_created:${srResult.shiprocketOrderId}`,
        source: 'shiprocket_api',
        status: 'shiprocket_order_created',
        description: `Shiprocket order #${srResult.shiprocketOrderId} created (shipment #${srResult.shiprocketShipmentId}). Pickup is NOT scheduled until seller marks Ready to Ship.`,
        actor: options.actor,
        metadata: {
          shiprocketOrderId: srResult.shiprocketOrderId,
          shiprocketShipmentId: srResult.shiprocketShipmentId,
          pickupLocation: pickupCheck.shiprocketLocationName,
        },
        occurredAt: syncedAt,
      });
      recordOrderEvent(db, {
        orderId: order.id,
        sellerOrderId: row.seller_order_id,
        type: 'fulfilment.shiprocket_order_created',
        description: `Shiprocket order synced automatically (${srResult.shiprocketOrderId}). Waiting for seller to mark package ready for pickup.`,
        actor: options.actor,
      });
      rollupSellerOrderAndParentOrderStatus(db, row.seller_order_id);
      audit(db, options.actor ?? null, 'fulfilment.shiprocket_synced', 'order_fulfilment', fulfilmentId, null, {
        shiprocketOrderId: srResult.shiprocketOrderId,
        shiprocketShipmentId: srResult.shiprocketShipmentId,
        pickupLocation: pickupCheck.shiprocketLocationName,
      });
    });

    return {
      synced: true,
      shiprocketOrderId: srResult.shiprocketOrderId,
      shiprocketShipmentId: srResult.shiprocketShipmentId,
    };
  } catch (err) {
    const cleanError = sanitizeShiprocketMessage(err);
    const outbox = queryOne<{ attempts: number; max_attempts: number }>(
      db,
      'SELECT attempts, max_attempts FROM shipping_sync_outbox WHERE fulfilment_id = ?',
      fulfilmentId,
    );
    const nextAttempts = (outbox?.attempts ?? row.sync_attempts) + 1;
    const maxAttempts = outbox?.max_attempts ?? 5;
    const isDeadLetter = nextAttempts >= maxAttempts;
    const backoffMs = Math.min(3600_000, 30_000 * Math.pow(2, Math.max(0, nextAttempts - 1)));
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    const failNow = new Date().toISOString();

    tx(db, () => {
      execute(
        db,
        `UPDATE order_fulfilments
            SET status = 'sync_failed', shiprocket_sync_status = 'failed',
                sync_attempts = sync_attempts + 1, last_sync_error = ?, updated_at = ?
          WHERE id = ?`,
        cleanError,
        failNow,
        fulfilmentId,
      );
      execute(
        db,
        `UPDATE shipping_sync_outbox
            SET status = ?, attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ?
          WHERE fulfilment_id = ?`,
        isDeadLetter ? 'dead_letter' : 'failed',
        nextAttempts,
        nextRetryAt,
        cleanError,
        failNow,
        fulfilmentId,
      );
      recordFulfilmentEvent(db, {
        fulfilmentId,
        source: 'shiprocket_api',
        status: 'sync_failed',
        description: `Shiprocket sync failed (attempt ${nextAttempts}): ${cleanError}`,
        actor: options.actor,
      });
      audit(db, options.actor ?? null, 'fulfilment.shiprocket_sync_failed', 'order_fulfilment', fulfilmentId, null, {
        error: cleanError,
        attempts: nextAttempts,
      });
    });

    if (env.email.adminNotificationEmail) {
      void notify(db, {
        email: env.email.adminNotificationEmail,
        type: 'shiprocket_sync_failed',
        subject: `Shiprocket sync failed for Order ${order.order_number}`,
        body: `<p>Automatic Shiprocket order creation failed for fulfilment <code>${escapeHtml(fulfilmentId)}</code> in order <strong>${escapeHtml(order.order_number)}</strong>.</p><p><strong>Error:</strong> ${escapeHtml(cleanError)}</p><p>Customer order remains safe. Open Admin → Shipping Management to retry once resolved.</p>`,
        dedupeKey: `sr-sync-fail:${fulfilmentId}:${nextAttempts}`,
      });
    }

    return { synced: false, error: cleanError };
  }
}

export async function processOrderFulfilments(db: Db, orderId: string): Promise<void> {
  const pendingShiprocket = queryAll<{ id: string }>(
    db,
    `SELECT id FROM order_fulfilments
      WHERE order_id = ? AND fulfilment_method = 'SHIPROCKET' AND shiprocket_sync_status IN ('pending','failed')`,
    orderId,
  );
  for (const row of pendingShiprocket) {
    try {
      await syncShiprocketFulfilment(db, row.id);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'fulfilment_sync_unhandled',
          fulfilmentId: row.id,
          error: sanitizeShiprocketMessage(err),
        }),
      );
    }
  }
}

export async function processPendingShippingOutboxBatch(db: Db, limit = 15): Promise<number> {
  const nowIso = new Date().toISOString();
  const due = queryAll<{ fulfilment_id: string }>(
    db,
    `SELECT fulfilment_id FROM shipping_sync_outbox
      WHERE status IN ('pending','failed') AND next_retry_at <= ?
      ORDER BY next_retry_at ASC LIMIT ?`,
    nowIso,
    limit,
  );
  let syncedCount = 0;
  for (const job of due) {
    try {
      const res = await syncShiprocketFulfilment(db, job.fulfilment_id);
      if (res.synced) syncedCount += 1;
    } catch {
      // Errors are logged and state persisted inside syncShiprocketFulfilment.
    }
  }
  return syncedCount;
}

/* ------------------------------------------------------------------ */
/* Inventory Consumption & Rollup Helpers                              */
/* ------------------------------------------------------------------ */

function consumeInventoryForFulfilmentItems(
  db: Db,
  fulfilmentId: string,
  orderNumber: string,
  targetItemStatus: 'shipped' | 'delivered',
  note: string,
): void {
  const nowIso = new Date().toISOString();
  const orderedItems = queryAll<{ id: string; product_id: string; quantity: number }>(
    db,
    "SELECT id, product_id, quantity FROM order_items WHERE fulfilment_id = ? AND status = 'ordered'",
    fulfilmentId,
  );
  for (const item of orderedItems) {
    const moved = execute(
      db,
      `UPDATE inventory SET quantity = quantity - ?, reserved_quantity = reserved_quantity - ?, updated_at = ?
        WHERE product_id = ? AND quantity >= ? AND reserved_quantity >= ?`,
      item.quantity,
      item.quantity,
      nowIso,
      item.product_id,
      item.quantity,
      item.quantity,
    );
    if (Number(moved.changes) !== 1) {
      throw conflict(
        'Stock could not be released for this dispatch because reserved inventory changed after checkout.',
        'inventory_mismatch',
      );
    }
    execute(
      db,
      `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
       VALUES (?, ?, ?, 'sale', ?, ?)`,
      newId('mov_'),
      item.product_id,
      -item.quantity,
      orderNumber,
      note,
    );
    execute(db, 'UPDATE order_items SET status = ? WHERE id = ?', targetItemStatus, item.id);
  }
  if (targetItemStatus === 'delivered') {
    execute(db, "UPDATE order_items SET status = 'delivered' WHERE fulfilment_id = ? AND status = 'shipped'", fulfilmentId);
  }
}

function upsertLegacyShipmentForSellerOrder(
  db: Db,
  params: {
    sellerOrderId: string;
    fulfilmentId: string;
    provider: string;
    carrier: string;
    trackingNumber: string;
    trackingUrl?: string | null;
    shiprocketShipmentId?: number | null;
    labelUrl?: string | null;
    pickupScheduledAt?: string | null;
    pickupToken?: string | null;
    status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'rto';
    shippedAt?: string;
    deliveredAt?: string | null;
    eventDescription?: string;
    eventId?: string;
  },
): void {
  const nowIso = new Date().toISOString();
  const existing = queryOne<{ id: string }>(
    db,
    'SELECT id FROM shipments WHERE seller_order_id = ?',
    params.sellerOrderId,
  );
  let shipmentId = existing?.id;
  if (!shipmentId) {
    shipmentId = newId('shp_');
    execute(
      db,
      `INSERT INTO shipments
         (id, seller_order_id, fulfilment_id, provider, carrier, tracking_number, tracking_url,
          provider_shipment_id, label_url, pickup_scheduled_at, pickup_token, status, shipped_at, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      shipmentId,
      params.sellerOrderId,
      params.fulfilmentId,
      params.provider,
      params.carrier,
      params.trackingNumber,
      params.trackingUrl ?? null,
      params.shiprocketShipmentId ?? null,
      params.labelUrl ?? null,
      params.pickupScheduledAt ?? null,
      params.pickupToken ?? null,
      params.status,
      params.shippedAt ?? nowIso,
      params.deliveredAt ?? null,
    );
  } else {
    execute(
      db,
      `UPDATE shipments
          SET fulfilment_id = ?,
              provider = ?,
              carrier = ?,
              tracking_number = ?,
              tracking_url = COALESCE(?, tracking_url),
              provider_shipment_id = COALESCE(?, provider_shipment_id),
              label_url = COALESCE(?, label_url),
              pickup_scheduled_at = COALESCE(?, pickup_scheduled_at),
              pickup_token = COALESCE(?, pickup_token),
              status = ?,
              delivered_at = COALESCE(?, delivered_at)
        WHERE id = ?`,
      params.fulfilmentId,
      params.provider,
      params.carrier,
      params.trackingNumber,
      params.trackingUrl ?? null,
      params.shiprocketShipmentId ?? null,
      params.labelUrl ?? null,
      params.pickupScheduledAt ?? null,
      params.pickupToken ?? null,
      params.status,
      params.deliveredAt ?? null,
      shipmentId,
    );
  }
  if (params.eventDescription) {
    execute(
      db,
      `INSERT OR IGNORE INTO shipment_events (id, shipment_id, event_id, status, description, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId('she_'),
      shipmentId,
      params.eventId ?? `ful:${params.fulfilmentId}:${params.status}:${nowIso}`,
      params.status,
      params.eventDescription,
      nowIso,
    );
  }
}

export function rollupSellerOrderAndParentOrderStatus(db: Db, sellerOrderId: string): void {
  const so = queryOne<{ id: string; order_id: string; status: string; shipped_at: string | null; delivered_at: string | null }>(
    db,
    'SELECT id, order_id, status, shipped_at, delivered_at FROM seller_orders WHERE id = ?',
    sellerOrderId,
  );
  if (!so) return;

  const fulfilments = queryAll<{ status: string }>(
    db,
    'SELECT status FROM order_fulfilments WHERE seller_order_id = ?',
    sellerOrderId,
  );
  if (fulfilments.length === 0) return;

  const nowIso = new Date().toISOString();
  const active = fulfilments.filter((f) => f.status !== 'cancelled');
  let nextStatus = so.status;

  if (active.length === 0) {
    nextStatus = 'cancelled';
  } else if (active.every((f) => f.status === 'delivered')) {
    nextStatus = 'delivered';
  } else if (
    active.some((f) =>
      ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'rto_initiated', 'rto_delivered'].includes(f.status),
    )
  ) {
    nextStatus = 'shipped';
  } else if (
    active.some((f) =>
      ['ready_to_ship', 'awb_assigned', 'pickup_scheduled', 'preparing', 'external_order_placed'].includes(f.status),
    )
  ) {
    nextStatus = 'packed';
  } else if (
    active.some((f) => ['shiprocket_order_created', 'accepted', 'supplier_confirmed'].includes(f.status))
  ) {
    if (so.status === 'pending') nextStatus = 'confirmed';
  }

  if (nextStatus !== so.status) {
    const shippedAt = nextStatus === 'shipped' || nextStatus === 'delivered' ? so.shipped_at ?? nowIso : so.shipped_at;
    const deliveredAt = nextStatus === 'delivered' ? so.delivered_at ?? nowIso : so.delivered_at;
    execute(
      db,
      'UPDATE seller_orders SET status = ?, shipped_at = ?, delivered_at = ?, updated_at = ? WHERE id = ?',
      nextStatus,
      shippedAt,
      deliveredAt,
      nowIso,
      so.id,
    );
  }

  if (nextStatus === 'delivered') {
    const availableAt = new Date(Date.now() + 7 * 86400_000).toISOString();
    execute(
      db,
      `UPDATE seller_ledger_entries SET status = 'eligible', available_at = ?
        WHERE seller_order_id = ? AND status = 'pending'`,
      availableAt,
      so.id,
    );
    markCodDeliveredIfSettled(db, so.order_id, nowIso);
  }

  refreshOrderStatus(db, so.order_id);
}

/* ------------------------------------------------------------------ */
/* Seller & Admin Lifecycle Operations Per Fulfilment Method           */
/* ------------------------------------------------------------------ */

export async function markFulfilmentReadyToShip(
  db: Db,
  params: {
    fulfilmentId: string;
    ownerSellerId?: string;
    actor: SessionUser;
    preferredCourierId?: number;
  },
): Promise<{
  awbCode: string;
  courierName: string;
  trackingUrl: string;
  labelUrl: string | null;
  pickupScheduledAt: string;
  pickupToken: string | null;
}> {
  let row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', params.fulfilmentId);
  if (!row) throw notFound('Fulfilment record not found.');
  if (params.ownerSellerId && row.seller_id !== params.ownerSellerId) {
    throw notFound('Fulfilment record not found.');
  }
  if (row.fulfilment_method !== 'SHIPROCKET') {
    throw conflict(
      `Ready-to-Ship pickup scheduling is only valid for Shiprocket orders. This package uses ${row.fulfilment_method}.`,
      'shipping_method_mismatch',
    );
  }
  if (['cancelled', 'delivered', 'rto_delivered'].includes(row.status)) {
    throw conflict(`Cannot mark a ${row.status} fulfilment ready to ship.`);
  }

  // Idempotent if AWB & pickup are already scheduled
  if (row.awb_code && row.pickup_scheduled_at) {
    return {
      awbCode: row.awb_code,
      courierName: row.courier_name ?? 'Shiprocket Courier',
      trackingUrl: row.tracking_url ?? `https://shiprocket.co/tracking/${encodeURIComponent(row.awb_code)}`,
      labelUrl: row.label_url,
      pickupScheduledAt: row.pickup_scheduled_at,
      pickupToken: row.pickup_token,
    };
  }

  // Ensure Shiprocket order is created first if it was pending/failed
  if (!row.shiprocket_order_id || !row.shiprocket_shipment_id) {
    const syncOutcome = await syncShiprocketFulfilment(db, row.id, { forceRetry: true, actor: params.actor });
    if (!syncOutcome.synced) {
      throw new AppError(
        502,
        'shiprocket_sync_required',
        syncOutcome.error ?? 'Could not synchronize order with Shiprocket before scheduling pickup.',
      );
    }
    row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', row.id)!;
  }

  const pickupCheck = resolveValidatedPickupForFulfilment(db, row);
  if (!pickupCheck.ok) {
    throw badRequest(pickupCheck.reason, { pickupLocationId: pickupCheck.reason });
  }

  const nowIso = new Date().toISOString();
  execute(
    db,
    "UPDATE order_fulfilments SET status = 'ready_to_ship', ready_to_ship_at = COALESCE(ready_to_ship_at, ?), updated_at = ? WHERE id = ?",
    nowIso,
    nowIso,
    row.id,
  );

  // Assign AWB + Generate Label + Request Pickup
  let awbCode = row.awb_code;
  let courierName = row.courier_name ?? 'Shiprocket Courier';
  let courierCompanyId = row.courier_company_id;
  let trackingUrl = row.tracking_url;

  if (!awbCode) {
    const awb = await assignShiprocketAwb({
      shiprocketShipmentId: row.shiprocket_shipment_id!,
      preferredCourierId: params.preferredCourierId,
    });
    awbCode = awb.awbCode;
    courierName = awb.courierName;
    courierCompanyId = awb.courierCompanyId;
    trackingUrl = awb.trackingUrl;
  }

  const labelUrl = row.label_url ?? (await generateShiprocketLabel(row.shiprocket_shipment_id!).catch(() => null));
  const pickup = await requestShiprocketPickup(row.shiprocket_shipment_id!);
  const pickupAt = pickup.pickupScheduledDate ?? nowIso;

  const order = queryOne<{ order_number: string; email: string; user_id: string }>(
    db,
    'SELECT order_number, email, user_id FROM orders WHERE id = ?',
    row.order_id,
  );

  tx(db, () => {
    execute(
      db,
      `UPDATE order_fulfilments
          SET status = ?,
              courier_company_id = ?,
              courier_name = ?,
              awb_code = ?,
              tracking_number = ?,
              tracking_url = ?,
              label_url = ?,
              pickup_scheduled_at = ?,
              pickup_token = ?,
              ready_to_ship_at = COALESCE(ready_to_ship_at, ?),
              updated_at = ?
        WHERE id = ?`,
      pickup.scheduled ? 'pickup_scheduled' : 'awb_assigned',
      courierCompanyId,
      courierName,
      awbCode,
      awbCode,
      trackingUrl,
      labelUrl,
      pickupAt,
      pickup.pickupToken,
      nowIso,
      nowIso,
      row.id,
    );

    if (queryOne(db, 'SELECT COUNT(*) AS count FROM order_fulfilments WHERE seller_order_id = ?', row.seller_order_id)) {
      const siblingCount =
        queryOne<{ count: number }>(
          db,
          'SELECT COUNT(*) AS count FROM order_fulfilments WHERE seller_order_id = ?',
          row.seller_order_id,
        )?.count ?? 1;
      if (siblingCount === 1) {
        upsertLegacyShipmentForSellerOrder(db, {
          sellerOrderId: row.seller_order_id,
          fulfilmentId: row.id,
          provider: 'shiprocket',
          carrier: courierName,
          trackingNumber: awbCode!,
          trackingUrl,
          shiprocketShipmentId: row.shiprocket_shipment_id,
          labelUrl,
          pickupScheduledAt: pickupAt,
          pickupToken: pickup.pickupToken,
          status: 'shipped',
          shippedAt: nowIso,
          eventDescription: `AWB ${awbCode} generated via ${courierName}; pickup scheduled.`,
          eventId: `sr-rts:${row.id}:${awbCode}`,
        });
      }
    }

    recordFulfilmentEvent(db, {
      fulfilmentId: row.id,
      eventId: `rts:${row.id}:${awbCode}`,
      source: 'shiprocket_api',
      status: pickup.scheduled ? 'pickup_scheduled' : 'awb_assigned',
      description: `Seller marked Ready to Ship. ${courierName} assigned (AWB: ${awbCode}). ${pickup.note}`,
      actor: params.actor,
      metadata: { awbCode, courierName, labelUrl, pickupToken: pickup.pickupToken },
      occurredAt: nowIso,
    });
    recordOrderEvent(db, {
      orderId: row.order_id,
      sellerOrderId: row.seller_order_id,
      type: 'fulfilment.pickup_scheduled',
      description: `Package marked Ready to Ship with ${courierName} (AWB ${awbCode}) and courier pickup scheduled.`,
      actor: params.actor,
    });
    rollupSellerOrderAndParentOrderStatus(db, row.seller_order_id);
    audit(db, params.actor, 'fulfilment.ready_to_ship', 'order_fulfilment', row.id, { status: row.status }, {
      status: pickup.scheduled ? 'pickup_scheduled' : 'awb_assigned',
      awbCode,
      courierName,
      pickupToken: pickup.pickupToken,
    });
  });

  if (order) {
    void notify(db, {
      userId: order.user_id,
      email: order.email,
      type: 'order_pickup_scheduled',
      subject: `Courier assigned for order ${order.order_number} (AWB ${awbCode})`,
      body: `<p>Your package is packed and scheduled for courier pickup via <strong>${escapeHtml(courierName)}</strong>.</p><p><strong>AWB:</strong> ${escapeHtml(awbCode!)}</p>${trackingUrl ? `<p><a href="${escapeHtml(trackingUrl)}">Track Parcel</a></p>` : ''}`,
      dedupeKey: `pickup-scheduled:${row.id}:${awbCode}`,
    });
  }

  return {
    awbCode: awbCode!,
    courierName,
    trackingUrl: trackingUrl ?? `https://shiprocket.co/tracking/${encodeURIComponent(awbCode!)}`,
    labelUrl,
    pickupScheduledAt: pickupAt,
    pickupToken: pickup.pickupToken,
  };
}

export async function cancelShiprocketFulfilmentPickup(
  db: Db,
  params: { fulfilmentId: string; ownerSellerId?: string; actor: SessionUser; note?: string },
): Promise<{ ok: boolean; note: string }> {
  const row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', params.fulfilmentId);
  if (!row) throw notFound('Fulfilment record not found.');
  if (params.ownerSellerId && row.seller_id !== params.ownerSellerId) throw notFound('Fulfilment record not found.');
  if (row.fulfilment_method !== 'SHIPROCKET') {
    throw conflict('Pickup cancellation is only supported on Shiprocket fulfilments.', 'shipping_method_mismatch');
  }
  if (['delivered', 'picked_up', 'in_transit', 'out_for_delivery', 'cancelled'].includes(row.status)) {
    throw conflict(`Cannot cancel pickup from status "${row.status}".`);
  }

  const result = await cancelShiprocketPickupOrOrder({
    shiprocketOrderId: row.shiprocket_order_id,
    awbCode: row.awb_code,
  });

  const nowIso = new Date().toISOString();
  tx(db, () => {
    execute(
      db,
      `UPDATE order_fulfilments
          SET status = 'shiprocket_order_created',
              awb_code = NULL,
              tracking_number = NULL,
              tracking_url = NULL,
              label_url = NULL,
              pickup_scheduled_at = NULL,
              pickup_token = NULL,
              updated_at = ?
        WHERE id = ?`,
      nowIso,
      row.id,
    );
    recordFulfilmentEvent(db, {
      fulfilmentId: row.id,
      source: 'shiprocket_api',
      status: 'shiprocket_order_created',
      description: params.note?.trim() || result.note || 'Shiprocket pickup cancelled.',
      actor: params.actor,
      occurredAt: nowIso,
    });
    rollupSellerOrderAndParentOrderStatus(db, row.seller_order_id);
    audit(db, params.actor, 'fulfilment.pickup_cancelled', 'order_fulfilment', row.id, { status: row.status }, {
      note: result.note,
    });
  });

  return { ok: true, note: result.note };
}

export async function refreshShiprocketFulfilmentTracking(
  db: Db,
  params: { fulfilmentId: string; ownerSellerId?: string; actor: SessionUser },
): Promise<{ status: string; updated: boolean; description: string }> {
  const row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', params.fulfilmentId);
  if (!row) throw notFound('Fulfilment record not found.');
  if (params.ownerSellerId && row.seller_id !== params.ownerSellerId) throw notFound('Fulfilment record not found.');
  if (row.fulfilment_method !== 'SHIPROCKET') {
    throw conflict('Live Shiprocket tracking sync is only supported for Shiprocket fulfilments.', 'shipping_method_mismatch');
  }
  if (!row.awb_code && !row.shiprocket_shipment_id) {
    throw badRequest('No Shiprocket AWB or shipment ID exists yet for tracking.');
  }

  const live = await fetchShiprocketTracking({
    awbCode: row.awb_code,
    shiprocketShipmentId: row.shiprocket_shipment_id,
  });
  if (!live || !live.currentStatus) {
    return { status: row.status, updated: false, description: 'No new tracking updates available from Shiprocket yet.' };
  }

  const webhookResult = await processHardenedShippingWebhook(db, {
    awb: row.awb_code,
    shipment_id: row.shiprocket_shipment_id,
    order_id: row.shiprocket_order_id,
    current_status: live.currentStatus,
    current_status_desc: live.description,
    courier_name: live.courierName,
  });

  return {
    status: webhookResult.status ?? row.status,
    updated: Boolean(webhookResult.processed),
    description: live.description,
  };
}

export function updateOwnDeliveryFulfilment(
  db: Db,
  params: {
    fulfilmentId: string;
    ownerSellerId?: string;
    actor: SessionUser;
    action: 'accept' | 'preparing' | 'out_for_delivery' | 'delivered' | 'delivery_failed';
    recipientName?: string;
    note?: string;
    proofUrl?: string;
    failedReason?: string;
  },
): { status: string } {
  const row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', params.fulfilmentId);
  if (!row) throw notFound('Fulfilment record not found.');
  if (params.ownerSellerId && row.seller_id !== params.ownerSellerId) throw notFound('Fulfilment record not found.');
  if (row.fulfilment_method !== 'OWN_DELIVERY') {
    throw conflict('Own delivery status actions can only be applied to Own Delivery fulfilments.', 'shipping_method_mismatch');
  }
  if (row.status === 'cancelled') throw conflict('This fulfilment has been cancelled.');
  if (row.status === 'delivered') throw conflict('This fulfilment is already delivered.');

  const allowedFrom: Record<typeof params.action, string[]> = {
    accept: ['order_confirmed'],
    preparing: ['order_confirmed', 'accepted'],
    out_for_delivery: ['order_confirmed', 'accepted', 'preparing', 'delivery_failed'],
    delivered: ['accepted', 'preparing', 'out_for_delivery'],
    delivery_failed: ['out_for_delivery', 'accepted', 'preparing'],
  };
  if (!allowedFrom[params.action].includes(row.status)) {
    throw conflict(`Cannot transition own delivery from "${row.status}" using action "${params.action}".`);
  }

  const targetMap: Record<typeof params.action, string> = {
    accept: 'accepted',
    preparing: 'preparing',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered',
    delivery_failed: 'delivery_failed',
  };
  const nextStatus = targetMap[params.action];
  const nowIso = new Date().toISOString();
  const order = queryOne<{ order_number: string; email: string; user_id: string }>(
    db,
    'SELECT order_number, email, user_id FROM orders WHERE id = ?',
    row.order_id,
  );
  const existingEvidence = safeJsonParse<Record<string, unknown>>(row.own_delivery_evidence_json, {});
  const nextEvidence = {
    ...existingEvidence,
    ...(params.recipientName?.trim() ? { recipientName: params.recipientName.trim() } : {}),
    ...(params.note?.trim() ? { note: params.note.trim() } : {}),
    ...(params.proofUrl?.trim() ? { proofUrl: params.proofUrl.trim() } : {}),
    ...(params.failedReason?.trim() ? { failedReason: params.failedReason.trim() } : {}),
    recordedAt: nowIso,
  };

  tx(db, () => {
    if (nextStatus === 'out_for_delivery' || nextStatus === 'delivered') {
      consumeInventoryForFulfilmentItems(
        db,
        row.id,
        order?.order_number ?? row.order_id,
        nextStatus === 'delivered' ? 'delivered' : 'shipped',
        `Own delivery ${nextStatus}`,
      );
    }

    execute(
      db,
      `UPDATE order_fulfilments
          SET status = ?,
              own_delivery_evidence_json = ?,
              dispatched_at = CASE WHEN ? = 'out_for_delivery' THEN COALESCE(dispatched_at, ?) ELSE dispatched_at END,
              delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, ?) ELSE delivered_at END,
              updated_at = ?
        WHERE id = ?`,
      nextStatus,
      JSON.stringify(nextEvidence),
      nextStatus,
      nowIso,
      nextStatus,
      nowIso,
      nowIso,
      row.id,
    );

    const siblingCount =
      queryOne<{ count: number }>(
        db,
        'SELECT COUNT(*) AS count FROM order_fulfilments WHERE seller_order_id = ?',
        row.seller_order_id,
      )?.count ?? 1;
    if (siblingCount === 1 && ['out_for_delivery', 'delivered', 'delivery_failed'].includes(nextStatus)) {
      upsertLegacyShipmentForSellerOrder(db, {
        sellerOrderId: row.seller_order_id,
        fulfilmentId: row.id,
        provider: 'own_delivery',
        carrier: 'Seller Direct Delivery',
        trackingNumber: row.id,
        status: nextStatus === 'delivered' ? 'delivered' : nextStatus === 'delivery_failed' ? 'failed' : 'out_for_delivery',
        shippedAt: row.dispatched_at ?? nowIso,
        deliveredAt: nextStatus === 'delivered' ? nowIso : null,
        eventDescription: params.note?.trim() || params.failedReason?.trim() || `Seller updated own delivery to ${nextStatus}`,
      });
    }

    recordFulfilmentEvent(db, {
      fulfilmentId: row.id,
      source: 'seller',
      status: nextStatus,
      description:
        params.failedReason?.trim() ||
        params.note?.trim() ||
        `Own delivery updated to ${nextStatus.replaceAll('_', ' ')}.`,
      actor: params.actor,
      metadata: nextEvidence,
      occurredAt: nowIso,
    });
    recordOrderEvent(db, {
      orderId: row.order_id,
      sellerOrderId: row.seller_order_id,
      type: `fulfilment.own_delivery.${nextStatus}`,
      description:
        nextStatus === 'delivered'
          ? `Delivered via seller's own delivery${params.recipientName ? ` (received by ${params.recipientName})` : ''}.`
          : `Seller updated own delivery status to ${nextStatus.replaceAll('_', ' ')}.`,
      actor: params.actor,
    });

    rollupSellerOrderAndParentOrderStatus(db, row.seller_order_id);
    audit(db, params.actor, `fulfilment.own_delivery_${nextStatus}`, 'order_fulfilment', row.id, { status: row.status }, {
      status: nextStatus,
    });
  });

  if (order && (nextStatus === 'out_for_delivery' || nextStatus === 'delivered')) {
    void notify(db, {
      userId: order.user_id,
      email: order.email,
      type: `own_delivery_${nextStatus}`,
      subject:
        nextStatus === 'delivered'
          ? `Order ${order.order_number} delivered (Own Delivery)`
          : `Order ${order.order_number} is out for delivery`,
      body: `<p>Your order <strong>${escapeHtml(order.order_number)}</strong> has been marked <strong>${escapeHtml(nextStatus.replaceAll('_', ' '))}</strong> by the maker's delivery team.</p>`,
      dedupeKey: `own:${row.id}:${nextStatus}`,
    });
  }

  return { status: nextStatus };
}

export function updateExternalSupplierFulfilment(
  db: Db,
  params: {
    fulfilmentId: string;
    ownerSellerId?: string;
    actor: SessionUser;
    action: 'confirm_supplier' | 'place_external_order' | 'update_tracking' | 'delivered' | 'delivery_exception';
    supplierName?: string;
    externalOrderRef?: string;
    courierName?: string;
    trackingId?: string;
    trackingUrl?: string;
    dispatchDate?: string;
    deliveryStatus?: 'in_transit' | 'out_for_delivery';
    note?: string;
  },
): { status: string } {
  const row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', params.fulfilmentId);
  if (!row) throw notFound('Fulfilment record not found.');
  if (params.ownerSellerId && row.seller_id !== params.ownerSellerId) throw notFound('Fulfilment record not found.');
  if (row.fulfilment_method !== 'EXTERNAL_SUPPLIER') {
    throw conflict(
      'External supplier actions can only be applied to External Supplier Direct Delivery fulfilments.',
      'shipping_method_mismatch',
    );
  }
  if (row.status === 'cancelled') throw conflict('This fulfilment has been cancelled.');
  if (row.status === 'delivered') throw conflict('This fulfilment is already delivered.');

  if (params.trackingUrl) {
    parseTrackingUrlSafe(params.trackingUrl);
  }

  const nowIso = new Date().toISOString();
  let nextStatus = row.status;
  if (params.action === 'confirm_supplier') {
    if (!['order_confirmed', 'delivery_exception'].includes(row.status)) {
      throw conflict(`Cannot confirm supplier from "${row.status}".`);
    }
    nextStatus = 'supplier_confirmed';
  } else if (params.action === 'place_external_order') {
    if (!params.externalOrderRef?.trim()) {
      throw badRequest('Record the external supplier order ID / reference.', {
        externalOrderRef: 'External order reference is required.',
      });
    }
    nextStatus = 'external_order_placed';
  } else if (params.action === 'update_tracking') {
    if (!params.courierName?.trim() && !row.courier_name) {
      throw badRequest('Enter the courier name handling external dispatch.', { courierName: 'Required' });
    }
    if (!params.trackingId?.trim() && !row.tracking_number) {
      throw badRequest('Enter the external tracking ID.', { trackingId: 'Required' });
    }
    nextStatus = params.deliveryStatus === 'out_for_delivery' ? 'out_for_delivery' : 'in_transit';
  } else if (params.action === 'delivered') {
    if (!['external_order_placed', 'in_transit', 'out_for_delivery', 'supplier_confirmed'].includes(row.status)) {
      throw conflict(`Cannot mark delivered from "${row.status}".`);
    }
    nextStatus = 'delivered';
  } else if (params.action === 'delivery_exception') {
    nextStatus = 'delivery_exception';
  }

  const order = queryOne<{ order_number: string; email: string; user_id: string }>(
    db,
    'SELECT order_number, email, user_id FROM orders WHERE id = ?',
    row.order_id,
  );
  const nextSupplier = params.supplierName?.trim() || row.external_supplier_name;
  const nextExtOrderRef = params.externalOrderRef?.trim() || row.external_order_ref;
  const nextCourier = params.courierName?.trim() || row.courier_name;
  const nextTrackingId = params.trackingId?.trim() || row.tracking_number;
  const nextTrackingUrl = params.trackingUrl?.trim() || row.tracking_url;
  const nextDispatchedAt =
    nextStatus === 'in_transit' || nextStatus === 'out_for_delivery'
      ? params.dispatchDate?.trim() || row.dispatched_at || nowIso
      : row.dispatched_at;

  tx(db, () => {
    if (['in_transit', 'out_for_delivery', 'delivered'].includes(nextStatus)) {
      consumeInventoryForFulfilmentItems(
        db,
        row.id,
        order?.order_number ?? row.order_id,
        nextStatus === 'delivered' ? 'delivered' : 'shipped',
        `External supplier ${nextStatus}`,
      );
    }

    execute(
      db,
      `UPDATE order_fulfilments
          SET status = ?,
              external_supplier_name = ?,
              external_order_ref = ?,
              courier_name = ?,
              tracking_number = ?,
              tracking_url = ?,
              dispatched_at = ?,
              delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, ?) ELSE delivered_at END,
              updated_at = ?
        WHERE id = ?`,
      nextStatus,
      nextSupplier,
      nextExtOrderRef,
      nextCourier,
      nextTrackingId,
      nextTrackingUrl,
      nextDispatchedAt,
      nextStatus,
      nowIso,
      nowIso,
      row.id,
    );

    const siblingCount =
      queryOne<{ count: number }>(
        db,
        'SELECT COUNT(*) AS count FROM order_fulfilments WHERE seller_order_id = ?',
        row.seller_order_id,
      )?.count ?? 1;
    if (siblingCount === 1 && nextTrackingId && nextCourier && ['in_transit', 'out_for_delivery', 'delivered'].includes(nextStatus)) {
      upsertLegacyShipmentForSellerOrder(db, {
        sellerOrderId: row.seller_order_id,
        fulfilmentId: row.id,
        provider: 'external_supplier',
        carrier: nextCourier,
        trackingNumber: nextTrackingId,
        trackingUrl: nextTrackingUrl,
        status: nextStatus === 'delivered' ? 'delivered' : nextStatus === 'out_for_delivery' ? 'out_for_delivery' : 'in_transit',
        shippedAt: nextDispatchedAt ?? nowIso,
        deliveredAt: nextStatus === 'delivered' ? nowIso : null,
        eventDescription: params.note?.trim() || `External supplier dispatch via ${nextCourier} (${nextTrackingId})`,
      });
    }

    recordFulfilmentEvent(db, {
      fulfilmentId: row.id,
      source: params.actor.roles.includes('admin') ? 'admin' : 'seller',
      status: nextStatus,
      description:
        params.note?.trim() ||
        `External supplier fulfilment updated to ${nextStatus.replaceAll('_', ' ')}${nextTrackingId ? ` (tracking ${nextTrackingId})` : ''}.`,
      actor: params.actor,
      metadata: {
        externalSupplierName: nextSupplier,
        externalOrderRef: nextExtOrderRef,
        courierName: nextCourier,
        trackingId: nextTrackingId,
      },
      occurredAt: nowIso,
    });
    recordOrderEvent(db, {
      orderId: row.order_id,
      sellerOrderId: row.seller_order_id,
      type: `fulfilment.external.${nextStatus}`,
      description: `External supplier status: ${nextStatus.replaceAll('_', ' ')}${nextCourier && nextTrackingId ? ` (${nextCourier} · ${nextTrackingId})` : ''}.`,
      actor: params.actor,
    });

    rollupSellerOrderAndParentOrderStatus(db, row.seller_order_id);
    audit(db, params.actor, `fulfilment.external_${nextStatus}`, 'order_fulfilment', row.id, { status: row.status }, {
      status: nextStatus,
      externalOrderRef: nextExtOrderRef,
      courierName: nextCourier,
      trackingId: nextTrackingId,
    });
  });

  return { status: nextStatus };
}

function parseTrackingUrlSafe(url: string): void {
  const parsed = safeTrackingUrlSchema.safeParse(url);
  if (!parsed.success) {
    throw badRequest('Enter a valid http/https tracking URL.', { trackingUrl: 'Invalid tracking URL.' });
  }
}

/* ------------------------------------------------------------------ */
/* Partial Fulfilment Cancellation                                     */
/* ------------------------------------------------------------------ */

export async function cancelSingleFulfilment(
  db: Db,
  params: {
    fulfilmentId: string;
    ownerSellerId?: string;
    actor: SessionUser;
    reason?: string;
  },
): Promise<{ ok: boolean; cancelledItems: number; refundPaise: number }> {
  const row = queryOne<FulfilmentRow>(db, 'SELECT * FROM order_fulfilments WHERE id = ?', params.fulfilmentId);
  if (!row) throw notFound('Fulfilment record not found.');
  if (params.ownerSellerId && row.seller_id !== params.ownerSellerId) throw notFound('Fulfilment record not found.');
  if (row.status === 'cancelled') throw conflict('This fulfilment is already cancelled.');
  if (['picked_up', 'in_transit', 'out_for_delivery', 'delivered'].includes(row.status)) {
    throw conflict('Cannot cancel a fulfilment that is already in transit or delivered.');
  }

  // If Shiprocket order exists, attempt API cancellation first (best-effort without blocking cancellation if already cancelled remotely).
  if (row.fulfilment_method === 'SHIPROCKET' && (row.shiprocket_order_id || row.awb_code) && env.shiprocket.configured) {
    try {
      await cancelShiprocketPickupOrOrder({
        shiprocketOrderId: row.shiprocket_order_id,
        awbCode: row.awb_code,
      });
    } catch (err) {
      audit(db, params.actor, 'fulfilment.shiprocket_cancel_warning', 'order_fulfilment', row.id, null, {
        error: sanitizeShiprocketMessage(err),
      });
    }
  }

  const order = queryOne<{ order_number: string }>(db, 'SELECT order_number FROM orders WHERE id = ?', row.order_id);
  const nowIso = new Date().toISOString();

  const summary = tx(db, () => {
    const items = queryAll<{ id: string; product_id: string; quantity: number; line_subtotal_paise: number; discount_paise: number; status: string }>(
      db,
      'SELECT id, product_id, quantity, line_subtotal_paise, discount_paise, status FROM order_items WHERE fulfilment_id = ?',
      row.id,
    );
    let refundPaise = 0;
    for (const item of items) {
      if (item.status === 'ordered') {
        execute(
          db,
          'UPDATE inventory SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = ? WHERE product_id = ?',
          item.quantity,
          nowIso,
          item.product_id,
        );
        execute(
          db,
          `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
           VALUES (?, ?, ?, 'release', ?, 'Partial/fulfilment cancellation')`,
          newId('mov_'),
          item.product_id,
          -item.quantity,
          order?.order_number ?? row.order_id,
        );
      }
      if (item.status !== 'cancelled') {
        refundPaise += Math.max(0, item.line_subtotal_paise - item.discount_paise);
        execute(db, "UPDATE order_items SET status = 'cancelled' WHERE id = ?", item.id);
      }
    }

    execute(
      db,
      "UPDATE order_fulfilments SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?",
      nowIso,
      nowIso,
      row.id,
    );
    execute(
      db,
      `UPDATE shipping_sync_outbox SET status = 'dead_letter', last_error = 'Cancelled', updated_at = ?
        WHERE fulfilment_id = ? AND status IN ('pending','failed')`,
      nowIso,
      row.id,
    );

    const activeRemaining =
      queryOne<{ count: number }>(
        db,
        "SELECT COUNT(*) AS count FROM order_fulfilments WHERE seller_order_id = ? AND status != 'cancelled'",
        row.seller_order_id,
      )?.count ?? 0;

    if (activeRemaining === 0) {
      execute(
        db,
        "UPDATE seller_ledger_entries SET status = 'reversed' WHERE seller_order_id = ? AND status = 'pending'",
        row.seller_order_id,
      );
    }

    if (refundPaise > 0) {
      const orderPayment = queryOne<{ payment_method: string }>(
        db,
        'SELECT payment_method FROM orders WHERE id = ?',
        row.order_id,
      );
      const payment = queryOne<{ id: string }>(
        db,
        "SELECT id FROM payments WHERE order_id = ? AND status = 'paid' ORDER BY created_at DESC LIMIT 1",
        row.order_id,
      );
      if (orderPayment?.payment_method !== 'cod' || payment) {
        execute(
          db,
          `INSERT OR IGNORE INTO refunds
             (id, order_id, seller_order_id, payment_id, amount_paise, reason, status, requested_by, dedupe_key)
           VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
          newId('ref_'),
          row.order_id,
          row.seller_order_id,
          payment?.id ?? null,
          refundPaise,
          params.reason?.trim() || `Partial cancellation of ${row.fulfilment_method} fulfilment`,
          params.actor.id,
          `refund:fulfilment:${row.id}`,
        );
      }
    }

    recordFulfilmentEvent(db, {
      fulfilmentId: row.id,
      source: params.actor.roles.includes('admin') ? 'admin' : 'seller',
      status: 'cancelled',
      description: params.reason?.trim() || 'Fulfilment package cancelled.',
      actor: params.actor,
      occurredAt: nowIso,
    });
    recordOrderEvent(db, {
      orderId: row.order_id,
      sellerOrderId: row.seller_order_id,
      type: 'fulfilment.cancelled',
      description: params.reason?.trim() || `A package (${row.fulfilment_method}) in your order was cancelled.`,
      actor: params.actor,
    });
    rollupSellerOrderAndParentOrderStatus(db, row.seller_order_id);
    audit(db, params.actor, 'fulfilment.cancelled', 'order_fulfilment', row.id, { status: row.status }, {
      status: 'cancelled',
      refundPaise,
    });
    return { cancelledItems: items.length, refundPaise };
  });

  return { ok: true, ...summary };
}

/**
 * Automatically cancels any synced Shiprocket orders/AWBs belonging to a cancelled
 * seller order (or whole order) after customer/seller/admin cancellation.
 */
async function cancelRemoteShiprocketRows(
  db: Db,
  rows: FulfilmentRow[],
  actor?: SessionUser | null,
): Promise<void> {
  if (!env.shiprocket.configured || rows.length === 0) return;
  for (const row of rows) {
    if (row.fulfilment_method !== 'SHIPROCKET') continue;
    if (!row.shiprocket_order_id && !row.awb_code) continue;
    const cancelEventId = `sr-cancel:${row.id}`;
    const alreadyDone = queryOne<{ id: string }>(
      db,
      'SELECT id FROM fulfilment_events WHERE event_id = ?',
      cancelEventId,
    );
    if (alreadyDone) continue;
    try {
      const res = await cancelShiprocketPickupOrOrder({
        shiprocketOrderId: row.shiprocket_order_id,
        awbCode: row.awb_code,
      });
      recordFulfilmentEvent(db, {
        fulfilmentId: row.id,
        eventId: cancelEventId,
        source: 'shiprocket_api',
        status: 'cancelled',
        description: `Cancelled in Shiprocket automatically (${res.note}).`,
        actor,
      });
      audit(db, actor ?? null, 'fulfilment.shiprocket_cancelled', 'order_fulfilment', row.id, null, {
        shiprocketOrderId: row.shiprocket_order_id,
        awbCode: row.awb_code,
        note: res.note,
      });
    } catch (err) {
      const errMsg = sanitizeShiprocketMessage(err);
      recordFulfilmentEvent(db, {
        fulfilmentId: row.id,
        source: 'shiprocket_api',
        status: 'cancelled',
        description: `Local order cancelled; automatic Shiprocket cancel returned warning: ${errMsg}`,
        actor,
      });
      audit(db, actor ?? null, 'fulfilment.shiprocket_cancel_warning', 'order_fulfilment', row.id, null, {
        shiprocketOrderId: row.shiprocket_order_id,
        awbCode: row.awb_code,
        error: errMsg,
      });
    }
  }
}

export async function cancelShiprocketOrdersForSellerOrder(
  db: Db,
  sellerOrderId: string,
  actor?: SessionUser | null,
): Promise<void> {
  const rows = queryAll<FulfilmentRow>(
    db,
    "SELECT * FROM order_fulfilments WHERE seller_order_id = ? AND fulfilment_method = 'SHIPROCKET'",
    sellerOrderId,
  );
  await cancelRemoteShiprocketRows(db, rows, actor);
}

export async function cancelShiprocketOrdersForOrder(
  db: Db,
  orderId: string,
  actor?: SessionUser | null,
): Promise<void> {
  const rows = queryAll<FulfilmentRow>(
    db,
    "SELECT * FROM order_fulfilments WHERE order_id = ? AND fulfilment_method = 'SHIPROCKET'",
    orderId,
  );
  await cancelRemoteShiprocketRows(db, rows, actor);
}

/* ------------------------------------------------------------------ */
/* Hardened Shiprocket Tracking Webhook Handler                        */
/* ------------------------------------------------------------------ */

const SHIPROCKET_RANK: Record<string, number> = {
  pending_sync: 1,
  sync_failed: 2,
  shiprocket_order_created: 3,
  ready_to_ship: 4,
  awb_assigned: 5,
  pickup_scheduled: 6,
  picked_up: 7,
  shipped: 7,
  in_transit: 8,
  out_for_delivery: 9,
  delivered: 10,
  rto_initiated: 11,
  rto: 11,
  rto_delivered: 12,
  cancelled: 12,
};

function mapShiprocketWebhookStatus(rawStatus: string): {
  fulfilmentStatus: string;
  legacyStatus: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'rto';
} {
  const s = rawStatus.toUpperCase().trim();
  if (s.includes('DELIVERED') && !s.includes('UNDELIVERED') && !s.includes('RTO')) {
    return { fulfilmentStatus: 'delivered', legacyStatus: 'delivered' };
  }
  if (s.includes('OUT FOR DELIVERY') || s.includes('OFD')) {
    return { fulfilmentStatus: 'out_for_delivery', legacyStatus: 'out_for_delivery' };
  }
  if (s.includes('PICKED UP') || s.includes('MANIFESTED')) {
    return { fulfilmentStatus: 'picked_up', legacyStatus: 'shipped' };
  }
  if (s.includes('RTO') || s.includes('RETURN')) {
    return {
      fulfilmentStatus: s.includes('DELIVERED') ? 'rto_delivered' : 'rto_initiated',
      legacyStatus: 'rto',
    };
  }
  if (s.includes('CANCEL')) {
    return { fulfilmentStatus: 'cancelled', legacyStatus: 'failed' };
  }
  if (s.includes('UNDELIVERED') || s.includes('FAILED') || s.includes('LOST')) {
    return { fulfilmentStatus: 'in_transit', legacyStatus: 'failed' };
  }
  return { fulfilmentStatus: 'in_transit', legacyStatus: 'in_transit' };
}

function logWebhookEvent(
  db: Db,
  data: {
    eventKey: string | null;
    awbCode: string | null;
    shiprocketShipmentId: number | null;
    shiprocketOrderId: number | null;
    fulfilmentId: string | null;
    rawStatus: string;
    mappedStatus: string | null;
    outcome: string;
    note?: string;
    payload: Record<string, unknown>;
  },
): void {
  const summary = {
    awb: data.awbCode,
    shipment_id: data.shiprocketShipmentId,
    order_id: data.shiprocketOrderId,
    current_status: data.rawStatus,
    etd: typeof data.payload.etd === 'string' ? data.payload.etd : undefined,
  };
  execute(
    db,
    `INSERT INTO shipping_webhook_logs
       (id, provider, event_key, awb_code, shiprocket_shipment_id, shiprocket_order_id,
        fulfilment_id, raw_status, mapped_status, outcome, note, payload_summary_json)
     VALUES (?, 'shiprocket', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('swl_'),
    data.eventKey,
    data.awbCode,
    data.shiprocketShipmentId,
    data.shiprocketOrderId,
    data.fulfilmentId,
    data.rawStatus,
    data.mappedStatus,
    data.outcome,
    data.note ?? null,
    JSON.stringify(summary).slice(0, 1500),
  );
}

export async function processHardenedShippingWebhook(
  db: Db,
  payload: Record<string, unknown>,
): Promise<{
  ok: boolean;
  processed: boolean;
  status?: string;
  fulfilmentId?: string;
  shipmentId?: string;
  message?: string;
}> {
  const awb = typeof payload.awb === 'string' ? payload.awb.trim() : null;
  const shipmentIdRaw = payload.shipment_id ? Number(payload.shipment_id) : null;
  const shipmentId = shipmentIdRaw && Number.isFinite(shipmentIdRaw) ? shipmentIdRaw : null;
  const srOrderIdRaw = payload.sr_order_id ?? payload.order_id;
  const srOrderIdNum = srOrderIdRaw && /^\d+$/.test(String(srOrderIdRaw)) ? Number(srOrderIdRaw) : null;

  const rawStatus = String(payload.current_status ?? payload.shipment_status ?? '');
  if ((!awb && !shipmentId && !srOrderIdNum) || !rawStatus) {
    throw badRequest('Invalid courier webhook payload: missing tracking reference or status.');
  }

  const mapped = mapShiprocketWebhookStatus(rawStatus);
  const rawDesc = String(payload.current_status_desc ?? payload.scans_desc ?? rawStatus).trim().slice(0, 300);
  const occurredAt =
    typeof payload.current_timestamp === 'string' && payload.current_timestamp.trim()
      ? payload.current_timestamp.trim()
      : new Date().toISOString();
  const providerEventId = typeof payload.event_id === 'string' && payload.event_id.trim() ? payload.event_id.trim() : null;

  // Step 1: Match ONLY order_fulfilments rows.
  const fulfilment = queryOne<FulfilmentRow>(
    db,
    `SELECT * FROM order_fulfilments
      WHERE (awb_code IS NOT NULL AND awb_code = ?)
         OR (shiprocket_shipment_id IS NOT NULL AND shiprocket_shipment_id = ?)
         OR (shiprocket_order_id IS NOT NULL AND shiprocket_order_id = ?)
      ORDER BY created_at DESC LIMIT 1`,
    awb ?? '__NO_AWB__',
    shipmentId ?? -1,
    srOrderIdNum ?? -1,
  );

  // Also check if someone sent an external/own tracking number that collides by tracking_number alone
  if (!fulfilment && awb) {
    const nonShiprocket = queryOne<FulfilmentRow>(
      db,
      "SELECT * FROM order_fulfilments WHERE tracking_number = ? AND fulfilment_method != 'SHIPROCKET' LIMIT 1",
      awb,
    );
    if (nonShiprocket) {
      logWebhookEvent(db, {
        eventKey: providerEventId,
        awbCode: awb,
        shiprocketShipmentId: shipmentId,
        shiprocketOrderId: srOrderIdNum,
        fulfilmentId: nonShiprocket.id,
        rawStatus,
        mappedStatus: mapped.fulfilmentStatus,
        outcome: 'rejected_method_mismatch',
        note: `Webhook rejected because matched fulfilment uses ${nonShiprocket.fulfilment_method}, not SHIPROCKET.`,
        payload,
      });
      return { ok: true, processed: false, message: 'Non-Shiprocket fulfilment cannot be updated by courier webhook.' };
    }
  }

  if (fulfilment) {
    if (fulfilment.fulfilment_method !== 'SHIPROCKET') {
      logWebhookEvent(db, {
        eventKey: providerEventId,
        awbCode: awb,
        shiprocketShipmentId: shipmentId,
        shiprocketOrderId: srOrderIdNum,
        fulfilmentId: fulfilment.id,
        rawStatus,
        mappedStatus: mapped.fulfilmentStatus,
        outcome: 'rejected_method_mismatch',
        note: `Blocked webhook mutation of ${fulfilment.fulfilment_method} fulfilment.`,
        payload,
      });
      return { ok: true, processed: false, message: 'Non-Shiprocket fulfilment ignored.' };
    }

    const eventKey =
      providerEventId ?? `sr-wh:${fulfilment.id}:${awb ?? shipmentId ?? srOrderIdNum}:${mapped.fulfilmentStatus}:${rawDesc.slice(0, 60)}`;
    const dup = queryOne<{ id: string }>(db, 'SELECT id FROM fulfilment_events WHERE event_id = ?', eventKey);
    if (dup) {
      logWebhookEvent(db, {
        eventKey,
        awbCode: awb,
        shiprocketShipmentId: shipmentId,
        shiprocketOrderId: srOrderIdNum,
        fulfilmentId: fulfilment.id,
        rawStatus,
        mappedStatus: mapped.fulfilmentStatus,
        outcome: 'duplicate_ignored',
        payload,
      });
      return { ok: true, processed: false, status: fulfilment.status, message: 'Duplicate event ignored.' };
    }

    const nowIso = new Date().toISOString();
    const currentRank = SHIPROCKET_RANK[fulfilment.status] ?? 0;
    const nextRank = SHIPROCKET_RANK[mapped.fulfilmentStatus] ?? 0;
    const isOutOfOrder = nextRank < currentRank && fulfilment.status !== 'cancelled';

    const order = queryOne<{ order_number: string; email: string; user_id: string }>(
      db,
      'SELECT order_number, email, user_id FROM orders WHERE id = ?',
      fulfilment.order_id,
    );

    tx(db, () => {
      if (!isOutOfOrder && ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'].includes(mapped.fulfilmentStatus)) {
        consumeInventoryForFulfilmentItems(
          db,
          fulfilment!.id,
          order?.order_number ?? fulfilment!.order_id,
          mapped.fulfilmentStatus === 'delivered' ? 'delivered' : 'shipped',
          `Shiprocket ${mapped.fulfilmentStatus}`,
        );
      }

      if (!isOutOfOrder) {
        execute(
          db,
          `UPDATE order_fulfilments
              SET status = ?,
                  courier_name = COALESCE(?, courier_name),
                  dispatched_at = CASE WHEN ? IN ('picked_up','in_transit','out_for_delivery','delivered') THEN COALESCE(dispatched_at, ?) ELSE dispatched_at END,
                  delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, ?) ELSE delivered_at END,
                  updated_at = ?
            WHERE id = ?`,
          mapped.fulfilmentStatus,
          typeof payload.courier_name === 'string' && payload.courier_name.trim() ? payload.courier_name.trim() : null,
          mapped.fulfilmentStatus,
          nowIso,
          mapped.fulfilmentStatus,
          nowIso,
          nowIso,
          fulfilment!.id,
        );
      }

      recordFulfilmentEvent(db, {
        fulfilmentId: fulfilment!.id,
        eventId: eventKey,
        source: 'shiprocket_webhook',
        status: mapped.fulfilmentStatus,
        description: rawDesc || `Courier webhook: ${rawStatus}`,
        occurredAt,
      });

      const siblingCount =
        queryOne<{ count: number }>(
          db,
          'SELECT COUNT(*) AS count FROM order_fulfilments WHERE seller_order_id = ?',
          fulfilment!.seller_order_id,
        )?.count ?? 1;
      if (siblingCount === 1 && !isOutOfOrder && fulfilment!.awb_code) {
        upsertLegacyShipmentForSellerOrder(db, {
          sellerOrderId: fulfilment!.seller_order_id,
          fulfilmentId: fulfilment!.id,
          provider: 'shiprocket',
          carrier: fulfilment!.courier_name ?? 'Shiprocket',
          trackingNumber: fulfilment!.awb_code,
          status: mapped.legacyStatus,
          deliveredAt: mapped.fulfilmentStatus === 'delivered' ? nowIso : null,
          eventDescription: rawDesc,
          eventId: eventKey,
        });
      }

      if (!isOutOfOrder && mapped.fulfilmentStatus === 'delivered') {
        recordOrderEvent(db, {
          orderId: fulfilment!.order_id,
          sellerOrderId: fulfilment!.seller_order_id,
          type: 'fulfilment.delivered',
          description: 'Shiprocket confirmed delivery. Seller payout is now subject to the 7-day return window.',
        });
      }

      rollupSellerOrderAndParentOrderStatus(db, fulfilment!.seller_order_id);
      logWebhookEvent(db, {
        eventKey,
        awbCode: awb,
        shiprocketShipmentId: shipmentId,
        shiprocketOrderId: srOrderIdNum,
        fulfilmentId: fulfilment!.id,
        rawStatus,
        mappedStatus: mapped.fulfilmentStatus,
        outcome: isOutOfOrder ? 'out_of_order_preserved_history' : 'processed',
        payload,
      });
    });

    if (!isOutOfOrder && order && mapped.fulfilmentStatus === 'delivered') {
      void notify(db, {
        userId: order.user_id,
        email: order.email,
        type: 'order_delivered',
        subject: `Delivered: Your Dear Hills Order ${order.order_number}`,
        body: `<p>Your package (AWB: ${escapeHtml(fulfilment.awb_code ?? awb ?? '')}) has been delivered successfully.</p>`,
        dedupeKey: `delivered-ful:${fulfilment.id}:${fulfilment.awb_code ?? awb}`,
      });
    }

    return {
      ok: true,
      processed: true,
      status: isOutOfOrder ? fulfilment.status : mapped.fulfilmentStatus,
      fulfilmentId: fulfilment.id,
    };
  }

  // Step 2: Backwards-compatible lookup in legacy `shipments` ONLY where provider = 'shiprocket'
  const legacyShipment = queryOne<{
    id: string;
    seller_order_id: string;
    tracking_number: string;
    status: string;
    provider: string;
  }>(
    db,
    `SELECT id, seller_order_id, tracking_number, status, provider FROM shipments
      WHERE (tracking_number = ? OR (provider_shipment_id IS NOT NULL AND provider_shipment_id = ?))`,
    awb ?? '__NO_AWB__',
    shipmentId ?? -1,
  );

  if (!legacyShipment || legacyShipment.provider !== 'shiprocket') {
    logWebhookEvent(db, {
      eventKey: providerEventId,
      awbCode: awb,
      shiprocketShipmentId: shipmentId,
      shiprocketOrderId: srOrderIdNum,
      fulfilmentId: null,
      rawStatus,
      mappedStatus: mapped.legacyStatus,
      outcome: legacyShipment ? 'rejected_method_mismatch' : 'unmatched',
      note: legacyShipment ? `Legacy shipment uses provider=${legacyShipment.provider}` : 'No matching shipment found.',
      payload,
    });
    return { ok: true, processed: false, message: 'No matching Shiprocket shipment found.' };
  }

  const eventKey = providerEventId ?? `sr-wh:${legacyShipment.id}:${mapped.legacyStatus}:${rawDesc.slice(0, 60)}`;
  const existingEv = queryOne<{ id: string }>(db, 'SELECT id FROM shipment_events WHERE event_id = ?', eventKey);
  if (existingEv) {
    logWebhookEvent(db, {
      eventKey,
      awbCode: awb,
      shiprocketShipmentId: shipmentId,
      shiprocketOrderId: srOrderIdNum,
      fulfilmentId: null,
      rawStatus,
      mappedStatus: mapped.legacyStatus,
      outcome: 'duplicate_ignored',
      payload,
    });
    return { ok: true, processed: false, message: 'Duplicate event ignored.' };
  }

  const so = queryOne<{ id: string; order_id: string; status: string }>(
    db,
    'SELECT id, order_id, status FROM seller_orders WHERE id = ?',
    legacyShipment.seller_order_id,
  );
  const nowIso = new Date().toISOString();

  tx(db, () => {
    const deliveredAt = mapped.legacyStatus === 'delivered' ? nowIso : null;
    execute(
      db,
      `UPDATE shipments SET status = ?, delivered_at = COALESCE(?, delivered_at) WHERE id = ?`,
      mapped.legacyStatus,
      deliveredAt,
      legacyShipment.id,
    );
    execute(
      db,
      `INSERT OR IGNORE INTO shipment_events (id, shipment_id, event_id, status, description, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId('she_'),
      legacyShipment.id,
      eventKey,
      mapped.legacyStatus,
      rawDesc,
      nowIso,
    );

    // Sync any SHIPROCKET order_fulfilments under this seller order (never Own Delivery or External)
    const srFulfilments = queryAll<{ id: string; status: string }>(
      db,
      "SELECT id, status FROM order_fulfilments WHERE seller_order_id = ? AND fulfilment_method = 'SHIPROCKET'",
      legacyShipment.seller_order_id,
    );
    for (const sf of srFulfilments) {
      execute(
        db,
        `UPDATE order_fulfilments
            SET status = ?, delivered_at = COALESCE(?, delivered_at), updated_at = ?
          WHERE id = ?`,
        mapped.fulfilmentStatus,
        deliveredAt,
        nowIso,
        sf.id,
      );
      recordFulfilmentEvent(db, {
        fulfilmentId: sf.id,
        eventId: `${eventKey}:${sf.id}`,
        source: 'shiprocket_webhook',
        status: mapped.fulfilmentStatus,
        description: rawDesc,
        occurredAt: nowIso,
      });
    }

    if (so && mapped.legacyStatus === 'delivered' && so.status !== 'delivered') {
      execute(
        db,
        "UPDATE seller_orders SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ?",
        nowIso,
        nowIso,
        so.id,
      );
      execute(db, "UPDATE order_items SET status = 'delivered' WHERE seller_order_id = ? AND fulfilment_method = 'SHIPROCKET'", so.id);
      const availableAt = new Date(Date.now() + 7 * 86400_000).toISOString();
      execute(
        db,
        `UPDATE seller_ledger_entries SET status = 'eligible', available_at = ?
          WHERE seller_order_id = ? AND status = 'pending'`,
        availableAt,
        so.id,
      );
      recordOrderEvent(db, {
        orderId: so.order_id,
        sellerOrderId: so.id,
        type: 'seller_order.delivered',
        description: 'Delivery confirmed by courier webhook. The 7-day return window now applies.',
      });
      markCodDeliveredIfSettled(db, so.order_id, deliveredAt ?? nowIso);
      refreshOrderStatus(db, so.order_id);
    }

    logWebhookEvent(db, {
      eventKey,
      awbCode: awb,
      shiprocketShipmentId: shipmentId,
      shiprocketOrderId: srOrderIdNum,
      fulfilmentId: srFulfilments[0]?.id ?? null,
      rawStatus,
      mappedStatus: mapped.legacyStatus,
      outcome: 'processed',
      payload,
    });
  });

  return { ok: true, processed: true, status: mapped.legacyStatus, shipmentId: legacyShipment.id };
}

/* ------------------------------------------------------------------ */
/* Order / Admin Fulfilment View Hydration                             */
/* ------------------------------------------------------------------ */

function hydrateFulfilmentRows(db: Db, rows: FulfilmentRow[], includeInternal = false): OrderFulfilmentView[] {
  if (rows.length === 0) return [];

  return rows.map((row) => {
    const seller = queryOne<{ business_name: string }>(db, 'SELECT business_name FROM seller_profiles WHERE id = ?', row.seller_id);
    const so = queryOne<{ reference: string; order_number: string }>(
      db,
      `SELECT so.reference, o.order_number
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE so.id = ?`,
      row.seller_order_id,
    );
    const syncOutbox = includeInternal
      ? queryOne<{ attempts: number; last_error: string | null }>(
          db,
          'SELECT attempts, last_error FROM shipping_sync_outbox WHERE fulfilment_id = ?',
          row.id,
        )
      : undefined;

    const itemRows = queryAll<{
      id: string;
      product_id: string;
      name: string;
      sku: string;
      image_url: string | null;
      quantity: number;
      unit_price_paise: number;
      line_subtotal_paise: number;
      status: string;
      fulfilment_method: string;
    }>(
      db,
      `SELECT id, product_id, name, sku, image_url, quantity, unit_price_paise, line_subtotal_paise, status, fulfilment_method
         FROM order_items WHERE fulfilment_id = ? ORDER BY created_at`,
      row.id,
    );

    const eventRows = queryAll<{
      id: string;
      source: string;
      status: string;
      description: string | null;
      actor_role: string | null;
      occurred_at: string;
    }>(
      db,
      'SELECT id, source, status, description, actor_role, occurred_at FROM fulfilment_events WHERE fulfilment_id = ? ORDER BY occurred_at, created_at',
      row.id,
    );

    const pickupSnap = safeJsonParse<Record<string, unknown> | null>(row.pickup_snapshot_json, null);
    const cfgSnap = safeJsonParse<Record<string, unknown> | null>(row.shipping_config_snapshot_json, null);
    const evidence = safeJsonParse<{
      recipientName?: string;
      note?: string;
      proofUrl?: string;
      failedReason?: string;
      recordedAt?: string;
    } | null>(row.own_delivery_evidence_json, null);

    const items: OrderFulfilmentItemView[] = itemRows.map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.name,
      sku: i.sku,
      imageUrl: i.image_url,
      quantity: i.quantity,
      unitPricePaise: i.unit_price_paise,
      lineSubtotalPaise: i.line_subtotal_paise,
      status: i.status,
      fulfilmentMethod: i.fulfilment_method,
    }));

    const events: OrderFulfilmentEventView[] = eventRows.map((e) => ({
      id: e.id,
      source: e.source,
      status: e.status,
      description: e.description,
      actorRole: e.actor_role,
      occurredAt: e.occurred_at,
    }));

    return {
      id: row.id,
      orderId: row.order_id,
      orderNumber: so?.order_number,
      sellerOrderId: row.seller_order_id,
      sellerOrderReference: so?.reference,
      sellerId: row.seller_id,
      sellerName: seller?.business_name ?? 'Maker',
      fulfilmentMethod: (row.fulfilment_method as FulfilmentMethod | 'UNKNOWN') ?? 'UNKNOWN',
      status: row.status,
      provider: row.provider,
      pickupLocationId: row.pickup_location_id,
      pickupLocationSummary: pickupSnap
        ? {
            nickname: typeof pickupSnap.nickname === 'string' ? pickupSnap.nickname : undefined,
            shiprocketLocationName:
              typeof pickupSnap.shiprocketLocationName === 'string' ? pickupSnap.shiprocketLocationName : undefined,
            city: typeof pickupSnap.city === 'string' ? pickupSnap.city : undefined,
            state: typeof pickupSnap.state === 'string' ? pickupSnap.state : undefined,
            pincode: typeof pickupSnap.pincode === 'string' ? pickupSnap.pincode : undefined,
          }
        : null,
      packageWeightG: row.package_weight_g,
      packageLengthCm: row.package_length_cm,
      packageBreadthCm: row.package_breadth_cm,
      packageHeightCm: row.package_height_cm,
      shiprocketOrderId: row.shiprocket_order_id,
      shiprocketShipmentId: row.shiprocket_shipment_id,
      shiprocketSyncStatus: row.shiprocket_sync_status,
      syncAttempts: syncOutbox?.attempts ?? row.sync_attempts,
      lastSyncError: includeInternal ? row.last_sync_error ?? syncOutbox?.last_error ?? null : null,
      lastSyncedAt: row.last_synced_at,
      courierCompanyId: row.courier_company_id,
      courierName: row.courier_name,
      awbCode: row.awb_code,
      trackingNumber: row.tracking_number,
      trackingUrl: row.tracking_url,
      labelUrl: includeInternal ? row.label_url : null,
      pickupScheduledAt: row.pickup_scheduled_at,
      pickupToken: includeInternal ? row.pickup_token : null,
      readyToShipAt: row.ready_to_ship_at,
      dispatchedAt: row.dispatched_at,
      deliveredAt: row.delivered_at,
      cancelledAt: row.cancelled_at,
      externalSupplierName: row.external_supplier_name,
      externalOrderRef: row.external_order_ref,
      ownDeliveryEvidence: evidence,
      estimatedDeliveryText: row.estimated_delivery_text,
      adminReviewReason: includeInternal ? row.admin_review_reason : null,
      ...(includeInternal && cfgSnap ? { shippingConfigSnapshot: cfgSnap } : {}),
      items,
      events,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export function getFulfilmentsForOrder(db: Db, orderId: string, options: { includeInternal?: boolean } = {}): OrderFulfilmentView[] {
  const rows = queryAll<FulfilmentRow>(
    db,
    'SELECT * FROM order_fulfilments WHERE order_id = ? ORDER BY created_at, id',
    orderId,
  );
  return hydrateFulfilmentRows(db, rows, Boolean(options.includeInternal));
}

export function getFulfilmentsForSellerOrder(db: Db, sellerOrderId: string): OrderFulfilmentView[] {
  const rows = queryAll<FulfilmentRow>(
    db,
    'SELECT * FROM order_fulfilments WHERE seller_order_id = ? ORDER BY created_at, id',
    sellerOrderId,
  );
  return hydrateFulfilmentRows(db, rows, true);
}
