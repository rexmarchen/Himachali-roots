import fs from 'node:fs';
import type { Express } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { resolvePrivateDocPath, deletePrivateDoc } from '../lib/uploads.js';
import { IDS, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
  0x34, 0x25, 0xa4, 0x00, 0x03, 0x70, 0x00, 0xfe, 0xfb, 0xfd, 0x50, 0x00,
]);

let app: Express;
let db: Db;
const createdFiles: string[] = [];

beforeAll(() => {
  ({ app, db } = setupTestApp());
});

afterAll(() => {
  for (const file of createdFiles) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
  }
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

function validMakerData(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Vikram Thakur',
    phone: '9816000000',
    businessName: 'Thakur Wild Honey',
    sellerType: 'farmer',
    sellerCategory: 'food_producer',
    tagline: 'Raw wild forest honey gathered in the pristine Shimla hills',
    story:
      'We have maintained traditional forest apiaries across three generations in the deodar belts of Shimla, never heating or ultrafiltering our honey.',
    region: 'Shimla',
    village: 'Kotkhai',
    address: { line1: 'Village Post Kotkhai', line2: '', city: 'Shimla', state: 'Himachal Pradesh', pincode: '171202' },
    dispatchSameAsOperating: true,
    categorySlugs: ['honey-preserves'],
    productGroups: ['honey'],
    originNarrative:
      'Harvested directly from wild cedar groves in Kotkhai valley, settled by gravity and bottled raw on our orchard property.',
    authenticityDeclaration: true,
    categoryAnswers: { 'prompt-0': 'Gathered in high-altitude cedar forests in Kotkhai.' },
    gstin: '',
    panLast4: '5566',
    fssaiNumber: '10012345678901',
    udyamNumber: '',
    businessRegistrationNumber: '',
    yearsOperating: 4,
    shipping: { dispatchDays: 2, packaging: 'Glass jar nestled in foam with double corrugated outer packaging.', shipsAcrossIndia: true, coldChain: false, notes: '' },
    payout: { method: 'bank_transfer', accountHolderName: 'Vikram Thakur', accountLast4: '9988', ifsc: 'SBIN0001234', upiIdMasked: '', consent: true },
    agreements: { sellerAgreement: true, commissionDisclosure: true, authenticityPolicy: true, privacyPolicy: true, version: '2026-10' },
    ...overrides,
  };
}

