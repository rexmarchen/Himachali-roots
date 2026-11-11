import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
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
  setRazorpayPaymentOverride,
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
    expect(response.body.order.shippingPaise).toBe(0);
    expect(response.body.order.totalPaise).toBe(100_000);
    expect(response.body.payment.provider).toBe('unconfigured');
    expect(response.body.payment.devPaymentsEnabled).toBe(true);

    expect(inventory(IDS.product)).toMatchObject({ quantity: 10, reserved_quantity: 1 });
    const sellerOrder = sellerOrderFor(db, response.body.order.orderNumber);
    expect(sellerOrder?.commission_paise).toBe(12_000);
    expect(sellerOrder?.seller_earning_paise).toBe(88_000);
  });

  it('recalculates the price at checkout instead of trusting the cart view', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    execute(db, 'UPDATE products SET price_paise = 120_000 WHERE id = ?', IDS.product);

    const response = await checkout(app, customer);
    expect(response.status).toBe(201);
    expect(response.body.order.subtotalPaise).toBe(120_000);
    expect(response.body.order.totalPaise).toBe(120_000);
    expect(sellerOrderFor(db, response.body.order.orderNumber)?.commission_paise).toBe(14_400);
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
      commissionPaise?: number;
      sellerEarningPaise?: number;
    }>;
    expect(sellerOrders).toHaveLength(2);
    expect(sellerOrders.reduce((sum, row) => sum + row.totalPaise, 0)).toBe(response.body.order.totalPaise);
    const storedCommissions = queryAll<{ commission_paise: number }>(
      db,
      `SELECT so.commission_paise FROM seller_orders so
         JOIN orders o ON o.id = so.order_id
        WHERE o.order_number = ?`,
      response.body.order.orderNumber,
    ).map((row) => row.commission_paise);
    expect(storedCommissions.sort((a, b) => a - b)).toEqual([6_000, 12_000]);
    // Internal margins are staff-only data and must never reach a customer response.
    expect(sellerOrders.every((row) => row.commissionPaise === undefined)).toBe(true);
    expect(sellerOrders.every((row) => row.sellerEarningPaise === undefined)).toBe(true);
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
    expect(response.body.order.totalPaise).toBe(90_000);
    expect(sellerOrderFor(db, response.body.order.orderNumber)?.commission_paise).toBe(10_800);
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
    expect(response.body.order.totalPaise).toBe(112_000);
    expect(sellerOrderFor(db, response.body.order.orderNumber)?.commission_paise).toBe(13_440);
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
    expect(entries?.total).toBe(88_000);
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
    execute(db, 'UPDATE products SET price_paise = 75_000 WHERE id = ?', IDS.product);
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const response = await checkout(app, customer, { couponCode: 'SHIP10' });

    expect(response.status).toBe(201);
    expect(response.body.order.subtotalPaise).toBe(75_000);
    expect(response.body.order.discountPaise).toBe(7_500);
    // ₹750 pre-discount qualifies for free shipping, but ₹675 after
    // the discount drops below ₹699. The server must charge flat ₹29.
    expect(response.body.order.shippingPaise).toBe(2_900);
    expect(response.body.order.totalPaise).toBe(70_400);
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

