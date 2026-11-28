import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryOne, type Db } from '../db.js';
import { seed } from '../seed.js';
import { POOKI_EMAIL, POOKI_SELLER_ID, seedPookiSelectCatalogue } from '../scripts/seedPookiSelectCatalogue.js';
import { completePookiSelectCatalogue } from '../scripts/completePookiSelectCatalogue.js';
import { removeDemoProducts } from '../scripts/removeDemoProducts.js';
import { hashPassword } from '../lib/auth.js';
import { TEST_PASSWORD, login, resetDb, setupTestApp } from './helpers.js';

describe('removeDemoProducts cleanup script & storefront behavior', () => {
  let app: Express;
  let db: Db;

  beforeEach(async () => {
    ({ app, db } = setupTestApp());
    resetDb(db);
    await seed(db, { reset: false });

    const now = new Date().toISOString();
    const passHash = hashPassword(TEST_PASSWORD);

    // Add Admin, Customer, and real Pooki seller + real listings
    execute(
      db,
      `INSERT INTO users (id, email, password_hash, email_verified, is_disabled, created_at)
       VALUES
         ('usr_cleanup_admin', 'admin-clean@test.local', ?, 1, 0, ?),
         ('usr_cleanup_cust', 'cust-clean@test.local', ?, 1, 0, ?),
         ('usr_cleanup_pooki', ?, ?, 1, 0, ?)`,
      passHash,
      now,
      passHash,
      now,
      POOKI_EMAIL,
      passHash,
      now,
    );
    execute(
      db,
      `INSERT INTO profiles (id, full_name) VALUES
         ('usr_cleanup_admin', 'Clean Admin'),
         ('usr_cleanup_cust', 'Clean Customer'),
         ('usr_cleanup_pooki', 'Anshu')`,
    );
    execute(
      db,
      `INSERT INTO user_roles (user_id, role) VALUES
         ('usr_cleanup_admin', 'customer'), ('usr_cleanup_admin', 'admin'),
         ('usr_cleanup_cust', 'customer'),
         ('usr_cleanup_pooki', 'customer'), ('usr_cleanup_pooki', 'seller')`,
    );
    execute(
      db,
      `INSERT INTO seller_profiles (
         id, user_id, business_name, slug, seller_type, seller_category,
         region, village, status, store_status, approved_at, created_at, updated_at
       ) VALUES (?, 'usr_cleanup_pooki', 'Anshu', 'new-maker', 'home_business', 'home_business',
                 'Kangra', 'jaisinghpur', 'approved', 'active', ?, ?, ?)`,
      POOKI_SELLER_ID,
      now,
      now,
      now,
    );

    // Pooki's pre-existing non-demo product (Apples) + 8 Select products (6 published, 2 draft)
    const shawlsCat = queryOne<{ id: string }>(db, "SELECT id FROM categories WHERE slug = 'shawls-and-weaves'")!;
    execute(
      db,
      `INSERT INTO products (
         id, seller_id, category_id, name, slug, short_description, description,
         price_paise, sku, weight_g, origin_place, region, status, is_demo,
         fulfilment_method, approved_at, published_at, created_at, updated_at
       ) VALUES (
         'prd_pooki_apples', ?, ?, 'Apples', 'apples',
         'Fresh mountain orchard apples from Himachal Pradesh.',
         'Handpicked seasonal Himachal orchard apples packed cleanly for dispatch.',
         60000, 'HR-APPL-2682', 1000, 'Kangra, HP', 'Kangra', 'approved', 0,
         'SHIPROCKET', ?, ?, ?, ?
       )`,
      POOKI_SELLER_ID,
      shawlsCat.id,
      now,
      now,
      now,
      now,
    );
    execute(
      db,
      'INSERT INTO inventory (product_id, quantity, reserved_quantity, low_stock_threshold, updated_at) VALUES (?, 20, 0, 5, ?)',
      'prd_pooki_apples',
      now,
    );

    seedPookiSelectCatalogue(db);
    completePookiSelectCatalogue(db);

    // Insert the ₹1 test listing (`is_demo = 0`, owned by a demo seller) just like production's BANANA-TEST-1
    const kulluDemoSeller = queryOne<{ id: string }>(
      db,
      "SELECT id FROM seller_profiles WHERE slug = 'kullu-loom-collective-demo'",
    )!;
    execute(
      db,
      `INSERT INTO products (
         id, seller_id, category_id, name, slug, short_description, description,
         price_paise, sku, status, is_demo, fulfilment_method, approved_at, published_at, created_at, updated_at
       ) VALUES (
         'prd_banana_test', ?, ?, 'Fresh Banana', 'fresh-banana',
         '₹1 test product for payment verification.',
         'Internal ₹1 test listing.',
         100, 'BANANA-TEST-1', 'approved', 0, 'SHIPROCKET', ?, ?, ?, ?
       )`,
      kulluDemoSeller.id,
      shawlsCat.id,
      now,
      now,
      now,
      now,
    );
    execute(
      db,
      'INSERT INTO inventory (product_id, quantity, reserved_quantity, low_stock_threshold, updated_at) VALUES (?, 50, 0, 5, ?)',
      'prd_banana_test',
      now,
    );
    execute(
      db,
      'INSERT INTO inventory_movements (id, product_id, change, reason, created_at) VALUES (?, ?, 50, ?, ?)',
      'imov_banana_test',
      'prd_banana_test',
      'adjustment',
      now,
    );
    execute(
      db,
      'INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES (?, ?, ?, ?, 0)',
      'img_banana_test',
      'prd_banana_test',
      '/images/product-apple.jpg',
      'Test image',
    );

    // Cart items + historical paid Razorpay orders referencing Chamba rajma (is_demo=1) and Fresh Banana (BANANA-TEST-1)
    const chambaRajma = queryOne<{ id: string; seller_id: string; sku: string; name: string }>(
      db,
      "SELECT id, seller_id, sku, name FROM products WHERE sku = 'DEMO-CHA-RAJ-01'",
    )!;
    execute(
      db,
      `INSERT INTO carts (id, user_id, token, created_at, updated_at) VALUES ('crt_cleanup_1', 'usr_cleanup_cust', 'tok_cleanup_1', ?, ?)`,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, created_at)
       VALUES ('ci_demo_1', 'crt_cleanup_1', ?, '', 1, ?), ('ci_banana_1', 'crt_cleanup_1', 'prd_banana_test', '', 1, ?)`,
      chambaRajma.id,
      now,
      now,
    );

    execute(
      db,
      `INSERT INTO orders (
         id, order_number, user_id, email, status, subtotal_paise, total_paise,
         shipping_address, idempotency_key, placed_at, paid_at, is_demo
       ) VALUES (
         'ord_hist_demo', 'PR-261029-HIST1', 'usr_cleanup_cust', 'cust-clean@test.local', 'paid',
         32000, 32000, '{"fullName":"Clean Customer","line1":"Test","city":"Shimla","state":"HP","pincode":"171001"}',
         ?, ?, ?, 0
       )`,
      crypto.randomUUID(),
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO seller_orders (
         id, order_id, seller_id, reference, status, subtotal_paise, total_paise,
         commission_rate_bp, commission_paise, seller_earning_paise
       ) VALUES ('sor_hist_demo', 'ord_hist_demo', ?, 'SO-HIST-1', 'pending', 32000, 32000, 1500, 4800, 27200)`,
      chambaRajma.seller_id,
    );
    execute(
      db,
      `INSERT INTO order_items (
         id, order_id, seller_order_id, product_id, seller_id, name, sku, image_url,
         unit_price_paise, quantity, line_subtotal_paise, commission_rate_bp, commission_paise, seller_earning_paise
       ) VALUES ('oit_hist_demo', 'ord_hist_demo', 'sor_hist_demo', ?, ?, ?, ?, '/images/product-rajma.jpg',
                 32000, 1, 32000, 1500, 4800, 27200)`,
      chambaRajma.id,
      chambaRajma.seller_id,
      chambaRajma.name,
      chambaRajma.sku,
    );
    execute(
      db,
      `INSERT INTO payments (
         id, order_id, provider, provider_order_id, provider_payment_id, amount_paise, currency, status, method, verified_at
       ) VALUES ('pay_hist_demo', 'ord_hist_demo', 'razorpay', 'order_test_1', 'pay_test_1', 32000, 'INR', 'paid', 'checkout', ?)`,
      now,
    );
  });

  afterEach(() => {
    closeDb();
  });

  it('supports dry-run audit without deleting any row, then permanently removes all 28 demo/₹1 test products and hides 5 demo makers cleanly', async () => {
    // 1. Dry-run leaves DB untouched
    const dryResult = removeDemoProducts(db, { dryRun: true });
    expect(dryResult.dryRun).toBe(true);
    expect(dryResult.targetProductCount).toBe(28);
    expect(dryResult.deletedByTable.products).toBe(28);
    expect(dryResult.preservedOrderItemCount).toBe(1);
    expect(dryResult.hiddenDemoSellerIds).toHaveLength(5);
    expect(dryResult.remainingProductsTotal).toBe(37);

    const beforeCount = queryOne<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM products')!.c;
    expect(beforeCount).toBe(37);

    // 2. Actual cleanup removes 28 products, hides 5 demo sellers, preserves 9 Pooki items + historical order
    const result = removeDemoProducts(db);
    expect(result.dryRun).toBe(false);
    expect(result.targetProductCount).toBe(28);
    expect(result.deletedByTable.products).toBe(28);
    expect(result.deletedByTable.cart_items).toBe(2);
    expect(result.deletedByTable.campaign_products).toBe(5);
    expect(result.deletedByTable.inventory).toBe(28);
    expect(result.deletedByTable.inventory_movements).toBe(28);
    expect(result.deletedByTable.product_images).toBe(28);
    expect(result.preservedOrderItemCount).toBe(1);
    expect(result.hiddenDemoSellerIds).toHaveLength(5);
    expect(result.remainingProductsTotal).toBe(9);
    expect(result.remainingApprovedProducts).toBe(7);
    expect(result.remainingDemoFlagProducts).toBe(0);

    // Foreign key check must be completely clean
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    // Pooki's Apples + 8 Select products remain intact
    const pookiCount = queryOne<{ c: number }>(
      db,
      'SELECT COUNT(*) AS c FROM products WHERE seller_id = ?',
      POOKI_SELLER_ID,
    )!.c;
    expect(pookiCount).toBe(9);

    // Historical Razorpay order snapshot & payment stay intact
    const preservedOrder = queryOne<{ id: string; status: string }>(
      db,
      "SELECT id, status FROM orders WHERE order_number = 'PR-261029-HIST1'",
    );
    expect(preservedOrder?.status).toBe('paid');

    // 3. Re-running cleanup is cleanly idempotent
    const secondRun = removeDemoProducts(db);
    expect(secondRun.targetProductCount).toBe(0);
    expect(secondRun.hiddenDemoSellerIds).toEqual([]);
    expect(secondRun.remainingProductsTotal).toBe(9);

    // 4. Verify live HTTP APIs reflect zero demo products & zero demo makers while historical order loads cleanly
    const homeRes = await request(app).get('/api/home');
    expect(homeRes.status).toBe(200);
    expect(homeRes.body.counts.products).toBe(7);
    expect(homeRes.body.counts.sellers).toBe(1);
    expect(homeRes.body.campaign).toBeNull();

    const shopRes = await request(app).get('/api/products?pageSize=48');
    expect(shopRes.status).toBe(200);
    expect(shopRes.body.total).toBe(7);
    expect(shopRes.body.items.some((item: { isDemo: boolean }) => item.isDemo)).toBe(false);
    expect(shopRes.body.items.some((item: { slug: string }) => item.slug === 'fresh-banana')).toBe(false);

    const makersRes = await request(app).get('/api/makers');
    expect(makersRes.status).toBe(200);
    expect(makersRes.body.makers).toHaveLength(1);
    expect(makersRes.body.makers[0].slug).toBe('new-maker');

    const adminAgent = await login(app, 'admin-clean@test.local');
    const adminProdsRes = await adminAgent.get('/api/admin/products');
    expect(adminProdsRes.status).toBe(200);
    expect(adminProdsRes.body.products).toHaveLength(9);
    expect(adminProdsRes.body.products.some((p: { is_demo: number }) => p.is_demo === 1)).toBe(false);

    const adminOrderRes = await adminAgent.get('/api/admin/orders/PR-261029-HIST1');
    expect(adminOrderRes.status).toBe(200);
    expect(adminOrderRes.body.order.orderNumber).toBe('PR-261029-HIST1');

    const custAgent = await login(app, 'cust-clean@test.local');
    const custOrdersRes = await custAgent.get('/api/account/orders');
    expect(custOrdersRes.status).toBe(200);
    expect(custOrdersRes.body.items).toHaveLength(1);
    expect(custOrdersRes.body.items[0].orderNumber).toBe('PR-261029-HIST1');

    const sitemapRes = await request(app).get('/sitemap.xml');
    expect(sitemapRes.status).toBe(200);
    expect(sitemapRes.text).not.toContain('-demo');
    expect(sitemapRes.text).not.toContain('chamba-rajma');
  });

  it('aborts cleanly if a protected real Pooki product ever matches target criteria', () => {
    execute(db, "UPDATE products SET is_demo = 1 WHERE sku = 'DH-SEL-KSH-01'");
    expect(() => removeDemoProducts(db)).toThrow(/Safety guard aborted cleanup/);
  });
});
