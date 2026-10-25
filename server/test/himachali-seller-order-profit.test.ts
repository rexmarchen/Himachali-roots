import type { Express } from 'express';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { closeDb, execute, queryOne, type Db } from '../db.js';
import {
  ADDRESS,
  IDS,
  checkout,
  login,
  mutate,
  resetDb,
  seedFixtures,
  setupTestApp,
} from './helpers.js';

let app: Express;
let db: Db;

beforeAll(() => {
  ({ app, db } = setupTestApp());
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

describe('Himachali Marketplace: Seller Product, Order Fulfilment & Profit Engine', () => {
  it('executes full end-to-end lifecycle: product upload -> approval -> catalog appearance -> purchase -> seller acceptance -> fulfilment -> profit calculation', async () => {
    const admin = await login(app, 'admin@test.local');
    const seller = await login(app, 'seller@test.local');
    const customer = await login(app, 'customer@test.local');

    // Ensure seller has an approved application on file
    execute(
      db,
      `INSERT INTO seller_applications (id, seller_id, status, revision, current_step, business_name, seller_type, submitted_at, reviewed_at)
       VALUES ('app_fixture_primary', ?, 'approved', 1, 10, 'Test Loom', 'individual', ?, ?)`,
      IDS.seller,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    // 1. Get categories and ensure strict Himachali categories exist
    const catRes = await request(app).get('/api/categories');
    expect(catRes.status).toBe(200);
    const fruitCat = catRes.body.categories.find((c: { slug: string }) => c.slug === 'fruits-and-fresh-produce') ?? catRes.body.categories[0];
    expect(fruitCat).toBeDefined();

    // 2. Seller creates a genuine Himachali fruit product with provenance and private cost inputs
    const createRes = await mutate(seller.post('/api/seller/products')).send({
      name: 'Kinnaur Royal Delicious Apples (Grade A)',
      categoryId: fruitCat.id,
      shortDescription: 'Freshly handpicked Royal Delicious apples from 2,700m alpine orchards in Kinnaur.',
      description: 'Grown in high-altitude Kotgarh orchards with natural snowmelt and crisp mountain air. Packed in protective cartons with individual foam cushioning.',
      pricePaise: 45000, // ₹450
      compareAtPricePaise: 55000, // ₹550
      estimatedCostPaise: 18000, // ₹180 COGS (private)
      packagingCostPaise: 3500, // ₹35 packaging (private)
      varietyGrade: 'Royal Delicious · Extra Fancy Grade A',
      harvestInfo: 'Harvested October 2026, Kotgarh Valley Orchards',
      dispatchConditions: 'Packed in 5-ply ventilated fruit cartons with foam liners; 48h express dispatch',
      sku: 'KNR-RDL-APPLES-01',
      unit: '2 kg box',
      weightG: 2200,
      originPlace: 'Kotgarh',
      region: 'Kinnaur, Himachal Pradesh',
      materials: 'Fresh Royal Delicious Apples',
    });
    expect(createRes.status).toBe(201);
    const productId = createRes.body.id;
    expect(productId).toBeDefined();

    // 3. Add an image and stock to the product
    execute(
      db,
      "INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES (?, ?, '/images/apple-orchard.jpg', 'Kinnaur Royal Apples in Orchard', 0)",
      `img_${productId}`,
      productId,
    );
    const stockRes = await mutate(seller.post(`/api/seller/inventory/${productId}`)).send({
      quantity: 25,
      lowStockThreshold: 5,
      note: 'Fresh harvest intake',
    });
    expect(stockRes.status).toBe(200);

    // Verify private costs are returned to the seller
    const sellerGetRes = await seller.get(`/api/seller/products/${productId}`);
    expect(sellerGetRes.status).toBe(200);
    expect(sellerGetRes.body.product.estimatedCostPaise).toBe(18000);
    expect(sellerGetRes.body.product.packagingCostPaise).toBe(3500);
    expect(sellerGetRes.body.product.varietyGrade).toBe('Royal Delicious · Extra Fancy Grade A');

    // 4. Seller submits the product for moderation
    const submitRes = await mutate(seller.post(`/api/seller/products/${productId}/submit`)).send({});
    expect(submitRes.status).toBe(200);

    // 5. Admin approves and publishes the product
    const approveRes = await mutate(admin.post(`/api/admin/products/${productId}/decision`)).send({
      decision: 'approve',
      note: 'Verified Kotgarh Himachal orchard harvest documentation.',
    });
    expect(approveRes.status).toBe(200);

    // 6. Verify product automatically appears in the public category and search
    const publicCatRes = await request(app).get(`/api/products?category=${fruitCat.slug}`);
    expect(publicCatRes.status).toBe(200);
    const foundInCat = (publicCatRes.body.items as Array<{ id: string }>).some((p) => p.id === productId);
    expect(foundInCat).toBe(true);

    const searchRes = await request(app).get('/api/products?q=Delicious');
    expect(searchRes.status).toBe(200);
    const foundInSearch = (searchRes.body.items as Array<{ id: string }>).some((p) => p.id === productId);
    expect(foundInSearch).toBe(true);

    // 7. Check public product details: Provenance attributes exist, BUT private costs NEVER leak
    const productSlug = sellerGetRes.body.product.slug;
    const publicDetailRes = await request(app).get(`/api/products/${productSlug}`);
    expect(publicDetailRes.status).toBe(200);
    expect(publicDetailRes.body.product.varietyGrade).toBe('Royal Delicious · Extra Fancy Grade A');
    expect(publicDetailRes.body.product.harvestInfo).toBe('Harvested October 2026, Kotgarh Valley Orchards');
    expect(publicDetailRes.body.product.dispatchConditions).toBe('Packed in 5-ply ventilated fruit cartons with foam liners; 48h express dispatch');
    expect((publicDetailRes.body.product as Record<string, unknown>).estimatedCostPaise).toBeUndefined();
    expect((publicDetailRes.body.product as Record<string, unknown>).packagingCostPaise).toBeUndefined();

    // 8. Customer adds product to cart and completes checkout
    const cartRes = await mutate(customer.post('/api/cart/items')).send({ productId, quantity: 2 });
    expect(cartRes.status).toBe(201);

    const checkoutRes = await checkout(app, customer);
    expect(checkoutRes.status).toBe(201);
    const orderNumber = checkoutRes.body.order.orderNumber as string;

    // Dev payment marks it paid
    const payRes = await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
    expect(payRes.status).toBe(200);

    // 9. Order appears in the seller dashboard
    const sellerOrdersRes = await seller.get('/api/seller/orders');
    expect(sellerOrdersRes.status).toBe(200);
    const sellerOrder = sellerOrdersRes.body.orders.find((o: { orderNumber: string }) => o.orderNumber === orderNumber);
    expect(sellerOrder).toBeDefined();
    expect(sellerOrder.status).toBe('pending');

    // 10. Seller accepts the order
    const acceptRes = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'accept',
      note: 'Confirmed fruit quality and boxing for dispatch.',
    });
    expect(acceptRes.status).toBe(200);

    // Verify order status is confirmed
    const orderAfterAccept = queryOne<{ status: string }>(
      db,
      'SELECT status FROM seller_orders WHERE id = ?',
      sellerOrder.id,
    );
    expect(orderAfterAccept?.status).toBe('confirmed');

    // 11. Seller packs the order and dispatches with real tracking
    const packRes = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'pack',
      note: 'Packed in ventilated corrugated box with wood-wool padding.',
    });
    expect(packRes.status).toBe(200);

    const shipRes = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'ship',
      carrier: 'Delhivery Surface Express',
      trackingNumber: 'DLV987654321HP',
      trackingUrl: 'https://delhivery.com/track/DLV987654321HP',
      note: 'Dispatched via Shimla transit hub.',
    });
    expect(shipRes.status).toBe(200);

    const orderAfterShip = queryOne<{ status: string }>(
      db,
      'SELECT status FROM seller_orders WHERE id = ?',
      sellerOrder.id,
    );
    expect(orderAfterShip?.status).toBe('shipped');

    // 12. Check inventory consistency
    const inv = queryOne<{ quantity: number; reserved_quantity: number }>(
      db,
      'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
      productId,
    );
    // 25 starting - 2 units bought = 23 quantity, 0 reserved after ship
    expect(inv?.quantity).toBe(23);
    expect(inv?.reserved_quantity).toBe(0);

    // 13. Verify Seller Dashboard financial metrics and accurate profit calculation
    const dashRes = await seller.get('/api/seller/dashboard?days=30');
    expect(dashRes.status).toBe(200);
    const finances = dashRes.body.finances;
    expect(finances).toBeDefined();
    expect(finances.hasCostData).toBe(true);

    // 2 units * ₹450 = ₹900 (90,000 paise) gross
    expect(finances.grossPaise).toBe(90000);
    // 15% marketplace commission = ₹135 (13,500 paise)
    expect(finances.commissionPaise).toBe(13500);
    // Net revenue = ₹765 (76,500 paise)
    expect(finances.netRevenuePaise).toBe(76500);
    // COGS = 2 units * ₹180 = ₹360 (36,000 paise)
    expect(finances.cogsPaise).toBe(36000);
    // Packaging = 2 units * ₹35 = ₹70 (7,000 paise)
    expect(finances.packagingPaise).toBe(7000);
    // Estimated net profit = ₹765 - (360 + 70) = ₹335 (33,500 paise)
    expect(finances.estimatedProfitPaise).toBe(33500);
    // Margin = (33500 / 90000) * 100 = 37.2%
    expect(finances.profitMarginPercent).toBe(37.2);
  });

  it('rejects an order with clear reason and restores inventory cleanly', async () => {
    const seller = await login(app, 'seller@test.local');
    const customer = await login(app, 'customer@test.local');

    // Customer buys 1 shawl
    const cartRes = await mutate(customer.post('/api/cart/items')).send({ productId: IDS.product, quantity: 1 });
    expect(cartRes.status).toBe(201);
    const checkoutRes = await checkout(app, customer);
    expect(checkoutRes.status).toBe(201);
    const orderNumber = checkoutRes.body.order.orderNumber as string;
    await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});

    // Seller sees order pending
    const sellerOrdersRes = await seller.get('/api/seller/orders');
    const sellerOrder = sellerOrdersRes.body.orders.find((o: { orderNumber: string }) => o.orderNumber === orderNumber);
    expect(sellerOrder).toBeDefined();

    const invBefore = queryOne<{ quantity: number; reserved_quantity: number }>(
      db,
      'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
      IDS.product,
    );
    expect(invBefore?.reserved_quantity).toBe(1);

    // Seller rejects the order with reason
    const rejectRes = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'reject',
      note: 'Out of stock / harvest damaged: Fabric damaged by rain in transit.',
    });
    expect(rejectRes.status).toBe(200);

    // Verify order cancelled and stock released
    const orderAfterReject = queryOne<{ status: string }>(
      db,
      'SELECT status FROM seller_orders WHERE id = ?',
      sellerOrder.id,
    );
    expect(orderAfterReject?.status).toBe('cancelled');

    const invAfter = queryOne<{ quantity: number; reserved_quantity: number }>(
      db,
      'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
      IDS.product,
    );
    expect(invAfter?.reserved_quantity).toBe(0);
    expect(invAfter?.quantity).toBe(10); // restored back to full stock
  });

  it('enforces multi-seller security isolation and prevents broken object-level authorization', async () => {
    const seller = await login(app, 'seller@test.local');
    const seller2 = await login(app, 'seller2@test.local');
    const customer = await login(app, 'customer@test.local');

    // 1. Seller 2 cannot access Seller 1's products
    const s2ProductRes = await seller2.get(`/api/seller/products/${IDS.product}`);
    expect(s2ProductRes.status).toBe(404);

    // 2. Customer places order for Seller 1's product
    await mutate(customer.post('/api/cart/items')).send({ productId: IDS.product, quantity: 1 });
    const checkoutRes = await checkout(app, customer);
    const orderNumber = checkoutRes.body.order.orderNumber as string;
    await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});

    const s1OrdersRes = await seller.get('/api/seller/orders');
    const s1Order = s1OrdersRes.body.orders.find((o: { orderNumber: string }) => o.orderNumber === orderNumber);
    expect(s1Order).toBeDefined();

    // 3. Seller 2 cannot access Seller 1's order details or execute actions
    const s2OrderRes = await seller2.get(`/api/seller/orders/${s1Order.id}`);
    expect(s2OrderRes.status).toBe(404);

    const s2ActionRes = await mutate(seller2.post(`/api/seller/orders/${s1Order.id}/action`)).send({
      action: 'accept',
    });
    expect(s2ActionRes.status).toBe(404);

    // 4. Seller cannot approve their own product
    const selfApproveRes = await mutate(seller.post(`/api/admin/products/${IDS.product}/publish`)).send({});
    expect(selfApproveRes.status).toBe(403);
  });
});
