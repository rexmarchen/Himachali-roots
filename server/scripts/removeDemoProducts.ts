import { execute, openDatabase, queryAll, queryOne, tx, type Db } from '../db.js';
import { env } from '../env.js';
import { POOKI_SELLER_ID } from './seedPookiSelectCatalogue.js';

export interface RemoveDemoProductsOptions {
  /** When true, counts matching records without writing any database changes. */
  dryRun?: boolean;
  /** Also remove ₹1 / <= ₹1 test products (such as BANANA-TEST-1). Defaults to true. */
  includeOneRupeeTestProducts?: boolean;
  /** Suspend `(demo)` storefronts so `/makers` and `/sitemap.xml` omit empty demo sellers while preserving historical `seller_orders`. Defaults to true. */
  hideDemoSellers?: boolean;
}

export interface RemoveDemoProductsResult {
  dryRun: boolean;
  targetProductCount: number;
  deletedProductSkus: string[];
  deletedByTable: {
    cart_items: number;
    inventory_movements: number;
    campaign_products: number;
    reviews: number;
    wishlist_items: number;
    product_images: number;
    product_sourcing: number;
    inventory: number;
    products: number;
  };
  preservedOrderItemCount: number;
  hiddenDemoSellerIds: string[];
  remainingProductsTotal: number;
  remainingApprovedProducts: number;
  remainingDemoFlagProducts: number;
}

interface TargetProductRow {
  id: string;
  sku: string;
  name: string;
  seller_id: string;
  is_demo: number;
}

interface TargetSellerRow {
  id: string;
  business_name: string;
  slug: string;
  store_status: string;
}

const PROTECTED_REAL_SKU_PREFIXES = ['DH-SEL-', 'HR-APPL-'];

/**
 * Permanently removes seeded demo products (`is_demo = 1`, `DEMO-%`, `(demo)` seller listings,
 * and optionally `<= ₹1` test listings) plus their dependent cart/inventory/image/campaign rows,
 * while preserving historical `orders`, `payments`, and `order_items` snapshots intact.
 */
