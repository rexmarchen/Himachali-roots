import { execute, openDatabase, queryOne, tx, type Db } from '../db.js';
import { env } from '../env.js';
import { newId, uniqueSlug } from '../lib/ids.js';
import { upsertProductSourcing } from '../lib/externalSourcing.js';
import type { ProductVariant } from '../../shared/types.js';

export const POOKI_SELLER_ID = 'sel_5fedb2d7-b75c-405a-8702-253e5230bf49';
export const POOKI_EMAIL = 'pookii2316@gmail.com';

interface CuratedProductSeedSpec {
  sku: string;
  name: string;
  categorySlug: string;
  categoryFallbackSlug: string;
  shortDescription: string;
  description: string;
  unit: string;
  materials: string;
  dimensions: string;
  careInstructions: string;
  region: string;
  regionSlug: string;
  sourceUrl: string;
  supplierCatalogCode: string;
  estimatedDeliveryDays: string;
  variants?: ProductVariant[];
}

export const POOKI_INITIAL_8_SPECS: CuratedProductSeedSpec[] = [
  {
    sku: 'DH-SEL-KSH-01',
    name: 'Dear Hills Select Woven Kullu-Style Winter Shawl',
    categorySlug: 'shawls-and-weaves',
    categoryFallbackSlug: 'shawls-and-weaves',
    shortDescription:
      'A refined mountain-inspired winter wrap finished with geometric woven borders, curated under Dear Hills Select for cool-weather layering.',
    description:
      'Selected for the Dear Hills Select winter collection, this woven shawl pairs clean everyday draping with traditional Himachali-style geometric border detailing along the edges. Designed for crisp autumn evenings, mountain travel, and seasonal layering over ethnic or casual outfits, it is sourced on order through our verified partner dispatch network.\n\nDraft record awaiting supplier verification: confirm exact yarn composition, length-by-width measurements, gram weight, commercial image authorization, and landed sourcing cost in Seller or Admin Studio before publishing to the live storefront.',
    unit: 'piece',
    materials: 'Pending supplier fabric composition verification',
    dimensions: 'Pending verified length × width measurements',
    careInstructions: 'Dry clean or gentle cold hand wash recommended (verify supplier label before publish)',
    region: 'Kullu Valley',
    regionSlug: 'kullu',
    sourceUrl: 'https://www.meesho.com/loom-pure-wool-handloom-kullu-stole/p/acb0d',
    supplierCatalogCode: 'acb0d',
    estimatedDeliveryDays: '5–8 working days',
  },
  {
    sku: 'DH-SEL-MCS-02',
    name: 'Dear Hills Select Multicolor Woven Winter Shawl',
    categorySlug: 'shawls-and-weaves',
    categoryFallbackSlug: 'shawls-and-weaves',
    shortDescription:
      'Warm-toned multicolor geometric border winter shawl curated for women, combining vibrant hill-palette styling with easy everyday comfort.',
    description:
      'Part of our curated Dear Hills Select seasonal edit, this multicolor winter shawl features lively woven pattern accents across a warm body suitable for daily winter wear, festive gifting, and layered travel wardrobes. Each order is fulfilled directly through our vetted partner dispatch channel.\n\nDraft record awaiting supplier verification: confirm exact fabric blend, full dimensions, packed parcel weight, authorized photographs, and verified supplier landed cost before publishing.',
    unit: 'piece',
    materials: 'Pending supplier fabric composition verification',
    dimensions: 'Pending verified length × width measurements',
    careInstructions: 'Dry clean or gentle cold wash in shade (verify care label before publish)',
    region: 'Kullu Valley',
    regionSlug: 'kullu',
    sourceUrl: 'https://www.meesho.com/fancy-warm-multicolor-kullu-shawl-for-womens/p/y1w0t',
    supplierCatalogCode: 'y1w0t',
    estimatedDeliveryDays: '5–8 working days',
  },
  {
    sku: 'DH-SEL-BKS-03',
    name: 'Dear Hills Select Classic Black Woven Winter Stole',
    categorySlug: 'shawls-and-weaves',
    categoryFallbackSlug: 'shawls-and-weaves',
    shortDescription:
      'An understated jet-black winter stole accented with crisp Himachali-style patterned trim for clean office, evening, and travel styling.',
    description:
      'Curated under Dear Hills Select, this classic black winter stole offers a versatile charcoal-dark silhouette paired with colourful hill-inspired border motifs. Built for effortless pairing across coats, kurtas, and everyday winter knitwear, every unit undergoes partner dispatch checks with tracked courier updates.\n\nDraft record awaiting supplier verification: confirm verified fibre composition, stole dimensions, net weight, commercial photography rights, and supplier pricing before making live.',
    unit: 'piece',
    materials: 'Pending supplier fabric composition verification',
    dimensions: 'Pending verified length × width measurements',
    careInstructions: 'Dry clean or cold gentle wash separately (verify supplier instructions before publish)',
    region: 'Himachal Pradesh',
    regionSlug: 'himachal-pradesh',
    sourceUrl: 'https://www.meesho.com/savie-black-attractive-woollen-kullu-stole-for-women/p/30ehrg',
    supplierCatalogCode: '30ehrg',
    estimatedDeliveryDays: '5–8 working days',
  },
  {
    sku: 'DH-SEL-HMC-04',
    name: 'Dear Hills Select Himachali Style Ethnic Pattern Cap',
    categorySlug: 'caps-and-headwear',
    categoryFallbackSlug: 'caps-and-headwear',
    shortDescription:
      'Unisex mountain-style winter cap featuring an ethnic front band, structured crown, and clean seasonal warmth for cool outdoor days.',
    description:
      'This unisex winter cap in the Dear Hills Select headwear lineup brings together a classic structured crown and a bright ethnic patterned border band suited to chilly mornings, mountain road trips, and festive gatherings.\n\nDraft record awaiting supplier verification: confirm inner lining fabric, outer material composition, available head sizes/variants, parcel weight, authorized photography, and verified sourcing cost before publication.',
    unit: 'piece',
    materials: 'Pending supplier fabric composition verification',
    dimensions: 'Pending verified cap circumference / size chart',
    careInstructions: 'Spot clean gently and air dry away from direct heat (verify before publish)',
    region: 'Himachal Pradesh',
    regionSlug: 'himachal-pradesh',
    sourceUrl:
      'https://www.meesho.com/traditional-himachali-woolen-cap-unisex-handloom-kullu-chamba-topi-winter-ethnic-headgear-handmade-woolen-pahadi-cap/p/9b5kv1',
    supplierCatalogCode: '9b5kv1',
    estimatedDeliveryDays: '5–8 working days',
  },
  {
    sku: 'DH-SEL-GMK-05',
    name: 'Dear Hills Select Emerald Makhmal Band Winter Cap',
    categorySlug: 'caps-and-headwear',
    categoryFallbackSlug: 'caps-and-headwear',
    shortDescription:
      'Emerald green plush-band winter cap inspired by Kinnauri topi styling, selected for warm ceremonial and winter wear.',
    description:
      'Curated for Dear Hills Select, this emerald-band winter cap pairs a neat structured body with a rich velvety green front band reminiscent of upper-valley Himachali styling. Designed for both everyday cold protection and cultural occasions.\n\nDraft record awaiting supplier verification: verify outer fabric and velvet band composition, available fit sizes, net weight, image usage permission, and landed supplier cost before publishing.',
    unit: 'piece',
    materials: 'Pending supplier fabric & velvet band verification',
    dimensions: 'Pending verified size / head circumference',
    careInstructions: 'Dry clean or brush lightly; keep dry when stored (verify before publish)',
    region: 'Kinnaur & Shimla',
    regionSlug: 'kinnaur',
    sourceUrl: 'https://www.meesho.com/himachali-green-makhmal-kinnauri-patti-woolen-topi/p/9ihwri',
    supplierCatalogCode: '9ihwri',
    estimatedDeliveryDays: '5–8 working days',
  },
  {
    sku: 'DH-SEL-PHT-06',
    name: 'Dear Hills Select Himalayan Border Topi',
    categorySlug: 'caps-and-headwear',
    categoryFallbackSlug: 'caps-and-headwear',
    shortDescription:
      'Clean everyday Pahadi-style winter cap with patterned front trim, lightweight comfort, and tracked partner dispatch across India.',
    description:
      'Selected for the Dear Hills Select seasonal collection, this structured border topi brings understated Himalayan character to winter outerwear and festive attire. Easy to pack for hill getaways and gifting.\n\nDraft record awaiting supplier verification: verify exact fabric composition, colour options, sizing range, packed weight, authorized photos, and landed sourcing price prior to approval.',
    unit: 'piece',
    materials: 'Pending supplier fabric composition verification',
    dimensions: 'Pending verified head size specifications',
    careInstructions: 'Spot clean with damp cloth and dry flat (verify before publish)',
    region: 'Himachal Pradesh',
    regionSlug: 'himachal-pradesh',
    sourceUrl: 'https://www.meesho.com/pahadi-himachali-caps-by-meesho/p/9b5kv5',
    supplierCatalogCode: '9b5kv5',
    estimatedDeliveryDays: '5–8 working days',
  },
  {
    sku: 'DH-SEL-MFL-07',
    name: 'Dear Hills Select Himalayan Pattern Winter Muffler',
    categorySlug: 'winter-accessories',
    categoryFallbackSlug: 'knitwear',
    shortDescription:
      'Soft cold-weather neck warmer muffler finished with subtle mountain-style woven pattern detailing for daily winter commuting.',
    description:
      'Chosen for the Dear Hills Select Winter Accessories collection, this cosy patterned neck muffler locks in warmth around the collar without bulky layering. Sized for everyday wind protection under jackets, sweaters, and woollens.\n\nDraft record awaiting supplier verification: verify length, width, exact fibre blend, available colours, parcel weight, authorized product photographs, and landed sourcing price before going live.',
    unit: 'piece',
    materials: 'Pending supplier fabric composition verification',
    dimensions: 'Pending verified muffler length × width',
    careInstructions: 'Gentle cold hand wash, dry flat in shade (verify before publish)',
    region: 'Kullu Valley',
    regionSlug: 'kullu',
    sourceUrl: 'https://www.meesho.com/kullu-muffler-nack-warm/p/ayz345',
    supplierCatalogCode: 'ayz345',
    estimatedDeliveryDays: '5–8 working days',
  },
  {
    sku: 'DH-SEL-WJK-08',
    name: "Dear Hills Select Heritage Trim Women's Winter Jacket",
    categorySlug: 'womens-winter-clothing',
    categoryFallbackSlug: 'knitwear',
    shortDescription:
      "Tailored women's winter layer styled with subtle Himalayan-inspired pattern trim, practical pockets, and reliable cold-weather coverage.",
    description:
      "Featured in the Dear Hills Select Women's Winter Clothing lineup, this structured winter jacket blends everyday outerwear practicality with Himachali-inspired trim accents. Ideal for crisp valley mornings, campus wear, and winter travel.\n\nDraft record awaiting supplier verification: verify fabric composition, chest/length measurements across sizes (S–XXL), care label details, weight, commercial photo permission, and landed cost prior to publishing.",
    unit: 'piece',
    materials: 'Pending supplier fabric & lining verification',
    dimensions: 'Pending verified size chart (S / M / L / XL / XXL)',
    careInstructions: 'Gentle dry clean recommended (verify supplier wash care label before publish)',
    region: 'Himachal Pradesh',
    regionSlug: 'himachal-pradesh',
    sourceUrl: 'https://www.meesho.com/himachali-woolen-women-jacket/p/ajfzza',
    supplierCatalogCode: 'ajfzza',
    estimatedDeliveryDays: '5–8 working days',
  },
];

