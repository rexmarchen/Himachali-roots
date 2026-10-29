import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryOne, type Db } from '../db.js';
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

async function orderForSeller() {
  const customer = await login(app, 'customer@test.local');
  const paid = await paidOrder(app, customer);
  const sellerOrder = sellerOrderFor(db, paid.orderNumber);
  if (!sellerOrder) throw new Error('Seller order missing');
  const seller = await login(app, 'seller@test.local');
  return { customer, seller, orderNumber: paid.orderNumber, sellerOrder };
}

describe('seller fulfilment', () => {
  it('enforces the confirm → pack → ship → deliver sequence', async () => {
    const { seller, orderNumber, sellerOrder } = await orderForSeller();

    const prematureShip = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'ship',
      carrier: 'Test Courier',
      trackingNumber: 'TRACK1234',
    });
    expect(prematureShip.status).toBe(409);

    expect(
      (await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({ action: 'confirm' })).status,
    ).toBe(200);
    expect(
      (await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({ action: 'pack' })).status,
    ).toBe(200);

    const missingTracking = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'ship',
      carrier: 'Test Courier',
    });
    expect(missingTracking.status).toBe(400);

    const shipped = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'ship',
      carrier: 'Test Courier',
      trackingNumber: 'TRACK1234',
    });
    expect(shipped.status).toBe(200);
    expect(
      queryOne<{ quantity: number; reserved_quantity: number }>(
        db,
        'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
        IDS.product,
      ),
    ).toMatchObject({ quantity: 9, reserved_quantity: 0 });

    const delivered = await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({ action: 'deliver' });
    expect(delivered.status).toBe(200);

    const detail = await seller.get(`/api/seller/orders/${sellerOrder.id}`);
    expect(detail.body.order.status).toBe('delivered');
    expect(detail.body.order.shipment.status).toBe('delivered');
    expect(detail.body.order.shipment.events.length).toBeGreaterThanOrEqual(2);

    const customerView = await (await login(app, 'customer@test.local')).get(`/api/orders/${orderNumber}`);
    expect(customerView.body.order.status).toBe('fulfilled');
    expect(customerView.body.order.canRequestReturn).toBe(true);

    const ledger = queryOne<{ count: number; status: string; available_at: string }>(
      db,
      'SELECT COUNT(*) AS count, MIN(status) AS status, MIN(available_at) AS available_at FROM seller_ledger_entries WHERE seller_id = ?',
      IDS.seller,
    );
    expect(ledger?.count).toBe(2);
    expect(ledger?.status).toBe('eligible');
    expect(new Date(ledger!.available_at).getTime()).toBeGreaterThan(Date.now() + 6 * 86400_000);
  });

  it('does not let one seller touch another seller’s order', async () => {
    const customer = await login(app, 'customer@test.local');
    const paid = await paidOrder(app, customer, IDS.product2);
    const otherSellerOrder = sellerOrderFor(db, paid.orderNumber);
    const seller = await login(app, 'seller@test.local');

    const response = await mutate(seller.post(`/api/seller/orders/${otherSellerOrder!.id}/action`)).send({
      action: 'confirm',
    });
    expect(response.status).toBe(404);
  });

  it('lets an administrator fulfil a seller order', async () => {
    const customer = await login(app, 'customer@test.local');
    const paid = await paidOrder(app, customer, IDS.product2);
    const sellerOrder = sellerOrderFor(db, paid.orderNumber);
    const admin = await login(app, 'admin@test.local');

    const response = await mutate(
      admin.post(`/api/admin/orders/${paid.orderNumber}/seller-orders/${sellerOrder!.id}/action`),
    ).send({ action: 'confirm' });
    expect(response.status).toBe(200);
    expect(sellerOrderFor(db, paid.orderNumber)?.status).toBe('confirmed');
  });
});

describe('seller ledger and settlements', () => {
  it('reports earnings and settles only after the availability window', async () => {
    const { seller, orderNumber, sellerOrder } = await orderForSeller();
    for (const action of ['confirm', 'pack']) {
      await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({ action });
    }
    await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({
      action: 'ship',
      carrier: 'Test Courier',
      trackingNumber: 'TRACK5678',
    });
    await mutate(seller.post(`/api/seller/orders/${sellerOrder.id}/action`)).send({ action: 'deliver' });

    const earnings = await seller.get('/api/seller/earnings');
    expect(earnings.status).toBe(200);
    expect(earnings.body.totals.eligible).toBe(88_000);
    expect(earnings.body.totals.pending).toBe(0);
    expect(earnings.body.entries).toHaveLength(2);

    const admin = await login(app, 'admin@test.local');
    const period = {
      periodStart: new Date(Date.now() - 3600_000).toISOString(),
      periodEnd: new Date(Date.now() + 3600_000).toISOString(),
    };

    const tooEarly = await mutate(admin.post('/api/admin/settlements')).send({
      sellerId: IDS.seller,
      ...period,
    });
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error.message).toContain('No eligible ledger entries');

    execute(
      db,
      "UPDATE seller_ledger_entries SET available_at = ? WHERE seller_id = ? AND status = 'eligible'",
      new Date(Date.now() - 1000).toISOString(),
      IDS.seller,
    );

    const created = await mutate(admin.post('/api/admin/settlements')).send({
      sellerId: IDS.seller,
      ...period,
    });
    expect(created.status).toBe(201);
    expect(created.body.netPaise).toBe(88_000);
    expect(created.body.entryCount).toBe(2);

    const paid = await mutate(admin.post(`/api/admin/settlements/${created.body.batchId}/pay`)).send({
      providerReference: 'BANK-REF-1234',
      note: 'Automated test payout record',
    });
    expect(paid.status).toBe(200);

    const repeated = await mutate(admin.post(`/api/admin/settlements/${created.body.batchId}/pay`)).send({
      providerReference: 'BANK-REF-5678',
    });
    expect(repeated.status).toBe(409);

    const detail = await admin.get(`/api/admin/settlements/${created.body.batchId}`);
    expect(detail.body.settlement.status).toBe('paid');
    expect(detail.body.settlement.provider_reference).toBe('BANK-REF-1234');

    const settled = await seller.get('/api/seller/earnings');
    expect(settled.body.totals.settled).toBe(88_000);
    expect(settled.body.totals.eligible).toBe(0);

    expect(
      queryOne<{ status: string }>(db, 'SELECT status FROM seller_orders WHERE order_id = (SELECT id FROM orders WHERE order_number = ?)', orderNumber)?.status,
    ).toBe('delivered');
  });
});
