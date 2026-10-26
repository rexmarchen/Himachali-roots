import { queryAll, queryOne, type Db } from '../db.js';
import type { CampaignSummary } from '../../shared/types.js';
import { badRequest, conflict } from './http.js';

/**
 * Seasonal campaign helpers.
 *
 * The database stores the editorial state (draft/active/archived). Scheduled
 * and expired are derived from the configured window so a campaign cannot keep
 * selling after its end date because nobody remembered to switch it off.
 */

export type EffectiveCampaignStatus = CampaignSummary['status'];

export interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  poster_url: string | null;
  poster_alt: string | null;
  status: 'draft' | 'active' | 'archived';
  starts_at: string | null;
  ends_at: string | null;
  max_discount_bp: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignPriceMeta {
  slug: string;
  name: string;
  discountPercent: number;
}

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export function effectiveCampaignStatus(
  campaign: Pick<CampaignRow, 'status' | 'starts_at' | 'ends_at'>,
  now = new Date().toISOString(),
): EffectiveCampaignStatus {
  if (campaign.status === 'draft') return 'draft';
  if (campaign.status === 'archived') return 'archived';
  if (campaign.starts_at && campaign.starts_at > now) return 'scheduled';
  if (campaign.ends_at && campaign.ends_at < now) return 'expired';
  return 'active';
}

export function isCampaignPageVisible(campaign: CampaignRow): boolean {
  const status = effectiveCampaignStatus(campaign);
  return status === 'active' || status === 'scheduled' || status === 'expired';
}

export function discountPercentFor(basePricePaise: number, promoPricePaise: number): number {
  if (basePricePaise <= 0 || promoPricePaise >= basePricePaise) return 0;
  return Math.round(((basePricePaise - promoPricePaise) / basePricePaise) * 100);
}

/**
 * Validates a promotional unit price. Returns the discount in basis points.
 * The fractional check matches the SQL view so the database and the API agree
 * on whether a price is inside the campaign's maximum discount.
 */
export function validatePromoPrice(basePricePaise: number, promoPricePaise: number, maxDiscountBp: number): number {
  if (!Number.isInteger(promoPricePaise) || promoPricePaise <= 0) {
    throw badRequest('Enter a promotional price greater than zero.', { promoPricePaise: 'Must be greater than zero.' });
  }
  if (promoPricePaise >= basePricePaise) {
    throw badRequest('The promotional price must be lower than the current selling price.', {
      promoPricePaise: 'Must be below the selling price.',
    });
  }
  const discountBp = ((basePricePaise - promoPricePaise) * 10000) / basePricePaise;
  if (discountBp > maxDiscountBp) {
    throw badRequest(
      `That price is a ${Math.floor(discountBp / 100)}% discount; this campaign allows at most ${Math.floor(maxDiscountBp / 100)}%.`,
      { promoPricePaise: 'Exceeds the campaign discount cap.' },
    );
  }
  return Math.round(discountBp);
}

export function getCampaignBySlug(db: Db, slug: string): CampaignRow | undefined {
  return queryOne<CampaignRow>(db, 'SELECT * FROM campaigns WHERE slug = ?', slug);
}

export function getCampaignById(db: Db, id: string): CampaignRow | undefined {
  return queryOne<CampaignRow>(db, 'SELECT * FROM campaigns WHERE id = ?', id);
}

export function campaignProductCount(db: Db, campaignId: string): number {
  return campaignStats(db, campaignId).productCount;
}

/** Public counts and the deepest real saving the campaign has configured. */
export function campaignStats(db: Db, campaignId: string): { productCount: number; maxDiscountPercent: number } {
  const rows = queryAll<{
    price_paise: number;
    promo_price_paise: number;
    max_discount_bp: number;
    product_status: string;
    seller_status: string;
  }>(
    db,
    `SELECT p.price_paise, cp.promo_price_paise, c.max_discount_bp,
            p.status AS product_status, s.status AS seller_status
       FROM campaign_products cp
       JOIN campaigns c ON c.id = cp.campaign_id
       JOIN products p ON p.id = cp.product_id
       JOIN seller_profiles s ON s.id = p.seller_id
      WHERE cp.campaign_id = ?`,
    campaignId,
  );
  let productCount = 0;
  let maxDiscountPercent = 0;
  for (const row of rows) {
    if (row.product_status !== 'approved' || row.seller_status !== 'approved') continue;
    // Mirror the validity rules of active_campaign_prices so a later price edit
    // can never leave an overstated "up to X% off" in the storefront.
    if (row.promo_price_paise >= row.price_paise) continue;
    if ((row.price_paise - row.promo_price_paise) * 10000 > row.max_discount_bp * row.price_paise) continue;
    productCount += 1;
    maxDiscountPercent = Math.max(maxDiscountPercent, discountPercentFor(row.price_paise, row.promo_price_paise));
  }
  return { productCount, maxDiscountPercent };
}

