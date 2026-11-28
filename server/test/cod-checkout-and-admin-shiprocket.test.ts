import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, openDatabase, queryAll, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { markOrderPaid, notifyOrderPaid } from '../lib/orders.js';
import { resetShiprocketTokenCache } from '../lib/shiprocketService.js';
import {
  ADDRESS,
  IDS,
  addToCart,
  checkout,
  login,
  mutate,
  resetDb,
  seedFixtures,
  setupTestApp,
} from './helpers.js';

interface RecordedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

describe('Cash on Delivery (>₹500, ₹19 fee, 1-click Admin confirm -> Shiprocket) & Migration 18', () => {
  let app: Express;
  let db: Db;
  let origEmail: string;
  let origPass: string;
  let origSecret: string;
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    ({ app, db } = setupTestApp());
    resetDb(db);
    seedFixtures(db);
    resetShiprocketTokenCache();
    origEmail = env.shiprocket.email;
    origPass = env.shiprocket.password;
    origSecret = env.shiprocket.webhookSecret;
    origFetch = globalThis.fetch;
    (env.shiprocket as { email: string }).email = 'sr-api@dearhills.in';
    (env.shiprocket as { password: string }).password = 'super-secret-sr-password';
    (env.shiprocket as { webhookSecret: string }).webhookSecret = 'cod-test-webhook-secret';
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    (env.shiprocket as { email: string }).email = origEmail;
    (env.shiprocket as { password: string }).password = origPass;
    (env.shiprocket as { webhookSecret: string }).webhookSecret = origSecret;
    resetShiprocketTokenCache();
  });

  afterAll(() => {
    closeDb();
  });

  function installMockShiprocket(): { calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    let nextOrderNum = 950001;
    let nextShipmentNum = 850001;

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      let body: Record<string, unknown> | null = null;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body) as Record<string, unknown>;
        } catch {
          body = null;
        }
      }
      calls.push({ url, method: init?.method ?? 'GET', body });

      if (url.includes('/auth/login')) {
        return new Response(JSON.stringify({ token: 'mock_sr_jwt_token_cod' }), { status: 200 });
      }
      if (url.includes('/orders/create/adhoc')) {
        return new Response(
          JSON.stringify({
            order_id: nextOrderNum++,
            shipment_id: nextShipmentNum++,
            status: 'NEW',
            status_code: 1,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/courier/assign/awb')) {
        return new Response(
          JSON.stringify({
            awb_assign_status: 1,
            response: { data: { awb_code: 'SR_COD_AWB_5544', courier_company_id: 24, courier_name: 'Delhivery COD' } },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/courier/generate/label')) {
        return new Response(JSON.stringify({ label_url: 'https://shiprocket.example/labels/cod-5544.pdf' }), {
          status: 200,
        });
      }
      if (url.includes('/courier/generate/pickup')) {
        return new Response(JSON.stringify({ pickup_status: 1, response: { data: 'PICKUP_COD_1' } }), { status: 200 });
      }
      if (url.includes('/orders/cancel')) {
        return new Response(JSON.stringify({ status: 200, message: 'Cancelled successfully' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    return { calls };
  }

  function setupVerifiedPickupForPrimarySeller(): string {
    const locId = 'pkl_cod_kullu_hub';
    execute(
      db,
      `INSERT INTO seller_pickup_locations
         (id, seller_id, nickname, shiprocket_location_name, shiprocket_pickup_id, contact_name, phone, email,
          line1, city, state, pincode, is_verified, is_approved, is_default, is_active)
       VALUES (?, ?, 'Kullu Hub', 'Kullu_Workshop_Hub', '7771', 'Test Maker', '9876543210', 'seller@test.local',
               '1 Maker Road', 'Kullu', 'Himachal Pradesh', '175125', 1, 1, 1, 1)`,
      locId,
      IDS.seller,
    );
    execute(
      db,
      `UPDATE products SET fulfilment_method = 'SHIPROCKET', pickup_location_id = ?, weight_g = 500,
                          package_length_cm = 20, package_breadth_cm = 15, package_height_cm = 10
        WHERE id = ?`,
      locId,
      IDS.product,
    );
    return locId;
  }

  it('rejects COD for orders <= ₹500 and for non-Shiprocket products', async () => {
    setupVerifiedPickupForPrimarySeller();
    execute(db, 'UPDATE products SET price_paise = 50000 WHERE id = ?', IDS.product); // Exact ₹500 (not OVER ₹500)

    const cust = await login(app, 'customer@test.local');
    await addToCart(app, cust, IDS.product, 1);
    const exact500 = await mutate(cust.post('/api/checkout'))
      .send({ address: ADDRESS, idempotencyKey: 'cod-reject-exact-500-key-01', paymentMethod: 'cod' });
    expect(exact500.status).toBe(400);
    expect(exact500.body.error.message).toMatch(/over ₹500/i);

    // Raise price above ₹500 (₹600), but switch product to OWN_DELIVERY
    execute(db, "UPDATE products SET price_paise = 60000, fulfilment_method = 'OWN_DELIVERY' WHERE id = ?", IDS.product);
    const nonSr = await mutate(cust.post('/api/checkout'))
      .send({ address: ADDRESS, idempotencyKey: 'cod-reject-non-sr-key-002', paymentMethod: 'cod' });
    expect(nonSr.status).toBe(400);
    expect(nonSr.body.error.message).toMatch(/Shiprocket/i);
  });

  it('places >₹500 COD order with ₹19 fee, holds Shiprocket until Admin 1-click confirms, then pushes COD payload', async () => {
    setupVerifiedPickupForPrimarySeller();
    // ₹550 product -> + ₹29 shipping (< ₹699 threshold) + ₹19 COD fee = ₹598 total
    execute(db, 'UPDATE products SET price_paise = 55000 WHERE id = ?', IDS.product);
    const { calls } = installMockShiprocket();

    const cust = await login(app, 'customer@test.local');
    await addToCart(app, cust, IDS.product, 1);
    const res = await mutate(cust.post('/api/checkout'))
      .send({ address: ADDRESS, idempotencyKey: 'cod-valid-550-checkout-key-01', paymentMethod: 'cod' });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('pending_cod_confirmation');
    expect(res.body.order.paymentMethod).toBe('cod');
    expect(res.body.order.subtotalPaise).toBe(55000);
    expect(res.body.order.shippingPaise).toBe(2900);
    expect(res.body.order.codFeePaise).toBe(1900);
    expect(res.body.order.totalPaise).toBe(55000 + 2900 + 1900);
    expect(res.body.payment.provider).toBe('cod');

    // Stock MUST be reserved, zero Shiprocket API calls must occur yet, and zero order_fulfilments exist
    const inv = queryOne<{ reserved_quantity: number }>(db, 'SELECT reserved_quantity FROM inventory WHERE product_id = ?', IDS.product);
    expect(inv?.reserved_quantity).toBe(1);
    expect(calls.filter((c) => c.url.includes('/orders/create/adhoc'))).toHaveLength(0);
    expect(queryAll(db, 'SELECT id FROM order_fulfilments WHERE order_id = ?', res.body.order.id)).toHaveLength(0);

    // Seller Studio MUST NOT see unconfirmed COD order yet and cannot pack/confirm it
    const seller = await login(app, 'seller@test.local');
    const sellerOrdersBefore = await seller.get('/api/seller/orders');
    expect(sellerOrdersBefore.status).toBe(200);
    expect(sellerOrdersBefore.body.orders.some((o: { orderNumber: string }) => o.orderNumber === res.body.order.orderNumber)).toBe(false);
    const soId = res.body.order.sellerOrders[0].id as string;
    const prematureAct = await mutate(seller.post(`/api/seller/orders/${soId}/action`)).send({ action: 'confirm' });
    expect(prematureAct.status).toBe(409);

    // Admin overview reports pending_cod_confirmations = 1
    const admin = await login(app, 'admin@test.local');
    const ov = await admin.get('/api/admin/overview');
    expect(ov.status).toBe(200);
    expect(ov.body.metrics.pending_cod_confirmations).toBe(1);

    // Admin clicks ONE button: Confirm COD & Send to Shiprocket
    const confirmRes = await mutate(admin.post(`/api/admin/orders/${res.body.order.orderNumber}/cod/confirm`)).send({});
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.ok).toBe(true);
    expect(confirmRes.body.order.status).toBe('confirmed');
    expect(confirmRes.body.fulfilments).toHaveLength(1);
    expect(confirmRes.body.fulfilments[0].shiprocketOrderId).toBe(950001);
    expect(confirmRes.body.fulfilments[0].shiprocketSyncStatus).toBe('synced');

    // Verify exact Shiprocket COD adhoc payload: payment_method = 'COD', sub_total = 550, shipping_charges = 29, transaction_charges = 19 (collectible = ₹598)
    const adhocCalls = calls.filter((c) => c.url.includes('/orders/create/adhoc'));
    expect(adhocCalls).toHaveLength(1);
    expect(adhocCalls[0].body?.payment_method).toBe('COD');
    expect(adhocCalls[0].body?.sub_total).toBe(550);
    expect(adhocCalls[0].body?.shipping_charges).toBe(29);
    expect(adhocCalls[0].body?.transaction_charges).toBe(19);
    // Seller ledger basis excludes shipping and ₹19 COD fee (commission computed strictly on ₹550 product value)
    expect(res.body.order.sellerOrders[0].totalPaise).toBe(55000 + 2900);

    // Now Seller sees the COD order & can mark Ready to Ship -> deliver -> COD payment flips to paid
    const sellerOrdersAfter = await seller.get('/api/seller/orders');
    expect(sellerOrdersAfter.body.orders.some((o: { orderNumber: string; paymentMethod: string }) => o.orderNumber === res.body.order.orderNumber && o.paymentMethod === 'cod')).toBe(true);

    const rts = await mutate(seller.post(`/api/seller/orders/${soId}/shipping/arrange`)).send({});
    expect(rts.status).toBe(200);
    expect(rts.body.shipment?.trackingNumber).toBe('SR_COD_AWB_5544');

    // Deliver via Shiprocket webhook -> COD payment marked collected & paid_at set
    const deliverRes = await request(app)
      .post('/api/webhooks/shiprocket')
      .set('x-shipping-token', 'cod-test-webhook-secret')
      .send({
        awb: 'SR_COD_AWB_5544',
        current_status: 'DELIVERED',
        current_status_desc: 'COD collected and delivered.',
      });
    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.processed).toBe(true);
    const updatedOrder = queryOne<{ status: string; paid_at: string | null }>(db, 'SELECT status, paid_at FROM orders WHERE id = ?', res.body.order.id);
    const updatedPayment = queryOne<{ status: string; method: string | null }>(db, 'SELECT status, method FROM payments WHERE order_id = ?', res.body.order.id);
    expect(updatedOrder?.status).toBe('fulfilled');
    expect(updatedOrder?.paid_at).toBeTruthy();
    expect(updatedPayment?.status).toBe('paid');
    expect(updatedPayment?.method).toBe('cod_collected');
  });

  it('rejects/cancels unconfirmed or confirmed COD orders cleanly without creating monetary refunds', async () => {
    setupVerifiedPickupForPrimarySeller();
    execute(db, 'UPDATE products SET price_paise = 75000 WHERE id = ?', IDS.product);
    const { calls } = installMockShiprocket();

    const cust = await login(app, 'customer@test.local');
    await addToCart(app, cust, IDS.product, 1);
    const first = await mutate(cust.post('/api/checkout'))
      .send({ address: ADDRESS, idempotencyKey: 'cod-reject-stock-release-01', paymentMethod: 'cod' });
    expect(first.status).toBe(201);

    const admin = await login(app, 'admin@test.local');
    const rej = await mutate(admin.post(`/api/admin/orders/${first.body.order.orderNumber}/cod/reject`))
      .send({ reason: 'Unreachable customer phone during verification' });
    expect(rej.status).toBe(200);

    expect(queryOne<{ reserved_quantity: number }>(db, 'SELECT reserved_quantity FROM inventory WHERE product_id = ?', IDS.product)?.reserved_quantity).toBe(0);
    expect(queryAll(db, 'SELECT id FROM refunds WHERE order_id = ?', first.body.order.id)).toHaveLength(0);
    expect(calls.filter((c) => c.url.includes('/orders/create/adhoc'))).toHaveLength(0);

    // Place a second COD order, Admin confirms (sends to Shiprocket), then customer cancels -> cancels in Shiprocket & creates zero refunds
    await addToCart(app, cust, IDS.product, 1);
    const second = await mutate(cust.post('/api/checkout'))
      .send({ address: ADDRESS, idempotencyKey: 'cod-cust-cancel-after-confirm-02', paymentMethod: 'cod' });
    expect(second.status).toBe(201);
    await mutate(admin.post(`/api/admin/orders/${second.body.order.orderNumber}/cod/confirm`)).send({});

    const cancelCust = await mutate(cust.post(`/api/account/orders/${second.body.order.orderNumber}/cancel`))
      .send({ sellerOrderId: second.body.order.sellerOrders[0].id, reason: 'Ordered wrong item by mistake' });
    expect(cancelCust.status).toBe(200);
    expect(calls.some((c) => c.url.includes('/orders/cancel'))).toBe(true);
    expect(queryAll(db, 'SELECT id FROM refunds WHERE order_id = ?', second.body.order.id)).toHaveLength(0);
  });

  it('keeps online Razorpay paid orders auto-routing directly to Shiprocket without manual admin confirmation', async () => {
    setupVerifiedPickupForPrimarySeller();
    execute(db, 'UPDATE products SET price_paise = 75000 WHERE id = ?', IDS.product);
    const { calls } = installMockShiprocket();

    const cust = await login(app, 'customer@test.local');
    await addToCart(app, cust, IDS.product, 1);
    const orderRes = await checkout(app, cust, { idempotencyKey: 'prepaid-direct-shiprocket-check-01' });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.order as { id: string; totalPaise: number };
    markOrderPaid(db, {
      orderId: order.id,
      provider: 'razorpay',
      providerEventId: 'evt_prepaid_cod_reg_1',
      providerPaymentId: 'pay_prepaid_cod_reg_1',
      amountPaise: order.totalPaise,
    });
    await notifyOrderPaid(db, order.id);

    const dbOrder = queryOne<{ status: string; payment_method: string; cod_fee_paise: number }>(
      db,
      'SELECT status, payment_method, cod_fee_paise FROM orders WHERE id = ?',
      order.id,
    );
    expect(dbOrder?.status).toBe('paid');
    expect(dbOrder?.payment_method).toBe('razorpay');
    expect(dbOrder?.cod_fee_paise).toBe(0);

    const adhocCalls = calls.filter((c) => c.url.includes('/orders/create/adhoc'));
    expect(adhocCalls).toHaveLength(1);
    expect(adhocCalls[0].body?.payment_method).toBe('Prepaid');
    expect(adhocCalls[0].body?.transaction_charges).toBe(0);
  });

  it('Migration 18 rebuilds legacy pre-COD orders table without corrupting child FKs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pahadi-cod-mig-'));
    try {
      const file = path.join(dir, 'pre-cod.db');
      const legacy = new DatabaseSync(file);
      legacy.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations (version, applied_at) VALUES (1,'2026-01-01'),(17,'2026-01-01');
        CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE);
        INSERT INTO users (id, email) VALUES ('u1', 'u1@test.local');
        CREATE TABLE orders (
          id TEXT PRIMARY KEY,
          order_number TEXT NOT NULL UNIQUE,
          user_id TEXT NOT NULL REFERENCES users(id),
          email TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','partially_fulfilled','fulfilled','cancelled','partially_refunded','refunded','expired')),
          subtotal_paise INTEGER NOT NULL,
          discount_paise INTEGER NOT NULL DEFAULT 0,
          shipping_paise INTEGER NOT NULL DEFAULT 0,
          tax_paise INTEGER NOT NULL DEFAULT 0,
          total_paise INTEGER NOT NULL,
          coupon_code TEXT,
          shipping_address TEXT NOT NULL,
          customer_note TEXT,
          reservation_expires_at TEXT,
          idempotency_key TEXT NOT NULL UNIQUE,
          placed_at TEXT NOT NULL,
          paid_at TEXT,
          cancelled_at TEXT,
          is_demo INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        INSERT INTO orders (id, order_number, user_id, email, status, subtotal_paise, total_paise, shipping_address, idempotency_key, placed_at, paid_at, is_demo)
        VALUES ('o1', 'PR-OLD-1', 'u1', 'u1@test.local', 'paid', 60000, 60000, '{}', 'k1', '2026-01-01', '2026-01-01', 0);
        CREATE TABLE payments (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          provider_order_id TEXT,
          provider_payment_id TEXT UNIQUE,
          amount_paise INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'INR',
          status TEXT NOT NULL CHECK (status IN ('created','pending','paid','failed','cancelled')),
          method TEXT,
          verified_at TEXT,
          failure_reason TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        INSERT INTO payments (id, order_id, provider, amount_paise, status) VALUES ('p1', 'o1', 'razorpay', 60000, 'paid');
      `);
      legacy.close();

      const upgraded = openDatabase(file);
      try {
        expect(queryOne(upgraded, 'PRAGMA foreign_key_check')).toBeUndefined();
        const paymentsSql = queryOne<{ sql: string }>(upgraded, "SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'")?.sql ?? '';
        expect(paymentsSql).toContain('REFERENCES orders(id)');
        expect(paymentsSql).not.toContain('orders_legacy');
        const migratedOrder = queryOne<{ payment_method: string; cod_fee_paise: number; confirmed_at: string | null }>(
          upgraded,
          'SELECT payment_method, cod_fee_paise, confirmed_at FROM orders WHERE id = ?',
          'o1',
        );
        expect(migratedOrder).toEqual({ payment_method: 'razorpay', cod_fee_paise: 0, confirmed_at: '2026-01-01' });
        // Ensure child insert works with foreign_keys = ON
        execute(upgraded, "INSERT INTO payments (id, order_id, provider, amount_paise, status) VALUES ('p2', 'o1', 'cod', 1000, 'pending')");
      } finally {
        upgraded.close();
      }
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Ignore transient Windows SQLite WAL handle release delay in tmp dir
      }
    }
  });
});
