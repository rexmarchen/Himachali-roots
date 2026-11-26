import fs from 'node:fs';
import type { Express } from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, queryAll, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { MfaService } from '../core/security/MfaService.js';
import type { GoogleProfile } from '../lib/google.js';
import { decryptPayoutDetails, encryptPayoutDetails } from '../lib/payoutCrypto.js';
import { resolvePrivateDocPath } from '../lib/uploads.js';
import { isSafeHttpUrl, isSafeInternalPath, isSafeSiteHref, safeExternalUrl } from '../../shared/urls.js';
import { IDS, TEST_PASSWORD, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

let app: Express;
let db: Db;

const fakeProfile: GoogleProfile = {
  sub: 'google-sub-mfa-link-001',
  email: 'customer@test.local',
  emailVerified: true,
  name: 'Customer MFA Link',
  picture: null,
};

async function fakeVerify(credential: string): Promise<GoogleProfile> {
  if (credential === 'valid-customer-google-cred') return fakeProfile;
  throw new Error('Invalid token');
}

beforeAll(() => {
  ({ app, db } = setupTestApp({ verifyGoogleIdToken: fakeVerify }));
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

describe('Security audit regression suite', () => {
  it('F-01: enforces TOTP MFA before completing Google account linking or issuing a session', async () => {
    const customer = await login(app, 'customer@test.local');
    const enrol = await mutate(customer.post('/api/auth/mfa/enrol')).send({});
    expect(enrol.status).toBe(201);
    const secret = enrol.body.secret as string;
    const confirm = await mutate(customer.post('/api/auth/mfa/confirm')).send({
      code: MfaService.generateToken(secret),
    });
    expect(confirm.status).toBe(200);

    const browser = request.agent(app);
    const start = await mutate(browser.post('/api/auth/google')).send({
      credential: 'valid-customer-google-cred',
    });
    expect(start.status).toBe(200);
    expect(start.body.linkingRequired).toBe(true);
    const linkToken = start.body.linkToken as string;

    // Password alone must NOT establish a session or bind the Google identity.
    const step1 = await mutate(browser.post('/api/auth/google/link')).send({
      linkToken,
      password: TEST_PASSWORD,
    });
    expect(step1.status).toBe(200);
    expect(step1.body.mfaRequired).toBe(true);
    expect(step1.body.challengeToken).toBeTruthy();
    expect((await browser.get('/api/auth/me')).body.user).toBeNull();
    expect(queryAll(db, 'SELECT id FROM auth_identities WHERE user_id = ?', IDS.customer)).toHaveLength(0);

    // Wrong MFA code must be rejected without linking or signing in.
    const badMfa = await mutate(browser.post('/api/auth/google/link')).send({
      linkToken,
      password: TEST_PASSWORD,
      challengeToken: step1.body.challengeToken,
      code: '000000',
    });
    expect(badMfa.status).toBe(401);
    expect((await browser.get('/api/auth/me')).body.user).toBeNull();
    expect(queryAll(db, 'SELECT id FROM auth_identities WHERE user_id = ?', IDS.customer)).toHaveLength(0);

    // Valid TOTP completes linking atomically and establishes the session.
    const step2 = await mutate(browser.post('/api/auth/google/link')).send({
      linkToken,
      password: TEST_PASSWORD,
      challengeToken: step1.body.challengeToken,
      code: MfaService.generateToken(secret),
    });
    expect(step2.status).toBe(200);
    expect(step2.body.user.id).toBe(IDS.customer);
    expect((await browser.get('/api/auth/me')).body.user.id).toBe(IDS.customer);
    expect(queryAll(db, 'SELECT id FROM auth_identities WHERE user_id = ?', IDS.customer)).toHaveLength(1);

    // Replay of the used link challenge must fail.
    const replay = await mutate(request(app).post('/api/auth/google/link')).send({
      linkToken,
      password: TEST_PASSWORD,
    });
    expect(replay.status).toBe(400);
  });

  it('F-02 & F-07 & F-09: blocks javascript:/data:/protocol-relative URLs in tracking, CMS, posters and helpers', async () => {
    expect(isSafeHttpUrl('https://shiprocket.co/tracking/123')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)', true)).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>', true)).toBe(false);
    expect(isSafeInternalPath('/shop?q=tea')).toBe(true);
    expect(isSafeInternalPath('//attacker.example')).toBe(false);
    expect(isSafeInternalPath('/\\attacker.example')).toBe(false);
    expect(isSafeSiteHref('javascript:alert(1)')).toBe(false);
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('https://delhivery.com/track/123')).toBe('https://delhivery.com/track/123');

    // Create a paid order so a seller order exists to ship.
    const customer = await login(app, 'customer@test.local');
    await mutate(customer.post('/api/cart/items')).send({ productId: IDS.product, quantity: 1 });
    const checkout = await mutate(customer.post('/api/checkout')).send({
      address: {
        fullName: 'Test Buyer',
        phone: '9816000001',
        line1: 'Mall Road 10',
        city: 'Shimla',
        state: 'Himachal Pradesh',
        pincode: '171001',
      },
      idempotencyKey: 'xss-track-url-test-key-01',
    });
    expect(checkout.status).toBe(201);
    const orderNumber = checkout.body.order.orderNumber as string;
    await mutate(customer.post(`/api/dev/orders/${orderNumber}/pay`)).send({});

    const seller = await login(app, 'seller@test.local');
    const so = queryOne<{ id: string }>(db, 'SELECT id FROM seller_orders LIMIT 1');
    await mutate(seller.post(`/api/seller/orders/${so!.id}/action`)).send({ action: 'confirm' });
    await mutate(seller.post(`/api/seller/orders/${so!.id}/action`)).send({ action: 'pack' });

    const xssTracking = await mutate(seller.post(`/api/seller/orders/${so!.id}/action`)).send({
      action: 'ship',
      carrier: 'Himalayan Courier',
      trackingNumber: 'AWB12345',
      trackingUrl: 'javascript:alert(document.cookie)',
    });
    expect(xssTracking.status).toBe(400);

    const admin = await login(app, 'admin@test.local');
    const badAnnouncement = await mutate(admin.put('/api/admin/content')).send({
      key: 'announcement',
      value: { active: true, text: 'Spring Harvest', href: 'javascript:alert(1)' },
    });
    expect(badAnnouncement.status).toBe(400);

    const protocolRelative = await mutate(admin.put('/api/admin/content')).send({
      key: 'announcement',
      value: { active: true, text: 'Spring Harvest', href: '//attacker.example' },
    });
    expect(protocolRelative.status).toBe(400);

    const insecurePoster = await mutate(admin.post('/api/admin/campaigns')).send({
      name: 'Unsafe Campaign',
      slug: 'unsafe-campaign',
      headline: 'Unsafe Headline',
      posterUrl: 'http://insecure.example/poster.jpg',
    });
    expect(insecurePoster.status).toBe(400);
  });

  it('F-03: bounds active pending_payment orders per user to prevent inventory reservation exhaustion', async () => {
    execute(db, 'UPDATE inventory SET quantity = 50, reserved_quantity = 0 WHERE product_id = ?', IDS.product);
    const customer = await login(app, 'customer@test.local');
    const address = {
      fullName: 'Stock Tester',
      phone: '9816000002',
      line1: 'Ridge Road 2',
      city: 'Shimla',
      state: 'Himachal Pradesh',
      pincode: '171001',
    };

    for (let i = 1; i <= 5; i += 1) {
      await mutate(customer.post('/api/cart/items')).send({ productId: IDS.product, quantity: 1 });
      const res = await mutate(customer.post('/api/checkout')).send({
        address,
        idempotencyKey: `pending-cap-key-000${i}`,
      });
      expect(res.status).toBe(201);
    }

    await mutate(customer.post('/api/cart/items')).send({ productId: IDS.product, quantity: 1 });
    const blocked = await mutate(customer.post('/api/checkout')).send({
      address,
      idempotencyKey: 'pending-cap-key-0006',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('too_many_pending_orders');
  });

  it('F-04 & F-07: re-encodes KYC images to strip EXIF, sandboxes download headers, and cleans orphaned uploads', async () => {
    const applicant = await login(app, 'customer@test.local');
    const exifJpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 24, g: 55, b: 42 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 90 })
      .toBuffer();
    expect((await sharp(exifJpeg).metadata()).exif).toBeDefined();

    const upload = await mutate(applicant.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', exifJpeg, { filename: 'id_with_exif.jpg', contentType: 'image/jpeg' });
    expect(upload.status).toBe(201);

    const doc = queryOne<{ storage_key: string; file_path: string }>(
      db,
      'SELECT storage_key, file_path FROM seller_documents WHERE id = ?',
      upload.body.id,
    );
    const resolvedDocPath = resolvePrivateDocPath(doc?.storage_key || doc?.file_path);
    expect(resolvedDocPath).toBeTruthy();
    try {
      const savedMeta = await sharp(resolvedDocPath!).metadata();
      expect(savedMeta.exif).toBeUndefined();

      const admin = await login(app, 'admin@test.local');
      const download = await admin.get(`/api/admin/seller-documents/${upload.body.id}/file`);
      expect(download.status).toBe(200);
      expect(download.headers['content-security-policy']).toContain("script-src 'none'");
      expect(download.headers['content-security-policy']).toContain("frame-ancestors 'self'");
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['x-frame-options']).toBe('SAMEORIGIN');
    } finally {
      if (resolvedDocPath && fs.existsSync(resolvedDocPath)) fs.unlinkSync(resolvedDocPath);
    }

    // Rejected product upload on missing product or invalid profile kind must not leak orphaned files in uploadDir.
    const seller = await login(app, 'seller@test.local');
    const beforeFiles = new Set(fs.existsSync(env.uploadDir) ? fs.readdirSync(env.uploadDir) : []);

    const missingProductUpload = await mutate(seller.post('/api/seller/products/nonexistent-prod/images'))
      .field('alt', 'Orphan check')
      .attach('image', exifJpeg, { filename: 'orphan.jpg', contentType: 'image/jpeg' });
    expect(missingProductUpload.status).toBe(404);

    const invalidKindUpload = await mutate(seller.post('/api/seller/profile/image/invalid_kind'))
      .attach('image', exifJpeg, { filename: 'orphan2.jpg', contentType: 'image/jpeg' });
    expect(invalidKindUpload.status).toBe(400);

    const afterFiles = fs.existsSync(env.uploadDir) ? fs.readdirSync(env.uploadDir) : [];
    expect(afterFiles.filter((f) => !beforeFiles.has(f))).toEqual([]);
  });

  it('F-05 & F-06 & F-09: audits password changes, escapes HTML in emails, and safely reads payout JSON', async () => {
    const customer = await login(app, 'customer@test.local');
    const pwdChange = await mutate(customer.post('/api/account/password')).send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'UpdatedPass123!',
    });
    expect(pwdChange.status).toBe(200);
    const pwdAudit = queryOne<{ action: string }>(
      db,
      "SELECT action FROM audit_logs WHERE actor_id = ? AND action = 'auth.password.changed'",
      IDS.customer,
    );
    expect(pwdAudit?.action).toBe('auth.password.changed');

    const contact = await mutate(request(app).post('/api/contact')).send({
      name: '<script>alert(1)</script>Attacker',
      email: 'user@example.com',
      subject: 'Order help',
      orderNumber: 'PR-123"><img src=x>',
      message: 'Please inspect <svg onload=alert(1)> payload & quotes "here".',
    });
    expect(contact.status).toBe(201);
    const notif = queryOne<{ body: string }>(
      db,
      "SELECT body FROM notifications WHERE type = 'support_ticket' ORDER BY created_at DESC LIMIT 1",
    );
    expect(notif?.body).not.toContain('<script>');
    expect(notif?.body).not.toContain('<img src=x>');
    expect(notif?.body).not.toContain('<svg ');
    expect(notif?.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Attacker');
    expect(notif?.body).toContain('&quot;here&quot;');

    // Payout crypto helper handles JSON transparently and validates safe fallback.
    const serialized = encryptPayoutDetails({ accountNumber: '123456789012', ifscCode: 'SBIN0001234' });
    expect(decryptPayoutDetails(serialized)).toMatchObject({ accountNumber: '123456789012', ifscCode: 'SBIN0001234' });
    expect(decryptPayoutDetails('not-json')).toBeNull();
  });
});
