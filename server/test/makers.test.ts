import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, execute, type Db } from '../db.js';
import { IDS, resetDb, seedFixtures, setupTestApp } from './helpers.js';

let app: Express;
let db: Db;

beforeAll(() => {
  ({ app, db } = setupTestApp());
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  resetDb(db);
  seedFixtures(db);
});

describe('Makers API discovery and security (/api/makers)', () => {
  it('retrieves approved and active makers without leaking private fields', async () => {
    execute(
      db,
      `UPDATE seller_profiles
          SET tagline = 'Master pit loom weavers of Kullu',
              region = 'Kullu',
              village = 'Naggar',
              verified_at = '2026-01-01T00:00:00Z',
              seller_category = 'artisan_craftsperson'
        WHERE id = ?`,
      IDS.seller,
    );

    const res = await request(app).get('/api/makers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.makers)).toBe(true);
    expect(res.body.makers.length).toBeGreaterThanOrEqual(1);

    const testMaker = res.body.makers.find((m: { id: string }) => m.id === IDS.seller);
    expect(testMaker).toBeTruthy();
    expect(testMaker.name).toBe('Test Loom');
    expect(testMaker.slug).toBe('test-loom');
    expect(testMaker.region).toBe('Kullu');
    expect(testMaker.village).toBe('Naggar');
    expect(testMaker.isVerified).toBe(true);
    expect(testMaker.sellerCategory).toBe('artisan_craftsperson');
    expect(testMaker.productCount).toBeGreaterThanOrEqual(1);

    // CRITICAL SECURITY CHECKS: Never leak private or sensitive fields
    expect(testMaker.phone).toBeUndefined();
    expect(testMaker.operating_address).toBeUndefined();
    expect(testMaker.pickup_address).toBeUndefined();
    expect(testMaker.gstin).toBeUndefined();
    expect(testMaker.pan_last4).toBeUndefined();
    expect(testMaker.commission_rate_bp).toBeUndefined();
    expect(testMaker.payout_status).toBeUndefined();
    expect(testMaker.rejection_reason).toBeUndefined();
  });

  it('strictly excludes pending, under_review, rejected, and suspended makers', async () => {
    // Set seller 1 to approved, seller 2 to under_review
    execute(db, "UPDATE seller_profiles SET status = 'under_review' WHERE id = ?", IDS.seller2);

    let res = await request(app).get('/api/makers');
    expect(res.status).toBe(200);
    const ids = res.body.makers.map((m: { id: string }) => m.id);
    expect(ids).toContain(IDS.seller);
    expect(ids).not.toContain(IDS.seller2);

    // Set seller 1 store_status to suspended
    execute(db, "UPDATE seller_profiles SET store_status = 'suspended' WHERE id = ?", IDS.seller);
    res = await request(app).get('/api/makers');
    expect(res.status).toBe(200);
    const updatedIds = res.body.makers.map((m: { id: string }) => m.id);
    expect(updatedIds).not.toContain(IDS.seller);
  });

  it('filters makers by text search q, region, and verification status', async () => {
    execute(db, "UPDATE seller_profiles SET business_name = 'Himalayan Organic Apiary', region = 'Lahaul and Spiti', verified_at = '2026-01-01T00:00:00Z' WHERE id = ?", IDS.seller);
    execute(db, "UPDATE seller_profiles SET business_name = 'Kullu Weavers Guild', region = 'Kullu', verified_at = NULL WHERE id = ?", IDS.seller2);

    // Search by q
    let res = await request(app).get('/api/makers?q=apiary');
    expect(res.status).toBe(200);
    expect(res.body.makers).toHaveLength(1);
    expect(res.body.makers[0].id).toBe(IDS.seller);

    // Filter by region
    res = await request(app).get('/api/makers?region=Kullu');
    expect(res.status).toBe(200);
    expect(res.body.makers.every((m: { region: string }) => m.region === 'Kullu')).toBe(true);

    // Filter by verified=true
    res = await request(app).get('/api/makers?verified=true');
    expect(res.status).toBe(200);
    expect(res.body.makers.every((m: { isVerified: boolean }) => m.isVerified)).toBe(true);
    expect(res.body.makers.some((m: { id: string }) => m.id === IDS.seller)).toBe(true);
    expect(res.body.makers.some((m: { id: string }) => m.id === IDS.seller2)).toBe(false);
  });

  it('handles pagination and sorting cleanly', async () => {
    execute(db, "UPDATE seller_profiles SET business_name = 'Alpha Craft' WHERE id = ?", IDS.seller);
    execute(db, "UPDATE seller_profiles SET business_name = 'Zeta Knitwear' WHERE id = ?", IDS.seller2);

    // Sort name_asc
    let res = await request(app).get('/api/makers?sort=name_asc');
    expect(res.status).toBe(200);
    expect(res.body.makers[0].name).toBe('Alpha Craft');

    // Sort name_desc
    res = await request(app).get('/api/makers?sort=name_desc');
    expect(res.status).toBe(200);
    expect(res.body.makers[0].name).toBe('Zeta Knitwear');

    // Pagination limit=1
    res = await request(app).get('/api/makers?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.makers).toHaveLength(1);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  it('returns maker detail via /api/makers/:slug and 404 for missing makers', async () => {
    const res = await request(app).get('/api/makers/test-loom');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.seller.name).toBe('Test Loom');
    expect(res.body.products.items).toHaveLength(1);

    const missing = await request(app).get('/api/makers/unknown-maker-slug');
    expect(missing.status).toBe(404);
  });
});