export function ensureSelectCategories(db: Db): Map<string, string> {
  const newCategories = [
    {
      name: 'Winter Accessories',
      slug: 'winter-accessories',
      description: 'Mufflers, neck warmers, gloves, and mountain-inspired cold-weather accessories.',
      sortOrder: 35,
    },
    {
      name: "Women's Winter Clothing",
      slug: 'womens-winter-clothing',
      description: "Seasonal winter jackets, coats, and cold-weather outerwear curated for women.",
      sortOrder: 36,
    },
  ];
  const now = new Date().toISOString();
  for (const cat of newCategories) {
    const existing = queryOne<{ id: string }>(db, 'SELECT id FROM categories WHERE slug = ?', cat.slug);
    if (!existing) {
      execute(
        db,
        `INSERT INTO categories (id, name, slug, parent_id, description, image_url, sort_order, is_active, created_at)
         VALUES (?, ?, ?, NULL, ?, NULL, ?, 1, ?)`,
        newId('cat_'),
        cat.name,
        cat.slug,
        cat.description,
        cat.sortOrder,
        now,
      );
    }
  }
  const map = new Map<string, string>();
  const rows = db.prepare('SELECT id, slug FROM categories WHERE is_active = 1').all() as Array<{ id: string; slug: string }>;
  for (const r of rows) map.set(r.slug, r.id);
  return map;
}