describe('payment verification and obsolete route deprecation', () => {
  const originalKeyId = env.razorpay.keyId;
  const originalKeySecret = env.razorpay.keySecret;
  const TEST_KEY_SECRET = 'test_secret_key_for_hmac_sha256_32char';

  beforeEach(() => {
    (env.razorpay as any).keyId = 'rzp_test_mock_key';
    (env.razorpay as any).keySecret = TEST_KEY_SECRET;
  });

  afterAll(() => {
    (env.razorpay as any).keyId = originalKeyId;
    (env.razorpay as any).keySecret = originalKeySecret;
  });

  afterEach(() => {
    setRazorpayPaymentOverride(null);
  });

  it('verifies valid HMAC signature, transitions order to paid, and is idempotent on duplicate replay', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const orderId = created.body.order.id as string;
    const razorpayOrderId = 'order_rzp_mock_12345';
    const razorpayPaymentId = 'pay_rzp_mock_67890';

    execute(
      db,
      'UPDATE payments SET provider_order_id = ?, provider = ? WHERE order_id = ?',
      razorpayOrderId,
      'razorpay',
      orderId,
    );

    const validSignature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    const firstVerify = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: validSignature,
    });

    expect(firstVerify.status).toBe(200);
    expect(firstVerify.body.alreadyProcessed).toBe(false);
    expect(firstVerify.body.order.status).toBe('paid');

    const replayVerify = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: validSignature,
    });

    expect(replayVerify.status).toBe(200);
    expect(replayVerify.body.alreadyProcessed).toBe(true);
    expect(replayVerify.body.order.status).toBe('paid');
  });

  it('rejects tampered or invalid Razorpay payment signature', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const orderId = created.body.order.id as string;
    const razorpayOrderId = 'order_rzp_mock_invalid_sig';
    const razorpayPaymentId = 'pay_rzp_mock_invalid_sig';

    execute(
      db,
      'UPDATE payments SET provider_order_id = ?, provider = ? WHERE order_id = ?',
      razorpayOrderId,
      'razorpay',
      orderId,
    );

    const tamperedSignature = crypto
      .createHmac('sha256', 'wrong_secret')
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    const response = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: tamperedSignature,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Payment signature verification failed');
  });

  it('prevents cross-user payment verification by rejecting unauthorized customers', async () => {
    const customer = await login(app, 'customer@test.local');
    const otherCustomer = await login(app, 'other@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const orderId = created.body.order.id as string;
    const razorpayOrderId = 'order_rzp_cross_user';
    const razorpayPaymentId = 'pay_rzp_cross_user';

    execute(
      db,
      'UPDATE payments SET provider_order_id = ?, provider = ? WHERE order_id = ?',
      razorpayOrderId,
      'razorpay',
      orderId,
    );

    const signature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    const response = await mutate(otherCustomer.post('/api/payments/verify')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: signature,
    });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toContain('does not belong to your account');
  });

  it('rejects a provider payment recorded against a different order', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const orderId = created.body.order.id as string;
    const razorpayOrderId = 'order_rzp_mismatch_order';
    const razorpayPaymentId = 'pay_rzp_mismatch_order';

    execute(
      db,
      'UPDATE payments SET provider_order_id = ?, provider = ? WHERE order_id = ?',
      razorpayOrderId,
      'razorpay',
      orderId,
    );

    setRazorpayPaymentOverride((paymentId) => ({
      id: paymentId,
      order_id: 'order_rzp_someone_else',
      amount: 100,
      currency: 'INR',
      status: 'captured',
      method: 'card',
    }));

    const signature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    const response = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: signature,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('payment reference does not match');
    const order = queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId);
    expect(order?.status).toBe('pending_payment');
  });

  it('rejects a provider payment whose amount does not match the order total', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const orderId = created.body.order.id as string;
    const razorpayOrderId = 'order_rzp_mismatch_amount';
    const razorpayPaymentId = 'pay_rzp_mismatch_amount';

    execute(
      db,
      'UPDATE payments SET provider_order_id = ?, provider = ? WHERE order_id = ?',
      razorpayOrderId,
      'razorpay',
      orderId,
    );

    setRazorpayPaymentOverride((paymentId, providerOrderId) => ({
      id: paymentId,
      order_id: providerOrderId,
      amount: 100,
      currency: 'INR',
      status: 'captured',
      method: 'card',
    }));

    const signature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    const response = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: signature,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('paid amount does not match');
    const order = queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId);
    expect(order?.status).toBe('pending_payment');
  });

  it('does not mark an order paid when the provider has not captured the payment', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const orderId = created.body.order.id as string;
    const razorpayOrderId = 'order_rzp_not_captured';
    const razorpayPaymentId = 'pay_rzp_not_captured';

    execute(
      db,
      'UPDATE payments SET provider_order_id = ?, provider = ? WHERE order_id = ?',
      razorpayOrderId,
      'razorpay',
      orderId,
    );

    setRazorpayPaymentOverride((paymentId, providerOrderId) => {
      const payment = queryOne<{ amount_paise: number }>(
        db,
        'SELECT amount_paise FROM payments WHERE provider_order_id = ?',
        providerOrderId,
      );
      return {
        id: paymentId,
        order_id: providerOrderId,
        amount: payment?.amount_paise ?? 0,
        currency: 'INR',
        status: 'authorized',
        method: 'card',
      };
    });

    const signature = crypto
      .createHmac('sha256', TEST_KEY_SECRET)
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    const response = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature: signature,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('has not been captured');
    const order = queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId);
    expect(order?.status).toBe('pending_payment');
  });

  it('confirms deprecated unauthenticated payment endpoints return 404', async () => {
    const customer = await login(app, 'customer@test.local');
    const resCreate = await mutate(customer.post('/api/create-order')).send({ amount: 100 });
    expect(resCreate.status).toBe(404);

    const resVerify = await mutate(customer.post('/api/verify-payment')).send({
      razorpay_order_id: 'rzp_1',
      razorpay_payment_id: 'rzp_2',
      razorpay_signature: 'sig',
    });
    expect(resVerify.status).toBe(404);
  });
});
