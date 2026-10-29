import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { commissionOn, resolveCommissionBp } from '../lib/pricing.js';
import { checkCourierServiceability } from '../lib/shipping.js';
import { markOrderPaid } from '../lib/orders.js';
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

describe('Centralized 12% Commission Engine', () => {
  it('calculates exactly 12% commission (1200 bp) with integer paise deterministic rounding', () => {
    // ₹1,000 subtotal (100,000 paise)
    const basisPaise = 100_000;
    const rateBp = 1200; // 12%
    const commission = commissionOn(basisPaise, rateBp);
    const sellerShare = basisPaise - commission;

    expect(commission).toBe(12_000); // ₹120 Dear Hills commission
    expect(sellerShare).toBe(88_000); // ₹880 seller share

    // Small amounts rounding
    expect(commissionOn(50, 1200)).toBe(6); // 50 paise * 12% = 6 paise
    expect(commissionOn(0, 1200)).toBe(0);
    expect(commissionOn(-500, 1200)).toBe(0);
  });

  it('resolves the default 12% rate unless a specific rule overrides it', () => {
    const defaultBp = resolveCommissionBp(db, IDS.seller, IDS.category);
    expect(defaultBp).toBe(1200);
  });

  it('snapshots 12% commission against each order item and seller order during checkout', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1); // Product priced at ₹1,000 (100,000 paise)

    const res = await checkout(app, customer);
    expect(res.status).toBe(201);
    const orderNumber = res.body.order.orderNumber;

    const sellerOrder = queryOne<{
      commission_rate_bp: number;
      commission_paise: number;
      seller_earning_paise: number;
      subtotal_paise: number;
    }>(
      db,
      `SELECT so.commission_rate_bp, so.commission_paise, so.seller_earning_paise, so.subtotal_paise
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE o.order_number = ?`,
      orderNumber,
    );

    expect(sellerOrder).toBeTruthy();
    expect(sellerOrder!.commission_rate_bp).toBe(1200);
    expect(sellerOrder!.commission_paise).toBe(12_000); // 12% of 100,000 paise = 12,000 paise (₹120)
    expect(sellerOrder!.seller_earning_paise).toBe(88_000); // ₹880
  });

  it('strictly hides internal commission rates from seller-facing /config and /earnings responses', async () => {
    const seller = await login(app, 'seller@test.local');

    // Check seller /config
    const configRes = await mutate(seller.get('/api/seller/config'));
    expect(configRes.status).toBe(200);
    // categoryRates and defaultBp must NOT be exposed in seller config
    expect(configRes.body.commission.categoryRates).toBeUndefined();
    expect(configRes.body.commission.defaultBp).toBeUndefined();
    expect(configRes.body.commission.note).toContain('Commission is calculated on the product value');

    // Check seller /earnings
    const earningsRes = await mutate(seller.get('/api/seller/earnings'));
    expect(earningsRes.status).toBe(200);
    // Internal commission breakdown table with rate_bp must not be present
    expect(earningsRes.body.commissions).toBeUndefined();
    expect(earningsRes.body.feeDeductionsTotalPaise).toBeDefined();
    expect(earningsRes.body.totals).toBeDefined();
  });
});