describe('Production Seller KYC & Document Verification System', () => {
  it('1. registers a new seller account and authenticates session', async () => {
    const applicant = await login(app, 'customer@test.local');
    const profile = await applicant.get('/api/auth/me');
    expect(profile.status).toBe(200);
    expect(profile.body.user.email).toBe('customer@test.local');
    expect(profile.body.user.roles).toContain('customer');
  });

  it('2. auto-provisions seller profile and draft application when uploading document directly at Step 6', async () => {
    const applicant = await login(app, 'customer@test.local');
    
    // Ensure no prior seller_profile or seller_application exists for this user
    execute(db, 'DELETE FROM seller_applications WHERE seller_id IN (SELECT id FROM seller_profiles WHERE user_id = ?)', IDS.customer);
    execute(db, 'DELETE FROM seller_profiles WHERE user_id = ?', IDS.customer);

    const uploadRes = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'aadhaar_front.pdf', contentType: 'application/pdf' });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.id).toBeTruthy();
    expect(uploadRes.body.docType).toBe('id_proof');
    expect(uploadRes.body.originalName).toBe('aadhaar_front.pdf');

    // Verify auto-created profile and application
    const profile = queryOne<{ id: string }>(db, 'SELECT id FROM seller_profiles WHERE user_id = ?', IDS.customer);
    expect(profile).toBeTruthy();
    const appRecord = queryOne<{ status: string }>(db, 'SELECT status FROM seller_applications WHERE seller_id = ?', profile!.id);
    expect(appRecord?.status).toBe('draft');

    const docRecord = queryOne<{ storage_key: string; file_path: string; sha256: string }>(
      db,
      'SELECT storage_key, file_path, sha256 FROM seller_documents WHERE id = ?',
      uploadRes.body.id,
    );
    expect(docRecord?.storage_key).toBeTruthy();
    expect(docRecord?.sha256).toBeTruthy();
    if (docRecord?.file_path) createdFiles.push(docRecord.file_path);
  });

  it('3. accepts PDF, JPEG, PNG, and modern WebP document formats', async () => {
    const applicant = await login(app, 'customer@test.local');

    const formats = [
      { type: 'id_proof', file: PDF, name: 'passport.pdf', mime: 'application/pdf' },
      { type: 'address_proof', file: JPEG, name: 'electricity_bill.jpg', mime: 'image/jpeg' },
      { type: 'business_registration', file: PNG, name: 'udyam.png', mime: 'image/png' },
      { type: 'gst_certificate', file: WEBP, name: 'gst_cert.webp', mime: 'image/webp' },
    ];

    for (const fmt of formats) {
      const res = await mutate(applicant.post('/api/seller/documents'))
        .field('docType', fmt.type)
        .attach('document', fmt.file, { filename: fmt.name, contentType: fmt.mime });

      expect(res.status).toBe(201);
      expect(res.body.docType).toBe(fmt.type);
      expect(res.body.originalName).toBe(fmt.name);

      const doc = queryOne<{ storage_key: string; file_path: string }>(
        db,
        'SELECT storage_key, file_path FROM seller_documents WHERE id = ?',
        res.body.id,
      );
      if (doc?.file_path) createdFiles.push(doc.file_path);
    }
  });

  it('4. rejects disguised executables and invalid file signatures', async () => {
    const applicant = await login(app, 'customer@test.local');

    const fakeJpg = Buffer.from('<?php echo "evil"; ?>');
    const res = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', fakeJpg, { filename: 'malware.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('valid PDF, JPEG, PNG, or WebP');
  });

  it('5. rejects oversized files exceeding the 5 MB limit', async () => {
    const applicant = await login(app, 'customer@test.local');

    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024);
    PDF.copy(largeBuffer, 0);

    const res = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', largeBuffer, { filename: 'oversized.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/too large|5 MB/i);
  });

  it('6. replaces existing document and cleans up previous physical file on disk', async () => {
    const applicant = await login(app, 'customer@test.local');

    const res1 = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'v1.pdf', contentType: 'application/pdf' });
    expect(res1.status).toBe(201);

    const doc1 = queryOne<{ storage_key: string; file_path: string }>(
      db,
      'SELECT storage_key, file_path FROM seller_documents WHERE id = ?',
      res1.body.id,
    );
    expect(doc1?.storage_key).toBeTruthy();
    const diskPath1 = resolvePrivateDocPath(doc1?.storage_key || doc1?.file_path);
    expect(diskPath1).toBeTruthy();
    expect(fs.existsSync(diskPath1!)).toBe(true);

    const res2 = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', JPEG, { filename: 'v2.jpg', contentType: 'image/jpeg' });
    expect(res2.status).toBe(201);

    const doc2 = queryOne<{ storage_key: string; file_path: string }>(
      db,
      'SELECT storage_key, file_path FROM seller_documents WHERE id = ?',
      res2.body.id,
    );
    const diskPath2 = resolvePrivateDocPath(doc2?.storage_key || doc2?.file_path);
    expect(diskPath2).toBeTruthy();
    createdFiles.push(diskPath2!);

    expect(fs.existsSync(diskPath1!)).toBe(false);
    expect(fs.existsSync(diskPath2!)).toBe(true);

    const oldDbDoc = queryOne(db, 'SELECT id FROM seller_documents WHERE id = ?', res1.body.id);
    expect(oldDbDoc).toBeUndefined();
  });

  it('7. enforces required id_proof before application submission', async () => {
    const applicant = await login(app, 'customer@test.local');
    const data = validMakerData({
      sellerCategory: 'artisan_craftsperson',
      categorySlugs: ['test-weaves'],
      productGroups: ['shawls'],
      fssaiNumber: '',
    });

    const draftRes = await mutate(applicant.post('/api/seller/application/draft')).send({
      currentStep: 10,
      data,
    });
    expect(draftRes.status).toBe(200);

    // Remove any documents
    execute(db, 'DELETE FROM seller_documents WHERE seller_id IN (SELECT id FROM seller_profiles WHERE user_id = ?)', IDS.customer);

    const submitRes = await mutate(applicant.post('/api/seller/application/submit')).send({
      data,
      idempotencyKey: 'vikram-sub-no-docs',
    });
    expect(submitRes.status).toBe(400);
    expect(submitRes.body.error.message).toContain('Government photo identity');

    // Upload required id_proof
    const uploadRes = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'vikram_pan.pdf', contentType: 'application/pdf' });
    expect(uploadRes.status).toBe(201);

    const doc = queryOne<{ storage_key: string; file_path: string }>(
      db,
      'SELECT storage_key, file_path FROM seller_documents WHERE id = ?',
      uploadRes.body.id,
    );
    const diskPath = resolvePrivateDocPath(doc?.storage_key || doc?.file_path);
    if (diskPath) createdFiles.push(diskPath);

    // Resubmit succeeds
    const submitRes2 = await mutate(applicant.post('/api/seller/application/submit')).send({
      data,
      idempotencyKey: 'vikram-sub-with-docs',
    });
    expect(submitRes2.status).toBe(201);
    expect(submitRes2.body.status).toBe('submitted');
  });

  it('8. strictly prevents unauthorized and cross-seller access to private documents', async () => {
    const applicant = await login(app, 'customer@test.local');
    const uploadRes = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'private_id.pdf', contentType: 'application/pdf' });
    expect(uploadRes.status).toBe(201);
    const documentId = uploadRes.body.id;

    // Other seller cannot access it (404)
    const otherSeller = await login(app, 'seller@test.local');
    const otherRes = await otherSeller.get(`/api/seller/documents/${documentId}/file`);
    expect(otherRes.status).toBe(404);

    // Document owner can access it
    const ownerRes = await applicant.get(`/api/seller/documents/${documentId}/file`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.headers['content-type']).toContain('application/pdf');
    expect(ownerRes.headers['cache-control']).toContain('private, no-store');
  });

  it('9. admin dashboard lists seller with document_count, serves file with audit log', async () => {
    const applicant = await login(app, 'customer@test.local');
    const uploadRes = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PNG, { filename: 'voter_card.png', contentType: 'image/png' });
    expect(uploadRes.status).toBe(201);
    const documentId = uploadRes.body.id;

    const admin = await login(app, 'admin@test.local');

    // Admin sellers list includes document_count
    const listRes = await admin.get('/api/admin/sellers');
    expect(listRes.status).toBe(200);
    const sellerRow = listRes.body.sellers.find((s: { email: string }) => s.email === 'customer@test.local');
    expect(sellerRow).toBeDefined();
    expect(sellerRow.document_count).toBeGreaterThanOrEqual(1);

    // Admin seller detail includes documents with fileExists
    const detailRes = await admin.get(`/api/admin/sellers/${sellerRow.id}`);
    expect(detailRes.status).toBe(200);
    const docMeta = detailRes.body.documents.find((d: { id: string }) => d.id === documentId);
    expect(docMeta).toBeDefined();
    expect(docMeta.fileExists).toBe(true);

    // Admin opens document file
    const fileRes = await admin.get(`/api/admin/seller-documents/${documentId}/file`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toContain('image/png');
    expect(fileRes.headers['cache-control']).toContain('private, no-store');

    // Verify audit log recorded
    const auditRecord = queryOne<{ action: string; actor_id: string }>(
      db,
      "SELECT action, actor_id FROM audit_logs WHERE action = 'seller.document_opened' AND entity_id = ?",
      documentId,
    );
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.actor_id).toBe(IDS.admin);
  });

  it('10. admin can accept or reject individual document with reviewer note', async () => {
    const applicant = await login(app, 'customer@test.local');
    const uploadRes = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'blurry_id.pdf', contentType: 'application/pdf' });
    expect(uploadRes.status).toBe(201);
    const documentId = uploadRes.body.id;

    const admin = await login(app, 'admin@test.local');

    // Reject document with note
    const rejectRes = await mutate(admin.post(`/api/admin/seller-documents/${documentId}/status`)).send({
      status: 'rejected',
      note: 'The ID is blurred and text is illegible. Please upload a clear photo or scan.',
    });
    expect(rejectRes.status).toBe(200);

    const docInDb = queryOne<{ status: string; review_note: string; reviewed_by: string }>(
      db,
      'SELECT status, review_note, reviewed_by FROM seller_documents WHERE id = ?',
      documentId,
    );
    expect(docInDb?.status).toBe('rejected');
    expect(docInDb?.review_note).toContain('blurred');
    expect(docInDb?.reviewed_by).toBe(IDS.admin);

    // Now accept document
    const acceptRes = await mutate(admin.post(`/api/admin/seller-documents/${documentId}/status`)).send({
      status: 'accepted',
      note: 'Verified with official records.',
    });
    expect(acceptRes.status).toBe(200);

    const docInDb2 = queryOne<{ status: string; review_note: string }>(
      db,
      'SELECT status, review_note FROM seller_documents WHERE id = ?',
      documentId,
    );
    expect(docInDb2?.status).toBe('accepted');
    expect(docInDb2?.review_note).toBe('Verified with official records.');
  });

  it('11. admin approves application, promoting user to seller role and store to active', async () => {
    const applicant = await login(app, 'customer@test.local');

    // Upload ID proof
    await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'id.pdf', contentType: 'application/pdf' });

    // Submit application
    const data = validMakerData({
      fullName: 'Tara Devi',
      phone: '9816111222',
      businessName: 'Tara Woolens',
      sellerType: 'artisan',
      sellerCategory: 'artisan_craftsperson',
      tagline: 'Authentic Chamba thal and shawls handwoven by master craftswomen',
      story:
        'I have woven traditional Chamba woolens and embroidery for over twenty years, preserving local folk heritage and mentoring younger village weavers.',
      region: 'Chamba',
      village: 'Chamba Town',
      address: { line1: 'Main Crafts Street', line2: '', city: 'Chamba', state: 'Himachal Pradesh', pincode: '176310' },
      categorySlugs: ['test-weaves'],
      productGroups: ['shawls'],
      originNarrative:
        'Crafted using indigenous Gaddi sheep wool with traditional wooden pit looms and organic vegetable botanical dyes.',
      categoryAnswers: { 'prompt-0': 'Handcrafted on wooden pit looms in Chamba.' },
      panLast4: '7788',
      fssaiNumber: '',
    });

    const submitRes = await mutate(applicant.post('/api/seller/application/submit')).send({
      data,
      idempotencyKey: 'tara-sub-full-1',
    });
    expect(submitRes.status).toBe(201);

    const sellerProfile = queryOne<{ id: string }>(db, 'SELECT id FROM seller_profiles WHERE user_id = ?', IDS.customer);

    const admin = await login(app, 'admin@test.local');
    const decisionRes = await mutate(admin.post(`/api/admin/sellers/${sellerProfile!.id}/decision`)).send({
      decision: 'approve',
      reason: 'All credentials and documents verified successfully.',
    });
    expect(decisionRes.status).toBe(200);

    // Verify role promoted to 'seller' and store_status 'active'
    const userRoles = queryAll<{ role: string }>(db, 'SELECT role FROM user_roles WHERE user_id = ?', IDS.customer).map((r) => r.role);
    expect(userRoles).toContain('seller');

    const profileRecord = queryOne<{ status: string; store_status: string }>(
      db,
      'SELECT status, store_status FROM seller_profiles WHERE id = ?',
      sellerProfile!.id,
    );
    expect(profileRecord?.status).toBe('approved');
    expect(profileRecord?.store_status).toBe('active');
  });

  it('12. verifies storage persistence across path portability using internal storage keys', async () => {
    const applicant = await login(app, 'customer@test.local');
    const uploadRes = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'portable_test.pdf', contentType: 'application/pdf' });
    expect(uploadRes.status).toBe(201);
    const documentId = uploadRes.body.id;

    const doc = queryOne<{ storage_key: string; file_path: string }>(
      db,
      'SELECT storage_key, file_path FROM seller_documents WHERE id = ?',
      documentId,
    );
    expect(doc?.storage_key).toBeTruthy();

    const resolvedPath = resolvePrivateDocPath(doc?.storage_key || doc?.file_path);
    expect(resolvedPath).toBeTruthy();
    expect(fs.existsSync(resolvedPath!)).toBe(true);

    const deleted = deletePrivateDoc(doc?.storage_key || doc?.file_path);
    expect(deleted).toBe(true);
    expect(fs.existsSync(resolvedPath!)).toBe(false);
  });
});
