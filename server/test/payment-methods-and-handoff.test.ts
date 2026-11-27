import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, execute, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { MfaService } from '../core/security/MfaService.js';
import {
  ADDRESS,
  IDS,
  addToCart,
  checkout,
  login,
  mutate,
  resetDb,
  seedFixtures,
  setRazorpayPaymentOverride,
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

afterEach(() => {
  setRazorpayPaymentOverride(null);
});

describe('payment methods, failure retry, pending cancel, and mobile handoff', () => {
  const originalKeyId = env.razorpay.keyId;
  const originalKeySecret = env.razorpay.keySecret;
  const TEST_SECRET = 'test_secret_key_for_hmac_sha256_32char';

  beforeEach(() => {
    (env.razorpay as unknown as { keyId: string; keySecret: string }).keyId = 'rzp_test_mock_key';
    (env.razorpay as unknown as { keyId: string; keySecret: string }).keySecret = TEST_SECRET;
  });

  afterAll(() => {
    (env.razorpay as unknown as { keyId: string; keySecret: string }).keyId = originalKeyId;
    (env.razorpay as unknown as { keyId: string; keySecret: string }).keySecret = originalKeySecret;
  });

  it('keeps real Razorpay purchases on non-demo products marked isDemo=false even in dev mode', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    expect(created.status).toBe(201);
    expect(created.body.order.isDemo).toBe(false);

    const rzpOrderId = 'order_real_100';
    const rzpPayId = 'pay_real_100';
    execute(
      db,
      "UPDATE payments SET provider = 'razorpay', provider_order_id = ? WHERE order_id = ?",
      rzpOrderId,
      created.body.order.id,
    );

    const sig = crypto.createHmac('sha256', TEST_SECRET).update(`${rzpOrderId}|${rzpPayId}`).digest('hex');
    const verified = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPayId,
      razorpaySignature: sig,
    });

    expect(verified.status).toBe(200);
    expect(verified.body.order.status).toBe('paid');
    expect(verified.body.order.isDemo).toBe(false);
  });

  it('records client failure and allows retrying payment with a new payment id on the same Razorpay order', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const rzpOrderId = 'order_retry_upi_1';
    execute(
      db,
      "UPDATE payments SET provider = 'razorpay', provider_order_id = ? WHERE order_id = ?",
      rzpOrderId,
      created.body.order.id,
    );

    // Client-side failure report
    const clientFail = await mutate(customer.post('/api/payments/failed')).send({
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: 'pay_failed_1',
      reason: 'Incorrect UPI PIN entered',
      code: 'BAD_REQUEST_ERROR',
    });
    expect(clientFail.status).toBe(200);

    // Simulate payment.failed webhook from first attempt
    const failWebhookBody = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_1',
            order_id: rzpOrderId,
            error_description: 'UPI collect expired',
          },
        },
      },
    });
    const whSig = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(failWebhookBody).digest('hex');
    const whRes = await request(app)
      .post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', whSig)
      .set('x-razorpay-event-id', 'evt_fail_retry_1')
      .send(failWebhookBody);
    expect(whRes.status).toBe(200);

    // Same failed payment id stays rejected
    const failedSig = crypto.createHmac('sha256', TEST_SECRET).update(`${rzpOrderId}|pay_failed_1`).digest('hex');
    const blockedRetrySameId = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: 'pay_failed_1',
      razorpaySignature: failedSig,
    });
    expect(blockedRetrySameId.status).toBe(409);

    // In-modal retry with a fresh captured payment id on the SAME Razorpay order succeeds
    const successPayId = 'pay_retry_ok_2';
    const successSig = crypto.createHmac('sha256', TEST_SECRET).update(`${rzpOrderId}|${successPayId}`).digest('hex');
    const verified = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: successPayId,
      razorpaySignature: successSig,
    });
    expect(verified.status).toBe(200);
    expect(verified.body.order.status).toBe('paid');

    // Resume endpoint on a separate failed order reuses existing providerOrderId cleanly
    await addToCart(app, customer, IDS.product2, 1);
    const second = await checkout(app, customer);
    execute(
      db,
      "UPDATE payments SET provider = 'razorpay', provider_order_id = 'order_reused_99', status = 'failed' WHERE order_id = ?",
      second.body.order.id,
    );
    const resumed = await mutate(customer.post(`/api/orders/${second.body.order.orderNumber}/payment`)).send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body.payment.providerOrderId).toBe('order_reused_99');
  });

  it('allows customers to cancel unpaid pending_payment orders and frees stock + coupons', async () => {
    execute(
      db,
      `INSERT INTO coupons (id, code, description, type, value, min_order_paise, per_user_limit)
       VALUES ('cpn_cancel_pending', 'PEND10', 'Ten percent off', 'percent', 10, 0, 1)`,
    );
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 2);
    const created = await checkout(app, customer, { address: ADDRESS, couponCode: 'PEND10' });
    expect(created.status).toBe(201);
    expect(
      queryOne<{ reserved_quantity: number }>(db, 'SELECT reserved_quantity FROM inventory WHERE product_id = ?', IDS.product)
        ?.reserved_quantity,
    ).toBe(2);

    const cancelled = await mutate(customer.post(`/api/account/orders/${created.body.order.orderNumber}/cancel`)).send({
      reason: 'Want to change delivery address and items',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('completed');
    expect(
      queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', created.body.order.id)?.status,
    ).toBe('cancelled');
    expect(
      queryOne<{ reserved_quantity: number }>(db, 'SELECT reserved_quantity FROM inventory WHERE product_id = ?', IDS.product)
        ?.reserved_quantity,
    ).toBe(0);
    expect(
      queryOne<{ used_count: number }>(db, "SELECT used_count FROM coupons WHERE id = 'cpn_cancel_pending'")?.used_count,
    ).toBe(0);
  });

  it('issues single-use browser handoff tokens for mobile checkout and blocks replay/open redirects', async () => {
    const mobileAgent = await login(app, 'customer@test.local');
    await addToCart(app, mobileAgent, IDS.product, 1);

    const badTarget = await mutate(mobileAgent.post('/api/auth/browser-handoff')).send({
      targetPath: 'https://evil.example/steal',
    });
    expect(badTarget.status).toBe(400);

    const issued = await mutate(mobileAgent.post('/api/auth/browser-handoff')).send({
      targetPath: '/checkout?coupon=WELCOME10',
    });
    expect(issued.status).toBe(201);
    expect(issued.body.handoffPath).toContain('/api/auth/browser-handoff?token=');

    const browserAgent = request.agent(app);
    const exchange = await browserAgent.get(issued.body.handoffPath).redirects(0);
    expect(exchange.status).toBe(302);
    expect(exchange.headers.location).toBe('/checkout?coupon=WELCOME10');

    const me = await browserAgent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('customer@test.local');

    const cart = await browserAgent.get('/api/cart');
    expect(cart.status).toBe(200);
    expect(cart.body.cart.itemCount).toBe(1);

    // Replay of single-use handoff token is rejected
    const replay = await request(app)
      .get(issued.body.handoffPath)
      .set('Accept', 'application/json');
    expect(replay.status).toBe(401);
  });

  it('returns settlement id cleanly matching AdminSettlementsPage contract', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const payRes = await mutate(customer.post(`/api/dev/orders/${created.body.order.orderNumber}/pay`)).send({});
    expect(payRes.status).toBe(200);

    execute(db, "UPDATE seller_profiles SET payout_status = 'verified' WHERE id = ?", IDS.seller);
    execute(db, "UPDATE seller_ledger_entries SET status = 'eligible', available_at = '2020-01-01T00:00:00.000Z' WHERE order_id = ?", created.body.order.id);

    const admin = await login(app, 'admin@test.local');
    const enrol = await mutate(admin.post('/api/auth/mfa/enrol')).send({});
    await mutate(admin.post('/api/auth/mfa/confirm')).send({ code: MfaService.generateToken(enrol.body.secret) });
    await mutate(admin.post('/api/auth/mfa/step-up')).send({ code: MfaService.generateToken(enrol.body.secret) });

    const settlement = await mutate(admin.post('/api/admin/settlements')).send({
      sellerId: IDS.seller,
      periodStart: '2020-01-01T00:00:00.000Z',
      periodEnd: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(settlement.status).toBe(201);
    expect(settlement.body.id).toBeTruthy();
    expect(settlement.body.id).toBe(settlement.body.batchId);
  });

  it('maps Razorpay order init auth failures to 502 instead of 401 session errors', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const resume = await mutate(customer.post(`/api/orders/${created.body.order.orderNumber}/payment`)).send({});
    expect(resume.status).toBe(502);
    expect(resume.body.error.code).toBe('payment_provider_error');
  });

  it('finalizes synchronous Razorpay refunds immediately when provider returns status=processed', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const created = await checkout(app, customer);
    const rzpOrderId = 'order_sync_refund_1';
    const rzpPayId = 'pay_sync_refund_1';
    execute(
      db,
      "UPDATE payments SET provider = 'razorpay', provider_order_id = ? WHERE order_id = ?",
      rzpOrderId,
      created.body.order.id,
    );
    const sig = crypto.createHmac('sha256', TEST_SECRET).update(`${rzpOrderId}|${rzpPayId}`).digest('hex');
    const verified = await mutate(customer.post('/api/payments/verify')).send({
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPayId,
      razorpaySignature: sig,
    });
    expect(verified.status).toBe(200);

    const sellerOrderId = created.body.order.sellerOrders[0].id as string;
    const cancelRes = await mutate(customer.post(`/api/account/orders/${created.body.order.orderNumber}/cancel`)).send({
      sellerOrderId,
      reason: 'Customer cancelled before dispatch for refund test',
    });
    expect(cancelRes.status).toBe(200);

    const refundRow = queryOne<{ id: string }>(db, 'SELECT id FROM refunds WHERE order_id = ?', created.body.order.id);
    expect(refundRow?.id).toBeTruthy();

    const admin = await login(app, 'admin@test.local');
    const enrol = await mutate(admin.post('/api/auth/mfa/enrol')).send({});
    await mutate(admin.post('/api/auth/mfa/confirm')).send({ code: MfaService.generateToken(enrol.body.secret) });
    await mutate(admin.post('/api/auth/mfa/step-up')).send({ code: MfaService.generateToken(enrol.body.secret) });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'rfnd_sync_processed_1',
          payment_id: rzpPayId,
          amount: created.body.order.totalPaise,
          status: 'processed',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    try {
      const decideRes = await mutate(admin.post(`/api/admin/refunds/${refundRow!.id}/decide`)).send({
        decision: 'approve',
        method: 'razorpay',
        note: 'Instant Razorpay refund processed synchronously',
      });
      expect(decideRes.status).toBe(200);
      expect(decideRes.body.status).toBe('completed');
    } finally {
      fetchSpy.mockRestore();
    }

    expect(
      queryOne<{ status: string; provider_refund_id: string }>(db, 'SELECT status, provider_refund_id FROM refunds WHERE id = ?', refundRow!.id),
    ).toMatchObject({ status: 'completed', provider_refund_id: 'rfnd_sync_processed_1' });
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', created.body.order.id)?.status).toBe('refunded');
  });
});