describe('Automated Shipping & Courier Lifecycle', () => {
  it('checks courier serviceability and returns benchmarked Himalayan courier options', async () => {
    const result = await checkCourierServiceability({
      pickupPincode: '175125', // Kullu, HP
      deliveryPincode: '110001', // New Delhi
      weightG: 500,
    });

    expect(result.serviceable).toBe(true);
    expect(result.couriers.length).toBeGreaterThan(0);
    expect(result.fastestDays).toBeGreaterThan(0);
  });

  it('rejects invalid PIN codes during serviceability check', async () => {
    await expect(
      checkCourierServiceability({
        pickupPincode: '999', // Invalid PIN
        deliveryPincode: '110001',
        weightG: 500,
      }),
    ).rejects.toThrow();
  });

  it('prevents a seller from manually marking an order as delivered via action endpoint', async () => {
    const seller = await login(app, 'seller@test.local');
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const orderRes = await checkout(app, customer);
    const orderId = orderRes.body.order.id;

    // Simulate payment capture using markOrderPaid
    markOrderPaid(db, {
      orderId,
      provider: 'razorpay',
      providerEventId: `test_evt_${Date.now()}`,
      providerPaymentId: `pay_test_${Date.now()}`,
      amountPaise: 107_900,
    });

    const so = queryOne<{ id: string }>(db, 'SELECT id FROM seller_orders WHERE order_id = ?', orderId);

    // Seller accepts and packs
    await mutate(seller.post(`/api/seller/orders/${so!.id}/action`)).send({ action: 'accept' });
    await mutate(seller.post(`/api/seller/orders/${so!.id}/action`)).send({ action: 'pack' });

    // Attempt to manually trigger 'deliver' (must be rejected with 400 bad request)
    const deliverAttempt = await mutate(seller.post(`/api/seller/orders/${so!.id}/action`)).send({ action: 'deliver' });
    expect([400, 409]).toContain(deliverAttempt.status);
  });

  it('processes courier delivery webhooks idempotently and starts the 7-day return window', async () => {
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, IDS.product, 1);
    const orderRes = await checkout(app, customer);
    const orderId = orderRes.body.order.id;

    markOrderPaid(db, {
      orderId,
      provider: 'razorpay',
      providerEventId: `test_evt_${Date.now()}`,
      providerPaymentId: `pay_test_${Date.now()}`,
      amountPaise: 107_900,
    });

    const so = queryOne<{ id: string }>(db, 'SELECT id FROM seller_orders WHERE order_id = ?', orderId);

    // Create a shipment record with AWB
    const testAwb = `DH_AWB_${Date.now()}`;
    const shipmentId = `shp_test_${Date.now()}`;
    const nowIso = new Date().toISOString();

    execute(
      db,
      `INSERT INTO shipments (id, seller_order_id, provider, carrier, tracking_number, tracking_url, status, shipped_at, created_at)
       VALUES (?, ?, 'shiprocket', 'Delhivery Express', ?, 'https://shiprocket.co/tracking', 'in_transit', ?, ?)`,
      shipmentId,
      so!.id,
      testAwb,
      nowIso,
      nowIso,
    );

    execute(db, "UPDATE seller_orders SET status = 'shipped' WHERE id = ?", so!.id);

    // Send courier webhook reporting DELIVERED
    const webhookRes = await request(app)
      .post('/api/webhooks/shipping')
      .send({
        awb: testAwb,
        current_status: 'DELIVERED',
        current_status_desc: 'Delivered to recipient at destination address.',
      });

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.ok).toBe(true);
    expect(webhookRes.body.status).toBe('delivered');

    // Check that seller_order is now delivered
    const updatedSo = queryOne<{ status: string; delivered_at: string | null }>(
      db,
      'SELECT status, delivered_at FROM seller_orders WHERE id = ?',
      so!.id,
    );
    expect(updatedSo!.status).toBe('delivered');
    expect(updatedSo!.delivered_at).toBeTruthy();

    // Check that ledger entries are transitioned to eligible after 7-day return window
    const ledger = queryOne<{ status: string; available_at: string | null }>(
      db,
      "SELECT status, available_at FROM seller_ledger_entries WHERE seller_order_id = ? AND type = 'sale'",
      so!.id,
    );
    expect(ledger).toBeTruthy();
    expect(ledger!.status).toBe('eligible');
    expect(ledger!.available_at).toBeTruthy();

    // Verify deduplication: re-sending exact same delivery webhook does not duplicate events
    const duplicateWebhookRes = await request(app)
      .post('/api/webhooks/shipping')
      .send({
        awb: testAwb,
        current_status: 'DELIVERED',
        current_status_desc: 'Delivered to recipient at destination address.',
      });

    expect(duplicateWebhookRes.status).toBe(200);
    expect(duplicateWebhookRes.body.processed).toBe(false); // Ignored duplicate
  });
});

