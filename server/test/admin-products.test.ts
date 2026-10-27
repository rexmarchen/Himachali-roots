import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { execute, queryOne, type Db } from '../db.js';
import { IDS, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

describe('Admin Product Management', () => {
  let app: ReturnType<typeof setupTestApp>['app'];
  let db: Db;
  let adminAgent: Awaited<ReturnType<typeof login>>;
  let customerAgent: Awaited<ReturnType<typeof login>>;

  beforeEach(async () => {
    const context = setupTestApp();
    app = context.app;
    db = context.db;
    resetDb(db);
    seedFixtures(db);
    adminAgent = await login(app, 'admin@test.local');
    customerAgent = await login(app, 'customer@test.local');
  });

  describe('Product Creation & Input Validation', () => {
    it('creates a draft product by default with unique slug and inventory initialized', async () => {
      const response = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'DEMO PRODUCT 001 — Kangra Orthodox Tea',
        pricePaise: 45000,
        stock: 25,
        description: 'Authentic high-grown loose leaf Kangra orthodox black tea from certified estates.',
        isDemo: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.status).toBe('draft');
      expect(response.body.slug).toBe('demo-product-001-kangra-orthodox-tea');

      // Verify persistence in SQLite database
      const row = queryOne<{ id: string; status: string; is_demo: number; price_paise: number }>(
        db,
        'SELECT id, status, is_demo, price_paise FROM products WHERE id = ?',
        response.body.id,
      );
      expect(row).toBeDefined();
      expect(row?.status).toBe('draft');
      expect(row?.is_demo).toBe(1);
      expect(row?.price_paise).toBe(45000);

      // Verify inventory initialized
      const inv = queryOne<{ quantity: number; reserved_quantity: number }>(
        db,
        'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
        response.body.id,
      );
      expect(inv).toBeDefined();
      expect(inv?.quantity).toBe(25);
      expect(inv?.reserved_quantity).toBe(0);

      // Verify draft product is NOT visible in public shop catalogue
      const publicShop = await request(app).get('/api/shop/products');
      expect(publicShop.status).toBe(200);
      const publicSlugs = publicShop.body.items.map((p: { slug: string }) => p.slug);
      expect(publicSlugs).not.toContain(response.body.slug);

      // Verify direct public detail access is rejected for draft
      const publicDetail = await request(app).get(`/api/shop/products/${response.body.slug}`);
      expect(publicDetail.status).toBe(404);
    });

    it('rejects creation with negative price', async () => {
      const response = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'Invalid Price Tea',
        pricePaise: -500,
        stock: 10,
        description: 'Test description of sufficient length for listing quality.',
      });
      expect(response.status).toBe(400);
      expect(response.body.error.fields).toHaveProperty('pricePaise');
    });

    it('rejects creation with negative stock', async () => {
      const response = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'Negative Stock Product',
        pricePaise: 10000,
        stock: -1,
        description: 'Test description of sufficient length for listing quality.',
      });
      expect(response.status).toBe(400);
      expect(response.body.error.fields).toHaveProperty('stock');
    });

    it('rejects creation with missing or too-short name', async () => {
      const response = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'A',
        pricePaise: 10000,
        stock: 5,
        description: 'Test description of sufficient length for listing quality.',
      });
      expect(response.status).toBe(400);
    });

    it('rejects duplicate SKU for the same seller', async () => {
      const first = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'Product A',
        sku: 'UNIQUE-SKU-123',
        pricePaise: 10000,
        stock: 5,
        description: 'Test description of sufficient length for listing quality.',
      });
      expect(first.status).toBe(201);

      const duplicate = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'Product B',
        sku: 'UNIQUE-SKU-123',
        pricePaise: 12000,
        stock: 10,
        description: 'Test description of sufficient length for listing quality.',
      });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.error.fields).toHaveProperty('sku');
    });
  });

  describe('Product Lifecycle: Publish, Unpublish, Archive', () => {
    it('publishes a draft product and makes it accessible in the customer storefront', async () => {
      // 1. Create draft
      const created = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'DEMO PRODUCT 002 — Himachali Wild Honey',
        pricePaise: 65000,
        stock: 15,
        description: 'Raw multifloral forest honey ethically gathered from high altitude flora.',
        materials: 'Raw multifloral forest honey',
        isDemo: true,
      });
      expect(created.status).toBe(201);
      const productId = created.body.id as string;
      const slug = created.body.slug as string;

      // 2. Publish
      const publishRes = await mutate(adminAgent.post(`/api/admin/products/${productId}/publish`)).send({});
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.status).toBe('approved');

      // Verify in DB
      const dbProduct = queryOne<{ status: string; published_at: string | null }>(
        db,
        'SELECT status, published_at FROM products WHERE id = ?',
        productId,
      );
      expect(dbProduct?.status).toBe('approved');
      expect(dbProduct?.published_at).toBeTruthy();

      // 3. Now public storefront must include it
      const shopRes = await request(app).get('/api/shop/products');
      expect(shopRes.status).toBe(200);
      const found = shopRes.body.items.find((p: { slug: string }) => p.slug === slug);
      expect(found).toBeDefined();
      expect(found.name).toBe('DEMO PRODUCT 002 — Himachali Wild Honey');
      expect(found.stock).toBe(15);

      // 4. Public detail page is accessible
      const detailRes = await request(app).get(`/api/shop/products/${slug}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.product.name).toBe('DEMO PRODUCT 002 — Himachali Wild Honey');
    });

    it('unpublishes a product and immediately hides it from the public storefront', async () => {
      // IDS.product is seeded as approved
      const initial = await request(app).get(`/api/shop/products/test-shawl`);
      expect(initial.status).toBe(200);

      // Unpublish
      const unpublishRes = await mutate(adminAgent.post(`/api/admin/products/${IDS.product}/unpublish`)).send({});
      expect(unpublishRes.status).toBe(200);
      expect(unpublishRes.body.status).toBe('paused');

      // Verify hidden from public detail
      const after = await request(app).get(`/api/shop/products/test-shawl`);
      expect(after.status).toBe(404);

      // Verify hidden from public listing
      const shopRes = await request(app).get('/api/shop/products');
      const found = shopRes.body.items.find((p: { slug: string }) => p.slug === 'test-shawl');
      expect(found).toBeUndefined();
    });

    it('archives a product without destroying historical order integrity', async () => {
      const archiveRes = await mutate(adminAgent.post(`/api/admin/products/${IDS.product}/archive`)).send({});
      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.status).toBe('archived');

      // Verify DB record status
      const p = queryOne<{ status: string }>(db, 'SELECT status FROM products WHERE id = ?', IDS.product);
      expect(p?.status).toBe('archived');

      // Verify hidden from public storefront
      const publicRes = await request(app).get(`/api/shop/products/test-shawl`);
      expect(publicRes.status).toBe(404);
    });
  });

  describe('Stock Management & Inventory Adjustments', () => {
    it('sets inventory stock and logs an audit movement', async () => {
      const res = await mutate(adminAgent.post(`/api/admin/products/${IDS.product}/stock`)).send({
        quantity: 50,
        mode: 'set',
        reason: 'annual_restock',
      });
      expect(res.status).toBe(200);
      expect(res.body.stock).toBe(50);
      expect(res.body.available).toBe(50);

      // Verify inventory table
      const inv = queryOne<{ quantity: number }>(db, 'SELECT quantity FROM inventory WHERE product_id = ?', IDS.product);
      expect(inv?.quantity).toBe(50);

      // Verify inventory_movements table
      const movement = queryOne<{ change: number; reason: string }>(
        db,
        'SELECT change, reason FROM inventory_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT 1',
        IDS.product,
      );
      expect(movement).toBeDefined();
      expect(movement?.change).toBe(40); // Was 10, now 50 -> change +40
    });

    it('adjusts inventory stock increment by delta', async () => {
      const res = await mutate(adminAgent.post(`/api/admin/products/${IDS.product}/stock`)).send({
        quantity: 15,
        mode: 'adjust',
      });
      expect(res.status).toBe(200);
      expect(res.body.stock).toBe(25); // 10 + 15 = 25
    });

    it('rejects setting stock below reserved quantity', async () => {
      // Simulate reserved stock
      execute(db, 'UPDATE inventory SET reserved_quantity = 8 WHERE product_id = ?', IDS.product);

      const res = await mutate(adminAgent.post(`/api/admin/products/${IDS.product}/stock`)).send({
        quantity: 5, // Lower than 8 reserved
        mode: 'set',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty('quantity');
    });

    it('rejects negative stock update', async () => {
      const res = await mutate(adminAgent.post(`/api/admin/products/${IDS.product}/stock`)).send({
        quantity: -10,
        mode: 'set',
      });
      expect(res.status).toBe(400);
    });

    it('updates the low-stock threshold and lists only published low-stock products', async () => {
      const update = await mutate(adminAgent.post(`/api/admin/products/${IDS.product}/stock`)).send({
        quantity: 4,
        mode: 'set',
        lowStockThreshold: 5,
      });
      expect(update.status).toBe(200);
      expect(update.body.lowStockThreshold).toBe(5);
      expect(update.body.available).toBe(4);

      execute(db, "UPDATE products SET status = 'draft' WHERE id = ?", IDS.product2);
      execute(db, 'UPDATE inventory SET low_stock_threshold = 100 WHERE product_id = ?', IDS.product2);

      const list = await adminAgent.get('/api/admin/products?lowStock=true');
      expect(list.status).toBe(200);
      expect(list.body.products.map((product: { id: string }) => product.id)).toContain(IDS.product);
      expect(list.body.products.map((product: { id: string }) => product.id)).not.toContain(IDS.product2);
      const row = list.body.products.find((product: { id: string }) => product.id === IDS.product);
      expect(row.low_stock_threshold).toBe(5);
      expect(row.stock).toBe(4);
      expect(row.reserved).toBe(0);
      expect(list.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Product Updates (PATCH)', () => {
    it('updates product attributes with validation', async () => {
      const res = await mutate(adminAgent.patch(`/api/admin/products/${IDS.product}`)).send({
        name: 'Updated Mountain Shawl',
        pricePaise: 120_000,
        compareAtPricePaise: 150_000,
        materials: '100% Fine Merino Wool',
      });
      expect(res.status).toBe(200);

      const updated = queryOne<{ name: string; price_paise: number; compare_at_price_paise: number; materials: string }>(
        db,
        'SELECT name, price_paise, compare_at_price_paise, materials FROM products WHERE id = ?',
        IDS.product,
      );
      expect(updated?.name).toBe('Updated Mountain Shawl');
      expect(updated?.price_paise).toBe(120_000);
      expect(updated?.compare_at_price_paise).toBe(150_000);
      expect(updated?.materials).toBe('100% Fine Merino Wool');
    });

    it('rejects compare-at price less than selling price', async () => {
      const res = await mutate(adminAgent.patch(`/api/admin/products/${IDS.product}`)).send({
        pricePaise: 100_000,
        compareAtPricePaise: 80_000, // Invalid: compareAt cannot be cheaper than selling price
      });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty('compareAtPricePaise');
    });
  });

  describe('Category publication gates', () => {
    it('refuses direct published creation in a regulated category', async () => {
      const res = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'Direct Published Weave',
        pricePaise: 90_000,
        stock: 4,
        description: 'A handwoven runner that should go through category review before publication.',
        status: 'approved',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty('status');
    });

    it('refuses to publish a regulated draft without the required category information', async () => {
      const created = await mutate(adminAgent.post('/api/admin/products')).send({
        name: 'Draft Weave Without Materials',
        pricePaise: 90_000,
        stock: 4,
        description: 'A handwoven runner that is missing its material description in the draft.',
      });
      expect(created.status).toBe(201);

      const published = await mutate(adminAgent.post(`/api/admin/products/${created.body.id}/publish`)).send({});
      expect(published.status).toBe(400);
      expect(published.body.error.fields).toHaveProperty('materials');

      const row = queryOne<{ status: string }>(db, 'SELECT status FROM products WHERE id = ?', created.body.id);
      expect(row?.status).toBe('draft');
    });
  });

  describe('Access Control & Security', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await mutate(request(app).post('/api/admin/products')).send({
        name: 'Unauthorized Product',
        pricePaise: 10000,
        stock: 5,
        description: 'Test description of sufficient length for listing quality.',
      });
      expect(res.status).toBe(401);
    });

    it('rejects ordinary customer requests with 403 forbidden', async () => {
      const res = await mutate(customerAgent.post('/api/admin/products')).send({
        name: 'Hacker Product',
        pricePaise: 10000,
        stock: 5,
        description: 'Test description of sufficient length for listing quality.',
      });
      expect(res.status).toBe(403);
    });

    it('rejects ordinary customer from stock updates with 403', async () => {
      const res = await mutate(customerAgent.post(`/api/admin/products/${IDS.product}/stock`)).send({
        quantity: 9999,
        mode: 'set',
      });
      expect(res.status).toBe(403);
    });
  });
});