export function removeDemoProducts(
  db: Db,
  options: RemoveDemoProductsOptions = {},
): RemoveDemoProductsResult {
  const dryRun = options.dryRun ?? false;
  const includeOneRupeeTestProducts = options.includeOneRupeeTestProducts ?? true;
  const hideDemoSellers = options.hideDemoSellers ?? true;

  const targetProducts = queryAll<TargetProductRow>(
    db,
    `SELECT p.id, p.sku, p.name, p.seller_id, p.is_demo
       FROM products p
       LEFT JOIN seller_profiles s ON s.id = p.seller_id
       LEFT JOIN users u ON u.id = s.user_id
      WHERE p.is_demo = 1
         OR UPPER(p.sku) LIKE 'DEMO-%'
         OR LOWER(COALESCE(s.slug, '')) LIKE '%-demo'
         OR LOWER(COALESCE(s.slug, '')) = 'demo'
         OR LOWER(COALESCE(s.business_name, '')) LIKE '%(demo)%'
         OR (u.email IS NOT NULL AND LOWER(u.email) LIKE '%.test')
         OR (? = 1 AND p.price_paise <= 100)
      ORDER BY p.created_at ASC, p.id ASC`,
    includeOneRupeeTestProducts ? 1 : 0,
  );

  for (const prod of targetProducts) {
    const upperSku = prod.sku.toUpperCase();
    if (
      prod.seller_id === POOKI_SELLER_ID ||
      PROTECTED_REAL_SKU_PREFIXES.some((prefix) => upperSku.startsWith(prefix))
    ) {
      throw new Error(
        `Safety guard aborted cleanup: protected real product matched target query (${prod.sku} / ${prod.id}).`,
      );
    }
  }

  const productIds = targetProducts.map((p) => p.id);
  const ph = productIds.map(() => '?').join(',');

  const countFor = (table: string): number => {
    if (productIds.length === 0) return 0;
    const row = queryOne<{ count: number }>(
      db,
      `SELECT COUNT(*) AS count FROM "${table}" WHERE product_id IN (${ph})`,
      ...productIds,
    );
    return Number(row?.count ?? 0);
  };

  const deletedByTable = {
    cart_items: countFor('cart_items'),
    inventory_movements: countFor('inventory_movements'),
    campaign_products: countFor('campaign_products'),
    reviews: countFor('reviews'),
    wishlist_items: countFor('wishlist_items'),
    product_images: countFor('product_images'),
    product_sourcing: countFor('product_sourcing'),
    inventory: countFor('inventory'),
    products: productIds.length,
  };

  const preservedOrderItemCount = countFor('order_items');

  const demoSellerCandidates = hideDemoSellers
    ? queryAll<TargetSellerRow>(
        db,
        `SELECT s.id, s.business_name, s.slug, s.store_status
           FROM seller_profiles s
           LEFT JOIN users u ON u.id = s.user_id
          WHERE LOWER(s.slug) LIKE '%-demo'
             OR LOWER(s.slug) = 'demo'
             OR LOWER(s.business_name) LIKE '%(demo)%'
             OR (u.email IS NOT NULL AND LOWER(u.email) LIKE '%.test')
          ORDER BY s.business_name ASC`,
      )
    : [];

  for (const seller of demoSellerCandidates) {
    if (seller.id === POOKI_SELLER_ID) {
      throw new Error(`Safety guard aborted cleanup: Pooki seller matched demo seller criteria.`);
    }
    const remainingOwnedCount =
      productIds.length > 0
        ? queryOne<{ count: number }>(
            db,
            `SELECT COUNT(*) AS count FROM products WHERE seller_id = ? AND id NOT IN (${ph})`,
            seller.id,
            ...productIds,
          )?.count ?? 0
        : queryOne<{ count: number }>(
            db,
            'SELECT COUNT(*) AS count FROM products WHERE seller_id = ?',
            seller.id,
          )?.count ?? 0;
    if (remainingOwnedCount > 0) {
      throw new Error(
        `Safety guard aborted cleanup: demo seller ${seller.id} (${seller.business_name}) owns ${remainingOwnedCount} non-demo product(s).`,
      );
    }
  }

  const sellersToHide = demoSellerCandidates.filter((s) => s.store_status !== 'suspended');

  if (!dryRun && (productIds.length > 0 || sellersToHide.length > 0)) {
    const now = new Date().toISOString();
    tx(db, () => {
      if (productIds.length > 0) {
        for (const table of [
          'cart_items',
          'inventory_movements',
          'campaign_products',
          'reviews',
          'wishlist_items',
          'product_images',
          'product_sourcing',
          'inventory',
        ] as const) {
          execute(db, `DELETE FROM "${table}" WHERE product_id IN (${ph})`, ...productIds);
        }
        execute(db, `DELETE FROM products WHERE id IN (${ph})`, ...productIds);
      }

      if (sellersToHide.length > 0) {
        const sph = sellersToHide.map(() => '?').join(',');
        execute(
          db,
          `UPDATE seller_profiles
              SET store_status = 'suspended',
                  store_status_reason = 'Demo store removed from live marketplace',
                  updated_at = ?
            WHERE id IN (${sph})`,
          now,
          ...sellersToHide.map((s) => s.id),
        );
      }

      const fkViolations = queryAll<Record<string, unknown>>(db, 'PRAGMA foreign_key_check');
      if (fkViolations.length > 0) {
        throw new Error(`Foreign key check failed after demo cleanup: ${JSON.stringify(fkViolations)}`);
      }
    });
  }

  const remainingTotals = queryOne<{ total: number; approved: number; demo_flag: number }>(
    db,
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
            COALESCE(SUM(CASE WHEN is_demo = 1 THEN 1 ELSE 0 END), 0) AS demo_flag
       FROM products`,
  );

  return {
    dryRun,
    targetProductCount: targetProducts.length,
    deletedProductSkus: targetProducts.map((p) => p.sku),
    deletedByTable,
    preservedOrderItemCount,
    hiddenDemoSellerIds: sellersToHide.map((s) => s.id),
    remainingProductsTotal: Number(remainingTotals?.total ?? 0),
    remainingApprovedProducts: Number(remainingTotals?.approved ?? 0),
    remainingDemoFlagProducts: Number(remainingTotals?.demo_flag ?? 0),
  };
}

const isCliRun = /removeDemoProducts\.(ts|js)$/.test(process.argv[1] ?? '');
if (isCliRun) {
  const dryRun = process.argv.includes('--dry-run');
  const includeOneRupeeTestProducts = !process.argv.includes('--keep-one-rupee');
  const hideDemoSellers = !process.argv.includes('--keep-demo-sellers');
  const db = openDatabase(env.databasePath);
  try {
    const result = removeDemoProducts(db, {
      dryRun,
      includeOneRupeeTestProducts,
      hideDemoSellers,
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } finally {
    db.close();
  }
}
