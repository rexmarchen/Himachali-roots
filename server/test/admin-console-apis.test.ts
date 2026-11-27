import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, type Db } from '../db.js';
import { IDS, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

describe('Admin console APIs: customers, payments, sellers, payouts & taxonomy', () => {
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

  it('returns accurate overview integrations including emailProvider and webhook flag', async () => {
    const admin = await login(app, 'admin@test.local');
    const res = await admin.get('/api/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body.integrations).toMatchObject({
      email: expect.any(String),
      emailProvider: expect.any(String),
      shipping: expect.any(String),
      payments: {
        provider: 'razorpay',
        configured: expect.any(Boolean),
        webhookConfigured: expect.any(Boolean),
        mode: expect.any(String),
      },
    });
  });

  it('summarizes and filters real vs demo payments and search queries in /api/admin/payments', async () => {
    const admin = await login(app, 'admin@test.local');

    // Insert one paid real order + payment and one paid demo order + payment
    execute(
      db,
      `INSERT INTO orders (id, order_number, user_id, email, status, subtotal_paise, shipping_paise, tax_paise, total_paise, shipping_address, idempotency_key, placed_at, is_demo, paid_at)
       VALUES ('ord_real_1', 'PR-261127-REAL01', ?, 'customer@test.local', 'paid', 25000, 0, 0, 25000, '{}', 'idem_real_1', datetime('now'), 0, datetime('now'))`,
      IDS.customer,
    );
    execute(
      db,
      `INSERT INTO payments (id, order_id, provider, status, amount_paise, provider_order_id, provider_payment_id, method, verified_at)
       VALUES ('pay_real_1', 'ord_real_1', 'razorpay', 'paid', 25000, 'order_real_1', 'pay_live_9911', 'upi', datetime('now'))`,
    );

    execute(
      db,
      `INSERT INTO orders (id, order_number, user_id, email, status, subtotal_paise, shipping_paise, tax_paise, total_paise, shipping_address, idempotency_key, placed_at, is_demo, paid_at)
       VALUES ('ord_demo_1', 'PR-261127-DEMO01', ?, 'other@test.local', 'paid', 50000, 0, 0, 50000, '{}', 'idem_demo_1', datetime('now'), 1, datetime('now'))`,
      IDS.otherCustomer,
    );
    execute(
      db,
      `INSERT INTO payments (id, order_id, provider, status, amount_paise, provider_order_id, provider_payment_id, method, verified_at)
       VALUES ('pay_demo_1', 'ord_demo_1', 'simulated', 'paid', 50000, 'sim_order_1', 'sim_pay_1', 'simulator', datetime('now'))`,
    );

    const allRes = await admin.get('/api/admin/payments');
    expect(allRes.status).toBe(200);
    expect(allRes.body.total).toBe(2);
    expect(allRes.body.summary).toMatchObject({
      totalPaidPaise: 25000,
      demoPaidPaise: 50000,
      paidCount: 2,
      realPaidCount: 1,
      demoPaidCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
    expect(allRes.body.provider).toMatchObject({
      provider: 'razorpay',
      webhookConfigured: expect.any(Boolean),
    });

    const realOnly = await admin.get('/api/admin/payments?isDemo=false');
    expect(realOnly.status).toBe(200);
    expect(realOnly.body.payments).toHaveLength(1);
    expect(realOnly.body.payments[0]).toMatchObject({
      order_number: 'PR-261127-REAL01',
      email: 'customer@test.local',
      is_demo: 0,
    });

    const qSearch = await admin.get('/api/admin/payments?q=pay_live_9911');
    expect(qSearch.status).toBe(200);
    expect(qSearch.body.payments).toHaveLength(1);
    expect(qSearch.body.payments[0].id).toBe('pay_real_1');
  });

  it('summarizes and filters customer accounts by role, email verification, and excludes demo orders from spend', async () => {
    const admin = await login(app, 'admin@test.local');

    // Add unverified customer and both a real order + demo order on customer
    execute(
      db,
      "INSERT INTO users (id, email, password_hash, email_verified, is_disabled) VALUES ('usr_unverified', 'unverified@test.local', 'x', 0, 0)",
    );
    execute(db, "INSERT INTO profiles (id, full_name) VALUES ('usr_unverified', 'Unverified Buyer')");
    execute(db, "INSERT INTO user_roles (user_id, role) VALUES ('usr_unverified', 'customer')");

    execute(
      db,
      `INSERT INTO orders (id, order_number, user_id, email, status, subtotal_paise, shipping_paise, tax_paise, total_paise, shipping_address, idempotency_key, placed_at, is_demo, paid_at)
       VALUES ('ord_cust_real', 'PR-261127-CREAL1', ?, 'customer@test.local', 'paid', 40000, 0, 0, 40000, '{}', 'idem_creal_1', datetime('now'), 0, datetime('now'))`,
      IDS.customer,
    );
    execute(
      db,
      `INSERT INTO orders (id, order_number, user_id, email, status, subtotal_paise, shipping_paise, tax_paise, total_paise, shipping_address, idempotency_key, placed_at, is_demo, paid_at)
       VALUES ('ord_cust_demo', 'PR-261127-CDEMO1', ?, 'customer@test.local', 'paid', 99000, 0, 0, 99000, '{}', 'idem_cdemo_1', datetime('now'), 1, datetime('now'))`,
      IDS.customer,
    );

    const allRes = await admin.get('/api/admin/customers');
    expect(allRes.status).toBe(200);
    expect(allRes.body.summary).toMatchObject({
      totalAccounts: 6,
      verifiedCount: 5,
      sellerCount: 2,
      adminCount: 1,
      buyersWithOrders: 1,
    });

    const cust = (allRes.body.customers as { email: string; orderCount: number; paidTotalPaise: number }[]).find(
      (c) => c.email === 'customer@test.local',
    );
    expect(cust).toMatchObject({ orderCount: 1, paidTotalPaise: 40000 });

    const sellersOnly = await admin.get('/api/admin/customers?role=seller');
    expect(sellersOnly.status).toBe(200);
    expect(sellersOnly.body.total).toBe(2);

    const unverifiedOnly = await admin.get('/api/admin/customers?verified=false');
    expect(unverifiedOnly.status).toBe(200);
    expect(unverifiedOnly.body.total).toBe(1);
    expect(unverifiedOnly.body.customers[0].email).toBe('unverified@test.local');
  });

  it('filters more_info_required sellers, exposes payouts overview, and manages region/craft visibility', async () => {
    const admin = await login(app, 'admin@test.local');

    execute(db, "UPDATE seller_profiles SET status = 'more_info_required' WHERE id = ?", IDS.seller2);
    const sellersMoreInfo = await admin.get('/api/admin/sellers?status=more_info_required');
    expect(sellersMoreInfo.status).toBe(200);
    expect(sellersMoreInfo.body.sellers.some((s: { id: string }) => s.id === IDS.seller2)).toBe(true);

    const payoutsOverview = await admin.get('/api/admin/payouts/overview');
    expect(payoutsOverview.status).toBe(200);
    expect(payoutsOverview.body.metrics).toMatchObject({
      pendingAllocationsPaise: expect.any(Number),
      eligibleReviewPaise: expect.any(Number),
      approvedBatchesPaise: expect.any(Number),
      settledPaise: expect.any(Number),
    });
    expect(Array.isArray(payoutsOverview.body.eligibleQueue)).toBe(true);

    const regionsRes = await admin.get('/api/admin/regions');
    expect(regionsRes.status).toBe(200);
    const firstRegion = regionsRes.body.regions[0];
    const toggleRegion = await mutate(admin.patch(`/api/admin/regions/${firstRegion.id}`)).send({
      isActive: !firstRegion.isActive,
    });
    expect(toggleRegion.status).toBe(200);
    expect(toggleRegion.body.region.isActive).toBe(!firstRegion.isActive);

    const createCraft = await mutate(admin.post('/api/admin/crafts')).send({
      name: 'Test Pine Needle Basketry',
      introText:
        'Hand-coiled pine needle baskets crafted in Himachal hill villages using fallen chir pine needles and cotton thread.',
    });
    expect(createCraft.status).toBe(201);
    const craftId = createCraft.body.craft.id as string;

    const toggleCraft = await mutate(admin.patch(`/api/admin/crafts/${craftId}`)).send({ isActive: false });
    expect(toggleCraft.status).toBe(200);
    expect(toggleCraft.body.craft.isActive).toBe(false);
  });
});
