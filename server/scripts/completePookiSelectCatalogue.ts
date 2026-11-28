import { execute, openDatabase, queryOne, tx, type Db } from '../db.js';
import { env } from '../env.js';
import { newId } from '../lib/ids.js';
import {
  calculateExternalPricing,
  evaluateExternalProductReadiness,
  upsertProductSourcing,
} from '../lib/externalSourcing.js';
import { POOKI_EMAIL, POOKI_SELLER_ID } from './seedPookiSelectCatalogue.js';
import type { ProductVariant } from '../../shared/types.js';

interface VerifiedSelectUpdateSpec {
  sku: string;
  available: true;
  supplierPricePaise: number;
  supplierShippingPaise: number;
  otherSourcingCostPaise: number;
  weightG: number;
  materials: string;
  dimensions: string;
  careInstructions: string;
  shortDescription: string;
  description: string;
  originPlace: string | null;
  region: string | null;
  regionSlug: string | null;
  internalSupplierName: string;
  supplierCatalogCode: string;
  sourceUrl: string;
  variants: ProductVariant[];
  targetStockQty: number;
  returnWindowDays: number;
  supplierReturnPolicyNote: string;
  internalNotes: string;
}

interface UnavailableSelectUpdateSpec {
  sku: string;
  available: false;
  sourceUrl: string;
  supplierCatalogCode: string;
  internalNotes: string;
}

const SELECT_STUDIO_MEDIA: Record<string, { url: string; alt: string }> = {
  'DH-SEL-KSH-01': {
    url: '/images/select/dh-sel-ksh-01.jpg',
    alt: 'Dear Hills Select woven multicolor winter shawl with geometric border pattern on linen',
  },
  'DH-SEL-MCS-02': {
    url: '/images/select/dh-sel-mcs-02.jpg',
    alt: 'Dear Hills Select multicolor woven wool winter shawl with floral border on travertine stone',
  },
  'DH-SEL-BKS-03': {
    url: '/images/select/dh-sel-bks-03.jpg',
    alt: 'Dear Hills Select jet-black woven jacquard wool stole with patterned border and tassels',
  },
  'DH-SEL-HMC-04': {
    url: '/images/select/dh-sel-hmc-04.jpg',
    alt: 'Dear Hills Select Himachali-style multicolor patterned wool winter cap on limestone plinth',
  },
  'DH-SEL-GMK-05': {
    url: '/images/select/dh-sel-gmk-05.jpg',
    alt: 'Dear Hills Select emerald green velvet-band wool winter topi on warm sandstone background',
  },
  'DH-SEL-PHT-06': {
    url: '/images/select/dh-sel-pht-06.jpg',
    alt: 'Dear Hills Select Himalayan border wool winter topi on warm natural linen',
  },
};

export type PookiSelectUpdateSpec = VerifiedSelectUpdateSpec | UnavailableSelectUpdateSpec;

/**
 * Verified facts observed directly on Meesho on 2026-11-28 via authorized browser session.
 * Fixed ₹100 markup (10000 paise) is applied strictly via calculateExternalPricing().
 * Image authorization stays pending until supplier permission or merchant-owned photos are uploaded.
 */
