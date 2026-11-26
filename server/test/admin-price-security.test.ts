import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { MfaService } from '../core/security/MfaService.js';
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE, sha256 } from '../lib/auth.js';
import { clearUnknownLoginLockouts } from '../routes/auth.js';
import {
  ADDRESS,
  IDS,
  TEST_PASSWORD,
  addToCart,
  checkout,
  login,
  mutate,
  resetDb,
  seedFixtures,
  setRazorpayPaymentOverride,
  setupTestApp,
} from './helpers.js';

function signWebhook(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function signCheckout(orderId: string, paymentId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function cookieValue(res: { headers: Record<string, unknown> }, name: string): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  for (const item of list) {
    const match = String(item).match(new RegExp(`^${name}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return '';
}

describe('Admin access, 2FA step-up, price tampering & payment verification security', () => {
  let app: Express;
  let db: Db;

  beforeAll(() => {
    ({ app, db } = setupTestApp());
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    setRazorpayPaymentOverride(null);
    clearUnknownLoginLockouts();
    resetDb(db);
    seedFixtures(db);
  });

  it('TEST 1 & 2: denies anonymous (redirect/401) and non-admin customer/seller (403) across /admin/* pages & APIs, and isolates sessions', async () => {
    // 1. Anonymous user: /admin/* page redirects to /login with noindex; /api/admin/* returns 401
    for (const pagePath of ['/admin', '/admin/orders', '/admin/refunds', '/admin/audit']) {
      const pageRes = await request(app).get(pagePath);
      expect(pageRes.status).toBe(302);
      expect(pageRes.headers.location).toContain('/login');
      expect(pageRes.headers['x-robots-tag']).toContain('noindex');
    }

    for (const apiPath of ['/api/admin/overview', '/api/admin/orders', '/api/admin/refunds', '/api/admin/settlements', '/api/admin/customers', '/api/admin/audit']) {
      const apiRes = await request(app).get(apiPath);
      expect(apiRes.status).toBe(401);
    }

    // 2. Customer and seller receive 403 on admin pages and APIs
    for (const email of ['customer@test.local', 'seller@test.local']) {
      const agent = await login(app, email);
      expect((await agent.get('/admin')).status).toBe(403);
      expect((await agent.get('/admin/refunds')).status).toBe(403);
      expect((await agent.get('/api/admin/overview')).status).toBe(403);
      expect((await agent.get('/api/admin/orders')).status).toBe(403);
      expect((await mutate(agent.post('/api/admin/products')).send({ name: 'X' })).status).toBe(403);
    }

    // 3. A customer pr_session token stuffed into pr_admin_session is never accepted for admin routes
    const customerLogin = await mutate(request(app).post('/api/auth/login')).send({
      email: 'customer@test.local',
      password: TEST_PASSWORD,
    });
    const customerToken = cookieValue(customerLogin, SESSION_COOKIE);
    expect(customerToken).toBeTruthy();
    const stuffed = await request(app)
      .get('/api/admin/overview')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${customerToken}`]);
    expect(stuffed.status).toBe(401);

    // 4. Isolated admin session expires at 30-min idle timeout even while standard session stays valid,
    //    and immediate DB role revocation blocks the existing admin session on the very next request.
    const adminAgent = await login(app, 'admin@test.local');
    expect((await adminAgent.get('/api/admin/overview')).status).toBe(200);

    execute(
      db,
      "UPDATE sessions SET last_seen_at = ? WHERE user_id = ? AND scope = 'admin'",
      new Date(Date.now() - 31 * 60_000).toISOString(),
      IDS.admin,
    );
    expect((await adminAgent.get('/api/admin/overview')).status).toBe(401);
    expect((await adminAgent.get('/api/auth/me')).body.user.id).toBe(IDS.admin);

    const freshAdmin = await login(app, 'admin@test.local');
    execute(db, "DELETE FROM user_roles WHERE user_id = ? AND role = 'admin'", IDS.admin);
    expect((await freshAdmin.get('/api/admin/overview')).status).toBe(403);
  });

  it('TEST 3: enforces mandatory admin 2FA enrolment and step-up verification for sensitive actions', async () => {
    const strict = setupTestApp({ requireAdminMfa: true });
    try {
      resetDb(strict.db);
      seedFixtures(strict.db);

      // Admin without 2FA enrolled is blocked from /api/admin/* (403) and /admin page redirects to enrolment
      const admin = await login(strict.app, 'admin@test.local');
      const blockedApi = await admin.get('/api/admin/overview');
      expect(blockedApi.status).toBe(403);
      expect(blockedApi.body.error.code).toBe('mfa_enrollment_required');

      const blockedPage = await admin.get('/admin');
      expect(blockedPage.status).toBe(302);
      expect(blockedPage.headers.location).toContain('/account/profile?mfa=required');

      // Enrol and confirm TOTP via /api/auth/mfa/*
      const enrol = await mutate(admin.post('/api/auth/mfa/enrol')).send({});
      expect(enrol.status).toBe(201);
      const secret = enrol.body.secret as string;
      const confirm = await mutate(admin.post('/api/auth/mfa/confirm')).send({
        code: MfaService.generateToken(secret),
      });
      expect(confirm.status).toBe(200);

      // Re-login with 2FA establishes isolated admin session with active step-up window
      const verifiedAgent = request.agent(strict.app);
      const step1 = await mutate(verifiedAgent.post('/api/auth/login')).send({
        email: 'admin@test.local',
        password: TEST_PASSWORD,
      });
      expect(step1.body.mfaRequired).toBe(true);
      const step2 = await mutate(verifiedAgent.post('/api/auth/mfa/verify')).send({
        challengeToken: step1.body.challengeToken,
        code: MfaService.generateToken(secret),
      });
      expect(step2.status).toBe(200);
      expect((await verifiedAgent.get('/api/admin/overview')).status).toBe(200);

      // Simulate stale step-up (> 15 min) -> sensitive financial action rejected until step-up verified
      execute(
        strict.db,
        "UPDATE sessions SET mfa_verified_at = ? WHERE user_id = ? AND scope = 'admin'",
        new Date(Date.now() - 20 * 60_000).toISOString(),
        IDS.admin,
      );
      const stale = await mutate(verifiedAgent.post('/api/admin/commissions')).send({
        scope: 'global',
        rateBp: 1500,
      });
      expect(stale.status).toBe(403);
      expect(stale.body.error.code).toBe('mfa_step_up_required');

      // Step-up verification restores access to sensitive actions
      const stepUp = await mutate(verifiedAgent.post('/api/auth/mfa/step-up')).send({
        code: MfaService.generateToken(secret),
      });
      expect(stepUp.status).toBe(200);
      const allowed = await mutate(verifiedAgent.post('/api/admin/commissions')).send({
        scope: 'global',
        rateBp: 1500,
      });
      expect(allowed.status).toBe(201);
    } finally {
      closeDb();
      // Re-open default in-memory DB for subsequent tests in this file
      ({ app, db } = setupTestApp());
    }
  });

  it('TEST 4: ignores client-supplied prices/totals/discounts/shipping and snapshots DB prices', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);

    const res = await mutate(customer.post('/api/checkout')).send({
      address: ADDRESS,
      idempotencyKey: crypto.randomUUID(),
      pricePaise: 1,
      subtotalPaise: 1,
      discountPaise: 99_999,
      shippingPaise: 0,
      taxPaise: 0,
      totalPaise: 1,
      currency: 'USD',
    });
    expect(res.status).toBe(201);
    expect(res.body.order.totalPaise).toBe(100_000);
    expect(res.body.order.subtotalPaise).toBe(100_000);

    // Later product price updates do not mutate historical order snapshots
    execute(db, 'UPDATE products SET price_paise = 250_000 WHERE id = ?', IDS.product);
    const snapshot = queryOne<{ unit_price_paise: number; line_subtotal_paise: number }>(
      db,
      'SELECT unit_price_paise, line_subtotal_paise FROM order_items WHERE order_id = ?',
      res.body.order.id,
    );
    expect(snapshot).toEqual({ unit_price_paise: 100_000, line_subtotal_paise: 100_000 });
  });

  it('TEST 5 & 6: rejects wrong amount or forged signature, alerts admin on mismatch, and deduplicates webhooks', async () => {
    const prevKeyId = env.razorpay.keyId;
    const prevKeySecret = env.razorpay.keySecret;
    const prevWebhookSecret = env.razorpay.webhookSecret;
    (env.razorpay as { keyId: string }).keyId = 'rzp_test_sec';
    (env.razorpay as { keySecret: string }).keySecret = 'sec_razorpay_secret_key';
    (env.razorpay as { webhookSecret: string }).webhookSecret = 'sec_webhook_secret';
    try {
      const customer = await login(app, 'customer@test.local');
      await addToCart(app, customer, IDS.product, 1);
      const created = await checkout(app, customer);
      expect(created.status).toBe(201);
      const orderId = created.body.order.id as string;
      const orderNumber = created.body.order.orderNumber as string;

      // Seed provider_order_id cleanly so signature/verification can run without live Razorpay HTTP calls
      const rzpOrderId = 'order_test_sec_001';
      execute(db, 'UPDATE payments SET provider_order_id = ?, provider = ? WHERE order_id = ?', rzpOrderId, 'razorpay', orderId);

      // Invalid signature rejected
      const badSig = await mutate(customer.post('/api/payments/verify')).send({
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: 'pay_test_001',
        razorpaySignature: '0'.repeat(64),
      });
      expect(badSig.status).toBe(400);
      expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId)?.status).toBe('pending_payment');

      // Valid signature but mismatched captured amount -> rejected + security notification + order event
      setRazorpayPaymentOverride(async () => ({
        id: 'pay_test_mismatch',
        order_id: rzpOrderId,
        amount: 100, // tampered ₹1 instead of ₹1,000
        currency: 'INR',
        status: 'captured',
        method: 'upi',
      }));
      const mismatchRes = await mutate(customer.post('/api/payments/verify')).send({
        razorpayOrderId: rzpOrderId,
        razorpayPaymentId: 'pay_test_mismatch',
        razorpaySignature: signCheckout(rzpOrderId, 'pay_test_mismatch', 'sec_razorpay_secret_key'),
      });
      expect(mismatchRes.status).toBe(400);
      expect(mismatchRes.body.error.message).toContain('amount does not match');
      expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId)?.status).toBe('pending_payment');
      expect(
        queryOne<{ type: string }>(db, "SELECT type FROM notifications WHERE type = 'security_payment_mismatch' LIMIT 1"),
      ).toBeTruthy();

      // Webhook tampered signature rejected
      const webhookPayload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_wh_001', order_id: rzpOrderId, amount: 100_000, status: 'captured', method: 'card' } } },
      });
      const forgedWh = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'bad_sig')
        .set('x-razorpay-event-id', 'evt_sec_dup_1')
        .send(webhookPayload);
      expect(forgedWh.status).toBe(400);

      // Duplicate valid webhook processes exactly once
      const validSig = signWebhook(webhookPayload, 'sec_webhook_secret');
      const wh1 = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', validSig)
        .set('x-razorpay-event-id', 'evt_sec_dup_1')
        .send(webhookPayload);
      expect(wh1.status).toBe(200);
      const ledgerAfterFirst = queryAll(db, 'SELECT id FROM seller_ledger_entries');

      const wh2 = await request(app)
        .post('/api/webhooks/razorpay')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', validSig)
        .set('x-razorpay-event-id', 'evt_sec_dup_1')
        .send(webhookPayload);
      expect(wh2.status).toBe(200);
      expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE order_number = ?', orderNumber)?.status).toBe('paid');
      expect(queryAll(db, 'SELECT id FROM commission_entries')).toHaveLength(1);
      expect(queryAll(db, 'SELECT id FROM seller_ledger_entries')).toHaveLength(ledgerAfterFirst.length);
    } finally {
      (env.razorpay as { keyId: string }).keyId = prevKeyId;
      (env.razorpay as { keySecret: string }).keySecret = prevKeySecret;
      (env.razorpay as { webhookSecret: string }).webhookSecret = prevWebhookSecret;
    }
  });

  it('TEST 7 & 8: stops cross-seller price tampering, audits prices + IP append-only, enforces customer order IDOR & login lockout', async () => {
    // 7a. Seller 1 cannot edit Seller 2's product price
    const seller1 = await login(app, 'seller@test.local');
    const crossEdit = await mutate(seller1.patch(`/api/seller/products/${IDS.product2}`)).send({ pricePaise: 100 });
    expect(crossEdit.status).toBe(404);
    expect(queryOne<{ price_paise: number }>(db, 'SELECT price_paise FROM products WHERE id = ?', IDS.product2)?.price_paise).toBe(50_000);

    // 7b. Mass assignment fields rejected cleanly with 400
    const massAssign = await mutate(seller1.patch(`/api/seller/products/${IDS.product}`)).send({
      pricePaise: 120_000,
      sellerId: IDS.seller2,
      isAdmin: true,
    });
    expect(massAssign.status).toBe(400);

    // 7c. Seller edits own product price -> audited with old/new price & IP, flagged if >= 50%, triggers block UPDATE/DELETE on audit_logs
    const ownEdit = await mutate(seller1.patch(`/api/seller/products/${IDS.product}`)).send({ pricePaise: 200_000 });
    expect(ownEdit.status).toBe(200);
    expect(ownEdit.body.priceSpikeFlagged).toBe(true);
    const auditRow = queryOne<{ before_json: string; after_json: string; ip_address: string }>(
      db,
      "SELECT before_json, after_json, ip_address FROM audit_logs WHERE action = 'product.price_or_listing_updated' AND entity_id = ?",
      IDS.product,
    );
    expect(JSON.parse(auditRow!.before_json)).toMatchObject({ pricePaise: 100_000 });
    expect(JSON.parse(auditRow!.after_json)).toMatchObject({ pricePaise: 200_000, priceChangePercent: 100, priceSpikeFlagged: true });
    expect(auditRow?.ip_address).toBeTruthy();

    // Append-only trigger enforcement at DB layer
    expect(() => db.exec("UPDATE audit_logs SET action = 'tampered'")).toThrow(/append-only/i);
    expect(() => db.exec('DELETE FROM audit_logs')).toThrow(/append-only/i);

    // 8a. Customer A cannot view Customer B's order
    const customerA = await login(app, 'customer@test.local');
    await addToCart(app, customerA, IDS.product2, 1);
    const orderA = await checkout(app, customerA);
    const numA = orderA.body.order.orderNumber as string;

    const customerB = await login(app, 'other@test.local');
    expect((await customerB.get(`/api/orders/${numA}`)).status).toBe(404);
    expect((await customerB.get(`/api/account/orders/${numA}`)).status).toBe(404);

    // 8b. 5 failed login attempts lock account temporarily (429) without revealing existence
    for (let i = 0; i < 5; i += 1) {
      const fail = await mutate(request(app).post('/api/auth/login')).send({
        email: 'other@test.local',
        password: 'WrongPassword123!',
      });
      expect(fail.status).toBe(401);
    }
    const locked = await mutate(request(app).post('/api/auth/login')).send({
      email: 'other@test.local',
      password: TEST_PASSWORD,
    });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('account_locked');

    // Verify admin sees IP in /api/admin/audit
    const admin = await login(app, 'admin@test.local');
    const auditRes = await admin.get('/api/admin/audit');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.logs.length).toBeGreaterThan(0);
    expect(auditRes.body.logs[0]).toHaveProperty('ipAddress');
    expect(sha256('check')).toHaveLength(64);
  });
});
