import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryOne, type Db } from '../db.js';
import {
  ADDRESS,
  IDS,
  addToCart,
  checkout,
  login,
  mutate,
  orderView,
  resetDb,
  seedFixtures,
  setupTestApp,
  sellerOrderFor,
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

function inventory(productId: string) {
  return queryOne<{ quantity: number; reserved_quantity: number }>(
    db,
    'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
    productId,
  );
}

describe('checkout', () => {
  it('requires authentication', async () => {
    const response = await mutate(request(app).post('/api/checkout')).send({
      address: ADDRESS,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(response.status).toBe(401);
  });

  it('reserves stock and computes the order on the server', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const response = await checkout(app, customer);

    expect(response.status).toBe(201);
    expect(response.body.order.status).toBe('pending_payment');
    expect(response.body.order.subtotalPaise).toBe(100_000);
    expect(response.body.order.shippingPaise).toBe(7_900);
    expect(response.body.order.totalPaise).toBe(107_900);
    expect(response.body.payment.provider).toBe('unconfigured');
    expect(response.body.payment.devPaymentsEnabled).toBe(true);

    expect(inventory(IDS.product)).toMatchObject({ quantity: 10, reserved_quantity: 1 });
    const sellerOrder = sellerOrderFor(db, response.body.order.orderNumber);
    expect(sellerOrder?.commission_paise).toBe(15_000);
    expect(sellerOrder?.seller_earning_paise).toBe(85_000);
  });

  it('recalculates the price at checkout instead of trusting the cart view', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    execute(db, 'UPDATE products SET price_paise = 120_000 WHERE id = ?', IDS.product);

    const response = await checkout(app, customer);
    expect(response.status).toBe(201);
    expect(response.body.order.subtotalPaise).toBe(120_000);
    expect(response.body.order.totalPaise).toBe(127_900);
    expect(sellerOrderFor(db, response.body.order.orderNumber)?.commission_paise).toBe(18_000);
  });

  it('returns the same order for a repeated idempotency key without reserving twice', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const key = crypto.randomUUID();
    const first = await checkout(app, customer, { idempotencyKey: key });
    const second = await checkout(app, customer, { idempotencyKey: key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.order.orderNumber).toBe(first.body.order.orderNumber);
    expect(inventory(IDS.product)?.reserved_quantity).toBe(1);
    expect(
      queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM orders WHERE idempotency_key = ?', key)?.count,
    ).toBe(1);
  });

  it('rejects the second checkout when two customers race for one unit', async () => {
    execute(db, 'UPDATE inventory SET quantity = 1 WHERE product_id = ?', IDS.product);
    const first = await login(app, 'customer@test.local');
    const second = await login(app, 'other@test.local');
    await addToCart(app, first, IDS.product, 1);
    await addToCart(app, second, IDS.product, 1);

    const firstCheckout = await checkout(app, first);
    const secondCheckout = await checkout(app, second);

    expect(firstCheckout.status).toBe(201);
    expect(secondCheckout.status).toBe(409);
    expect(secondCheckout.body.error.code).toBe('insufficient_stock');
    expect(inventory(IDS.product)).toMatchObject({ quantity: 1, reserved_quantity: 1 });
  });

  it('splits a multi-seller basket into seller orders that add up to the total', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    await addToCart(app, customer, IDS.product2, 1);
    const response = await checkout(app, customer);

    expect(response.status).toBe(201);
    const sellerOrders = response.body.order.sellerOrders as Array<{
      sellerName: string;
      totalPaise: number;
      commissionPaise: number;
      sellerEarningPaise: number;
    }>;
    expect(sellerOrders).toHaveLength(2);
    expect(sellerOrders.reduce((sum, row) => sum + row.totalPaise, 0)).toBe(response.body.order.totalPaise);
    expect(sellerOrders.map((row) => row.commissionPaise).sort((a, b) => a - b)).toEqual([7_500, 15_000]);
  });

  it('applies a coupon once per customer and snapshots the discount', async () => {
    execute(
      db,
      `INSERT INTO coupons (id, code, description, type, value, min_order_paise, per_user_limit)
       VALUES ('cpn_test', 'SAVE10', 'Ten percent off', 'percent', 10, 0, 1)`,
    );
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const response = await checkout(app, customer, { couponCode: 'SAVE10' });

    expect(response.status).toBe(201);
    expect(response.body.order.discountPaise).toBe(10_000);
    expect(response.body.order.totalPaise).toBe(97_900);
    expect(sellerOrderFor(db, response.body.order.orderNumber)?.commission_paise).toBe(13_500);
    expect(
      queryOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = 'cpn_test'")?.count,
    ).toBe(1);
    expect(queryOne<{ used_count: number }>(db, "SELECT used_count FROM coupons WHERE id = 'cpn_test'")?.used_count).toBe(1);

    await addToCart(app, customer, IDS.product, 1);
    const repeated = await checkout(app, customer, { couponCode: 'SAVE10' });
    expect(repeated.status).toBe(400);
    expect(repeated.body.error.fields.coupon).toBeTruthy();
  });

  it('snapshots the GST component without adding it to the payable total', async () => {
    execute(db, 'UPDATE products SET tax_rate_bp = 1200, price_paise = 112_000 WHERE id = ?', IDS.product);
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const response = await checkout(app, customer);

    expect(response.status).toBe(201);
    expect(response.body.order.taxPaise).toBe(12_000);
    expect(response.body.order.totalPaise).toBe(119_900);
    expect(sellerOrderFor(db, response.body.order.orderNumber)?.commission_paise).toBe(16_800);
  });

  it('does not expose another customer’s order', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const other = await login(app, 'other@test.local');
    const response = await other.get(`/api/orders/${created.body.order.orderNumber}`);
    expect(response.status).toBe(404);
  });

  it('creates pending ledger entries only after a verified payment', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    expect(
      queryOne<{ count: number }>(
        db,
        'SELECT COUNT(*) AS count FROM seller_ledger_entries WHERE seller_id = ?',
        IDS.seller,
      )?.count,
    ).toBe(0);

    const paid = await mutate(customer.post(`/api/dev/orders/${created.body.order.orderNumber}/pay`)).send({});
    expect(paid.status).toBe(200);
    expect(paid.body.order.status).toBe('paid');
    expect(orderView(db, created.body.order.orderNumber)?.status).toBe('paid');
    const entries = queryOne<{ count: number; total: number }>(
      db,
      'SELECT COUNT(*) AS count, COALESCE(SUM(amount_paise),0) AS total FROM seller_ledger_entries WHERE seller_id = ?',
      IDS.seller,
    );
    expect(entries?.count).toBe(2);
    expect(entries?.total).toBe(85_000);
    expect(
      queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM commission_entries WHERE seller_id = ?', IDS.seller)?.count,
    ).toBe(1);
  });

  it('reports the development payment capability through the public config', async () => {
    const response = await request(app).get('/api/config');
    expect(response.status).toBe(200);
    expect(response.body.payments.provider).toBe('razorpay');
    expect(response.body.payments.mode).toBe('unconfigured');
    expect(response.body.payments.devPaymentsEnabled).toBe(true);
  });

  it('refuses to create an order from an empty bag', async () => {
    const customer = await login(app, 'customer@test.local');
    const response = await checkout(app, customer);
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('empty');
  });

  it('rejects an invalid delivery address before reserving stock', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const response = await checkout(app, customer, {
      address: { ...ADDRESS, pincode: '12345' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.fields['address.pincode']).toBeTruthy();
    expect(inventory(IDS.product)?.reserved_quantity).toBe(0);
  });

  it('rejects an unknown coupon without reserving stock', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const response = await checkout(app, customer, { couponCode: 'NOT-A-COUPON' });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.coupon).toBeTruthy();
    expect(inventory(IDS.product)?.reserved_quantity).toBe(0);
  });

  it('calculates shipping after the coupon discount, not before it', async () => {
    execute(
      db,
      `INSERT INTO coupons (id, code, description, type, value, min_order_paise, per_user_limit)
       VALUES ('cpn_shipping', 'SHIP10', 'Ten percent off', 'percent', 10, 0, 1)`,
    );
    execute(db, 'UPDATE products SET price_paise = 150_000 WHERE id = ?', IDS.product);
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const response = await checkout(app, customer, { couponCode: 'SHIP10' });

    expect(response.status).toBe(201);
    expect(response.body.order.subtotalPaise).toBe(150_000);
    expect(response.body.order.discountPaise).toBe(15_000);
    // ₹1,500 pre-discount would qualify for free shipping, but ₹1,350 after
    // the discount does not. The server must charge the flat rate.
    expect(response.body.order.shippingPaise).toBe(7_900);
    expect(response.body.order.totalPaise).toBe(142_900);
  });

  it('reinitializes payment for a pending order without creating a duplicate order', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const orderNumber = created.body.order.orderNumber as string;

    const resumed = await mutate(customer.post(`/api/orders/${orderNumber}/payment`)).send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body.order.orderNumber).toBe(orderNumber);
    expect(resumed.body.payment.provider).toBe('unconfigured');
    expect(resumed.body.payment.devPaymentsEnabled).toBe(true);
    expect(
      queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM orders WHERE user_id = ?', IDS.customer)?.count,
    ).toBe(1);

    const paid = await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
    expect(paid.status).toBe(200);
    expect(paid.body.order.status).toBe('paid');

    const afterPaid = await mutate(customer.post(`/api/orders/${orderNumber}/payment`)).send({});
    expect(afterPaid.status).toBe(409);
  });
});
