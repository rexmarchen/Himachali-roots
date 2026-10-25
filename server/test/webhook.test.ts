import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryOne, type Db } from '../db.js';
import { IDS, addToCart, checkout, login, resetDb, seedFixtures, setupTestApp } from './helpers.js';

const WEBHOOK_SECRET = 'test_webhook_secret';

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

function sign(raw: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
}

async function pendingOrderWithProviderReference() {
  const customer = await login(app, 'customer@test.local');
  await addToCart(app, customer, IDS.product, 1);
  const created = await checkout(app, customer);
  const providerOrderId = `order_test_${crypto.randomBytes(4).toString('hex')}`;
  execute(
    db,
    "UPDATE payments SET provider = 'razorpay', provider_order_id = ? WHERE order_id = (SELECT id FROM orders WHERE order_number = ?)",
    providerOrderId,
    created.body.order.orderNumber,
  );
  return {
    customer,
    orderNumber: created.body.order.orderNumber as string,
    totalPaise: created.body.order.totalPaise as number,
    providerOrderId,
  };
}

function paymentBody(providerOrderId: string, amountPaise: number, event = 'payment.captured') {
  return JSON.stringify({
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: `pay_test_${providerOrderId.slice(-8)}`,
          order_id: providerOrderId,
          amount: amountPaise,
          method: 'upi',
          status: 'captured',
        },
      },
    },
  });
}

describe('Razorpay webhook', () => {
  it('rejects an invalid signature without changing the order', async () => {
    const pending = await pendingOrderWithProviderReference();
    const raw = paymentBody(pending.providerOrderId, pending.totalPaise);

    const response = await request(app)
      .post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', 'not-a-valid-signature')
      .send(raw);

    expect(response.status).toBe(400);
    expect(
      queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE order_number = ?', pending.orderNumber)?.status,
    ).toBe('pending_payment');
  });

  it('marks an order paid once and ignores a duplicate event', async () => {
    const pending = await pendingOrderWithProviderReference();
    const raw = paymentBody(pending.providerOrderId, pending.totalPaise);

    const first = await request(app)
      .post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', sign(raw))
      .set('x-razorpay-event-id', 'evt_test_capture_1')
      .send(raw);
    expect(first.status).toBe(200);
    expect(first.body.received).toBe(true);
    expect(
      queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE order_number = ?', pending.orderNumber)?.status,
    ).toBe('paid');

    const second = await request(app)
      .post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', sign(raw))
      .set('x-razorpay-event-id', 'evt_test_capture_1')
      .send(raw);
    expect(second.status).toBe(200);

    expect(
      queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM seller_ledger_entries WHERE seller_id = ?', IDS.seller)
        ?.count,
    ).toBe(2);
    expect(
      queryOne<{ count: number }>(
        db,
        'SELECT COUNT(*) AS count FROM payment_events WHERE provider_event_id = ?',
        'rzp:evt_test_capture_1',
      )?.count,
    ).toBe(1);
  });

  it('records an amount mismatch for manual reconciliation and leaves the order unpaid', async () => {
    const pending = await pendingOrderWithProviderReference();
    const raw = paymentBody(pending.providerOrderId, pending.totalPaise - 1);

    const response = await request(app)
      .post('/api/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-razorpay-signature', sign(raw))
      .set('x-razorpay-event-id', 'evt_test_mismatch_1')
      .send(raw);

    expect(response.status).toBe(200);
    expect(
      queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE order_number = ?', pending.orderNumber)?.status,
    ).toBe('pending_payment');
    expect(
      queryOne<{ count: number }>(db, "SELECT COUNT(*) AS count FROM payment_events WHERE type = 'payment.amount_mismatch'")
        ?.count,
    ).toBe(1);
  });
});
