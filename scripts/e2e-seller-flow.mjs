#!/usr/bin/env node
/**
 * Live end-to-end seller lifecycle test against a running PAHADI ROOTS API.
 *
 * Exercises the real HTTP surface only:
 *   customer registration -> email verification -> seller wizard draft ->
 *   private document upload -> application submit -> admin approval ->
 *   product draft -> image upload -> stock -> submit -> admin moderation ->
 *   public catalogue/storefront visibility -> customer cart access.
 *
 * Requirements:
 *   - A running API at SMOKE_BASE_URL (default http://localhost:8787).
 *   - A verified customer account can be created (dev auth helpers enabled).
 *   - Admin credentials in E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 *   - ALLOW_DEV_AUTH_HELPERS=true so registration returns a verification URL.
 *
 * This script creates real records. Point it at a disposable development DB and
 * disposable UPLOAD_DIR / PRIVATE_DOCS_DIR directories, then remove them.
 */
import crypto from 'node:crypto';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:8787';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

class Client {
  cookies = new Map();

  headers(extra = {}) {
    const headers = { 'x-requested-with': 'pahadi-roots', ...extra };
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    return headers;
  }

  captureCookies(response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  async request(method, path, body) {
    const headers = this.headers(body === undefined ? {} : { 'content-type': 'application/json' });
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    this.captureCookies(response);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON responses are reported through `text` when an assertion fails.
    }
    return { status: response.status, body: json, text };
  }

  async upload(path, fields, fileField, buffer, filename, mimeType) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append(fileField, new Blob([buffer], { type: mimeType }), filename);
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
      redirect: 'manual',
    });
    this.captureCookies(response);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }
    return { status: response.status, body: json, text };
  }

  get(path) {
    return this.request('GET', path);
  }

  post(path, body = {}) {
    return this.request('POST', path, body);
  }
}

let checks = 0;
let failures = 0;

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
    `got ${response.status}: ${response.text.slice(0, 400)}`,
  );
  return response;
}

function must(label, condition, detail) {
  if (!condition) throw new Error(`${label}${detail ? ` — ${detail}` : ''}`);
}

