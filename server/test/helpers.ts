import crypto from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../app.js';
import { execute, initDb, queryAll, queryOne, type Db } from '../db.js';
import { hashPassword } from '../lib/auth.js';
import type { AuthRouterDeps } from '../routes/auth.js';

export const TEST_PASSWORD = 'TestPass123!';

export const IDS = {
  admin: 'usr_test_admin',
  customer: 'usr_test_customer',
  otherCustomer: 'usr_test_other',
  sellerUser: 'usr_test_seller',
  seller2User: 'usr_test_seller2',
  seller: 'sel_test_primary',
  seller2: 'sel_test_secondary',
  category: 'cat_test',
  product: 'prd_test_primary',
  product2: 'prd_test_secondary',
} as const;

export const ADDRESS = {
  fullName: 'Test Customer',
  phone: '9876543210',
  line1: '12 Test Lane',
  city: 'Shimla',
  state: 'Himachal Pradesh',
  pincode: '171001',
};

export function setupTestApp(deps: Partial<AuthRouterDeps> = {}): { app: Express; db: Db } {
  const db = initDb(':memory:');
  const app = createApp(db, deps);
  return { app, db };
}

export function resetDb(db: Db): void {
  const tables = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'",
  );
  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of tables) {
    db.exec(`DELETE FROM "${table.name}"`);
  }
  db.exec('PRAGMA foreign_keys = ON');
}

function addUser(
  db: Db,
  id: string,
  email: string,
  fullName: string,
  roles: Array<'customer' | 'seller' | 'admin'>,
  options: { verified?: boolean; disabled?: boolean } = {},
): void {
  execute(
    db,
    'INSERT INTO users (id, email, password_hash, email_verified, is_disabled) VALUES (?, ?, ?, ?, ?)',
    id,
    email,
    hashPassword(TEST_PASSWORD),
    options.verified === false ? 0 : 1,
    options.disabled ? 1 : 0,
  );
  execute(db, 'INSERT INTO profiles (id, full_name) VALUES (?, ?)', id, fullName);
  for (const role of roles) {
    execute(db, 'INSERT INTO user_roles (user_id, role) VALUES (?, ?)', id, role);
  }
}

function addSeller(db: Db, id: string, userId: string, name: string, slug: string, region: string): void {
  execute(
    db,
    `INSERT INTO seller_profiles
       (id, user_id, business_name, slug, seller_type, region, operating_address, pickup_address, status,
        store_status, approved_at)
     VALUES (?, ?, ?, ?, 'individual', ?, ?, ?, 'approved', 'active', ?)`,
    id,
    userId,
    name,
    slug,
    region,
    JSON.stringify({ line1: '1 Maker Road', city: region, state: 'Himachal Pradesh', pincode: '171001' }),
    JSON.stringify({ line1: '1 Maker Road', city: region, state: 'Himachal Pradesh', pincode: '171001' }),
    new Date().toISOString(),
  );
}

function addProduct(
  db: Db,
  id: string,
  sellerId: string,
  name: string,
  slug: string,
  sku: string,
  pricePaise: number,
  stock: number,
  taxRateBp = 0,
): void {
  execute(
    db,
    `INSERT INTO products
       (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku,
        weight_g, status, is_demo, tax_rate_bp, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 500, 'approved', 0, ?, ?)`,
    id,
    sellerId,
    IDS.category,
    name,
    slug,
    'A test product used by the automated suite.',
    'This is a deliberately long test description used to satisfy the minimum listing quality checks in the marketplace.',
    pricePaise,
    sku,
    taxRateBp,
    new Date().toISOString(),
  );
  execute(
    db,
    "INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES (?, ?, '/images/product-shawl.jpg', ?, 0)",
    `img_${id}`,
    id,
    `${name} photographed on a plain background`,
  );
  execute(db, 'INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES (?, ?, 2)', id, stock);
}

export function seedFixtures(db: Db): void {
  execute(
    db,
    "INSERT INTO categories (id, name, slug, description, sort_order) VALUES (?, 'Test Weaves', 'test-weaves', 'Test category', 1)",
    IDS.category,
  );

  addUser(db, IDS.admin, 'admin@test.local', 'Test Admin', ['admin', 'customer']);
  addUser(db, IDS.customer, 'customer@test.local', 'Test Customer', ['customer']);
  addUser(db, IDS.otherCustomer, 'other@test.local', 'Other Customer', ['customer']);
  addUser(db, IDS.sellerUser, 'seller@test.local', 'Test Seller', ['seller', 'customer']);
  addUser(db, IDS.seller2User, 'seller2@test.local', 'Second Seller', ['seller', 'customer']);

  addSeller(db, IDS.seller, IDS.sellerUser, 'Test Loom', 'test-loom', 'Kullu');
  addSeller(db, IDS.seller2, IDS.seller2User, 'Second Loom', 'second-loom', 'Kangra');

  addProduct(db, IDS.product, IDS.seller, 'Test Shawl', 'test-shawl', 'TEST-SHAWL', 100_000, 10);
  addProduct(db, IDS.product2, IDS.seller2, 'Second Shawl', 'second-shawl', 'TEST-SHAWL-2', 50_000, 10);
}

export function mutate<T extends { set(field: string, value: string): T }>(test: T): T {
  return test.set('x-requested-with', 'pahadi-roots');
}

export async function login(app: Express, email: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const response = await mutate(agent.post('/api/auth/login')).send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return agent;
}

export function orderView(db: Db, orderNumber: string) {
  return queryOne<{ id: string; status: string; total_paise: number; subtotal_paise: number; tax_paise: number }>(
    db,
    'SELECT id, status, total_paise, subtotal_paise, tax_paise FROM orders WHERE order_number = ?',
    orderNumber,
  );
}

export function sellerOrderFor(db: Db, orderNumber: string) {
  return queryOne<{
    id: string;
    seller_id: string;
    status: string;
    subtotal_paise: number;
    shipping_paise: number;
    commission_paise: number;
    seller_earning_paise: number;
  }>(
    db,
    `SELECT so.id, so.seller_id, so.status, so.subtotal_paise, so.shipping_paise,
            so.commission_paise, so.seller_earning_paise
       FROM seller_orders so JOIN orders o ON o.id = so.order_id
      WHERE o.order_number = ?`,
    orderNumber,
  );
}

export async function addToCart(_app: Express, agent: ReturnType<typeof request.agent>, productId: string, quantity = 1) {
  const response = await mutate(agent.post('/api/cart/items')).send({ productId, quantity });
  if (response.status !== 201) {
    throw new Error(`Add to cart failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.cart;
}

export async function checkout(
  _app: Express,
  agent: ReturnType<typeof request.agent>,
  options: { couponCode?: string; idempotencyKey?: string; address?: typeof ADDRESS } = {},
) {
  return mutate(agent.post('/api/checkout')).send({
    address: options.address ?? ADDRESS,
    idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    ...(options.couponCode ? { couponCode: options.couponCode } : {}),
  });
}

export async function paidOrder(
  _app: Express,
  agent: ReturnType<typeof request.agent>,
  productId: string = IDS.product,
  quantity = 1,
) {
  await addToCart(_app, agent, productId, quantity);
  const response = await checkout(_app, agent);
  if (response.status !== 201) {
    throw new Error(`Checkout failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const orderNumber = response.body.order.orderNumber as string;
  const paid = await mutate(agent.post(`/api/dev/orders/${orderNumber}/pay`)).send({});
  if (paid.status !== 200) {
    throw new Error(`Dev payment failed: ${paid.status} ${JSON.stringify(paid.body)}`);
  }
  return { orderNumber, order: paid.body.order };
}