export function seedPookiSelectCatalogue(
  db: Db,
  options: { sellerId?: string; createExtraCategories?: boolean } = {},
): { sellerId: string; createdIds: string[]; skippedSkus: string[] } {
  const targetSeller = options.sellerId
    ? queryOne<{ id: string; status: string; business_name: string }>(
        db,
        `SELECT sp.id, sp.status, sp.business_name
           FROM seller_profiles sp JOIN users u ON u.id = sp.user_id
          WHERE sp.id = ? OR LOWER(u.email) = LOWER(?)
          LIMIT 1`,
        options.sellerId,
        POOKI_EMAIL,
      )
    : queryOne<{ id: string; status: string; business_name: string }>(
        db,
        `SELECT sp.id, sp.status, sp.business_name
           FROM seller_profiles sp JOIN users u ON u.id = sp.user_id
          WHERE sp.id = ? OR LOWER(u.email) = LOWER(?)
          LIMIT 1`,
        POOKI_SELLER_ID,
        POOKI_EMAIL,
      );

  if (!targetSeller) {
    throw new Error(
      `Existing Pooki seller account (${POOKI_SELLER_ID} / ${POOKI_EMAIL}) was not found. Aborting without creating a replacement account.`,
    );
  }
  if (targetSeller.status !== 'approved') {
    throw new Error(
      `Existing Pooki seller account (${targetSeller.id}) is "${targetSeller.status}" and cannot accept products.`,
    );
  }

  const categoryMap = options.createExtraCategories !== false ? ensureSelectCategories(db) : (() => {
    const map = new Map<string, string>();
    const rows = db.prepare('SELECT id, slug FROM categories WHERE is_active = 1').all() as Array<{ id: string; slug: string }>;
    for (const r of rows) map.set(r.slug, r.id);
    return map;
  })();

  const fallbackCatId = categoryMap.values().next().value as string | undefined;
  if (!fallbackCatId) {
    throw new Error('No active categories exist to assign curated listings.');
  }

  const createdIds: string[] = [];
  const skippedSkus: string[] = [];
  const now = new Date().toISOString();

  tx(db, () => {
    for (const spec of POOKI_INITIAL_8_SPECS) {
      const existingBySku = queryOne<{ id: string }>(
        db,
        'SELECT id FROM products WHERE seller_id = ? AND sku = ?',
        targetSeller.id,
        spec.sku,
      );
      if (existingBySku) {
        skippedSkus.push(spec.sku);
        continue;
      }

      const categoryId =
        categoryMap.get(spec.categorySlug) ?? categoryMap.get(spec.categoryFallbackSlug) ?? fallbackCatId;
      const productId = newId('prd_');
      const slug = uniqueSlug(spec.name, (candidate) =>
        Boolean(queryOne(db, 'SELECT 1 FROM products WHERE slug = ?', candidate)),
      );

      const shippingCfg = {
        fulfilmentMethod: 'EXTERNAL_SUPPLIER',
        supplierName: 'Meesho Sourcing Partner (Internal)',
        supplierReference: spec.supplierCatalogCode,
        processingTimeDays: 3,
        estimatedDeliveryDays: spec.estimatedDeliveryDays,
        fulfilmentInstructions: 'Dispatch in neutral white-label packaging; zero third-party marketplace slips inside.',
      };

      execute(
        db,
        `INSERT INTO products (
           id, seller_id, category_id, name, slug, short_description, description,
           price_paise, compare_at_price_paise, sku, unit, weight_g, dimensions,
           fulfilment_method, pickup_location_id, handling_days, shipping_config_json,
           is_select_curated, availability_policy, max_order_quantity, variants_json,
           return_window_days, return_shipping_bearer,
           materials, care_instructions, region, region_slug, status, is_demo,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 10000, NULL, ?, ?, NULL, ?, 'EXTERNAL_SUPPLIER', NULL, 3, ?, 1, 'on_demand_external', 5, ?, 7, 'partner_defective_only', ?, ?, ?, ?, 'draft', 0, ?, ?)`,
        productId,
        targetSeller.id,
        categoryId,
        spec.name,
        slug,
        spec.shortDescription,
        spec.description,
        spec.sku,
        spec.unit,
        spec.dimensions,
        JSON.stringify(shippingCfg),
        spec.variants ? JSON.stringify(spec.variants) : null,
        spec.materials,
        spec.careInstructions,
        spec.region,
        spec.regionSlug,
        now,
        now,
      );

      execute(
        db,
        'INSERT INTO inventory (product_id, quantity, reserved_quantity, low_stock_threshold) VALUES (?, 0, 0, 2)',
        productId,
      );

      upsertProductSourcing(db, productId, {
        sourcingChannel: 'meesho',
        sourceUrl: spec.sourceUrl,
        supplierName: 'Meesho Supplier Partner',
        supplierCatalogId: spec.supplierCatalogCode,
        supplierSkuRef: spec.sku,
        supplierPricePaise: 0,
        supplierShippingPaise: 0,
        otherSourcingCostPaise: 0,
        markupPaise: 10000,
        priceFloorLocked: true,
        priceVerified: false,
        supplierAvailable: false,
        availabilityVerified: false,
        imageAuthorizationStatus: 'pending_authorization',
        imageAuthorizationNote:
          'Pending supplier authorization & verified product photos. Keep in draft until uploaded.',
        supplierReturnPolicyNote: 'Verify supplier return / defective replacement policy before publishing.',
        internalNotes: 'Seeded from initial 8 Meesho sourcing references; Meesho HTTP 403 prevented automatic scraping.',
      });

      createdIds.push(productId);
    }
  });

  return { sellerId: targetSeller.id, createdIds, skippedSkus };
}

const isCliRun = /seedPookiSelectCatalogue\.(ts|js)$/.test(process.argv[1] ?? '');
if (isCliRun) {
  const db = openDatabase(env.databasePath);
  try {
    const result = seedPookiSelectCatalogue(db, { createExtraCategories: true });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    db.close();
  }
}