const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the seller lifecycle test.');
  }

  console.log(`PAHADI ROOTS seller lifecycle E2E against ${BASE}`);

  const publicClient = new Client();
  const health = expectStatus('health endpoint', await publicClient.get('/api/health'), 200);
  must('database is up', health.body?.database === 'up');

  const categoriesResponse = expectStatus('public categories', await publicClient.get('/api/categories'), 200);
  const category = (categoriesResponse.body?.categories ?? [])[0];
  must('at least one active category exists', Boolean(category?.slug));

  // 1. Register and verify a new seller account
  const sellerEmail = `e2e-seller-${stamp}@demo.pahadiroots.test`;
  const sellerPassword = 'E2eSeller!2026';
  const seller = new Client();
  const registration = expectStatus(
    'seller account registration',
    await seller.post('/api/auth/register', {
      fullName: 'E2E Mountain Maker',
      email: sellerEmail,
      password: sellerPassword,
      acceptedTerms: true,
    }),
    201,
  );
  check('registration creates a session', registration.body?.user?.email === sellerEmail);
  must('registration returns a dev verification URL', typeof registration.body?.devVerifyUrl === 'string');
  const verifyToken = new URL(registration.body.devVerifyUrl).searchParams.get('token');
  expectStatus('email verification', await seller.post('/api/auth/verify-email', { token: verifyToken }), 200);

  // 2. Save the multi-step application draft
  const businessName = `E2E Mountain Workshop ${stamp.slice(-5)}`;
  const wizard = {
    fullName: 'E2E Mountain Maker',
    phone: '9876501234',
    businessName,
    sellerType: 'individual',
    sellerCategory: 'artisan_craftsperson',
    tagline: 'Small-batch handloom woven in a home workshop.',
    story:
      'I weave small batches of wool textiles at home in Kullu district, using a pit loom and locally purchased yarn. Each piece is finished by hand and inspected before it is packed for a buyer.',
    region: 'Kullu',
    village: 'E2E Village',
    address: {
      line1: '12 Workshop Lane',
      line2: '',
      city: 'Kullu',
      state: 'Himachal Pradesh',
      pincode: '175101',
    },
    dispatchAddress: {
      line1: '12 Workshop Lane',
      line2: '',
      city: 'Kullu',
      state: 'Himachal Pradesh',
      pincode: '175101',
    },
    dispatchSameAsOperating: true,
    categorySlugs: [category.slug],
    productGroups: ['handloom'],
    originNarrative:
      'The yarn is bought locally in Kullu and woven on a wooden pit loom at my home. Pieces are washed, dried in shade, pressed and packed in paper before dispatch.',
    authenticityDeclaration: true,
    categoryAnswers: {
      tradition: 'Kullu handloom weaving',
      materials: 'Local wool yarn',
    },
    gstin: '',
    panLast4: 'ABCD',
    fssaiNumber: '',
    udyamNumber: '',
    businessRegistrationNumber: '',
    yearsOperating: 4,
    shipping: {
      dispatchDays: 3,
      packaging: 'Wrapped in paper, then sealed in a recycled board box.',
      shipsAcrossIndia: true,
      coldChain: false,
      notes: '',
    },
    payout: {
      method: 'bank_transfer',
      accountHolderName: 'E2E Mountain Maker',
      accountLast4: '1234',
      ifsc: 'HDFC0001234',
      upiIdMasked: '',
      consent: true,
    },
    agreements: {
      sellerAgreement: true,
      commissionDisclosure: true,
      authenticityPolicy: true,
      privacyPolicy: true,
      version: 'e2e-2026-01',
    },
  };

  const draft = expectStatus(
    'save seller application draft',
    await seller.post('/api/seller/application/draft', { currentStep: 8, data: wizard }),
    200,
  );
  check('draft records the saved step', draft.body?.currentStep === 8, JSON.stringify(draft.body));
  const applicationId = draft.body?.applicationId;
  must('draft returns an application id', typeof applicationId === 'string');

  const resumed = expectStatus('resume seller application', await seller.get('/api/seller/application'), 200);
  check(
    'resumed draft keeps the business name and step',
    resumed.body?.application?.businessName === businessName && resumed.body?.application?.currentStep === 8,
  );
  const sellerId = resumed.body?.seller?.id;
  const sellerSlug = resumed.body?.seller?.slug;
  must('application exposes the seller id', typeof sellerId === 'string' && typeof sellerSlug === 'string');

  // 3. Upload the required private identity document
  const document = await seller.upload(
    '/api/seller/documents',
    { docType: 'id_proof' },
    'document',
    PNG_1X1,
    'e2e-id.png',
    'image/png',
  );
  expectStatus('private document upload', document, 201);
  const documentId = document.body?.id;
  must('document upload returns an id', typeof documentId === 'string');

  const publicDocumentRead = await publicClient.get(`/api/seller/documents/${documentId}/file`);
  check('document is not public', publicDocumentRead.status === 401 || publicDocumentRead.status === 403);

  // 4. Submit the application idempotently
  const idempotencyKey = `e2e-${stamp}`;
  const submitted = expectStatus(
    'submit seller application',
    await seller.post('/api/seller/application/submit', { data: wizard, idempotencyKey }),
    201,
  );
  check('application status is submitted', submitted.body?.status === 'submitted', JSON.stringify(submitted.body));

  const replay = expectStatus(
    'repeat submission is deduplicated',
    await seller.post('/api/seller/application/submit', { data: wizard, idempotencyKey }),
    200,
  );
  check('repeat submission is marked deduplicated', replay.body?.deduplicated === true);

  const messagesBefore = expectStatus('seller notifications', await seller.get('/api/seller/notifications'), 200);
  check('submission produces a seller notification', (messagesBefore.body?.notifications ?? []).length > 0);

  // 5. Admin approves the seller application
  const admin = new Client();
  expectStatus('admin login', await admin.post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }), 200);

  const reviewQueue = expectStatus('admin seller review queue', await admin.get('/api/admin/sellers?queue=review'), 200);
  const queuedSeller = (reviewQueue.body?.sellers ?? []).find(
    (row) => row.id === sellerId || row.business_name === businessName || row.email === sellerEmail,
  );
  must('new application appears in the admin review queue', Boolean(queuedSeller), businessName);
  check('queued seller id matches the application', queuedSeller.id === sellerId);

  const sellerDetail = expectStatus('admin seller detail', await admin.get(`/api/admin/sellers/${sellerId}`), 200);
  check('admin detail exposes the application', Boolean(sellerDetail.body?.application));

  const privateDoc = await publicClient.get(`/api/admin/seller-documents/${documentId}/file`);
  check('private document is not readable without admin auth', privateDoc.status === 401 || privateDoc.status === 403);

  expectStatus(
    'admin approves seller application',
    await admin.post(`/api/admin/sellers/${sellerId}/decision`, {
      decision: 'approve',
      reason: 'E2E verification complete.',
      idempotencyKey: `${idempotencyKey}-approve`,
    }),
    200,
  );

  const sellerProfile = expectStatus('approved seller profile', await seller.get('/api/seller/profile'), 200);
  check(
    'seller account is active after approval',
    sellerProfile.body?.profile?.status === 'approved' && sellerProfile.body?.profile?.storeStatus === 'active',
    JSON.stringify(sellerProfile.body?.profile),
  );

  const publicStorefront = expectStatus('public maker storefront', await publicClient.get(`/api/sellers/${sellerSlug}`), 200);
  check('approved storefront is publicly visible', publicStorefront.body?.seller?.name === businessName);

  // 6. Create a product draft and upload a real image file
  const productName = `E2E Handwoven Shawl ${stamp.slice(-4)}`;
  const createdProduct = expectStatus(
    'create product draft',
    await seller.post('/api/seller/products', {
      name: productName,
      categoryId: category.id,
      shortDescription: 'A handwoven wool shawl from a Kullu home workshop.',
      description:
        'This shawl is woven on a wooden pit loom in a home workshop in Kullu district. The wool yarn is bought locally, washed, and finished by hand. The piece is inspected before packing and dispatch. No machine production or synthetic blend is used.',
      pricePaise: 249900,
      sku: `E2E-${stamp.slice(-6).toUpperCase()}`,
      unit: 'piece',
      weightG: 450,
      materials: 'Local wool yarn, cotton warp thread',
      careInstructions: 'Dry clean or hand wash cold. Dry in shade. Store folded away from direct sun.',
      originPlace: 'E2E Village, Kullu',
      region: 'Kullu',
      varietyGrade: 'Handloom',
      harvestInfo: 'Woven in small batches',
      dispatchConditions: 'Packed in paper and a recycled board box',
      attributes: { Weave: 'Pit loom', Fibre: 'Local wool' },
    }),
    201,
  );
  const productId = createdProduct.body?.id;
  const productSlug = createdProduct.body?.slug;
  must('product creation returns an id and slug', typeof productId === 'string' && typeof productSlug === 'string');
  check('new product starts as draft', createdProduct.body?.status === 'draft');

  const hiddenBeforeApproval = await publicClient.get(`/api/products/${productSlug}`);
  check('draft product is not public', hiddenBeforeApproval.status === 404, `got ${hiddenBeforeApproval.status}`);

  const image = await seller.upload(
    `/api/seller/products/${productId}/images`,
    { alt: 'Handwoven wool shawl photographed on a plain background' },
    'image',
    PNG_1X1,
    'e2e-shawl.png',
    'image/png',
  );
  expectStatus('product image upload', image, 201);

  expectStatus(
    'set product stock',
    await seller.post(`/api/seller/inventory/${productId}`, { quantity: 8, lowStockThreshold: 2 }),
    200,
  );

  expectStatus(
    'submit product for moderation',
    await seller.post(`/api/seller/products/${productId}/submit`),
    200,
  );

  const stillHidden = await publicClient.get(`/api/products/${productSlug}`);
  check('pending product is not public', stillHidden.status === 404, `got ${stillHidden.status}`);

  // 7. Admin approves the product (second approval gate)
  const adminProduct = expectStatus('admin product detail', await admin.get(`/api/admin/products/${productId}`), 200);
  check('admin sees the pending product', adminProduct.body?.product?.status === 'pending');

  expectStatus(
    'admin approves product listing',
    await admin.post(`/api/admin/products/${productId}/decision`, {
      decision: 'approve',
      originVerified: false,
      taxRateBp: 500,
    }),
    200,
  );

  const repeatDecision = await admin.post(`/api/admin/products/${productId}/decision`, {
    decision: 'approve',
    originVerified: false,
  });
  check('repeat moderation decision is refused', repeatDecision.status === 409, `got ${repeatDecision.status}`);

  const publicProduct = expectStatus('public product detail', await publicClient.get(`/api/products/${productSlug}`), 200);
  check('approved product is publicly visible', publicProduct.body?.product?.id === productId);
  check('public product exposes real seller logo fields', 'logoUrl' in (publicProduct.body?.product?.seller ?? {}));
  check('public product has no private seller fields', !('gstin' in (publicProduct.body?.product?.seller ?? {})) && !('email' in (publicProduct.body?.product?.seller ?? {})));

  const shelf = expectStatus('public catalogue search', await publicClient.get(`/api/products?q=${encodeURIComponent(productName)}`), 200);
  check('approved product appears in search', (shelf.body?.items ?? []).some((item) => item.id === productId));

  const sellerStore = expectStatus('approved maker catalogue', await publicClient.get(`/api/sellers/${sellerSlug}`), 200);
  check('approved product appears on maker storefront', (sellerStore.body?.products?.items ?? []).some((item) => item.id === productId));

  // 8. A customer can add the newly approved product to a cart
  const customerEmail = `e2e-buyer-${stamp}@demo.pahadiroots.test`;
  const customer = new Client();
  expectStatus(
    'buyer registration',
    await customer.post('/api/auth/register', {
      fullName: 'E2E Buyer',
      email: customerEmail,
      password: 'E2eBuyer!2026',
      acceptedTerms: true,
    }),
    201,
  );
  const cart = expectStatus(
    'add approved product to cart',
    await customer.post('/api/cart/items', { productId, quantity: 1 }),
    201,
  );
  check('cart contains the approved product', (cart.body?.cart?.lines ?? []).some((line) => line.productId === productId));

  // 9. Seller notifications record both approvals
  const notifications = expectStatus('seller notifications after moderation', await seller.get('/api/seller/notifications'), 200);
  const types = (notifications.body?.notifications ?? []).map((item) => item.type);
  check('seller is notified of seller approval', types.some((type) => type.includes('approve') && type.includes('application')) || types.includes('seller_approve'), JSON.stringify(types));
  check('seller is notified of product approval', types.some((type) => type.includes('product_approve')), JSON.stringify(types));

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nSeller lifecycle E2E aborted: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