export function mapCampaign(campaign: CampaignRow, productCount = 0, maxDiscountPercent = 0): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    slug: campaign.slug,
    description: campaign.description,
    posterUrl: campaign.poster_url,
    posterAlt: campaign.poster_alt,
    status: effectiveCampaignStatus(campaign),
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    maxDiscountBp: campaign.max_discount_bp,
    productCount,
    maxDiscountPercent,
  };
}

/** The campaign shown in storefront promotion slots: live now, with a poster. */
export function getFeaturedCampaign(db: Db): CampaignRow | undefined {
  const rows = queryAll<CampaignRow>(
    db,
    `SELECT * FROM campaigns
      WHERE status = 'active'
        AND poster_url IS NOT NULL
        AND (starts_at IS NULL OR starts_at <= ${NOW_SQL})
        AND (ends_at IS NULL OR ends_at >= ${NOW_SQL})
      ORDER BY created_at DESC`,
  );
  // A banner for an offer with nothing eligible would send shoppers to an empty
  // shelf, so a campaign only earns the homepage slot when it has a real
  // product to sell. The offer page remains addressable either way.
  return rows.find(
    (row) => effectiveCampaignStatus(row) === 'active' && campaignStats(db, row.id).productCount > 0,
  );
}

/**
 * Attaches the winning campaign's public slug/name to product summaries. A
 * product may belong to only one live campaign (enforced when prices are
 * configured), so the result is deterministic.
 */
export function attachCampaignMeta<T extends { id: string; pricePaise: number; originalPricePaise?: number | null }>(
  db: Db,
  items: T[],
): (T & { campaignSlug: string | null; campaignName: string | null })[] {
  if (items.length === 0) return [];
  const placeholders = items.map(() => '?').join(',');
  const rows = queryAll<{
    product_id: string;
    slug: string;
    name: string;
    promo_price_paise: number;
    price_paise: number;
  }>(
    db,
    `SELECT cp.product_id, c.slug, c.name, cp.promo_price_paise, p.price_paise
       FROM campaign_products cp
       JOIN campaigns c ON c.id = cp.campaign_id
       JOIN products p ON p.id = cp.product_id
      WHERE cp.product_id IN (${placeholders})
        AND c.status = 'active'
        AND (c.starts_at IS NULL OR c.starts_at <= ${NOW_SQL})
        AND (c.ends_at IS NULL OR c.ends_at >= ${NOW_SQL})
        AND cp.promo_price_paise < p.price_paise
        AND (p.price_paise - cp.promo_price_paise) * 10000 <= c.max_discount_bp * p.price_paise
      ORDER BY cp.created_at, c.created_at`,
    ...items.map((item) => item.id),
  );
  const byProduct = new Map<string, { slug: string; name: string }>();
  for (const row of rows) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, { slug: row.slug, name: row.name });
  }
  return items.map((item) => {
    const meta = byProduct.get(item.id);
    return { ...item, campaignSlug: meta?.slug ?? null, campaignName: meta?.name ?? null };
  });
}

/** Ensures a product is not already promised to another live or scheduled campaign. */
export function assertProductNotInAnotherCampaign(
  db: Db,
  campaignId: string,
  productId: string,
  now = new Date().toISOString(),
): void {
  const rows = queryAll<CampaignRow>(
    db,
    `SELECT c.* FROM campaign_products cp JOIN campaigns c ON c.id = cp.campaign_id
      WHERE cp.product_id = ? AND c.id != ? AND c.status = 'active'`,
    productId,
    campaignId,
  );
  const clash = rows.find((row) => {
    const status = effectiveCampaignStatus(row, now);
    return status === 'active' || status === 'scheduled';
  });
  if (clash) {
    throw conflict(`This product is already part of the live campaign “${clash.name}”.`, 'campaign_conflict');
  }
}

export function validateCampaignWindow(startsAt: string | null, endsAt: string | null): void {
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw badRequest('The campaign end must be after its start.', { endsAt: 'Must be after the start.' });
  }
}