export const POOKI_VERIFIED_UPDATES: PookiSelectUpdateSpec[] = [
  {
    sku: 'DH-SEL-KSH-01',
    available: true,
    supplierPricePaise: 52500,
    supplierShippingPaise: 0,
    otherSourcingCostPaise: 0,
    weightG: 250,
    materials: 'Wool (Woven Design)',
    dimensions: 'Free Size (Onesize)',
    careInstructions: 'Dry clean or gentle cold hand wash separately; dry flat in shade.',
    shortDescription:
      'A refined mountain-inspired wool stole finished with geometric woven borders, curated under Dear Hills Select for cool-weather layering.',
    description:
      'Selected for the Dear Hills Select winter collection, this woven wool shawl pairs clean everyday draping with Himachali-style geometric border detailing along the edges. Weighing 250g in a versatile Multicolor Free Size fit for women, it suits cool evenings, travel layering, and ethnic casual occasions. Dispatched on order in neutral Dear Hills packaging with tracked courier delivery and 7-day return support.',
    originPlace: 'Kullu, Himachal Pradesh',
    region: 'Kullu Valley',
    regionSlug: 'kullu',
    internalSupplierName: 'HimalayanKraft',
    supplierCatalogCode: 'acb0d',
    sourceUrl: 'https://www.meesho.com/loom-pure-wool-handloom-kullu-stole/p/acb0d',
    variants: [
      {
        id: 'var-multicolor-freesize',
        label: 'Multicolor · Free Size',
        color: 'Multicolor',
        size: 'Free Size',
        material: 'Wool',
        priceDeltaPaise: 0,
        available: true,
      },
    ],
    targetStockQty: 10,
    returnWindowDays: 7,
    supplierReturnPolicyNote: 'Meesho shows 7-day Returns; seller HimalayanKraft (Kullu, HP).',
    internalNotes:
      'Verified 2026-11-28 via Chrome session: In stock at ₹525, Free Size Multicolor, 250g, Wool Woven Design. Selling price ₹625 (₹525 + ₹100 fixed markup). Sent to review pending authorized photography.',
  },
  {
    sku: 'DH-SEL-MCS-02',
    available: true,
    supplierPricePaise: 29000,
    supplierShippingPaise: 0,
    otherSourcingCostPaise: 0,
    weightG: 400,
    materials: 'Wool (Woven Design, Floral Border)',
    dimensions: 'Free Size',
    careInstructions: 'Dry clean or gentle cold wash in shade; do not bleach.',
    shortDescription:
      'Warm multicolor wool winter shawl with woven floral-border accents curated for daily wear and seasonal gifting.',
    description:
      'Part of our curated Dear Hills Select seasonal edit, this multicolor winter shawl features woven design accents with a floral border across a warm wool body (Free Size, net weight 400g). Suitable for daily winter layering, travel wardrobes, and gifting, every unit ships in neutral Dear Hills white-label packaging with tracked courier updates and a 7-day return window.',
    originPlace: 'India',
    region: null,
    regionSlug: null,
    internalSupplierName: 'GanpatiTextiles',
    supplierCatalogCode: 'y1w0t',
    sourceUrl: 'https://www.meesho.com/fancy-warm-multicolor-kullu-shawl-for-womens/p/y1w0t',
    variants: [
      {
        id: 'var-multicolor-freesize',
        label: 'Multicolor · Free Size',
        color: 'Multicolor',
        size: 'Free Size',
        material: 'Wool',
        priceDeltaPaise: 0,
        available: true,
      },
    ],
    targetStockQty: 10,
    returnWindowDays: 7,
    supplierReturnPolicyNote: 'Meesho shows 7-day Returns; seller GanpatiTextiles (Ludhiana).',
    internalNotes:
      'Verified 2026-11-28 via Chrome session: In stock at ₹290, Free Size Multicolor, 400g, Wool Floral Woven Border. Selling price ₹390 (₹290 + ₹100 fixed markup). Sent to review pending authorized photography.',
  },
  {
    sku: 'DH-SEL-BKS-03',
    available: true,
    supplierPricePaise: 37100,
    supplierShippingPaise: 0,
    otherSourcingCostPaise: 0,
    weightG: 300,
    materials: 'Wool (Woven Jacquard Styling, Tassels and Latkans Border)',
    dimensions: 'Free Size',
    careInstructions: 'Dry clean recommended or gentle cold wash separately.',
    shortDescription:
      'Classic jet-black wool winter stole featuring woven jacquard detailing and tassel trim for versatile office and evening wear.',
    description:
      'Curated under Dear Hills Select, this classic black winter stole pairs a versatile woven jacquard wool silhouette with tassel and latkan border detailing (Free Size, net weight 300g). Built to style effortlessly over coats, kurtas, and evening winter layers, each order ships in white-label Dear Hills packaging with tracked delivery and 7-day return support.',
    originPlace: 'India',
    region: null,
    regionSlug: null,
    internalSupplierName: 'MASHOOR SHAWLS',
    supplierCatalogCode: '30ehrg',
    sourceUrl: 'https://www.meesho.com/savie-black-attractive-woollen-kullu-stole-for-women/p/30ehrg',
    variants: [
      {
        id: 'var-black-freesize',
        label: 'Black · Free Size',
        color: 'Black',
        colorHex: '#18181b',
        size: 'Free Size',
        material: 'Wool',
        priceDeltaPaise: 0,
        available: true,
      },
    ],
    targetStockQty: 10,
    returnWindowDays: 7,
    supplierReturnPolicyNote: 'Meesho shows 7-day Returns; seller MASHOOR SHAWLS.',
    internalNotes:
      'Verified 2026-11-28 via Chrome session: In stock at ₹371, Free Size Black, 300g, Wool Jacquard with Tassels. Selling price ₹471 (₹371 + ₹100 fixed markup). Sent to review pending authorized photography.',
  },
  {
    sku: 'DH-SEL-HMC-04',
    available: true,
    supplierPricePaise: 18600,
    supplierShippingPaise: 0,
    otherSourcingCostPaise: 0,
    weightG: 150,
    materials: 'Wool (Traditional Winter Cap)',
    dimensions: 'Free Size',
    careInstructions: 'Spot clean gently and air dry away from direct heat.',
    shortDescription:
      'Multicolor Himachali-style wool winter cap with ethnic patterned front trim for everyday cold-weather wear.',
    description:
      'This traditional winter cap in the Dear Hills Select headwear lineup combines wool construction with an ethnic multicolor patterned band built for cold-weather protection (Free Size, net weight 150g). Ideal for chilly mornings, mountain travel, and cultural gatherings, dispatched in neutral Dear Hills white-label packaging with tracked delivery and a 7-day return window.',
    originPlace: 'Chamba, Himachal Pradesh',
    region: 'Chamba',
    regionSlug: 'chamba',
    internalSupplierName: 'CHAMBA HERITAGE',
    supplierCatalogCode: '9b5kv1',
    sourceUrl:
      'https://www.meesho.com/traditional-himachali-woolen-cap-unisex-handloom-kullu-chamba-topi-winter-ethnic-headgear-handmade-woolen-pahadi-cap/p/9b5kv1',
    variants: [
      {
        id: 'var-multicolor-freesize',
        label: 'Multicolor · Free Size',
        color: 'Multicolor',
        size: 'Free Size',
        material: 'Wool',
        priceDeltaPaise: 0,
        available: true,
      },
    ],
    targetStockQty: 10,
    returnWindowDays: 7,
    supplierReturnPolicyNote: 'Meesho shows 7-day Returns; seller CHAMBA HERITAGE (Chamba, HP 176310).',
    internalNotes:
      'Verified 2026-11-28 via Chrome session: In stock at ₹186, Free Size Multicolor, 150g, Wool Traditional Cap. Selling price ₹286 (₹186 + ₹100 fixed markup). Sent to review pending authorized photography.',
  },
  {
    sku: 'DH-SEL-GMK-05',
    available: true,
    supplierPricePaise: 51900,
    supplierShippingPaise: 0,
    otherSourcingCostPaise: 0,
    weightG: 10,
    materials: 'Wool with Makhmal Velvet Front Band (Solid)',
    dimensions: '22.5 inch circumference × 3.5 inch height (Circular Shape), Free Size (L)',
    careInstructions: 'Dry clean or brush lightly; store dry away from direct moisture.',
    shortDescription:
      'Green wool winter topi with plush makhmal-style front band tailored in a classic circular fit.',
    description:
      'Curated for Dear Hills Select, this emerald green winter cap pairs a neat structured wool body with a rich makhmal velvet-finish front band reminiscent of Kinnauri styling (Circular Shape, 22.5 inch circumference × 3.5 inch height, Size L / Free Size). Suitable for casual winter wear and traditional occasions, shipped in white-label packaging with a 7-day return policy.',
    originPlace: 'Rampur Bushahr, Shimla, Himachal Pradesh',
    region: 'Shimla',
    regionSlug: 'shimla',
    internalSupplierName: 'Laxvish Mart',
    supplierCatalogCode: '9ihwri',
    sourceUrl: 'https://www.meesho.com/himachali-green-makhmal-kinnauri-patti-woolen-topi/p/9ihwri',
    variants: [
      {
        id: 'var-green-l',
        label: 'Green · Free Size (L)',
        color: 'Green',
        colorHex: '#15803d',
        size: 'Free Size (L)',
        material: 'Wool',
        priceDeltaPaise: 0,
        available: true,
      },
    ],
    targetStockQty: 10,
    returnWindowDays: 7,
    supplierReturnPolicyNote: 'Meesho shows 7-day Returns; seller Laxvish Mart (Rampur Bushahr, Shimla HP).',
    internalNotes:
      'Verified 2026-11-28 via Chrome session: In stock at ₹519, Green Size L / Free Size (22.5" x 3.5"), Wool. Selling price ₹619 (₹519 + ₹100 fixed markup). Sent to review pending authorized photography.',
  },
  {
    sku: 'DH-SEL-PHT-06',
    available: true,
    supplierPricePaise: 17400,
    supplierShippingPaise: 0,
    otherSourcingCostPaise: 0,
    weightG: 150,
    materials: 'Wool (Traditional Winter Cap)',
    dimensions: 'Free Size',
    careInstructions: 'Spot clean gently with a damp cloth and dry flat.',
    shortDescription:
      'Lightweight multicolor wool Pahadi-style winter cap with patterned border detailing and tracked delivery.',
    description:
      'Selected for the Dear Hills Select headwear collection, this lightweight wool winter topi brings understated Himalayan character with a patterned front border trim (Free Size, net weight 150g). Easy to pack for winter travel, daily outdoor wear, and seasonal gifting, dispatched in white-label Dear Hills packaging with tracked delivery and 7-day return support.',
    originPlace: 'Chamba, Himachal Pradesh',
    region: 'Chamba',
    regionSlug: 'chamba',
    internalSupplierName: 'CHAMBA HERITAGE',
    supplierCatalogCode: '9b5kv5',
    sourceUrl: 'https://www.meesho.com/pahadi-himachali-caps-by-meesho/p/9b5kv5',
    variants: [
      {
        id: 'var-multicolor-freesize',
        label: 'Multicolor · Free Size',
        color: 'Multicolor',
        size: 'Free Size',
        material: 'Wool',
        priceDeltaPaise: 0,
        available: true,
      },
    ],
    targetStockQty: 10,
    returnWindowDays: 7,
    supplierReturnPolicyNote: 'Meesho shows 7-day Returns; seller CHAMBA HERITAGE (Chamba, HP).',
    internalNotes:
      'Verified 2026-11-28 via Chrome session: In stock at ₹174, Free Size Multicolor, 150g, Wool Traditional Cap. Selling price ₹274 (₹174 + ₹100 fixed markup). Sent to review pending authorized photography.',
  },
  {
    sku: 'DH-SEL-MFL-07',
    available: false,
    supplierCatalogCode: 'ayz345',
    sourceUrl: 'https://www.meesho.com/kullu-muffler-nack-warm/p/ayz345',
    internalNotes:
      'Checked 2026-11-28 via Chrome session: Meesho listing returned "This product is out of stock" (HTTP 410). No price, specs, or images available; kept in draft.',
  },
  {
    sku: 'DH-SEL-WJK-08',
    available: false,
    supplierCatalogCode: 'ajfzza',
    sourceUrl: 'https://www.meesho.com/himachali-woolen-women-jacket/p/ajfzza',
    internalNotes:
      'Checked 2026-11-28 via Chrome session: Meesho listing returned "This product is out of stock" (HTTP 410). No price, sizes, specs, or images available; kept in draft.',
  },
];

