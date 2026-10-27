import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { queryAll, queryOne, type Db } from '../db.js';
import { ADDRESS, IDS, addToCart, checkout, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

describe('Demo Checkout, Inventory & Admin Order Management', () => {
  let app: ReturnType<typeof setupTestApp>['app'];
  let db: Db;
  let adminAgent: Awaited<ReturnType<typeof login>>;
  let customerAgent: Awaited<ReturnType<typeof login>>;
  let otherCustomerAgent: Awaited<ReturnType<typeof login>>;

  beforeEach(async () => {
    const context = setupTestApp();
    app = context.app;
    db = context.db;
    resetDb(db);
    seedFixtures(db);
    adminAgent = await login(app, 'admin@test.local');
    customerAgent = await login(app, 'customer@test.local');
    otherCustomerAgent = await login(app, 'other@test.local');
  });

  describe('Primary End-to-End Workflow', () => {
    it('executes full workflow: admin creates demo product -> publishes -> customer checks out -> order persisted with is_demo -> admin updates status -> admin cancels and restores stock', async () => {
      // 1. Admin creates demo product in draft
      const createRes = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'DEMO PRODUCT 003 — Pure Chamba Honey',
        pricePaise: 50000,
        stock: 5,
        sku: 'DEMO-HONEY-003',
        description: 'Rare Chamba forest honey sample for local testing and demo checkout.',
        // Publication checks follow the product category. The suite fixture
        // category is a textile category, so a material description is needed.
        materials: 'Pure Chamba forest honey',
        isDemo: true,
      });
      expect(createRes.status).toBe(201);
      const demoProductId = createRes.body.id as string;
      const demoSlug = createRes.body.slug as string;

      // 2. Admin publishes it to customer storefront
      const publishRes = await mutate(adminAgent.post(`/api/admin/products/${demoProductId}/publish`)).send({});
      expect(publishRes.status).toBe(200);

      // 3. Customer views product on public storefront
      const publicProduct = await request(app).get(`/api/shop/products/${demoSlug}`);
      expect(publicProduct.status).toBe(200);
      expect(publicProduct.body.product.name).toBe('DEMO PRODUCT 003 — Pure Chamba Honey');
      expect(publicProduct.body.product.stock).toBe(5);

      // 4. Customer adds 2 units to cart
      await addToCart(app, customerAgent, demoProductId, 2);

      // 5. Customer completes checkout
      const checkoutRes = await checkout(app, customerAgent, { address: ADDRESS });
      expect(checkoutRes.status).toBe(201);
      const orderNumber = checkoutRes.body.order.orderNumber as string;
      expect(orderNumber).toBeTruthy();
      expect(checkoutRes.body.order.isDemo).toBe(true);

      // Verify atomic inventory reservation: 2 units reserved, 3 available
      const invAfterCheckout = queryOne<{ quantity: number; reserved_quantity: number }>(
        db,
        'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
        demoProductId,
      );
      expect(invAfterCheckout?.quantity).toBe(5);
      expect(invAfterCheckout?.reserved_quantity).toBe(2);

      // 6. Verify frozen snapshot in database
      const orderItems = queryAll<{ product_id: string; name: string; unit_price_paise: number; quantity: number }>(
        db,
        'SELECT product_id, name, unit_price_paise, quantity FROM order_items WHERE product_id = ?',
        demoProductId,
      );
      expect(orderItems).toHaveLength(1);
      expect(orderItems[0].name).toBe('DEMO PRODUCT 003 — Pure Chamba Honey');
      expect(orderItems[0].unit_price_paise).toBe(50000);
      expect(orderItems[0].quantity).toBe(2);

      // 7. Verify future product edits DO NOT rewrite historical order details
      await mutate(adminAgent.patch(`/api/admin/products/${demoProductId}`)).send({
        name: 'REVISED Honey Name 2027',
        pricePaise: 99999,
      });
      const orderItemsAfterEdit = queryAll<{ name: string; unit_price_paise: number }>(
        db,
        'SELECT name, unit_price_paise FROM order_items WHERE product_id = ?',
        demoProductId,
      );
      expect(orderItemsAfterEdit[0].name).toBe('DEMO PRODUCT 003 — Pure Chamba Honey');
      expect(orderItemsAfterEdit[0].unit_price_paise).toBe(50000);

      // 8. Customer simulates payment with demo payment endpoint
      const payRes = await mutate(customerAgent.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
      expect(payRes.status).toBe(200);
      expect(payRes.body.ok).toBe(true);
      expect(payRes.body.isDemo).toBe(true);
      expect(payRes.body.demoLabel).toBe('DEMO ORDER — NOT A REAL PURCHASE');

      // 9. Admin views orders list and filters by isDemo
      const adminOrdersAll = await mutate(adminAgent.get('/api/admin/orders'));
      expect(adminOrdersAll.status).toBe(200);
      const demoOrderRow = adminOrdersAll.body.orders.find((o: { orderNumber: string }) => o.orderNumber === orderNumber);
      expect(demoOrderRow).toBeDefined();
      expect(demoOrderRow.isDemo).toBe(true);

      const adminOrdersDemoOnly = await mutate(adminAgent.get('/api/admin/orders?isDemo=true'));
      expect(adminOrdersDemoOnly.body.orders.every((o: { isDemo: boolean }) => o.isDemo)).toBe(true);

      const adminOrdersRealOnly = await mutate(adminAgent.get('/api/admin/orders?isDemo=false'));
      expect(adminOrdersRealOnly.body.orders.find((o: { orderNumber: string }) => o.orderNumber === orderNumber)).toBeUndefined();

      // 10. Admin inspects order details
      const adminOrderDetail = await mutate(adminAgent.get(`/api/admin/orders/${orderNumber}`));
      expect(adminOrderDetail.status).toBe(200);
      expect(adminOrderDetail.body.order.isDemo).toBe(true);
      expect(adminOrderDetail.body.order.orderNumber).toBe(orderNumber);

      // 11. Admin updates status: confirm seller sub-order
      const sellerOrderId = adminOrderDetail.body.order.sellerOrders[0].id as string;
      const confirmRes = await mutate(
        adminAgent.post(`/api/admin/orders/${orderNumber}/seller-orders/${sellerOrderId}/action`),
      ).send({ action: 'confirm' });
      expect(confirmRes.status).toBe(200);

      // 12. Admin cancels the order and verifies stock restoration
      const cancelRes = await mutate(adminAgent.post(`/api/admin/orders/${orderNumber}/status`)).send({
        action: 'cancel',
        note: 'Customer requested simulated order cancellation',
      });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('cancelled');

      // Verify master order in DB is cancelled
      const orderDb = queryOne<{ status: string }>(db, 'SELECT status FROM orders WHERE order_number = ?', orderNumber);
      expect(orderDb?.status).toBe('cancelled');

      // Verify reserved stock was fully released back: reserved_quantity becomes 0
      const invAfterCancel = queryOne<{ quantity: number; reserved_quantity: number }>(
        db,
        'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
        demoProductId,
      );
      expect(invAfterCancel?.reserved_quantity).toBe(0);
      expect(invAfterCancel?.quantity).toBe(5);

      // Verify audit movement was recorded for release
      const cancelMovement = queryOne<{ change: number; reason: string }>(
        db,
        "SELECT change, reason FROM inventory_movements WHERE product_id = ? AND reason = 'release'",
        demoProductId,
      );
      expect(cancelMovement).toBeDefined();
    });
  });

  describe('Inventory Concurrency & Overselling Prevention', () => {
    it('rejects checkout when concurrent requests exceed available stock', async () => {
      // IDS.product has stock 10. Both customers put 6 units in their cart concurrently.
      await addToCart(app, customerAgent, IDS.product, 6);
      await addToCart(app, otherCustomerAgent, IDS.product, 6);

      // Customer 1 checks out first and claims 6 units
      const order1 = await checkout(app, customerAgent, { address: ADDRESS });
      expect(order1.status).toBe(201);

      // Customer 2 attempts to check out 6 units when only 4 remain available
      const order2 = await checkout(app, otherCustomerAgent, { address: ADDRESS });
      expect(order2.status).toBe(409);
      expect(order2.body.error.code).toBe('insufficient_stock');
    });

    it('recalculates totals on the server and rejects client-manipulated prices', async () => {
      await addToCart(app, customerAgent, IDS.product, 1);
      // Attempt to send a fake client total in the checkout payload
      const res = await mutate(customerAgent.post('/api/checkout')).send({
        address: ADDRESS,
        idempotencyKey: 'client-key-1234567890',
        totalPaise: 1, // Malicious 1 paise
        pricePaise: 1,
      });
      expect(res.status).toBe(201);
      // Real price from DB is 100_000 (₹1,000)
      expect(res.body.order.subtotalPaise).toBe(100_000);
    });
  });

  describe('Admin Analytics & Revenue Isolation', () => {
    it('strictly isolates demo orders from real GMV and reports demo order metrics separately', async () => {
      // Place a demo order and mark it paid
      await addToCart(app, customerAgent, IDS.product, 1);
      const co = await checkout(app, customerAgent, { address: ADDRESS });
      const orderNumber = co.body.order.orderNumber as string;
      await mutate(customerAgent.post(`/api/dev/orders/${orderNumber}/pay`)).send({});

      // Query admin overview
      const overviewRes = await mutate(adminAgent.get('/api/admin/overview'));
      expect(overviewRes.status).toBe(200);
      const metrics = overviewRes.body.metrics;

      // Because all simulated dev payments set is_demo = 1:
      // Real GMV must be 0!
      expect(metrics.gmv).toBe(0);
      expect(metrics.commission).toBe(0);
      expect(metrics.real_orders).toBe(0);

      // Demo orders must be counted under demo_orders
      expect(metrics.demo_orders).toBeGreaterThanOrEqual(1);
      expect(metrics.total_orders).toBeGreaterThanOrEqual(1);

      // Catalogue breakdown must be present
      expect(metrics.published_products).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Authorization & Customer Privacy', () => {
    it('prevents a customer from accessing another customer’s private order', async () => {
      await addToCart(app, customerAgent, IDS.product, 1);
      const co = await checkout(app, customerAgent, { address: ADDRESS });
      const orderNumber = co.body.order.orderNumber as string;

      // Other customer tries to view it
      const res = await mutate(otherCustomerAgent.get(`/api/account/orders/${orderNumber}`));
      expect(res.status).toBe(404);
    });

    it('rejects customer from updating order status directly with 403', async () => {
      await addToCart(app, customerAgent, IDS.product, 1);
      const co = await checkout(app, customerAgent, { address: ADDRESS });
      const orderNumber = co.body.order.orderNumber as string;

      const res = await mutate(customerAgent.post(`/api/admin/orders/${orderNumber}/status`)).send({
        action: 'deliver',
      });
      expect(res.status).toBe(403);
    });
  });
});
