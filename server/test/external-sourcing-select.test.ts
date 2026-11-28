import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { POOKI_EMAIL, POOKI_SELLER_ID, seedPookiSelectCatalogue } from '../scripts/seedPookiSelectCatalogue.js';
import { completePookiSelectCatalogue } from '../scripts/completePookiSelectCatalogue.js';
import { resetShiprocketTokenCache } from '../lib/shiprocketService.js';
import { ADDRESS, IDS, checkout, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

// Valid 1x1 PNG buffer for image upload tests
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Dear Hills Select: External Sourcing, ₹100 Markup, Brand Isolation & Zero Shiprocket', () => {
  let app: Express;
  let db: Db;
  let origFetch: typeof globalThis.fetch;
  let origSrEmail: string;
  let origSrPass: string;

  function seedPookiSeller(): void {
    const now = new Date().toISOString();
    execute(
      db,
      `INSERT INTO users (id, email, password_hash, email_verified, is_disabled, created_at)
       VALUES ('usr_pooki_test', ?, (SELECT password_hash FROM users WHERE id = ?), 1, 0, ?)`,
      POOKI_EMAIL,
      IDS.sellerUser,
      now,
    );
    execute(db, "INSERT INTO profiles (id, full_name) VALUES ('usr_pooki_test', 'Anshu Pooki')");
    execute(
      db,
      "INSERT INTO user_roles (user_id, role) VALUES ('usr_pooki_test', 'customer'), ('usr_pooki_test', 'seller')",
    );
    execute(
      db,
      `INSERT INTO seller_profiles (id, user_id, business_name, slug, seller_type, seller_category, region, village, status, store_status, approved_at, created_at, updated_at)
       VALUES (?, 'usr_pooki_test', 'Anshu', 'new-maker', 'home_business', 'home_business', 'Kangra', 'jaisinghpur', 'approved', 'active', ?, ?, ?)`,
      POOKI_SELLER_ID,
      now,
      now,
      now,
    );
    // Ensure baseline categories exist as in production
    execute(
      db,
      `INSERT OR IGNORE INTO categories (id, name, slug, sort_order, is_active) VALUES
       ('cat_shawls', 'Shawls & Handlooms', 'shawls-and-weaves', 10, 1),
       ('cat_caps', 'Himachali Caps', 'caps-and-headwear', 12, 1),
       ('cat_knit', 'Warm Knitwear', 'knitwear', 14, 1)`,
    );
  }

  beforeEach(() => {
    ({ app, db } = setupTestApp());
    resetDb(db);
    seedFixtures(db);
    seedPookiSeller();
    resetShiprocketTokenCache();
    origFetch = globalThis.fetch;
    origSrEmail = env.shiprocket.email;
    origSrPass = env.shiprocket.password;
    (env.shiprocket as { email: string }).email = 'sr-api@dearhills.in';
    (env.shiprocket as { password: string }).password = 'secret';
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    (env.shiprocket as { email: string }).email = origSrEmail;
    (env.shiprocket as { password: string }).password = origSrPass;
    resetShiprocketTokenCache();
  });

  afterAll(() => {
    closeDb();
  });

  it('TEST 1: seeds 8 draft external-supplier listings under existing Pooki seller without duplicating account or leaking to storefront', async () => {
    const res = seedPookiSelectCatalogue(db, { createExtraCategories: true });
    expect(res.sellerId).toBe(POOKI_SELLER_ID);
    expect(res.createdIds).toHaveLength(8);
    expect(res.skippedSkus).toHaveLength(0);

    // Re-running is idempotent
    const secondRun = seedPookiSelectCatalogue(db, { createExtraCategories: true });
    expect(secondRun.createdIds).toHaveLength(0);
    expect(secondRun.skippedSkus).toHaveLength(8);

    // Only one Pooki account exists
    const pookiAccounts = queryAll(db, 'SELECT id FROM seller_profiles WHERE id = ?', POOKI_SELLER_ID);
    expect(pookiAccounts).toHaveLength(1);

    // All 8 products are draft + EXTERNAL_SUPPLIER + is_select_curated = 1
    const seededRows = queryAll<{
      status: string;
      fulfilment_method: string;
      is_select_curated: number;
    }>(db, 'SELECT status, fulfilment_method, is_select_curated FROM products WHERE seller_id = ?', POOKI_SELLER_ID);
    expect(seededRows).toHaveLength(8);
    expect(seededRows.every((r) => r.status === 'draft')).toBe(true);
    expect(seededRows.every((r) => r.fulfilment_method === 'EXTERNAL_SUPPLIER')).toBe(true);
    expect(seededRows.every((r) => r.is_select_curated === 1)).toBe(true);

    // Zero drafts leak to public storefront, sitemap, or Google Merchant feed
    const publicRes = await request(app).get('/api/products?pageSize=48');
    expect(publicRes.body.items.every((item: { slug: string }) => !item.slug.includes('select'))).toBe(true);
    const sitemapRes = await request(app).get('/sitemap.xml');
    expect(sitemapRes.text.toLowerCase()).not.toContain('meesho');
    const feedRes = await request(app).get('/feeds/google-merchant.xml');
    expect(feedRes.status).toBe(200);
    expect(feedRes.text.toLowerCase()).not.toContain('meesho');
  });

  it('TEST 2 & 3: enforces ₹100 landed-cost markup, image authorization, availability verification & brand leak guard before publish', async () => {
    const { createdIds } = seedPookiSelectCatalogue(db, { createExtraCategories: true });
    const shawlId = createdIds[0];

    const admin = await login(app, 'admin@test.local');

    // Unverified draft cannot be published
    const prematurePublish = await mutate(admin.post(`/api/admin/products/${shawlId}/publish`)).send({});
    expect(prematurePublish.status).toBe(400);
    expect(prematurePublish.body.error.fields).toHaveProperty('priceVerified');
    expect(prematurePublish.body.error.fields).toHaveProperty('availabilityVerified');
    expect(prematurePublish.body.error.fields).toHaveProperty('imageAuthorizationStatus');

    // Compute landed cost = ₹350 (base ₹300 + ₹40 shipping + ₹10 other) -> ₹450 selling price (+₹100 markup)
    const sourcingRes = await mutate(admin.patch(`/api/admin/products/${shawlId}/sourcing`)).send({
      supplierPricePaise: 30000,
      supplierShippingPaise: 4000,
      otherSourcingCostPaise: 1000,
      autoPriceFromLanded: true,
      priceVerified: true,
      supplierAvailable: true,
      availabilityVerified: true,
      imageAuthorizationStatus: 'authorized',
      imageAuthorizationNote: 'Supplier written commercial approval #402',
      variants: [
        { id: 'v_maroon', label: 'Maroon Border · Free Size', size: 'Free Size', color: 'Maroon', colorHex: '#7A2E2E', available: true },
        { id: 'v_slate', label: 'Slate Grey · Out of Stock', size: 'Free Size', color: 'Grey', available: false },
      ],
    });
    expect(sourcingRes.status).toBe(200);
    expect(sourcingRes.body.sourcing.landedCostPaise).toBe(35000);
    expect(sourcingRes.body.pricePaise).toBe(45000);

    // Price floor blocks selling below landed cost + ₹100 (₹449 fails)
    const underprice = await mutate(admin.patch(`/api/admin/products/${shawlId}`)).send({ pricePaise: 44900 });
    expect(underprice.status).toBe(400);

    // Upload authorized photo and fill verified material/dimensions/stock
    const imgUpload = await mutate(admin.post(`/api/admin/products/${shawlId}/images`)).attach('image', TINY_PNG, 'shawl.png');
    expect(imgUpload.status).toBe(201);
    await mutate(admin.patch(`/api/admin/products/${shawlId}`)).send({
      materials: 'Acrylic-wool blended winter weave',
      dimensions: '200 × 95 cm',
      weightG: 340,
    });
    await mutate(admin.post(`/api/admin/products/${shawlId}/stock`)).send({ quantity: 5, mode: 'set' });

    // Brand leak guard: putting "Meesho" or unverified "Pure Wool" into description rejects update/publish
    const leakyUpdate = await mutate(admin.patch(`/api/admin/products/${shawlId}`)).send({
      status: 'approved',
      description: 'Sourced directly via Meesho seller in Himachal with authentic pure wool fibres for mountain winters.',
    });
    expect(leakyUpdate.status).toBe(400);

    // Valid publish succeeds cleanly
    const publishOk = await mutate(admin.post(`/api/admin/products/${shawlId}/publish`)).send({});
    expect(publishOk.status).toBe(200);
    expect(publishOk.body.status).toBe('approved');

    // Public filter & admin sourcing filter work with complete brand isolation
    const adminFiltered = await admin.get('/api/admin/products?filter=external_fulfilment');
    expect(adminFiltered.body.products.some((p: { id: string; landed_cost_paise: number }) => p.id === shawlId && p.landed_cost_paise === 35000)).toBe(true);

    const pooki = await login(app, POOKI_EMAIL);
    const pookiProducts = await pooki.get('/api/seller/products?filter=external_fulfilment');
    expect(pookiProducts.body.products.length).toBeGreaterThanOrEqual(8);
  });

  it('TEST 4, 5 & 6: full storefront checkout with variant preserves ZERO Shiprocket calls, hides supplier info from buyer, and resolves sourcing exceptions', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const { createdIds } = seedPookiSelectCatalogue(db, { createExtraCategories: true });
    const shawlId = createdIds[0];
    const admin = await login(app, 'admin@test.local');

    await mutate(admin.patch(`/api/admin/products/${shawlId}/sourcing`)).send({
      supplierPricePaise: 42000,
      supplierShippingPaise: 3000,
      otherSourcingCostPaise: 0,
      autoPriceFromLanded: true,
      priceVerified: true,
      supplierAvailable: true,
      availabilityVerified: true,
      imageAuthorizationStatus: 'authorized',
      isSelectCurated: true,
      variants: [
        { id: 'var_crimson', label: 'Crimson Trim', size: 'Free Size', available: true },
        { id: 'var_sold', label: 'Ivory Trim', size: 'Free Size', available: false },
      ],
    });
    await mutate(admin.post(`/api/admin/products/${shawlId}/images`)).attach('image', TINY_PNG, 'shawl.png');
    await mutate(admin.patch(`/api/admin/products/${shawlId}`)).send({
      materials: 'Blended winter weave',
      dimensions: '200 × 95 cm',
    });
    await mutate(admin.post(`/api/admin/products/${shawlId}/stock`)).send({ quantity: 8, mode: 'set' });
    await mutate(admin.post(`/api/admin/products/${shawlId}/publish`)).send({});

    const detailRow = queryOne<{ slug: string }>(db, 'SELECT slug FROM products WHERE id = ?', shawlId)!;
    const publicDetail = await request(app).get(`/api/products/${detailRow.slug}`);
    expect(publicDetail.status).toBe(200);
    expect(publicDetail.body.product.isSelectCurated).toBe(true);
    expect(publicDetail.body.product.pricePaise).toBe(55000);
    expect(publicDetail.body.product.shippingSummary.methodLabel).toBe('Dear Hills Select Dispatch');
    expect(publicDetail.body.product.shippingSummary.supplierName).toBeUndefined();

    // Ensure zero leakage of supplier/Meesho terms in public response JSON
    const serialized = JSON.stringify(publicDetail.body).toLowerCase();
    expect(serialized).not.toContain('meesho');
    expect(serialized).not.toContain('supplierprice');
    expect(serialized).not.toContain('landedcost');
    expect(serialized).not.toContain('external supplier');

    // Customer buys unavailable variant -> blocked
    const customer = await login(app, 'customer@test.local');
    const badVariant = await mutate(customer.post('/api/cart/items')).send({
      productId: shawlId,
      quantity: 1,
      variantId: 'var_sold',
    });
    expect(badVariant.status).toBe(409);

    // Customer buys valid variant -> checkout & prepaid payment
    const goodVariant = await mutate(customer.post('/api/cart/items')).send({
      productId: shawlId,
      quantity: 2,
      variantId: 'var_crimson',
    });
    expect(goodVariant.status).toBe(201);

    const orderRes = await checkout(app, customer, { address: ADDRESS });
    expect(orderRes.status).toBe(201);
    const orderNumber = orderRes.body.order.orderNumber as string;
    const orderId = orderRes.body.order.id as string;

    const payRes = await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
    expect(payRes.status).toBe(200);

    // Zero Shiprocket HTTP calls & zero outbox rows created!
    expect(calls).toHaveLength(0);
    expect(queryAll(db, 'SELECT id FROM shipping_sync_outbox WHERE order_id = ?', orderId)).toHaveLength(0);

    const fulfilment = queryOne<Record<string, unknown>>(
      db,
      'SELECT * FROM order_fulfilments WHERE order_id = ?',
      orderId,
    )!;
    expect(fulfilment.fulfilment_method).toBe('EXTERNAL_SUPPLIER');
    expect(fulfilment.shiprocket_sync_status).toBe('not_applicable');

    // Customer order API reveals variantLabel but NEVER supplier name, order ref, or Meesho
    const customerOrder = await customer.get(`/api/orders/${orderNumber}`);
    const orderSerialized = JSON.stringify(customerOrder.body).toLowerCase();
    expect(orderSerialized).not.toContain('meesho');
    expect(orderSerialized).not.toContain('external supplier');
    expect(customerOrder.body.order.sellerOrders[0].items[0].variantLabel).toBe('Crimson Trim');
    expect(customerOrder.body.order.fulfilments[0].externalSupplierName).toBeNull();

    // Admin flags supplier price increase exception and then cancels & triggers refund cleanly
    const flagRes = await mutate(admin.post(`/api/admin/shipping/fulfilments/${fulfilment.id}/external`)).send({
      action: 'flag_sourcing_exception',
      exceptionType: 'supplier_price_increased',
      newCostPaise: 51000,
      note: 'Supplier increased wholesale rate above acceptable margin',
    });
    expect(flagRes.status).toBe(200);
    expect(flagRes.body.status).toBe('delivery_exception');

    const cancelRes = await mutate(admin.post(`/api/admin/shipping/fulfilments/${fulfilment.id}/external`)).send({
      action: 'resolve_sourcing_exception',
      resolutionAction: 'cancel_and_refund',
      note: 'Cancelled due to supplier price hike',
    });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('cancelled');
    expect(cancelRes.body.refundPaise).toBe(110000);
    expect(calls).toHaveLength(0);
  });

  it('TEST 6: completes existing 6 verified in-stock Pooki listings into review and publishes them cleanly with brand-owned photos, ₹100 markup & zero Shiprocket while keeping 2 HTTP 410 items in draft', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    seedPookiSelectCatalogue(db, { createExtraCategories: true });

    // Stage A: review-only leaves unphotographed verified listings in pending review without leaking publicly
    const reviewPass = completePookiSelectCatalogue(db, { attachStudioImages: false, publishVerified: false });
    expect(reviewPass.missingSkus).toHaveLength(0);
    expect(reviewPass.reviewReadySkus).toEqual([
      'DH-SEL-KSH-01',
      'DH-SEL-MCS-02',
      'DH-SEL-BKS-03',
      'DH-SEL-HMC-04',
      'DH-SEL-GMK-05',
      'DH-SEL-PHT-06',
    ]);
    expect(reviewPass.publishedSkus).toHaveLength(0);
    for (const sku of reviewPass.reviewReadySkus) {
      expect(reviewPass.readinessBlockersBySku[sku]).toEqual([
        'Upload at least one verified product photograph before publishing.',
        'Product photographs must have confirmed commercial usage authorization before publishing.',
      ]);
    }
    const reviewPublicRes = await request(app).get('/api/products?pageSize=48');
    expect(reviewPublicRes.body.items.every((item: { slug: string }) => !item.slug.includes('select'))).toBe(true);

    // Stage B: attaching authorized Dear Hills studio photos passes 100% readiness and publishes live (idempotent on re-run)
    const publishedPass = completePookiSelectCatalogue(db, { attachStudioImages: true, publishVerified: true });
    expect(publishedPass.publishedSkus).toEqual(reviewPass.reviewReadySkus);
    expect(publishedPass.outOfStockDraftSkus).toEqual(['DH-SEL-MFL-07', 'DH-SEL-WJK-08']);

    const secondPass = completePookiSelectCatalogue(db, { attachStudioImages: true, publishVerified: true });
    expect(secondPass.publishedSkus).toEqual(reviewPass.reviewReadySkus);
    expect(queryAll(db, 'SELECT id FROM products WHERE seller_id = ?', POOKI_SELLER_ID)).toHaveLength(8);
    expect(queryAll(db, 'SELECT id FROM inventory_movements')).toHaveLength(6);
    expect(queryAll(db, 'SELECT id FROM product_images WHERE url LIKE \'/images/select/%\'')).toHaveLength(6);

    for (const sku of publishedPass.publishedSkus) {
      expect(publishedPass.readinessBlockersBySku[sku]).toEqual([]);
    }

    const pookiRows = queryAll<{
      sku: string;
      status: string;
      price_paise: number;
      landed_cost_paise: number;
      markup_paise: number;
      price_verified: number;
      availability_verified: number;
      supplier_available: number;
      fulfilment_method: string;
    }>(
      db,
      `SELECT p.sku, p.status, p.price_paise, ps.landed_cost_paise, ps.markup_paise,
              ps.price_verified, ps.availability_verified, ps.supplier_available, p.fulfilment_method
         FROM products p JOIN product_sourcing ps ON ps.product_id = p.id
        WHERE p.seller_id = ? ORDER BY p.sku`,
      POOKI_SELLER_ID,
    );
    const bySku = Object.fromEntries(pookiRows.map((r) => [r.sku, r]));
    expect(bySku['DH-SEL-KSH-01']?.price_paise).toBe(62500);
    expect(bySku['DH-SEL-MCS-02']?.price_paise).toBe(39000);
    expect(bySku['DH-SEL-BKS-03']?.price_paise).toBe(47100);
    expect(bySku['DH-SEL-HMC-04']?.price_paise).toBe(28600);
    expect(bySku['DH-SEL-GMK-05']?.price_paise).toBe(61900);
    expect(bySku['DH-SEL-PHT-06']?.price_paise).toBe(27400);
    for (const sku of publishedPass.publishedSkus) {
      expect(bySku[sku]?.status).toBe('approved');
      expect(bySku[sku]?.price_paise).toBe((bySku[sku]?.landed_cost_paise ?? 0) + 10000);
      expect(bySku[sku]?.price_verified).toBe(1);
      expect(bySku[sku]?.availability_verified).toBe(1);
      expect(bySku[sku]?.supplier_available).toBe(1);
      expect(bySku[sku]?.fulfilment_method).toBe('EXTERNAL_SUPPLIER');
    }
    expect(bySku['DH-SEL-MFL-07']?.status).toBe('draft');
    expect(bySku['DH-SEL-MFL-07']?.supplier_available).toBe(0);
    expect(bySku['DH-SEL-WJK-08']?.status).toBe('draft');
    expect(bySku['DH-SEL-WJK-08']?.supplier_available).toBe(0);

    // Public storefront shows all 6 published items with photos and ZERO Meesho / supplier leaks
    const publicRes = await request(app).get('/api/products?pageSize=48');
    const publishedItems = (publicRes.body.items as Array<{ slug: string; imageUrl: string | null; isSelectCurated: boolean }>).filter(
      (item) => item.slug.includes('dear-hills-select'),
    );
    expect(publishedItems).toHaveLength(6);
    expect(publishedItems.every((i) => Boolean(i.imageUrl?.startsWith('/images/select/')))).toBe(true);
    expect(publishedItems.every((i) => i.isSelectCurated)).toBe(true);
    expect(JSON.stringify(publicRes.body).toLowerCase()).not.toContain('meesho');

    const sitemapRes = await request(app).get('/sitemap.xml');
    expect(sitemapRes.text.toLowerCase()).not.toContain('meesho');
    const feedRes = await request(app).get('/feeds/google-merchant.xml');
    expect(feedRes.status).toBe(200);
    expect(feedRes.text.toLowerCase()).not.toContain('meesho');
    expect(calls).toHaveLength(0);
  });
});