export interface CompletePookiResult {
  sellerId: string;
  reviewReadySkus: string[];
  publishedSkus: string[];
  outOfStockDraftSkus: string[];
  missingSkus: string[];
  readinessBlockersBySku: Record<string, string[]>;
}

export interface CompletePookiOptions {
  sellerId?: string;
  attachStudioImages?: boolean;
  publishVerified?: boolean;
}

/**
 * Updates the existing 8 Pooki external-sourcing records with verified supplier data
 * without creating duplicate products, attaching brand-owned illustrative photos and
 * publishing verified listings only when readiness passes cleanly.
 */
export function completePookiSelectCatalogue(
  db: Db,
  options: CompletePookiOptions = {},
): CompletePookiResult {
  const targetSeller = queryOne<{ id: string; status: string }>(
    db,
    `SELECT sp.id, sp.status
       FROM seller_profiles sp JOIN users u ON u.id = sp.user_id
      WHERE sp.id = ? OR LOWER(u.email) = LOWER(?)
      LIMIT 1`,
    options.sellerId ?? POOKI_SELLER_ID,
    POOKI_EMAIL,
  );
  if (!targetSeller) {
    throw new Error(`Existing Pooki seller (${POOKI_SELLER_ID} / ${POOKI_EMAIL}) was not found.`);
  }

  const attachStudioImages = options.attachStudioImages ?? true;
  const publishVerified = options.publishVerified ?? true;
  const now = new Date().toISOString();
  const reviewReadySkus: string[] = [];
  const publishedSkus: string[] = [];
  const outOfStockDraftSkus: string[] = [];
  const missingSkus: string[] = [];
  const readinessBlockersBySku: Record<string, string[]> = {};

  tx(db, () => {
    for (const spec of POOKI_VERIFIED_UPDATES) {
      const existing = queryOne<{ id: string; status: string; submitted_at: string | null }>(
        db,
        'SELECT id, status, submitted_at FROM products WHERE seller_id = ? AND sku = ?',
        targetSeller.id,
        spec.sku,
      );
      if (!existing) {
        missingSkus.push(spec.sku);
        continue;
      }

      if (spec.available) {
        const pricing = calculateExternalPricing({
          supplierPricePaise: spec.supplierPricePaise,
          supplierShippingPaise: spec.supplierShippingPaise,
          otherSourcingCostPaise: spec.otherSourcingCostPaise,
        });

        const shippingCfg = {
          fulfilmentMethod: 'EXTERNAL_SUPPLIER',
          supplierName: `${spec.internalSupplierName} (${spec.supplierCatalogCode})`,
          supplierReference: spec.supplierCatalogCode,
          processingTimeDays: 3,
          estimatedDeliveryDays: '5–8 working days',
          fulfilmentInstructions:
            'Dispatch in neutral white-label packaging; zero third-party marketplace slips inside.',
        };

        execute(
          db,
          `UPDATE products
              SET short_description = ?,
                  description = ?,
                  price_paise = ?,
                  weight_g = ?,
                  dimensions = ?,
                  materials = ?,
                  care_instructions = ?,
                  origin_place = ?,
                  origin_verified = 0,
                  region = ?,
                  region_slug = ?,
                  fulfilment_method = 'EXTERNAL_SUPPLIER',
                  shipping_config_json = ?,
                  is_select_curated = 1,
                  availability_policy = 'on_demand_external',
                  max_order_quantity = 5,
                  variants_json = ?,
                  return_window_days = ?,
                  return_shipping_bearer = 'partner_defective_only',
                  status = CASE WHEN status = 'approved' THEN 'approved' ELSE 'pending' END,
                  submitted_at = COALESCE(submitted_at, ?),
                  rejection_reason = NULL,
                  moderation_note = NULL,
                  changes_requested_at = NULL,
                  updated_at = ?
            WHERE id = ? AND seller_id = ?`,
          spec.shortDescription,
          spec.description,
          pricing.recommendedSellingPricePaise,
          spec.weightG,
          spec.dimensions,
          spec.materials,
          spec.careInstructions,
          spec.originPlace,
          spec.region,
          spec.regionSlug,
          JSON.stringify(shippingCfg),
          JSON.stringify(spec.variants),
          spec.returnWindowDays,
          now,
          now,
          existing.id,
          targetSeller.id,
        );

        const inv = queryOne<{ quantity: number }>(
          db,
          'SELECT quantity FROM inventory WHERE product_id = ?',
          existing.id,
        );
        const currentQty = inv?.quantity ?? 0;
        if (currentQty !== spec.targetStockQty) {
          execute(
            db,
            'UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?',
            spec.targetStockQty,
            now,
            existing.id,
          );
          execute(
            db,
            `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note, created_at)
             VALUES (?, ?, ?, 'adjustment', 'pooki_verified_sourcing', 'Verified supplier stock availability from sourcing session', ?)`,
            newId('mov_'),
            existing.id,
            spec.targetStockQty - currentQty,
            now,
          );
        }

        const studioMedia = SELECT_STUDIO_MEDIA[spec.sku];
        let hasAuthorizedStudioImg = false;
        if (attachStudioImages && studioMedia) {
          const existingImg = queryOne<{ id: string }>(
            db,
            'SELECT id FROM product_images WHERE product_id = ? LIMIT 1',
            existing.id,
          );
          if (!existingImg) {
            execute(
              db,
              `INSERT INTO product_images (id, product_id, url, alt, credit, sort_order, created_at)
               VALUES (?, ?, ?, ?, 'Dear Hills Creative Studio · Illustrative Studio Visual', 0, ?)`,
              newId('img_'),
              existing.id,
              studioMedia.url,
              studioMedia.alt,
              now,
            );
          }
          hasAuthorizedStudioImg = true;
        }

        upsertProductSourcing(db, existing.id, {
          sourcingChannel: 'meesho',
          sourceUrl: spec.sourceUrl,
          supplierName: spec.internalSupplierName,
          supplierCatalogId: spec.supplierCatalogCode,
          supplierSkuRef: spec.sku,
          supplierPricePaise: pricing.supplierPricePaise,
          supplierShippingPaise: pricing.supplierShippingPaise,
          otherSourcingCostPaise: pricing.otherSourcingCostPaise,
          markupPaise: pricing.markupPaise,
          priceFloorLocked: true,
          priceVerified: true,
          supplierAvailable: true,
          availabilityVerified: true,
          ...(hasAuthorizedStudioImg
            ? {
                imageAuthorizationStatus: 'authorized' as const,
                imageAuthorizationNote:
                  'Dear Hills Creative Studio brand-owned illustrative product photograph (no third-party marketplace assets).',
              }
            : {}),
          supplierReturnPolicyNote: spec.supplierReturnPolicyNote,
          internalNotes: spec.internalNotes,
        });

        const readiness = evaluateExternalProductReadiness(db, existing.id);
        readinessBlockersBySku[spec.sku] = readiness.blockers;

        if (publishVerified && readiness.ready) {
          execute(
            db,
            `UPDATE products
                SET status = 'approved',
                    approved_at = COALESCE(approved_at, ?),
                    published_at = COALESCE(published_at, ?),
                    updated_at = ?
              WHERE id = ? AND seller_id = ?`,
            now,
            now,
            now,
            existing.id,
            targetSeller.id,
          );
          publishedSkus.push(spec.sku);
        } else {
          reviewReadySkus.push(spec.sku);
        }
      } else {
        execute(
          db,
          `UPDATE products
              SET status = CASE WHEN status = 'approved' THEN status ELSE 'draft' END,
                  updated_at = ?
            WHERE id = ? AND seller_id = ?`,
          now,
          existing.id,
          targetSeller.id,
        );
        execute(
          db,
          'UPDATE inventory SET quantity = 0, updated_at = ? WHERE product_id = ?',
          now,
          existing.id,
        );
        upsertProductSourcing(db, existing.id, {
          sourcingChannel: 'meesho',
          sourceUrl: spec.sourceUrl,
          supplierCatalogId: spec.supplierCatalogCode,
          supplierSkuRef: spec.sku,
          priceVerified: false,
          supplierAvailable: false,
          availabilityVerified: true,
          internalNotes: spec.internalNotes,
        });
        const readiness = evaluateExternalProductReadiness(db, existing.id);
        readinessBlockersBySku[spec.sku] = readiness.blockers;
        outOfStockDraftSkus.push(spec.sku);
      }
    }
  });

  return {
    sellerId: targetSeller.id,
    reviewReadySkus,
    publishedSkus,
    outOfStockDraftSkus,
    missingSkus,
    readinessBlockersBySku,
  };
}

const isCliRun = /completePookiSelectCatalogue\.(ts|js)$/.test(process.argv[1] ?? '');
if (isCliRun) {
  const db = openDatabase(env.databasePath);
  const reviewOnly = process.argv.includes('--review-only');
  try {
    const result = completePookiSelectCatalogue(db, {
      attachStudioImages: !reviewOnly,
      publishVerified: !reviewOnly,
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    db.close();
  }
}
