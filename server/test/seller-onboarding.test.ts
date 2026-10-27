import fs from 'node:fs';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { IDS, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

let app: Express;
let db: Db;
const uploadedFiles: string[] = [];

beforeAll(() => {
  ({ app, db } = setupTestApp());
});

afterAll(() => {
  for (const file of uploadedFiles) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

function applicationData(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Asha Negi',
    phone: '9812345678',
    businessName: 'Asha Weaves',
    sellerType: 'individual',
    sellerCategory: 'artisan_craftsperson',
    tagline: 'Handloom woven at home in Naggar',
    story:
      'I learned to weave on my grandmother\'s loom in Naggar and now weave Kullu wool shawls at home, working with local spinners and natural dyes.',
    region: 'Kullu',
    village: 'Naggar',
    address: {
      line1: '12 Loom Lane',
      line2: '',
      city: 'Naggar',
      state: 'Himachal Pradesh',
      pincode: '175130',
    },
    dispatchSameAsOperating: true,
    categorySlugs: ['test-weaves'],
    productGroups: ['handloom'],
    originNarrative:
      'Every shawl is woven on a traditional pit loom in Naggar using wool spun by two neighbouring families.',
    authenticityDeclaration: true,
    categoryAnswers: { 'prompt-0': 'Woven by hand in Naggar, Kullu district.' },
    gstin: '',
    panLast4: '1234',
    fssaiNumber: '',
    udyamNumber: '',
    businessRegistrationNumber: '',
    yearsOperating: 6,
    shipping: {
      dispatchDays: 3,
      packaging: 'Recycled board box with a cloth wrap and a tamper-evident label.',
      shipsAcrossIndia: true,
      coldChain: false,
      notes: '',
    },
    payout: {
      method: 'bank_transfer',
      accountHolderName: 'Asha Negi',
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
      version: '2026-10',
    },
    ...overrides,
  };
}

async function saveDraft(agent: Awaited<ReturnType<typeof login>>, data: Record<string, unknown>, currentStep = 10) {
  return mutate(agent.post('/api/seller/application/draft')).send({ currentStep, data });
}

async function uploadIdProof(agent: Awaited<ReturnType<typeof login>>, docType = 'id_proof') {
  const response = await mutate(agent.post('/api/seller/documents'))
    .field('docType', docType)
    .attach('document', PDF, { filename: `${docType}.pdf`, contentType: 'application/pdf' });
  const doc = queryOne<{ file_path: string }>(db, 'SELECT file_path FROM seller_documents WHERE id = ?', response.body.id);
  if (doc?.file_path) uploadedFiles.push(doc.file_path);
  return response;
}

async function uploadProductImage(agent: Awaited<ReturnType<typeof login>>, productId: string) {
  return mutate(agent.post(`/api/seller/products/${productId}/images`))
    .field('alt', 'A product photograph used by the automated suite')
    .attach('image', JPEG, { filename: 'listing.jpg', contentType: 'image/jpeg' });
}

async function submitCompleteApplication(agent: Awaited<ReturnType<typeof login>>, idempotencyKey = 'submit-once') {
  const draft = await saveDraft(agent, applicationData());
  expect(draft.status).toBe(200);
  const doc = await uploadIdProof(agent);
  expect(doc.status).toBe(201);
  const submitted = await mutate(agent.post('/api/seller/application/submit')).send({
    data: applicationData(),
    idempotencyKey,
  });
  expect(submitted.status).toBe(201);
  return submitted;
}

describe('seller onboarding application', () => {
  it('saves a draft and resumes it with the saved step and content', async () => {
    const applicant = await login(app, 'customer@test.local');
    const saved = await saveDraft(
      applicant,
      { businessName: 'Draft Loom', sellerCategory: 'artisan_craftsperson', region: 'Kullu' },
      5,
    );
    expect(saved.status).toBe(200);
    expect(saved.body.status).toBe('draft');

    const view = await applicant.get('/api/seller/application');
    expect(view.status).toBe(200);
    expect(view.body.exists).toBe(true);
    expect(view.body.application.status).toBe('draft');
    expect(view.body.application.currentStep).toBe(5);
    expect(view.body.application.data.businessName).toBe('Draft Loom');
    expect(view.body.seller.storeStatus).toBe('setup_incomplete');
    expect(view.body.payoutProvider.configured).toBe(false);
  });

  it('saves an initial step 1 draft with empty address and unaccepted agreements', async () => {
    const applicant = await login(app, 'customer@test.local');
    const step1Payload = {
      fullName: 'Shrayas',
      phone: '',
      businessName: '',
      sellerType: 'individual',
      sellerCategory: undefined,
      tagline: '',
      story: '',
      region: '',
      village: '',
      address: { line1: '', line2: '', city: '', state: 'Himachal Pradesh', pincode: '' },
      dispatchAddress: { line1: '', line2: '', city: '', state: 'Himachal Pradesh', pincode: '' },
      dispatchSameAsOperating: true,
      categorySlugs: [],
      productGroups: [],
      originNarrative: '',
      authenticityDeclaration: false,
      categoryAnswers: {},
      gstin: '',
      panLast4: '',
      fssaiNumber: '',
      udyamNumber: '',
      businessRegistrationNumber: '',
      yearsOperating: undefined,
      shipping: { dispatchDays: 0, packaging: '', shipsAcrossIndia: true, coldChain: false, notes: '' },
      payout: { method: 'bank_transfer', accountHolderName: '', accountLast4: '', ifsc: '', upiIdMasked: '', consent: false },
      agreements: { sellerAgreement: false, commissionDisclosure: false, authenticityPolicy: false, privacyPolicy: false, version: '2026.1' },
    };
    const saved = await saveDraft(applicant, step1Payload, 1);
    expect(saved.status).toBe(200);
    expect(saved.body.savedAt).toBeDefined();

    const view = await applicant.get('/api/seller/application');
    expect(view.status).toBe(200);
    expect(view.body.application.currentStep).toBe(1);
    expect(view.body.application.data.fullName).toBe('Shrayas');
  });

  it('offers the full maker structure list, including artisan, farmer and home business', async () => {
    const applicant = await login(app, 'customer@test.local');
    const config = await applicant.get('/api/seller/config');
    expect(config.body.sellerTypes).toEqual(
      expect.arrayContaining([
        'artisan',
        'farmer',
        'home_business',
        'self_help_group',
        'cooperative',
        'proprietorship',
        'partnership',
        'other',
      ]),
    );

    for (const sellerType of ['artisan', 'farmer', 'home_business', 'other']) {
      const saved = await saveDraft(
        applicant,
        { businessName: `Maker ${sellerType}`, sellerCategory: 'home_business', sellerType },
        3,
      );
      expect(saved.status).toBe(200);
      const view = await applicant.get('/api/seller/application');
      expect(view.body.application.sellerType).toBe(sellerType);
    }
  });

  it('rejects an incomplete submission with field-level reasons', async () => {
    const applicant = await login(app, 'customer@test.local');
    await saveDraft(applicant, { businessName: 'Half Done' }, 3);

    const submitted = await mutate(applicant.post('/api/seller/application/submit')).send({
      data: { businessName: 'Half Done' },
    });
    expect(submitted.status).toBe(400);
    expect(submitted.body.error.fields).toMatchObject({
      fullName: expect.any(String),
      sellerCategory: expect.any(String),
    });
    expect(submitted.body.error.fields.story).toBeTruthy();
    expect(submitted.body.error.fields.originNarrative).toBeTruthy();
    expect(submitted.body.error.fields.gstin).toBeUndefined();

    const application = queryOne<{ status: string }>(
      db,
      'SELECT status FROM seller_applications WHERE seller_id = (SELECT id FROM seller_profiles WHERE user_id = ?)',
      IDS.customer,
    );
    expect(application?.status).toBe('draft');
  });

  it('requires FSSAI details for food producers without demanding them from other categories', async () => {
    const applicant = await login(app, 'customer@test.local');
    const foodData = applicationData({
      sellerCategory: 'food_producer',
      productGroups: ['preserves'],
      fssaiNumber: '',
    });
    await saveDraft(applicant, foodData);
    await uploadIdProof(applicant);

    const rejected = await mutate(applicant.post('/api/seller/application/submit')).send({ data: foodData });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.fields.fssaiNumber).toBeTruthy();
    expect(rejected.body.error.fields['documents.fssai']).toBeTruthy();
    expect(rejected.body.error.fields.gstin).toBeUndefined();

    const fssaiDoc = await uploadIdProof(applicant, 'fssai');
    expect(fssaiDoc.status).toBe(201);
    const accepted = await mutate(applicant.post('/api/seller/application/submit')).send({
      data: { ...foodData, fssaiNumber: '12345678901234' },
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body.status).toBe('submitted');
  });

  it('deduplicates a repeated submission and rejects a second distinct submission', async () => {
    const applicant = await login(app, 'customer@test.local');
    const first = await submitCompleteApplication(applicant, 'same-key');

    const replay = await mutate(applicant.post('/api/seller/application/submit')).send({
      data: applicationData(),
      idempotencyKey: 'same-key',
    });
    expect(replay.status).toBe(200);
    expect(replay.body.deduplicated).toBe(true);
    expect(replay.body.applicationId).toBe(first.body.applicationId);

    const duplicate = await mutate(applicant.post('/api/seller/application/submit')).send({
      data: applicationData(),
      idempotencyKey: 'different-key',
    });
    expect(duplicate.status).toBe(409);

    const events = queryAll<{ event: string }>(
      db,
      "SELECT event FROM seller_application_events WHERE application_id = ? AND event = 'application_submitted'",
      first.body.applicationId,
    );
    expect(events).toHaveLength(1);
  });

  it('lets an administrator request changes and accepts a resubmission as a new revision', async () => {
    const applicant = await login(app, 'customer@test.local');
    const submitted = await submitCompleteApplication(applicant, 'rev-1');

    const admin = await login(app, 'admin@test.local');
    const changed = await mutate(admin.post(`/api/admin/sellers/${submitted.body.sellerId}/decision`)).send({
      decision: 'request_changes',
      reason: 'Please add clearer photographs of the loom and a valid address proof.',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.status).toBe('changes_requested');

    const view = await applicant.get('/api/seller/application');
    expect(view.body.application.status).toBe('changes_requested');
    expect(view.body.application.rejectionReason).toContain('address proof');
    expect(view.body.seller.status).toBe('more_info_required');

    const resubmitted = await mutate(applicant.post('/api/seller/application/submit')).send({
      data: applicationData({ tagline: 'Updated after review feedback' }),
      idempotencyKey: 'rev-2',
    });
    expect(resubmitted.status).toBe(201);
    expect(resubmitted.body.revision).toBe(2);
    expect(resubmitted.body.status).toBe('submitted');
  });

  it('records approval, store activation, notifications and an audit trail', async () => {
    const applicant = await login(app, 'customer@test.local');
    const submitted = await submitCompleteApplication(applicant, 'approve-me');

    const admin = await login(app, 'admin@test.local');
    const started = await mutate(admin.post(`/api/admin/sellers/${submitted.body.sellerId}/decision`)).send({
      decision: 'start_review',
    });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('under_review');

    const approved = await mutate(admin.post(`/api/admin/sellers/${submitted.body.sellerId}/decision`)).send({
      decision: 'approve',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');

    const record = queryOne<{ status: string; store_status: string; approved_at: string | null }>(
      db,
      'SELECT status, store_status, approved_at FROM seller_profiles WHERE id = ?',
      submitted.body.sellerId,
    );
    expect(record?.status).toBe('approved');
    expect(record?.store_status).toBe('active');
    expect(record?.approved_at).toBeTruthy();

    const sellerView = await applicant.get('/api/seller/application');
    expect(sellerView.body.application.status).toBe('approved');
    expect(sellerView.body.checklist.some((item: { id: string; status: string }) => item.id === 'account' && item.status === 'complete')).toBe(true);
    expect(sellerView.body.events.map((event: { event: string }) => event.event)).toEqual(
      expect.arrayContaining(['admin_start_review', 'admin_approve']),
    );

    const notification = queryOne<{ title: string }>(
      db,
      "SELECT title FROM seller_notifications WHERE seller_id = ? AND type = 'application_approved' LIMIT 1",
      submitted.body.sellerId,
    );
    expect(notification?.title).toContain('approved');

    const auditEntry = queryOne<{ action: string; actor_email: string }>(
      db,
      "SELECT action, actor_email FROM audit_logs WHERE entity_type = 'seller' AND entity_id = ? AND action = 'seller.approve'",
      submitted.body.sellerId,
    );
    expect(auditEntry?.actor_email).toBe('admin@test.local');

    // Re-verification starts a new review but must not take a trading seller
    // offline; they still need access to fulfil orders while evidence is checked.
    const withoutReason = await mutate(admin.post(`/api/admin/sellers/${submitted.body.sellerId}/decision`)).send({
      decision: 'request_reverification',
    });
    expect(withoutReason.status).toBe(400);

    const reverify = await mutate(admin.post(`/api/admin/sellers/${submitted.body.sellerId}/decision`)).send({
      decision: 'request_reverification',
      reason: 'Annual review of the updated business registration certificate.',
    });
    expect(reverify.status).toBe(200);
    expect(reverify.body.status).toBe('under_review');

    const duringReview = queryOne<{ status: string; store_status: string }>(
      db,
      'SELECT status, store_status FROM seller_profiles WHERE id = ?',
      submitted.body.sellerId,
    );
    expect(duringReview).toMatchObject({ status: 'approved', store_status: 'active' });
    expect((await applicant.get('/api/seller/dashboard')).status).toBe(200);

    const reapproved = await mutate(admin.post(`/api/admin/sellers/${submitted.body.sellerId}/decision`)).send({
      decision: 'approve',
    });
    expect(reapproved.status).toBe(200);
    expect(reapproved.body.status).toBe('approved');
  });

  it('prevents administrators from approving their own application and refuses invalid transitions', async () => {
    execute(
      db,
      `INSERT INTO seller_profiles (id, user_id, business_name, slug, seller_type, seller_category, status, store_status, payout_status)
       VALUES ('sel_admin_owned', ?, 'Admin Owned', 'admin-owned', 'individual', 'artisan_craftsperson', 'submitted', 'pending_activation', 'not_started')`,
      IDS.admin,
    );
    execute(
      db,
      `INSERT INTO seller_applications (id, seller_id, status, revision, current_step, business_name, seller_type, submitted_at)
       VALUES ('app_admin_owned', 'sel_admin_owned', 'submitted', 1, 10, 'Admin Owned', 'individual', ?)`,
      new Date().toISOString(),
    );

    const admin = await login(app, 'admin@test.local');
    const selfApproval = await mutate(admin.post('/api/admin/sellers/sel_admin_owned/decision')).send({
      decision: 'approve',
    });
    expect(selfApproval.status).toBe(403);

    const applicant = await login(app, 'customer@test.local');
    await saveDraft(applicant, applicationData(), 4);
    const sellerId = queryOne<{ id: string }>(db, 'SELECT id FROM seller_profiles WHERE user_id = ?', IDS.customer)?.id;
    const invalid = await mutate(admin.post(`/api/admin/sellers/${sellerId}/decision`)).send({ decision: 'approve' });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe('conflict');
    expect(invalid.body.error.message).toContain('not been submitted');
  });

  it('keeps verification documents private to the owner and administrators', async () => {
    const applicant = await login(app, 'customer@test.local');
    await saveDraft(applicant, applicationData());
    const upload = await uploadIdProof(applicant);
    const documentId = upload.body.id as string;

    const otherCustomer = await login(app, 'other@test.local');
    expect((await otherCustomer.get(`/api/seller/documents/${documentId}/file`)).status).toBe(404);

    const otherSeller = await login(app, 'seller2@test.local');
    expect((await otherSeller.get(`/api/seller/documents/${documentId}/file`)).status).toBe(404);

    expect((await applicant.get(`/api/seller/documents/${documentId}/file`)).status).toBe(200);

    const admin = await login(app, 'admin@test.local');
    const adminView = await admin.get(`/api/admin/seller-documents/${documentId}/file`);
    expect(adminView.status).toBe(200);
    expect(String(adminView.headers['cache-control'])).toContain('no-store');
  });

  it('denies customer and cross-seller access to seller and admin workspaces', async () => {
    const customer = await login(app, 'customer@test.local');
    expect((await customer.get('/api/seller/dashboard')).status).toBe(403);
    expect((await customer.get(`/api/admin/sellers/${IDS.seller}`)).status).toBe(403);

    const otherSeller = await login(app, 'seller2@test.local');
    expect((await otherSeller.get(`/api/seller/products/${IDS.product}`)).status).toBe(404);
    const patch = await mutate(otherSeller.patch(`/api/seller/products/${IDS.product}`)).send({ name: 'Hijacked listing' });
    expect(patch.status).toBe(404);
  });
});

describe('seller product moderation', () => {
  it('keeps unapproved listings private, supports changes and publishes only after approval', async () => {
    const seller = await login(app, 'seller@test.local');
    const created = await mutate(seller.post('/api/seller/products')).send({
      name: 'Handwoven Test Runner',
      categoryId: IDS.category,
      shortDescription: 'A handwoven table runner in natural Kullu wool.',
      description:
        'A handwoven table runner made from locally spun wool on a traditional loom. The colour is derived from natural dyes and each piece is finished by hand.',
      pricePaise: 250_000,
      sku: 'TEST-RUNNER-1',
      unit: 'piece',
      weightG: 450,
      materials: 'Handspun Kullu wool',
      region: 'Kullu',
      originPlace: 'Naggar',
    });
    expect(created.status).toBe(201);
    const productId = created.body.id as string;

    const image = await mutate(seller.post(`/api/seller/products/${productId}/images`))
      .field('alt', 'A folded handwoven runner on a plain background')
      .attach('image', JPEG, { filename: 'runner.jpg', contentType: 'image/jpeg' });
    expect(image.status).toBe(201);

    const submitted = await mutate(seller.post(`/api/seller/products/${productId}/submit`)).send({});
    expect(submitted.status).toBe(200);

    // Fetch without a session cookie: the public catalogue is anonymous.
    const anonymous = request(app);
    const hidden = await anonymous.get(`/api/products/${created.body.slug}`);
    expect(hidden.status).toBe(404);

    execute(
      db,
      `INSERT INTO seller_applications (id, seller_id, status, revision, current_step, business_name, seller_type, submitted_at, reviewed_at)
       VALUES ('app_fixture_primary', ?, 'approved', 1, 10, 'Test Loom', 'individual', ?, ?)`,
      IDS.seller,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const admin = await login(app, 'admin@test.local');
    const changes = await mutate(admin.post(`/api/admin/products/${productId}/decision`)).send({
      decision: 'request_changes',
      reason: 'Add a close-up photograph showing the weave and the finished hem.',
    });
    expect(changes.status).toBe(200);

    const sellerProduct = await seller.get(`/api/seller/products/${productId}`);
    expect(sellerProduct.body.product.workflowStatus).toBe('changes_requested');
    expect(sellerProduct.body.product.moderationNote).toContain('close-up');

    const resubmitted = await mutate(seller.post(`/api/seller/products/${productId}/submit`)).send({});
    expect(resubmitted.status).toBe(200);

    const approved = await mutate(admin.post(`/api/admin/products/${productId}/decision`)).send({
      decision: 'approve',
      originVerified: true,
    });
    expect(approved.status).toBe(200);

    const visible = await anonymous.get(`/api/products/${created.body.slug}`);
    expect(visible.status).toBe(200);

    const suspended = await mutate(admin.post(`/api/admin/sellers/${IDS.seller}/decision`)).send({
      decision: 'suspend',
      reason: 'Repeated late dispatch reports need investigation before trade continues.',
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.status).toBe('suspended');

    const paused = queryOne<{ status: string }>(db, 'SELECT status FROM products WHERE id = ?', productId);
    expect(paused?.status).toBe('paused');
    expect((await anonymous.get(`/api/products/${created.body.slug}`)).status).toBe(404);
  });

  it('requires food information for a food-category listing before submission and approval', async () => {
    execute(
      db,
      "INSERT INTO categories (id, name, slug, description, sort_order) VALUES ('cat_food_test', 'Test Tea', 'tea-and-infusions', 'Test food category', 2)",
    );
    const seller = await login(app, 'seller@test.local');
    const payload = {
      name: 'Test Orthodox Tea',
      categoryId: 'cat_food_test',
      shortDescription: 'A small-batch orthodox tea from a high-altitude garden.',
      description:
        'A small-batch orthodox tea grown on a high-altitude family garden, hand-plucked in the first flush and withered slowly before rolling and drying.',
      pricePaise: 45_000,
      sku: 'TEST-TEA-1',
      unit: 'pack',
      weightG: 250,
      materials: 'Orthodox tea leaves',
    };
    const created = await mutate(seller.post('/api/seller/products')).send(payload);
    expect(created.status).toBe(201);
    const productId = created.body.id as string;
    expect((await uploadProductImage(seller, productId)).status).toBe(201);

    const missing = await mutate(seller.post(`/api/seller/products/${productId}/submit`)).send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields).toMatchObject({
      'compliance.fssaiLicense': expect.any(String),
      'compliance.ingredients': expect.any(String),
      'compliance.allergenInfo': expect.any(String),
      'compliance.shelfLife': expect.any(String),
      'compliance.storage': expect.any(String),
    });
    expect(missing.body.error.fields.materials).toBeUndefined();

    const updated = await mutate(seller.patch(`/api/seller/products/${productId}`)).send({
      ...payload,
      compliance: {
        fssaiLicense: '12345678901234',
        ingredients: 'Orthodox black tea leaves',
        allergenInfo: 'None known',
        shelfLife: '18 months from packing',
        storage: 'Store airtight away from light and moisture',
      },
    });
    expect(updated.status).toBe(200);

    const submitted = await mutate(seller.post(`/api/seller/products/${productId}/submit`)).send({});
    expect(submitted.status).toBe(200);

    const admin = await login(app, 'admin@test.local');
    const approved = await mutate(admin.post(`/api/admin/products/${productId}/decision`)).send({
      decision: 'approve',
      originVerified: true,
    });
    expect(approved.status).toBe(200);
  });
});

describe('applicant withdrawal and seller review access', () => {
  it('submits without payout details and does not create a payout requirement', async () => {
    const applicant = await login(app, 'customer@test.local');
    const data: Record<string, unknown> = { ...applicationData() };
    delete data.payout;

    const draft = await saveDraft(applicant, data);
    expect(draft.status).toBe(200);
    expect((await uploadIdProof(applicant)).status).toBe(201);

    const submitted = await mutate(applicant.post('/api/seller/application/submit')).send({
      data,
      idempotencyKey: 'no-payout',
    });
    expect(submitted.status).toBe(201);

    const view = await applicant.get('/api/seller/application');
    expect(view.body.application.status).toBe('submitted');
    expect(view.body.checklist.some((item: { id: string }) => item.id === 'payout')).toBe(false);
    const seller = queryOne<{ payout_status: string }>(
      db,
      'SELECT payout_status FROM seller_profiles WHERE id = ?',
      submitted.body.sellerId,
    );
    expect(seller?.payout_status).toBe('not_started');
    expect(view.body.payoutProvider.configured).toBe(false);
  });

  it('withdraws a submitted application, preserves its history and starts a fresh draft', async () => {
    const applicant = await login(app, 'customer@test.local');
    const submitted = await submitCompleteApplication(applicant, 'withdraw-me');
    const sellerId = submitted.body.sellerId as string;
    const applicationId = submitted.body.applicationId as string;

    const before = await applicant.get('/api/seller/application');
    expect(before.body.canWithdraw).toBe(true);

    const withdrawn = await mutate(applicant.post('/api/seller/application/withdraw')).send({
      reason: 'Pausing the workshop for the winter.',
    });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.status).toBe('withdrawn');
    expect(withdrawn.body.previousStatus).toBe('submitted');

    const profile = queryOne<{ status: string; store_status: string }>(
      db,
      'SELECT status, store_status FROM seller_profiles WHERE id = ?',
      sellerId,
    );
    expect(profile).toMatchObject({ status: 'draft', store_status: 'setup_incomplete' });

    const record = queryOne<{ status: string; rejection_reason: string }>(
      db,
      'SELECT status, rejection_reason FROM seller_applications WHERE id = ?',
      applicationId,
    );
    expect(record?.status).toBe('withdrawn');
    expect(record?.rejection_reason).toContain('winter');

    expect(
      queryOne(
        db,
        "SELECT 1 FROM seller_application_events WHERE application_id = ? AND event = 'application_withdrawn'",
        applicationId,
      ),
    ).toBeTruthy();
    expect(
      queryOne(
        db,
        "SELECT 1 FROM seller_notifications WHERE seller_id = ? AND type = 'application_withdrawn'",
        sellerId,
      ),
    ).toBeTruthy();

    const view = await applicant.get('/api/seller/application');
    expect(view.body.application.status).toBe('withdrawn');
    expect(view.body.canWithdraw).toBe(false);

    // The withdrawn row is closed; saving a draft creates a new application.
    const restarted = await saveDraft(applicant, applicationData({ businessName: 'Asha Weaves Again' }));
    expect(restarted.status).toBe(200);
    const applications = queryAll<{ status: string }>(
      db,
      'SELECT status FROM seller_applications WHERE seller_id = ? ORDER BY created_at, rowid',
      sellerId,
    );
    expect(applications.map((row) => row.status)).toEqual(['withdrawn', 'draft']);
  });

  it('refuses withdrawal after approval and never targets another seller', async () => {
    execute(
      db,
      `INSERT INTO seller_applications
         (id, seller_id, status, revision, current_step, business_name, seller_type, submitted_at, reviewed_at)
       VALUES ('app_approved_withdraw', ?, 'approved', 1, 10, 'Test Loom', 'individual', ?, ?)`,
      IDS.seller,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const seller = await login(app, 'seller@test.local');
    const refused = await mutate(seller.post('/api/seller/application/withdraw')).send({ sellerId: IDS.seller2 });
    expect(refused.status).toBe(409);
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM seller_applications WHERE id = ?', 'app_approved_withdraw')?.status).toBe('approved');

    const other = await login(app, 'seller2@test.local');
    const noApplication = await mutate(other.post('/api/seller/application/withdraw')).send({ sellerId: IDS.seller });
    expect(noApplication.status).toBe(400);
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM seller_applications WHERE id = ?', 'app_approved_withdraw')?.status).toBe('approved');
  });

  it('paginates and filters the seller review list, including the application reference', async () => {
    execute(
      db,
      `INSERT INTO seller_profiles
         (id, user_id, business_name, slug, seller_type, seller_category, region, status, store_status, payout_status)
       VALUES ('sel_filter_orchard', ?, 'Filter Orchard', 'filter-orchard', 'partnership', 'farmer_grower',
               'Lahaul-Spiti', 'submitted', 'pending_activation', 'not_started')`,
      IDS.otherCustomer,
    );
    execute(
      db,
      `INSERT INTO seller_applications
         (id, seller_id, status, revision, current_step, business_name, seller_type, seller_category, submitted_at)
       VALUES ('app_filter_ref', 'sel_filter_orchard', 'submitted', 2, 10, 'Filter Orchard', 'partnership',
               'farmer_grower', ?)`,
      new Date().toISOString(),
    );
    const admin = await login(app, 'admin@test.local');

    const paged = await admin.get('/api/admin/sellers?page=1&pageSize=1');
    expect(paged.status).toBe(200);
    expect(paged.body.sellers).toHaveLength(1);
    expect(paged.body.pageSize).toBe(1);
    expect(paged.body.total).toBeGreaterThanOrEqual(3);
    expect(paged.body.totalPages).toBe(paged.body.total);

    const byReference = await admin.get('/api/admin/sellers?q=app_filter_ref');
    expect(byReference.body.sellers).toHaveLength(1);
    expect(byReference.body.sellers[0].id).toBe('sel_filter_orchard');
    expect(byReference.body.sellers[0].application_id).toBe('app_filter_ref');
    expect(byReference.body.sellers[0].application_revision).toBe(2);

    const byFilters = await admin.get('/api/admin/sellers?sellerCategory=farmer_grower&region=Lahaul-Spiti');
    expect(byFilters.body.sellers.map((row: { id: string }) => row.id)).toEqual(['sel_filter_orchard']);
    expect(byFilters.body.filters.seller_category).toContain('farmer_grower');
    expect(byFilters.body.filters.region).toContain('Lahaul-Spiti');
  });

  it('hides approved listings when the maker store is not active', async () => {
    const anonymous = request(app);
    expect((await anonymous.get('/api/products/test-shawl')).status).toBe(200);
    expect((await anonymous.get('/api/sellers/test-loom')).status).toBe(200);

    execute(db, "UPDATE seller_profiles SET store_status = 'suspended' WHERE id = ?", IDS.seller);
    expect((await anonymous.get('/api/products/test-shawl')).status).toBe(404);
    expect((await anonymous.get('/api/sellers/test-loom')).status).toBe(404);

    execute(db, "UPDATE seller_profiles SET store_status = 'active' WHERE id = ?", IDS.seller);
    expect((await anonymous.get('/api/products/test-shawl')).status).toBe(200);
    expect((await anonymous.get('/api/sellers/test-loom')).status).toBe(200);
  });

  it('audits administrator document access and keeps private files away from other sellers', async () => {
    const applicant = await login(app, 'customer@test.local');
    expect((await saveDraft(applicant, applicationData())).status).toBe(200);
    const uploaded = await uploadIdProof(applicant, 'address_proof');
    expect(uploaded.status).toBe(201);
    const docId = uploaded.body.id as string;

    const owner = await applicant.get(`/api/seller/documents/${docId}/file`);
    expect(owner.status).toBe(200);
    expect(owner.headers['cache-control']).toContain('no-store');

    const admin = await login(app, 'admin@test.local');
    const opened = await admin.get(`/api/admin/seller-documents/${docId}/file`);
    expect(opened.status).toBe(200);
    const auditEntry = queryOne<{ actor_email: string }>(
      db,
      `SELECT actor_email FROM audit_logs
        WHERE entity_type = 'seller_document' AND entity_id = ? AND action = 'seller.document_opened'`,
      docId,
    );
    expect(auditEntry?.actor_email).toBe('admin@test.local');

    const other = await login(app, 'other@test.local');
    expect((await other.get(`/api/admin/seller-documents/${docId}/file`)).status).toBe(403);
    expect((await other.get(`/api/seller/documents/${docId}/file`)).status).toBe(404);
  });
});
