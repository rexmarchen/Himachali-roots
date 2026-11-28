import crypto from 'node:crypto';
import type { Express } from 'express';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { markOrderPaid, notifyOrderPaid } from '../lib/orders.js';
import { resetShiprocketTokenCache } from '../lib/shiprocketService.js';
import { syncShiprocketFulfilment } from '../lib/fulfilmentRouter.js';
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

describe('Product-wise fulfilment routing & Shiprocket automatic integration (TESTS 1–9)', () => {
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

  function installMockShiprocket(options: { failAdhocCount?: number } = {}): { calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    let adhocFailuresLeft = options.failAdhocCount ?? 0;
    let nextOrderNum = 910001;
    let nextShipmentNum = 810001;

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
        return new Response(JSON.stringify({ token: 'mock_sr_jwt_token_123' }), { status: 200 });
      }
      if (url.includes('/settings/company/pickup')) {
        return new Response(
          JSON.stringify({
            data: {
              shipping_address: [
                {
                  id: 7771,
                  pickup_location: 'Kullu_Workshop_Hub',
                  name: 'Test Seller',
                  pin_code: '175125',
                  address: '1 Maker Road, Kullu',
                  status: 1,
                  phone_verified: 1,
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/settings/company/addpickup')) {
        return new Response(
          JSON.stringify({
            success: true,
            pickup_id: 7772,
            address: { id: 7772, pickup_location: body?.pickup_location ?? 'SellerHub', phone_verified: 1 },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/orders/create/adhoc')) {
        if (adhocFailuresLeft > 0) {
          adhocFailuresLeft -= 1;
          return new Response(JSON.stringify({ message: 'Shiprocket upstream temporarily unavailable' }), { status: 503 });
        }
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
            response: {
              data: {
                awb_code: 'SR_AWB_778899',
                courier_company_id: 42,
                courier_name: 'Blue Dart Air',
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/courier/generate/label')) {
        return new Response(
          JSON.stringify({
            label_created: 1,
            label_url: 'https://shiprocket.co/labels/mock-778899.pdf',
          }),
          { status: 200 },
        );
      }
      if (url.includes('/courier/generate/pickup')) {
        return new Response(
          JSON.stringify({
            pickup_status: 1,
            response: {
              pickup_scheduled_date: '2026-11-29 14:00:00',
              pickup_token_number: 'PKP_TOKEN_554',
              data: 'Pickup scheduled successfully',
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/orders/cancel')) {
        return new Response(JSON.stringify({ message: 'Cancelled in Shiprocket' }), { status: 200 });
      }
      if (url.includes('/courier/track/')) {
        return new Response(
          JSON.stringify({
            tracking_data: {
              track_status: 1,
              shipment_track: [{ current_status: 'IN TRANSIT', courier_name: 'Blue Dart Air' }],
              shipment_track_activities: [{ date: '2026-11-28', status: 'IN TRANSIT', activity: 'Reached Delhi Hub' }],
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    return { calls };
  }

  function createVerifiedPickup(sellerId: string, srLocationName = 'Kullu_Workshop_Hub', pincode = '175125'): string {
    const locId = `pkl_${crypto.randomUUID().slice(0, 8)}`;
    execute(
      db,
      `INSERT INTO seller_pickup_locations
         (id, seller_id, nickname, shiprocket_location_name, shiprocket_pickup_id, contact_name, phone, email,
          line1, city, state, pincode, is_verified, is_approved, is_default, is_active, verified_at)
       VALUES (?, ?, 'Verified Hub', ?, '7771', 'Test Maker', '9876543210', 'seller@test.local',
               '1 Maker Road', 'Kullu', 'Himachal Pradesh', ?, 1, 1, 1, 1, ?)`,
      locId,
      sellerId,
      srLocationName,
      pincode,
      new Date().toISOString(),
    );
    return locId;
  }

  function createProductDirectly(params: {
    id: string;
    sellerId: string;
    name: string;
    sku: string;
    pricePaise?: number;
    method: 'SHIPROCKET' | 'OWN_DELIVERY' | 'EXTERNAL_SUPPLIER';
    pickupLocationId?: string | null;
    shippingConfig?: Record<string, unknown>;
    weightG?: number;
    l?: number;
    b?: number;
    h?: number;
  }): string {
    execute(
      db,
      `INSERT INTO products
         (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku,
          weight_g, dimensions, fulfilment_method, pickup_location_id, package_length_cm, package_breadth_cm,
          package_height_cm, handling_days, shipping_config_json, status, is_demo, approved_at)
       VALUES (?, ?, ?, ?, ?, 'Short description',
               'Long valid artisan description satisfying minimum listing requirements across Dear Hills.',
               ?, ?, ?, '20 × 15 × 10 cm', ?, ?, ?, ?, ?, 2, ?, 'approved', 0, ?)`,
      params.id,
      params.sellerId,
      IDS.category,
      params.name,
      `${params.id}-slug`,
      params.pricePaise ?? 120_000,
      params.sku,
      params.weightG ?? 750,
      params.method,
      params.pickupLocationId ?? null,
      params.l ?? 22,
      params.b ?? 16,
      params.h ?? 11,
      params.shippingConfig ? JSON.stringify(params.shippingConfig) : null,
      new Date().toISOString(),
    );
    execute(db, 'INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES (?, 25, 2)', params.id);
    return params.id;
  }

  it('TEST 1: Shiprocket product automatically creates Shiprocket order on payment WITHOUT premature pickup, then READY_TO_SHIP schedules AWB + pickup', async () => {
    const { calls } = installMockShiprocket();
    const pickupId = createVerifiedPickup(IDS.seller, 'Kullu_Workshop_Hub');

    // Create Shiprocket product via Seller API (mandatory field validated)
    const seller = await login(app, 'seller@test.local');
    const prodRes = await mutate(seller.post('/api/seller/products')).send({
      name: 'Kinnauri Wool Blanket (Shiprocket)',
      categoryId: IDS.category,
      shortDescription: 'Handwoven mountain blanket',
      description: 'Genuine Kinnauri sheep wool blanket woven cleanly on wooden looms in Himachal Pradesh for cold Himalayan winters.',
      pricePaise: 150_000,
      sku: 'SR-BLKT-01',
      weightG: 1200,
      fulfilmentMethod: 'SHIPROCKET',
      pickupLocationId: pickupId,
      packageLengthCm: 35,
      packageBreadthCm: 28,
      packageHeightCm: 12,
      handlingDays: 2,
      shippingConfig: {
        pickupLocationId: pickupId,
        packageWeightG: 1200,
        packageLengthCm: 35,
        packageBreadthCm: 28,
        packageHeightCm: 12,
        handlingDays: 2,
      },
    });
    expect(prodRes.status).toBe(201);
    const prodId = prodRes.body.id as string;
    execute(db, "UPDATE products SET status = 'approved', approved_at = ? WHERE id = ?", new Date().toISOString(), prodId);
    execute(db, 'UPDATE inventory SET quantity = 10 WHERE product_id = ?', prodId);

    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, prodId, 1);
    const orderRes = await checkout(app, customer);
    expect(orderRes.status).toBe(201);
    const orderNumber = orderRes.body.order.orderNumber as string;

    // Payment confirmed -> triggers automatic Shiprocket adhoc order create ONLY
    const payRes = await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
    expect(payRes.status).toBe(200);

    const adhocCalls = calls.filter((c) => c.url.includes('/orders/create/adhoc'));
    const awbCallsBefore = calls.filter((c) => c.url.includes('/courier/assign/awb'));
    const pickupCallsBefore = calls.filter((c) => c.url.includes('/courier/generate/pickup'));

    expect(adhocCalls).toHaveLength(1);
    expect(adhocCalls[0].body?.pickup_location).toBe('Kullu_Workshop_Hub');
    expect(adhocCalls[0].body?.billing_pincode).toBe(ADDRESS.pincode);
    expect(adhocCalls[0].body?.weight).toBe(1.2);
    expect(awbCallsBefore).toHaveLength(0);
    expect(pickupCallsBefore).toHaveLength(0);

    const fulfilment = queryOne<Record<string, unknown>>(
      db,
      'SELECT * FROM order_fulfilments WHERE order_id = ?',
      orderRes.body.order.id,
    );
    expect(fulfilment).toBeTruthy();
    expect(fulfilment!.shiprocket_order_id).toBe(910001);
    expect(fulfilment!.shiprocket_shipment_id).toBe(810001);
    expect(fulfilment!.shiprocket_sync_status).toBe('synced');
    expect(fulfilment!.status).toBe('shiprocket_order_created');
    expect(fulfilment!.awb_code).toBeNull();
    expect(fulfilment!.pickup_scheduled_at).toBeNull();

    // Now Seller explicitly marks READY TO SHIP -> assigns AWB, generates label, schedules pickup
    const rtsRes = await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/ready-to-ship`)).send({});
    expect(rtsRes.status).toBe(200);
    expect(rtsRes.body.awbCode).toBe('SR_AWB_778899');
    expect(rtsRes.body.labelUrl).toContain('shiprocket.co/labels');
    expect(rtsRes.body.pickupToken).toBe('PKP_TOKEN_554');

    expect(calls.filter((c) => c.url.includes('/courier/assign/awb'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('/courier/generate/label'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('/courier/generate/pickup'))).toHaveLength(1);
  });

  it('TEST 2: Own Delivery order never touches Shiprocket and follows internal seller lifecycle cleanly', async () => {
    const { calls } = installMockShiprocket();
    const ownProdId = createProductDirectly({
      id: 'prd_own_01',
      sellerId: IDS.seller,
      name: 'Fresh Shimla Plums (Own Delivery)',
      sku: 'OWN-PLUM-01',
      method: 'OWN_DELIVERY',
      shippingConfig: {
        fulfilmentMethod: 'OWN_DELIVERY',
        deliveryArea: 'Shimla Local Zone',
        serviceablePincodes: ['171001', '171002'],
        deliveryChargePaise: 0,
        estimatedDeliveryDays: 'Same day',
        contactName: 'Rohan Rider',
        contactPhone: '9876543210',
      },
    });

    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, ownProdId, 2);
    const orderRes = await checkout(app, customer);
    expect(orderRes.status).toBe(201);
    const orderNumber = orderRes.body.order.orderNumber as string;

    const payRes = await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
    expect(payRes.status).toBe(200);

    // Zero Shiprocket HTTP calls made!
    expect(calls).toHaveLength(0);

    const fulfilment = queryOne<Record<string, unknown>>(
      db,
      'SELECT * FROM order_fulfilments WHERE order_id = ?',
      orderRes.body.order.id,
    );
    expect(fulfilment!.fulfilment_method).toBe('OWN_DELIVERY');
    expect(fulfilment!.shiprocket_sync_status).toBe('not_applicable');
    expect(fulfilment!.status).toBe('order_confirmed');

    const seller = await login(app, 'seller@test.local');

    // Guard: Shiprocket arrange endpoint must REJECT non-Shiprocket order
    const blockedSr = await mutate(seller.post(`/api/seller/orders/${fulfilment!.seller_order_id}/shipping/arrange`)).send({});
    expect(blockedSr.status).toBe(409);
    expect(calls).toHaveLength(0);

    // Step through Own Delivery actions
    expect((await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/own-delivery`)).send({ action: 'accept' })).status).toBe(200);
    expect((await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/own-delivery`)).send({ action: 'preparing' })).status).toBe(200);
    expect((await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/own-delivery`)).send({ action: 'out_for_delivery' })).status).toBe(200);
    const deliverRes = await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/own-delivery`)).send({
      action: 'delivered',
      recipientName: 'Ananya Buyer',
      note: 'Handed to buyer cleanly',
    });
    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.status).toBe('delivered');
    expect(calls).toHaveLength(0);

    const customerOrder = await customer.get(`/api/orders/${orderNumber}`);
    expect(customerOrder.body.order.status).toBe('fulfilled');
    expect(customerOrder.body.order.fulfilments[0].status).toBe('delivered');
  });

  it('TEST 3: External Supplier Direct Delivery bypasses Shiprocket and supports manual supplier order & tracking references', async () => {
    const { calls } = installMockShiprocket();
    const extProdId = createProductDirectly({
      id: 'prd_ext_01',
      sellerId: IDS.seller,
      name: 'Meesho Reseller Brass Kettle',
      sku: 'EXT-KTL-01',
      method: 'EXTERNAL_SUPPLIER',
      shippingConfig: {
        fulfilmentMethod: 'EXTERNAL_SUPPLIER',
        supplierName: 'Meesho Artisanal Partner',
        supplierReference: 'MSH-CATALOG-99',
        processingTimeDays: 2,
        estimatedDeliveryDays: '5–7 days',
      },
    });

    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, extProdId, 1);
    const orderRes = await checkout(app, customer);
    const orderNumber = orderRes.body.order.orderNumber as string;
    await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});

    expect(calls).toHaveLength(0);

    const fulfilment = queryOne<Record<string, unknown>>(
      db,
      'SELECT * FROM order_fulfilments WHERE order_id = ?',
      orderRes.body.order.id,
    );
    expect(fulfilment!.fulfilment_method).toBe('EXTERNAL_SUPPLIER');
    expect(fulfilment!.shiprocket_sync_status).toBe('not_applicable');

    const seller = await login(app, 'seller@test.local');
    await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/external`)).send({ action: 'confirm_supplier' });
    await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/external`)).send({
      action: 'place_external_order',
      externalOrderRef: 'EXT-ORD-556677',
    });
    const trackRes = await mutate(seller.post(`/api/seller/fulfilments/${fulfilment!.id}/external`)).send({
      action: 'update_tracking',
      courierName: 'Shadowfax',
      trackingId: 'SFX-TRACK-9900',
      trackingUrl: 'https://shadowfax.in/track/SFX-TRACK-9900',
      dispatchDate: '2026-11-28',
    });
    expect(trackRes.status).toBe(200);
    expect(calls).toHaveLength(0);

    const view = await customer.get(`/api/orders/${orderNumber}`);
    expect(view.body.order.fulfilments[0].externalSupplierName).toBeNull();
    expect(view.body.order.fulfilments[0].externalOrderRef).toBeNull();
    expect(view.body.order.fulfilments[0].courierName).toBe('Shadowfax');
    expect(view.body.order.fulfilments[0].trackingNumber).toBe('SFX-TRACK-9900');

    const sellerOrder = await seller.get(`/api/seller/orders/${fulfilment!.seller_order_id}`);
    expect(sellerOrder.body.order.fulfilments[0].externalOrderRef).toBe('EXT-ORD-556677');
  });

  it('TEST 4: Mixed order routes A to Shiprocket, B to Own Delivery, C to External Supplier with partial cancellation & delivery', async () => {
    const { calls } = installMockShiprocket();
    const pickupId = createVerifiedPickup(IDS.seller, 'Kullu_Workshop_Hub');

    const prodA = createProductDirectly({
      id: 'prd_mix_a',
      sellerId: IDS.seller,
      name: 'Product A Shiprocket',
      sku: 'MIX-A',
      pricePaise: 100_000,
      method: 'SHIPROCKET',
      pickupLocationId: pickupId,
    });
    const prodB = createProductDirectly({
      id: 'prd_mix_b',
      sellerId: IDS.seller,
      name: 'Product B Own Delivery',
      sku: 'MIX-B',
      pricePaise: 50_000,
      method: 'OWN_DELIVERY',
      shippingConfig: {
        fulfilmentMethod: 'OWN_DELIVERY',
        deliveryArea: 'Shimla',
        serviceablePincodes: ['171001'],
        deliveryChargePaise: 0,
        estimatedDeliveryDays: '1–2 days',
        contactName: 'Rohan',
        contactPhone: '9876543210',
      },
    });
    const prodC = createProductDirectly({
      id: 'prd_mix_c',
      sellerId: IDS.seller2,
      name: 'Product C External',
      sku: 'MIX-C',
      pricePaise: 70_000,
      method: 'EXTERNAL_SUPPLIER',
      shippingConfig: {
        fulfilmentMethod: 'EXTERNAL_SUPPLIER',
        supplierName: 'Kangra Supplier',
        processingTimeDays: 1,
        estimatedDeliveryDays: '4–6 days',
      },
    });

    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, prodA, 1);
    await addToCart(app, customer, prodB, 1);
    await addToCart(app, customer, prodC, 1);
    const orderRes = await checkout(app, customer);
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id as string;
    const orderNumber = orderRes.body.order.orderNumber as string;

    await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});

    const fulfilments = queryAll<Record<string, unknown>>(
      db,
      'SELECT * FROM order_fulfilments WHERE order_id = ? ORDER BY created_at',
      orderId,
    );
    expect(fulfilments).toHaveLength(3);

    const srFul = fulfilments.find((f) => f.fulfilment_method === 'SHIPROCKET')!;
    const ownFul = fulfilments.find((f) => f.fulfilment_method === 'OWN_DELIVERY')!;
    const extFul = fulfilments.find((f) => f.fulfilment_method === 'EXTERNAL_SUPPLIER')!;
    expect(srFul.shiprocket_sync_status).toBe('synced');
    expect(ownFul.shiprocket_sync_status).toBe('not_applicable');
    expect(extFul.shiprocket_sync_status).toBe('not_applicable');

    // ONLY Product A was sent to Shiprocket adhoc order!
    const adhocCalls = calls.filter((c) => c.url.includes('/orders/create/adhoc'));
    expect(adhocCalls).toHaveLength(1);
    const sentItems = adhocCalls[0].body?.order_items as Array<{ sku: string }>;
    expect(sentItems.map((i) => i.sku)).toEqual(['MIX-A']);

    // Partial cancellation: Seller 1 cancels ONLY Product B (Own Delivery), leaving Product A intact!
    const seller1 = await login(app, 'seller@test.local');
    const partialCancel = await mutate(seller1.post(`/api/seller/fulfilments/${ownFul.id}/cancel`)).send({
      reason: 'Local rider unavailable for item B',
    });
    expect(partialCancel.status).toBe(200);
    expect(partialCancel.body.refundPaise).toBe(50_000);

    // Parent order still active for Shiprocket Product A & External Product C
    const refreshedOrder = queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId);
    expect(refreshedOrder!.status).toBe('paid');

    // Partial delivery on External Supplier Product C -> marks parent order partially_fulfilled
    const seller2 = await login(app, 'seller2@test.local');
    await mutate(seller2.post(`/api/seller/fulfilments/${extFul.id}/external`)).send({
      action: 'place_external_order',
      externalOrderRef: 'EXT-C-1',
    });
    await mutate(seller2.post(`/api/seller/fulfilments/${extFul.id}/external`)).send({ action: 'delivered' });
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId)!.status).toBe(
      'partially_fulfilled',
    );
  });

  it('TEST 5: Shiprocket API failure keeps order safe, allows admin retry without duplicate creation, and scrubs secrets', async () => {
    const { calls } = installMockShiprocket({ failAdhocCount: 1 });
    const pickupId = createVerifiedPickup(IDS.seller, 'Kullu_Workshop_Hub');
    const prodId = createProductDirectly({
      id: 'prd_retry_01',
      sellerId: IDS.seller,
      name: 'Retryable Shawl',
      sku: 'SR-RETRY-01',
      method: 'SHIPROCKET',
      pickupLocationId: pickupId,
    });

    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, prodId, 1);
    const orderRes = await checkout(app, customer);
    const orderId = orderRes.body.order.id as string;
    const orderNumber = orderRes.body.order.orderNumber as string;

    // Initial pay fails Shiprocket 503 -> payment MUST still succeed and order remains paid!
    const payRes = await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
    expect(payRes.status).toBe(200);
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', orderId)!.status).toBe('paid');

    const failedFul = queryOne<Record<string, unknown>>(db, 'SELECT * FROM order_fulfilments WHERE order_id = ?', orderId)!;
    expect(failedFul.status).toBe('sync_failed');
    expect(failedFul.shiprocket_sync_status).toBe('failed');
    expect(failedFul.last_sync_error).toBeTruthy();
    // Ensure zero secrets/tokens appear in error or outbox!
    expect(String(failedFul.last_sync_error)).not.toContain('super-secret-sr-password');
    expect(String(failedFul.last_sync_error)).not.toContain('mock_sr_jwt_token_123');

    // Now Admin retries sync via Admin Shipping Management API (mock succeeds now!)
    const admin = await login(app, 'admin@test.local');
    const retryRes = await mutate(admin.post(`/api/admin/shipping/fulfilments/${failedFul.id}/retry-sync`)).send({});
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.synced).toBe(true);
    expect(retryRes.body.shiprocketOrderId).toBe(910001);

    // Repeating retry must NOT create another Shiprocket order!
    const retryAgain = await mutate(admin.post(`/api/admin/shipping/fulfilments/${failedFul.id}/retry-sync`)).send({});
    expect(retryAgain.status).toBe(200);
    expect(retryAgain.body.alreadySynced).toBe(true);
    expect(calls.filter((c) => c.url.includes('/orders/create/adhoc'))).toHaveLength(2); // 1 failed + 1 succeeded
  });

  it('TEST 6: Duplicate payment callbacks/notifications never create duplicate Shiprocket orders or fulfilments', async () => {
    const { calls } = installMockShiprocket();
    const pickupId = createVerifiedPickup(IDS.seller, 'Kullu_Workshop_Hub');
    const prodId = createProductDirectly({
      id: 'prd_dup_01',
      sellerId: IDS.seller,
      name: 'Idempotent Honey Jar',
      sku: 'SR-DUP-01',
      method: 'SHIPROCKET',
      pickupLocationId: pickupId,
    });

    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, prodId, 1);
    const orderRes = await checkout(app, customer);
    const orderId = orderRes.body.order.id as string;
    const totalPaise = orderRes.body.order.totalPaise as number;

    markOrderPaid(db, {
      orderId,
      provider: 'razorpay',
      providerEventId: 'evt_dup_1',
      providerPaymentId: 'pay_dup_1',
      amountPaise: totalPaise,
    });
    // Simulate second webhook callback + repeated notifyOrderPaid
    markOrderPaid(db, {
      orderId,
      provider: 'razorpay',
      providerEventId: 'evt_dup_2',
      providerPaymentId: 'pay_dup_1',
      amountPaise: totalPaise,
    });
    await Promise.all([notifyOrderPaid(db, orderId), notifyOrderPaid(db, orderId)]);

    expect(queryAll(db, 'SELECT id FROM order_fulfilments WHERE order_id = ?', orderId)).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('/orders/create/adhoc'))).toHaveLength(1);
  });

  it('TEST 7: Editing product shipping method after order creation leaves existing order snapshot untouched', async () => {
    const { calls } = installMockShiprocket();
    const pickupId = createVerifiedPickup(IDS.seller, 'Kullu_Workshop_Hub');

    const seller = await login(app, 'seller@test.local');
    const createRes = await mutate(seller.post('/api/seller/products')).send({
      name: 'Walnut Wood Bowl (Switch Method Test)',
      categoryId: IDS.category,
      shortDescription: 'Hand carved bowl',
      description: 'Carved from aged Himalayan walnut wood and finished with beeswax in Kullu district.',
      pricePaise: 90_000,
      sku: 'SNAP-01',
      weightG: 600,
      fulfilmentMethod: 'SHIPROCKET',
      pickupLocationId: pickupId,
      packageLengthCm: 20,
      packageBreadthCm: 20,
      packageHeightCm: 10,
      handlingDays: 2,
      shippingConfig: {
        pickupLocationId: pickupId,
        packageWeightG: 600,
        packageLengthCm: 20,
        packageBreadthCm: 20,
        packageHeightCm: 10,
        handlingDays: 2,
      },
    });
    const prodId = createRes.body.id as string;
    execute(db, "UPDATE products SET status = 'approved', approved_at = ? WHERE id = ?", new Date().toISOString(), prodId);
    execute(db, 'UPDATE inventory SET quantity = 20 WHERE product_id = ?', prodId);

    // Order 1 placed while product is SHIPROCKET
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, prodId, 1);
    const order1Res = await checkout(app, customer);
    const order1Id = order1Res.body.order.id as string;

    // Immediately change product's shipping method to OWN_DELIVERY BEFORE payment 1 confirms!
    const switchRes = await mutate(seller.patch(`/api/seller/products/${prodId}`)).send({
      fulfilmentMethod: 'OWN_DELIVERY',
      pickupLocationId: null,
      shippingConfig: {
        fulfilmentMethod: 'OWN_DELIVERY',
        deliveryArea: 'Shimla',
        serviceablePincodes: ['171001'],
        deliveryChargePaise: 0,
        estimatedDeliveryDays: '2 days',
        contactName: 'Rohan',
        contactPhone: '9876543210',
      },
    });
    expect(switchRes.status).toBe(200);
    execute(db, "UPDATE products SET status = 'approved' WHERE id = ?", prodId);

    // Confirm Order 1 -> MUST still route via SHIPROCKET using checkout-time snapshot!
    await mutate(customer.post(`/api/dev/orders/${order1Res.body.order.orderNumber}/pay`)).send({});
    const order1Ful = queryOne<{ fulfilment_method: string }>(
      db,
      'SELECT fulfilment_method FROM order_fulfilments WHERE order_id = ?',
      order1Id,
    );
    expect(order1Ful!.fulfilment_method).toBe('SHIPROCKET');
    expect(calls.filter((c) => c.url.includes('/orders/create/adhoc'))).toHaveLength(1);

    // Place & pay Order 2 -> MUST use new OWN_DELIVERY with ZERO additional Shiprocket calls!
    await addToCart(app, customer, prodId, 1);
    const order2Res = await checkout(app, customer);
    await mutate(customer.post(`/api/dev/orders/${order2Res.body.order.orderNumber}/pay`)).send({});
    const order2Ful = queryOne<{ fulfilment_method: string }>(
      db,
      'SELECT fulfilment_method FROM order_fulfilments WHERE order_id = ?',
      order2Res.body.order.id,
    );
    expect(order2Ful!.fulfilment_method).toBe('OWN_DELIVERY');
    expect(calls.filter((c) => c.url.includes('/orders/create/adhoc'))).toHaveLength(1);
  });

  it('TEST 8: Rejects unregistered, unverified or other-seller pickup locations and never substitutes admin pickup', async () => {
    const { calls } = installMockShiprocket();
    const seller1 = await login(app, 'seller@test.local');
    const seller2Pickup = createVerifiedPickup(IDS.seller2, 'Kangra_Other_Seller_Hub', '176001');

    // Unverified local pickup for Seller 1
    const unverifiedId = 'pkl_unverified_1';
    execute(
      db,
      `INSERT INTO seller_pickup_locations
         (id, seller_id, nickname, shiprocket_location_name, contact_name, phone, line1, city, state, pincode, is_verified, is_approved)
       VALUES (?, ?, 'Unverified Hub', 'Unverified_SR', 'Maker', '9876543210', 'Road 1', 'Kullu', 'HP', '175125', 0, 0)`,
      unverifiedId,
      IDS.seller,
    );

    // 1. Missing pickupLocationId rejected
    const missingRes = await mutate(seller1.post('/api/seller/products')).send({
      name: 'Bad Shiprocket 1',
      categoryId: IDS.category,
      pricePaise: 50_000,
      weightG: 500,
      fulfilmentMethod: 'SHIPROCKET',
      shippingConfig: { packageWeightG: 500, packageLengthCm: 10, packageBreadthCm: 10, packageHeightCm: 10 },
    });
    expect(missingRes.status).toBe(400);

    // 2. Unverified pickupLocationId rejected
    const unverifiedRes = await mutate(seller1.post('/api/seller/products')).send({
      name: 'Bad Shiprocket 2',
      categoryId: IDS.category,
      pricePaise: 50_000,
      weightG: 500,
      fulfilmentMethod: 'SHIPROCKET',
      pickupLocationId: unverifiedId,
    });
    expect(unverifiedRes.status).toBe(400);

    // 3. Another seller's pickupLocationId rejected
    const crossSellerRes = await mutate(seller1.post('/api/seller/products')).send({
      name: 'Bad Shiprocket 3',
      categoryId: IDS.category,
      pricePaise: 50_000,
      weightG: 500,
      fulfilmentMethod: 'SHIPROCKET',
      pickupLocationId: seller2Pickup,
    });
    expect(crossSellerRes.status).toBe(400);

    // 4. Even if an order references a corrupted/unverified pickup, Shiprocket API is NEVER called with admin fallback
    const badProdId = createProductDirectly({
      id: 'prd_bad_pickup',
      sellerId: IDS.seller,
      name: 'Legacy Missing Pickup Prod',
      sku: 'BAD-PKP',
      method: 'SHIPROCKET',
      pickupLocationId: unverifiedId,
    });
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, badProdId, 1);
    const ordRes = await checkout(app, customer);
    await mutate(customer.post(`/api/dev/orders/${ordRes.body.order.orderNumber}/pay`)).send({});

    const ful = queryOne<{ id: string; status: string; last_sync_error: string | null }>(
      db,
      'SELECT id, status, last_sync_error FROM order_fulfilments WHERE order_id = ?',
      ordRes.body.order.id,
    )!;
    const manualSync = await syncShiprocketFulfilment(db, ful.id, { forceRetry: true });
    expect(manualSync.synced).toBe(false);
    expect(calls.filter((c) => c.url.includes('/orders/create/adhoc'))).toHaveLength(0);
    expect(ful.status).toBe('sync_failed');
    expect(ful.last_sync_error).toMatch(/verified|approved|pickup/i);
  });

  it('TEST 9: Rejects unauthorized webhooks (401), ignores non-Shiprocket targets, and blocks out-of-order regression', async () => {
    installMockShiprocket();
    const secret = 'test_shiprocket_webhook_secret_999';
    (env.shiprocket as { webhookSecret: string }).webhookSecret = secret;

    // Anonymous -> 401
    const request = (await import('supertest')).default;
    const unauth = await request(app).post('/api/webhooks/shiprocket').send({ awb: 'SR_AWB_778899', current_status: 'DELIVERED' });
    expect(unauth.status).toBe(401);

    const wrongToken = await request(app)
      .post('/api/webhooks/shiprocket')
      .set('x-shipping-token', 'bad_token')
      .send({ awb: 'SR_AWB_778899', current_status: 'DELIVERED' });
    expect(wrongToken.status).toBe(401);

    // Create a Shiprocket order & advance to READY_TO_SHIP, and an OWN_DELIVERY order
    const pickupId = createVerifiedPickup(IDS.seller, 'Kullu_Workshop_Hub');
    const srProd = createProductDirectly({
      id: 'prd_wh_sr',
      sellerId: IDS.seller,
      name: 'Webhook Shiprocket Product',
      sku: 'WH-SR',
      method: 'SHIPROCKET',
      pickupLocationId: pickupId,
    });
    const ownProd = createProductDirectly({
      id: 'prd_wh_own',
      sellerId: IDS.seller,
      name: 'Webhook Own Delivery Product',
      sku: 'WH-OWN',
      method: 'OWN_DELIVERY',
      shippingConfig: {
        fulfilmentMethod: 'OWN_DELIVERY',
        deliveryArea: 'Shimla',
        serviceablePincodes: ['171001'],
        deliveryChargePaise: 0,
        estimatedDeliveryDays: '1 day',
        contactName: 'Rohan',
        contactPhone: '9876543210',
      },
    });

    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, srProd, 1);
    const srOrder = await checkout(app, customer);
    await mutate(customer.post(`/api/dev/orders/${srOrder.body.order.orderNumber}/pay`)).send({});
    const srFulId = queryOne<{ id: string }>(db, 'SELECT id FROM order_fulfilments WHERE order_id = ?', srOrder.body.order.id)!.id;

    const seller = await login(app, 'seller@test.local');
    await mutate(seller.post(`/api/seller/fulfilments/${srFulId}/ready-to-ship`)).send({});

    await addToCart(app, customer, ownProd, 1);
    const ownOrder = await checkout(app, customer);
    await mutate(customer.post(`/api/dev/orders/${ownOrder.body.order.orderNumber}/pay`)).send({});
    const ownFulId = queryOne<{ id: string }>(db, 'SELECT id FROM order_fulfilments WHERE order_id = ?', ownOrder.body.order.id)!.id;
    execute(db, "UPDATE order_fulfilments SET tracking_number = 'OWN_TRACK_1' WHERE id = ?", ownFulId);

    // 1. Valid Shiprocket DELIVERED webhook updates SR order cleanly
    const deliveredRes = await request(app)
      .post('/api/webhooks/shiprocket')
      .set('x-shipping-token', secret)
      .send({
        awb: 'SR_AWB_778899',
        current_status: 'DELIVERED',
        current_status_desc: 'Delivered to customer.',
      });
    expect(deliveredRes.status).toBe(200);
    expect(deliveredRes.body.processed).toBe(true);
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM order_fulfilments WHERE id = ?', srFulId)!.status).toBe('delivered');

    // 2. Out-of-order PICKED UP arriving AFTER DELIVERED must NOT regress status from delivered!
    const staleRes = await request(app)
      .post('/api/webhooks/shiprocket')
      .set('x-shipping-token', secret)
      .send({
        awb: 'SR_AWB_778899',
        current_status: 'PICKED UP',
        current_status_desc: 'Late carrier scan',
      });
    expect(staleRes.status).toBe(200);
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM order_fulfilments WHERE id = ?', srFulId)!.status).toBe('delivered');

    // 3. Shiprocket webhook with Own Delivery tracking reference NEVER touches OWN_DELIVERY
    const crossMethodRes = await request(app)
      .post('/api/webhooks/shiprocket')
      .set('x-shipping-token', secret)
      .send({
        awb: 'OWN_TRACK_1',
        current_status: 'DELIVERED',
        current_status_desc: 'Malicious cross method attempt',
      });
    expect(crossMethodRes.status).toBe(200);
    expect(crossMethodRes.body.processed).toBe(false);
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM order_fulfilments WHERE id = ?', ownFulId)!.status).toBe(
      'order_confirmed',
    );
  });

  it('TEST 10: Customer mistaken order auto-cancels remote Shiprocket order & AWB before dispatch and releases stock/queues refund', async () => {
    const { calls } = installMockShiprocket();
    const pickupId = createVerifiedPickup(IDS.seller, 'Kullu_Workshop_Hub');
    const prodId = createProductDirectly({
      id: 'prd_mistake_sr',
      sellerId: IDS.seller,
      name: 'Mistaken Order Shiprocket Shawl',
      sku: 'MIST-SR-1',
      method: 'SHIPROCKET',
      pickupLocationId: pickupId,
    });

    // Scenario A: Paid order auto-synced to Shiprocket (no AWB yet) -> customer cancels by mistake
    const customer = await login(app, 'customer@test.local');
    await addToCart(app, customer, prodId, 1);
    const ord1 = await checkout(app, customer);
    const ord1Num = ord1.body.order.orderNumber as string;
    await mutate(customer.post(`/api/dev/orders/${ord1Num}/pay`)).send({});

    const so1 = queryOne<{ id: string }>(db, 'SELECT id FROM seller_orders WHERE order_id = ?', ord1.body.order.id)!;
    const cancel1 = await mutate(customer.post(`/api/account/orders/${ord1Num}/cancel`)).send({
      sellerOrderId: so1.id,
      reason: 'Placed order by mistake — wrong address selected.',
    });
    expect(cancel1.status).toBe(200);
    expect(cancel1.body.status).toBe('completed');

    const srCancelOrderCalls = calls.filter((c) => c.url.endsWith('/orders/cancel'));
    expect(srCancelOrderCalls).toHaveLength(1);
    expect(srCancelOrderCalls[0].body?.ids).toEqual([910001]);

    expect(queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE id = ?', ord1.body.order.id)!.status).toBe('cancelled');
    expect(queryOne<{ reserved_quantity: number }>(db, 'SELECT reserved_quantity FROM inventory WHERE product_id = ?', prodId)!.reserved_quantity).toBe(0);

    // Scenario B: Paid order already marked READY_TO_SHIP (has AWB, packed, not picked up) -> customer can still cancel -> cancels AWB in Shiprocket
    await addToCart(app, customer, prodId, 1);
    const ord2 = await checkout(app, customer);
    const ord2Num = ord2.body.order.orderNumber as string;
    await mutate(customer.post(`/api/dev/orders/${ord2Num}/pay`)).send({});

    const ful2 = queryOne<{ id: string; seller_order_id: string }>(
      db,
      'SELECT id, seller_order_id FROM order_fulfilments WHERE order_id = ?',
      ord2.body.order.id,
    )!;
    const seller = await login(app, 'seller@test.local');
    await mutate(seller.post(`/api/seller/fulfilments/${ful2.id}/ready-to-ship`)).send({});

    const orderView2 = await customer.get(`/api/account/orders/${ord2Num}`);
    expect(orderView2.body.order.canCancel).toBe(true);

    const cancel2 = await mutate(customer.post(`/api/account/orders/${ord2Num}/cancel`)).send({
      sellerOrderId: ful2.seller_order_id,
      reason: 'Mistaken duplicate order before courier pickup.',
    });
    expect(cancel2.status).toBe(200);
    expect(cancel2.body.status).toBe('completed');

    const awbCancelCalls = calls.filter((c) => c.url.includes('/orders/cancel/shipment/awbs'));
    expect(awbCancelCalls).toHaveLength(1);
    expect(awbCancelCalls[0].body?.awbs).toEqual(['SR_AWB_778899']);
  });
});
