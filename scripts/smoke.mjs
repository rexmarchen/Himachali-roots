#!/usr/bin/env node
/**
 * Live HTTP smoke test for a running PAHADI ROOTS server.
 *
 * It exercises the real HTTP surface only: storefront, registration, cart,
 * checkout, the development payment simulation, seller fulfilment, and the
 * admin settlement guard. It does not touch the database directly.
 *
 * Requirements:
 *   - The API is running (default http://localhost:8787).
 *   - ALLOW_DEV_PAYMENTS=true in a non-production environment, because the
 *     payment step deliberately uses the labelled development simulation.
 *   - Optional admin checks: set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD.
 *
 * This script creates real records in the target database. Run it against a
 * development database, not production.
 */
import crypto from 'node:crypto';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const DEMO_SELLER_PASSWORD = process.env.SMOKE_SELLER_PASSWORD ?? 'PahadiDemo!2026';

class Client {
  cookies = new Map();

  async request(method, path, body) {
    const headers = { 'x-requested-with': 'pahadi-roots' };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (body !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });

    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }

    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON responses are reported through `text` when an assertion fails.
    }
    return { status: response.status, body: json, text };
  }

  get(path) {
    return this.request('GET', path);
  }

  post(path, body = {}) {
    return this.request('POST', path, body);
  }

  patch(path, body = {}) {
    return this.request('PATCH', path, body);
  }
}

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

function expectStatus(label, response, status) {
  check(
    `${label} (HTTP ${status})`,
    response.status === status,
    `got ${response.status}: ${response.text.slice(0, 300)}`,
  );
  return response;
}

function must(label, condition, detail) {
  if (!condition) {
    failures += 1;
    throw new Error(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const DEMO_SELLER_PREFIXES = new Set(['kullu', 'kangra', 'lahaul', 'chamba', 'kinnaur']);
const sellerEmailFor = (slug) => `${slug.split('-')[0]}@demo.pahadiroots.test`;

async function main() {
  console.log(`PAHADI ROOTS smoke test against ${BASE}`);
  console.log('Development payment simulation will be used; no money moves.\n');

  const publicClient = new Client();

  const health = expectStatus('health endpoint', await publicClient.get('/api/health'), 200);
  check('database reports up', health.body?.database === 'up', JSON.stringify(health.body));

  const home = expectStatus('storefront home', await publicClient.get('/api/home'), 200);
  check('home returns categories', Array.isArray(home.body?.categories) && home.body.categories.length > 0);
  check('home reports approved catalogue totals', (home.body?.counts?.products ?? 0) > 0, JSON.stringify(home.body?.counts));

  const catalogue = expectStatus('product listing', await publicClient.get('/api/products?pageSize=48'), 200);
  const candidates = (catalogue.body?.items ?? []).filter(
    (item) => item.isDemo && item.stock > 0 && DEMO_SELLER_PREFIXES.has(item.sellerSlug.split('-')[0]),
  );
  must('a demo product with stock is available', candidates.length > 0, 'run `npm run reset` to restore demo data');
  const product = candidates[0];

  const sellerStorefront = expectStatus('maker storefront', await publicClient.get(`/api/sellers/${product.sellerSlug}`), 200);
  const sellerId = sellerStorefront.body?.seller?.id;
  must('maker storefront exposes a seller id', typeof sellerId === 'string');

  const email = `smoke-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@demo.pahadiroots.test`;
  const customer = new Client();
  const registration = expectStatus(
    'customer registration',
    await customer.post('/api/auth/register', {
      fullName: 'Smoke Test Customer',
      email,
      password: 'SmokeTest!2026',
      acceptedTerms: true,
    }),
    201,
  );
  check('registration returns a customer session', registration.body?.user?.email === email);

  const verifyUrl = registration.body?.devVerifyUrl;
  if (typeof verifyUrl === 'string') {
    const token = new URL(verifyUrl).searchParams.get('token');
    if (token) expectStatus('email verification', await customer.post('/api/auth/verify-email', { token }), 200);
  }

  const cart = expectStatus(
    'add product to cart',
    await customer.post('/api/cart/items', { productId: product.id, quantity: 1 }),
    201,
  );
  check('cart contains the selected product', (cart.body?.cart?.lines ?? []).some((line) => line.productId === product.id));

  const checkout = expectStatus(
    'checkout',
    await customer.post('/api/checkout', {
      address: {
        fullName: 'Smoke Test Customer',
        phone: '9876543210',
        line1: '12 Smoke Test Lane',
        city: 'Shimla',
        state: 'Himachal Pradesh',
        pincode: '171001',
      },
      idempotencyKey: crypto.randomUUID(),
    }),
    201,
  );
  const orderNumber = checkout.body?.order?.orderNumber;
  must('checkout returns an order number', typeof orderNumber === 'string');
  check('checkout requires payment', checkout.body?.order?.status === 'pending_payment', checkout.body?.order?.status);

  const payment = expectStatus(
    'development payment simulation',
    await customer.post(`/api/dev/orders/${orderNumber}/pay`),
    200,
  );
  check('payment is explicitly flagged as simulated', payment.body?.developmentSimulation === true);
  check('order is marked paid', payment.body?.order?.status === 'paid', payment.body?.order?.status);

  const seller = new Client();
  expectStatus(
    'demo seller login',
    await seller.post('/api/auth/login', { email: sellerEmailFor(product.sellerSlug), password: DEMO_SELLER_PASSWORD }),
    200,
  );

  const sellerOrders = expectStatus('seller order list', await seller.get('/api/seller/orders'), 200);
  const sellerOrder = (sellerOrders.body?.orders ?? []).find((order) => order.orderNumber === orderNumber);
  must('seller sees the new order', Boolean(sellerOrder));
  check('seller order starts pending', sellerOrder.status === 'pending', sellerOrder.status);

  for (const [action, extra] of [
    ['confirm', {}],
    ['pack', {}],
    ['ship', { carrier: 'India Post (smoke)', trackingNumber: `SMOKE${Date.now()}` }],
    ['deliver', {}],
  ]) {
    expectStatus(
      `seller action: ${action}`,
      await seller.post(`/api/seller/orders/${sellerOrder.id}/action`, { action, ...extra }),
      200,
    );
  }

  const customerOrder = expectStatus('customer order detail', await customer.get(`/api/account/orders/${orderNumber}`), 200);
  check(
    'order reaches a fulfilled state',
    ['fulfilled', 'delivered'].includes(customerOrder.body?.order?.status),
    customerOrder.body?.order?.status,
  );

  const earnings = expectStatus('seller earnings', await seller.get('/api/seller/earnings'), 200);
  check('seller earnings expose ledger totals', Boolean(earnings.body?.totals));

  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const admin = new Client();
    expectStatus('admin login', await admin.post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }), 200);
    expectStatus('admin overview', await admin.get('/api/admin/overview'), 200);
    expectStatus('admin order search', await admin.get('/api/admin/orders?q=' + encodeURIComponent(orderNumber)), 200);
    expectStatus('admin settlement list', await admin.get('/api/admin/settlements'), 200);

    const periodEnd = new Date(Date.now() + 60_000).toISOString();
    const periodStart = new Date(Date.now() - 86_400_000).toISOString();
    const settlement = await admin.post('/api/admin/settlements', { sellerId, periodStart, periodEnd });
    check(
      'settlement is refused while funds are still in the availability window',
      settlement.status === 400,
      `expected 400, got ${settlement.status}: ${settlement.text.slice(0, 200)}`,
    );
  } else {
    console.log('SKIP  admin checks — set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to enable them.');
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nSmoke test aborted: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
