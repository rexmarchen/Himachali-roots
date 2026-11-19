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

describe('public storefront', () => {
  it('sends a restrictive Permissions-Policy header', async () => {
    const response = await request(app).get('/api/config');
    expect(response.status).toBe(200);
    expect(String(response.headers['permissions-policy'])).toContain('camera=()');
    expect(String(response.headers['permissions-policy'])).toContain('microphone=()');
  });

  it('serves the home payload used by the landing page', async () => {
    execute(db, 'UPDATE products SET is_featured = 1 WHERE id = ?', IDS.product);
    execute(db, "UPDATE products SET region = 'Kullu' WHERE id = ?", IDS.product);
    execute(db, "UPDATE products SET region = 'Kangra' WHERE id = ?", IDS.product2);

    const response = await request(app).get('/api/home');
    expect(response.status).toBe(200);
    expect(response.body.categories.map((category: { slug: string }) => category.slug)).toContain('test-weaves');
    expect(response.body.featured.map((product: { slug: string }) => product.slug)).toContain('test-shawl');
    expect(response.body.newArrivals.length).toBeGreaterThan(0);
    expect(response.body.counts).toEqual({ products: 2, sellers: 2, regions: 2 });
    expect(response.body.reviews).toEqual([]);
    expect(response.body.content.homepage).toBeTruthy();
    expect(typeof response.body.generatedAt).toBe('string');
  });

  it('counts only approved products and sellers in the home totals', async () => {
    execute(db, "UPDATE seller_profiles SET status = 'under_review' WHERE id = ?", IDS.seller2);
    execute(db, "UPDATE products SET status = 'draft' WHERE id = ?", IDS.product2);
    execute(db, "UPDATE products SET region = 'Kullu' WHERE id = ?", IDS.product);
    execute(db, "UPDATE products SET region = 'Kangra' WHERE id = ?", IDS.product2);

    const response = await request(app).get('/api/home');
    expect(response.status).toBe(200);
    expect(response.body.counts).toEqual({ products: 1, sellers: 1, regions: 1 });
    expect(response.body.featured.map((product: { slug: string }) => product.slug)).not.toContain('second-shawl');
  });

  it('lists products and exposes catalogue filters', async () => {
    const response = await request(app).get('/api/products?sort=price_asc');
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].slug).toBe('second-shawl');
    expect(response.body.filters.priceRangePaise).toEqual({ min: 50_000, max: 100_000 });
    expect(response.body.filters.sellers).toHaveLength(2);
  });

  it('returns a product detail and the maker storefront', async () => {
    const product = await request(app).get('/api/products/test-shawl');
    expect(product.status).toBe(200);
    expect(product.body.product.name).toBe('Test Shawl');
    expect(product.body.product.stock).toBe(10);

    const seller = await request(app).get('/api/sellers/test-loom');
    expect(seller.status).toBe(200);
    expect(seller.body.seller.name).toBe('Test Loom');
    expect(seller.body.products.items).toHaveLength(1);
  });

  it('returns 404 for unknown products', async () => {
    const response = await request(app).get('/api/products/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('publishes an enhanced sitemap with categories, images and robots file', async () => {
    const sitemap = await request(app).get('/sitemap.xml');
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers['content-type']).toContain('xml');
    expect(sitemap.text).toContain('/shop/test-shawl');
    expect(sitemap.text).toContain('/makers/test-loom');
    expect(sitemap.text).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(sitemap.text).toContain('/categories/');

    const robots = await request(app).get('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.headers['content-type']).toContain('text/plain');
    expect(robots.text).toContain('User-agent: *');
    expect(robots.text).toContain('Disallow: /admin');
    expect(robots.text).toContain('Disallow: /checkout');
    expect(robots.text).toContain('Sitemap:');
  });

  it('serves SEO pre-rendered HTML with metadata and schema on SPA routes', async () => {
    const homeResponse = await request(app).get('/');
    expect(homeResponse.status).toBe(200);
    expect(homeResponse.headers['content-type']).toContain('text/html');
    expect(homeResponse.text).toContain('<title>DEAR HILLS — Authentic Himalayan Handloom');
    expect(homeResponse.text).toContain('rel="canonical"');
    expect(homeResponse.text).toContain('id="seo-structured-data"');
    expect(homeResponse.text).toContain('"@type":"Organization"');

    const productResponse = await request(app).get('/shop/test-shawl');
    expect(productResponse.status).toBe(200);
    expect(productResponse.text).toContain('<title>Test Shawl');
    expect(productResponse.text).toContain('"@type":"Product"');
    expect(productResponse.text).toContain('/shop/test-shawl');
  });
});
