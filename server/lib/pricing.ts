import { env } from '../env.js';
import { queryOne, type Db } from '../db.js';
import { badRequest } from './http.js';

/**
 * All monetary inputs/outputs are integer paise. Never use floating point for
 * a final monetary value; the only division happens in these helpers and is
 * rounded exactly once.
 */

export function shippingFor(subtotalAfterDiscountPaise: number): number {
  if (subtotalAfterDiscountPaise <= 0) return 0;
  if (subtotalAfterDiscountPaise >= env.freeShippingThresholdPaise) return 0;
  return env.flatShippingPaise;
}

/** Prices are GST-inclusive. Extract the tax component without changing the payable total. */
export function taxComponentInclusive(amountPaise: number, rateBp: number): number {
  if (rateBp <= 0 || amountPaise <= 0) return 0;
  return Math.round((amountPaise * rateBp) / (10000 + rateBp));
}

/** Split an integer amount across weights (largest remainder), guaranteeing exact sums. */
export function allocate(amountPaise: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0 || amountPaise === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amountPaise * w) / totalWeight);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = amountPaise - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const result = [...floors];
  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    result[order[i].index] += 1;
    remainder -= 1;
  }
  return result;
}

export function resolveCommissionBp(db: Db, sellerId: string, categoryId: string, now = new Date().toISOString()): number {
  const sellerRule = queryOne<{ rate_bp: number }>(
    db,
    `SELECT rate_bp FROM commission_rules
      WHERE scope = 'seller' AND seller_id = ? AND is_active = 1 AND effective_from <= ?
      ORDER BY effective_from DESC LIMIT 1`,
    sellerId,
    now,
  );
  if (sellerRule) return sellerRule.rate_bp;

  const categoryRule = queryOne<{ rate_bp: number }>(
    db,
    `SELECT rate_bp FROM commission_rules
      WHERE scope = 'category' AND category_id = ? AND is_active = 1 AND effective_from <= ?
      ORDER BY effective_from DESC LIMIT 1`,
    categoryId,
    now,
  );
  if (categoryRule) return categoryRule.rate_bp;

  const globalRule = queryOne<{ rate_bp: number }>(
    db,
    `SELECT rate_bp FROM commission_rules
      WHERE scope = 'global' AND is_active = 1 AND effective_from <= ?
      ORDER BY effective_from DESC LIMIT 1`,
    now,
  );
  return globalRule?.rate_bp ?? env.defaultCommissionBp;
}

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  type: 'percent' | 'fixed';
  value: number;
  min_order_paise: number;
  max_discount_paise: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: number;
}

export function evaluateCoupon(
  db: Db,
  code: string,
  userId: string,
  subtotalPaise: number,
  now = new Date().toISOString(),
): { coupon: CouponRow; discountPaise: number } {
  const normalized = code.trim().toUpperCase();
  const coupon = queryOne<CouponRow>(db, 'SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', normalized);
  if (!coupon || coupon.is_active !== 1) throw badRequest('That coupon code is not valid.', { coupon: 'Invalid coupon code.' });
  if (coupon.starts_at && coupon.starts_at > now) throw badRequest('That coupon is not active yet.', { coupon: 'Not yet active.' });
  if (coupon.ends_at && coupon.ends_at < now) throw badRequest('That coupon has expired.', { coupon: 'Expired.' });
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    throw badRequest('That coupon has reached its usage limit.', { coupon: 'Usage limit reached.' });
  }
  const userUses = queryOne<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?',
    coupon.id,
    userId,
  );
  if ((userUses?.count ?? 0) >= coupon.per_user_limit) {
    throw badRequest('You have already used this coupon.', { coupon: 'Already used.' });
  }
  if (subtotalPaise < coupon.min_order_paise) {
    throw badRequest(
      `This coupon needs a minimum order of ₹${(coupon.min_order_paise / 100).toLocaleString('en-IN')}.`,
      { coupon: 'Order value too low.' },
    );
  }
  let discount =
    coupon.type === 'percent'
      ? Math.round((subtotalPaise * coupon.value) / 100)
      : coupon.value;
  if (coupon.max_discount_paise !== null) discount = Math.min(discount, coupon.max_discount_paise);
  discount = Math.max(0, Math.min(discount, subtotalPaise));
  return { coupon, discountPaise: discount };
}

export function commissionOn(basisPaise: number, rateBp: number): number {
  return Math.max(0, Math.round((basisPaise * rateBp) / 10000));
}

/** Human-readable platform fee basis explanation used across seller UI and docs. */
export const COMMISSION_BASIS_NOTE =
  'Platform fee (12%) is calculated on the product value after discounts, excluding shipping and taxes.';
