import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, queryOne, type Db } from '../db.js';
import { env } from '../env.js';
import { IDS, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

let app: Express;
let db: Db;

let JPEG: Buffer;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

async function makeJpeg(options: { orientation?: number; width?: number; height?: number } = {}): Promise<Buffer> {
  const width = options.width ?? 24;
  const height = options.height ?? 16;
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 38, g: 61, b: 50 },
    },
  });
  const withMetadata = options.orientation ? base.withMetadata({ orientation: options.orientation }) : base;
  return withMetadata.jpeg({ quality: 90 }).toBuffer();
}

beforeAll(async () => {
  ({ app, db } = setupTestApp());
  JPEG = await makeJpeg();
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

describe('secure uploads', () => {
  it('requires an approved seller to upload a product image', async () => {
    const customer = await login(app, 'customer@test.local');
    const response = await mutate(customer.post(`/api/seller/products/${IDS.product}/images`))
      .field('alt', 'A test image')
      .attach('image', JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(response.status).toBe(403);
  });

  it('accepts a real image signature and rejects a disguised file', async () => {
    const seller = await login(app, 'seller@test.local');
    const accepted = await mutate(seller.post(`/api/seller/products/${IDS.product}/images`))
      .field('alt', 'A handwoven test shawl on a plain background')
      .attach('image', JPEG, { filename: 'test.jpg', contentType: 'image/jpeg' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.id).toBeTruthy();
    expect(queryOne<{ status: string }>(db, 'SELECT status FROM products WHERE id = ?', IDS.product)?.status).toBe(
      'pending',
    );

    const disguised = await mutate(seller.post(`/api/seller/products/${IDS.product}/images`))
      .field('alt', 'A disguised executable')
      .attach('image', Buffer.from('<html><script>alert(1)</script></html>'), {
        filename: 'evil.jpg',
        contentType: 'image/jpeg',
      });
    expect(disguised.status).toBe(400);
    expect(disguised.body.error.message).toContain('valid JPEG');

    const badMime = await mutate(seller.post(`/api/seller/products/${IDS.product}/images`))
      .field('alt', 'A text file')
      .attach('image', Buffer.from('plain text'), { filename: 'evil.txt', contentType: 'text/plain' });
    expect(badMime.status).toBe(400);
  });

  it('re-encodes stored images, strips metadata and bounds dimensions', async () => {
    const seller = await login(app, 'seller@test.local');
    const withMetadata = await makeJpeg({ orientation: 6, width: 2400, height: 1600 });
    expect((await sharp(withMetadata).metadata()).exif).toBeDefined();

    const response = await mutate(seller.post(`/api/seller/products/${IDS.product}/images`))
      .field('alt', 'A large camera image with orientation metadata')
      .attach('image', withMetadata, { filename: 'camera.jpg', contentType: 'image/jpeg' });
    expect(response.status).toBe(201);

    const storedPath = path.join(env.uploadDir, path.basename(response.body.url as string));
    try {
      const metadata = await sharp(storedPath).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBeLessThanOrEqual(2000);
      expect(metadata.height).toBeLessThanOrEqual(2000);
      // EXIF, including GPS and camera identifiers, must not survive.
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
    } finally {
      if (fs.existsSync(storedPath)) fs.unlinkSync(storedPath);
    }
  });

  it('keeps seller documents private and lets only the owner or an admin read them', async () => {
    const seller = await login(app, 'seller@test.local');
    const uploaded = await mutate(seller.post('/api/seller/documents'))
      .field('docType', 'id_proof')
      .attach('document', PDF, { filename: 'identity.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    const documentId = uploaded.body.id as string;

    const doc = queryOne<{ file_path: string }>(db, 'SELECT file_path FROM seller_documents WHERE id = ?', documentId);
    expect(doc).toBeTruthy();

    try {
      const owner = await seller.get(`/api/seller/documents/${documentId}/file`);
      expect(owner.status).toBe(200);
      expect(String(owner.headers['content-type'])).toContain('application/pdf');

      const otherSeller = await login(app, 'seller2@test.local');
      expect((await otherSeller.get(`/api/seller/documents/${documentId}/file`)).status).toBe(404);

      const customer = await login(app, 'customer@test.local');
      expect((await customer.get(`/api/seller/documents/${documentId}/file`)).status).toBe(404);

      const admin = await login(app, 'admin@test.local');
      const adminView = await admin.get(`/api/admin/seller-documents/${documentId}/file`);
      expect(adminView.status).toBe(200);
    } finally {
      if (doc && fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
    }
  });
});
