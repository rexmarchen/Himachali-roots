import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, queryOne, type Db } from '../db.js';
import {
  IDS,
  login,
  mutate,
  paidOrder,
  resetDb,
  seedFixtures,
  sellerOrderFor,
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

async function deliver(seller: Awaited<ReturnType<typeof login>>, sellerOrderId: string) {
  for (const action of ['confirm', 'pack']) {
    await mutate(seller.post(`/api/seller/orders/${sellerOrderId}/action`)).send({ action });
  }
  await mutate(seller.post(`/api/seller/orders/${sellerOrderId}/action`)).send({
    action: 'ship',
    carrier: 'Test Courier',
    trackingNumber: 'RETURN1234',
  });
  await mutate(seller.post(`/api/seller/orders/${sellerOrderId}/action`)).send({ action: 'deliver' });
}

describe('cancellations and refunds', () => {
  it('cancels before dispatch, queues a refund, and records a manual payout', async () => {
    const customer = await login(app, 'customer@test.local');
    const paid = await paidOrder(app, customer);
    const sellerOrder = sellerOrderFor(db, paid.orderNumber);

    const cancelled = await mutate(customer.post(`/api/account/orders/${paid.orderNumber}/cancel`)).send({
      sellerOrderId: sellerOrder!.id,
      reason: 'Changed my mind before dispatch.',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('completed');
    expect(sellerOrderFor(db, paid.orderNumber)?.status).toBe('cancelled');

    const refund = queryOne<{ id: string; amount_paise: number; status: string }>(
      db,
      'SELECT id, amount_paise, status FROM refunds WHERE seller_order_id = ?',
      sellerOrder!.id,
    );
    expect(refund).toMatchObject({ amount_paise: 107_900, status: 'requested' });

    const admin = await login(app, 'admin@test.local');
    const withoutMethod = await mutate(admin.post(`/api/admin/refunds/${refund!.id}/decide`)).send({
      decision: 'approve',
      note: 'Approved for manual refund',
    });
    expect(withoutMethod.status).toBe(400);

    const approved = await mutate(admin.post(`/api/admin/refunds/${refund!.id}/decide`)).send({
      decision: 'approve',
      method: 'manual',
      manualReference: 'UPI-REF-7788',
      note: 'Approved for manual refund',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('completed');

    expect(
      queryOne<{ status: string; provider_refund_id: string }>(
        db,
        'SELECT status, provider_refund_id FROM refunds WHERE id = ?',
        refund!.id,
      ),
    ).toMatchObject({ status: 'completed', provider_refund_id: 'manual:UPI-REF-7788' });

    const order = queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE order_number = ?', paid.orderNumber);
    expect(order?.status).toBe('refunded');

    const ledger = queryOne<{ total: number }>(
      db,
      'SELECT COALESCE(SUM(amount_paise),0) AS total FROM seller_ledger_entries WHERE seller_id = ? AND status != ?',
      IDS.seller,
      'reversed',
    );
    expect(ledger?.total).toBe(0);
  });

  it('approves a post-delivery return and reverses the commission proportionally', async () => {
    const customer = await login(app, 'customer@test.local');
    const paid = await paidOrder(app, customer);
    const sellerOrder = sellerOrderFor(db, paid.orderNumber);
    const seller = await login(app, 'seller@test.local');
    await deliver(seller, sellerOrder!.id);

    const requested = await mutate(customer.post(`/api/account/orders/${paid.orderNumber}/returns`)).send({
      sellerOrderId: sellerOrder!.id,
      reason: 'Not as described',
      description: 'The weave differs from the photograph.',
    });
    expect(requested.status).toBe(201);

    const admin = await login(app, 'admin@test.local');
    const returns = await admin.get('/api/admin/returns');
    const request = (returns.body.returns as Array<{ id: string; status: string }>).find(
      (row) => row.status === 'requested',
    );
    expect(request).toBeTruthy();

    const tooMuch = await mutate(admin.post(`/api/admin/returns/${request!.id}/decision`)).send({
      decision: 'approve',
      note: 'Refund approved',
      amountPaise: 999_999,
    });
    expect(tooMuch.status).toBe(400);

    const approved = await mutate(admin.post(`/api/admin/returns/${request!.id}/decision`)).send({
      decision: 'approve',
      note: 'Refund approved after inspection',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.refundId).toBeTruthy();

    const refunded = await mutate(admin.post(`/api/admin/refunds/${approved.body.refundId}/decide`)).send({
      decision: 'approve',
      method: 'manual',
      manualReference: 'BANK-REF-9900',
      note: 'Manual refund completed',
    });
    expect(refunded.status).toBe(200);
    expect(refunded.body.status).toBe('completed');

    expect(sellerOrderFor(db, paid.orderNumber)?.status).toBe('refunded');
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE order_number = ?', paid.orderNumber)?.status).toBe(
      'refunded',
    );

    const entries = queryOne<{ count: number; total: number }>(
      db,
      'SELECT COUNT(*) AS count, COALESCE(SUM(amount_paise),0) AS total FROM seller_ledger_entries WHERE seller_id = ?',
      IDS.seller,
    );
    expect(entries?.count).toBe(4);
    expect(entries?.total).toBe(0);

    const refundEntry = queryOne<{ amount_paise: number }>(
      db,
      "SELECT amount_paise FROM seller_ledger_entries WHERE type = 'refund' AND seller_id = ?",
      IDS.seller,
    );
    const commissionReversal = queryOne<{ amount_paise: number }>(
      db,
      "SELECT amount_paise FROM seller_ledger_entries WHERE type = 'adjustment' AND seller_id = ?",
      IDS.seller,
    );
    expect(refundEntry?.amount_paise).toBe(-100_000);
    expect(commissionReversal?.amount_paise).toBe(15_000);
  });

  it('does not approve a cancellation after dispatch and routes it to returns instead', async () => {
    const customer = await login(app, 'customer@test.local');
    const paid = await paidOrder(app, customer);
    const sellerOrder = sellerOrderFor(db, paid.orderNumber);
    const seller = await login(app, 'seller@test.local');
    for (const action of ['confirm', 'pack']) {
      await mutate(seller.post(`/api/seller/orders/${sellerOrder!.id}/action`)).send({ action });
    }
    await mutate(seller.post(`/api/seller/orders/${sellerOrder!.id}/action`)).send({
      action: 'ship',
      carrier: 'Test Courier',
      trackingNumber: 'SHIPPED1234',
    });

    const requested = await mutate(customer.post(`/api/account/orders/${paid.orderNumber}/cancel`)).send({
      sellerOrderId: sellerOrder!.id,
      reason: 'Please cancel this dispatched order.',
    });
    expect(requested.status).toBe(200);
    expect(requested.body.status).toBe('requested');

    const admin = await login(app, 'admin@test.local');
    const cancellations = await admin.get('/api/admin/cancellations');
    const cancellation = (cancellations.body.cancellations as Array<{ id: string; status: string }>).find(
      (row) => row.status === 'requested',
    );

    const approve = await mutate(admin.post(`/api/admin/cancellations/${cancellation!.id}/decision`)).send({
      decision: 'approve',
      note: 'Trying to approve after dispatch',
    });
    expect(approve.status).toBe(409);
    expect(approve.body.error.message).toContain('returns workflow');

    const reject = await mutate(admin.post(`/api/admin/cancellations/${cancellation!.id}/decision`)).send({
      decision: 'reject',
      note: 'Already dispatched; please request a return after delivery.',
    });
    expect(reject.status).toBe(200);
    expect(sellerOrderFor(db, paid.orderNumber)?.status).toBe('shipped');
  });

  it('requires a reason before a customer can request a return', async () => {
    const customer = await login(app, 'customer@test.local');
    const paid = await paidOrder(app, customer);
    const sellerOrder = sellerOrderFor(db, paid.orderNumber);
    const seller = await login(app, 'seller@test.local');
    await deliver(seller, sellerOrder!.id);

    const response = await mutate(customer.post(`/api/account/orders/${paid.orderNumber}/returns`)).send({
      sellerOrderId: sellerOrder!.id,
      reason: '',
    });
    expect(response.status).toBe(400);
  });
});