describe('Admin Payout Controls & Holds', () => {
  it('allows an administrator to place and release a payout hold with audit reasons', async () => {
    const admin = await login(app, 'admin@test.local');

    // Place payout hold
    const holdRes = await mutate(admin.post(`/api/admin/sellers/${IDS.seller}/payouts/hold`))
      .send({ reason: 'Verification of artisan documentation and packaging standard' });

    expect(holdRes.status).toBe(200);

    const sellerProfile = queryOne<{ payout_status: string }>(
      db,
      'SELECT payout_status FROM seller_profiles WHERE id = ?',
      IDS.seller,
    );
    expect(sellerProfile!.payout_status).toBe('blocked');

    // Release payout hold
    const releaseRes = await mutate(admin.post(`/api/admin/sellers/${IDS.seller}/payouts/release`))
      .send({ note: 'Packaging standards verified' });

    expect(releaseRes.status).toBe(200);

    const sellerProfileReleased = queryOne<{ payout_status: string }>(
      db,
      'SELECT payout_status FROM seller_profiles WHERE id = ?',
      IDS.seller,
    );
    expect(sellerProfileReleased!.payout_status).toBe('verified');
  });

  it('rejects unauthorized users from placing payout holds', async () => {
    const customer = await login(app, 'customer@test.local');

    const unauthorizedRes = await mutate(customer.post(`/api/admin/sellers/${IDS.seller}/payouts/hold`))
      .send({ reason: 'Hacking attempt' });

    expect(unauthorizedRes.status).toBe(403);
  });

  it('allows a seller to save bank payout details and verifies Indian bank format', async () => {
    const seller = await login(app, 'seller@test.local');

    // 1. Initially check payout details
    const initialRes = await seller.get('/api/seller/payout-details');
    expect(initialRes.status).toBe(200);

    // 2. Reject invalid IFSC
    const badIfscRes = await mutate(seller.post('/api/seller/payout-details')).send({
      beneficiaryName: 'Kullu Artisan',
      bankName: 'State Bank of India',
      accountNumber: '123456789012',
      ifscCode: 'INVALID_IFSC',
    });
    expect(badIfscRes.status).toBe(400);

    // 3. Save valid Indian bank details
    const saveRes = await mutate(seller.post('/api/seller/payout-details')).send({
      beneficiaryName: 'Kullu Shawl Artisan',
      bankName: 'State Bank of India',
      accountNumber: '304918273645',
      ifscCode: 'SBIN0001234',
      accountType: 'savings',
      upiId: 'artisan@sbi',
    });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.ok).toBe(true);
    expect(saveRes.body.details.accountNumberMasked).toBe('••••••••3645');
    expect(saveRes.body.details.ifscCode).toBe('SBIN0001234');

    // 4. Retrieve saved details as seller
    const getRes = await seller.get('/api/seller/payout-details');
    expect(getRes.status).toBe(200);
    expect(getRes.body.configured).toBe(true);
    expect(getRes.body.details.beneficiaryName).toBe('Kullu Shawl Artisan');

    // 5. Admin retrieves full payout details for settlement
    const admin = await login(app, 'admin@test.local');
    const adminSellerRes = await admin.get(`/api/admin/sellers/${IDS.seller}`);
    expect(adminSellerRes.status).toBe(200);
    expect(adminSellerRes.body.seller.payoutDetails).toBeDefined();
    expect(adminSellerRes.body.seller.payoutDetails.accountNumber).toBe('304918273645');
    expect(adminSellerRes.body.seller.payoutDetails.ifscCode).toBe('SBIN0001234');
  });
});
