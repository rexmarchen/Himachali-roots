import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HIMALAYAN_GUIDES } from '../../shared/guides.js';
import { closeDb, execute, queryOne, type Db } from '../db.js';
import { getSeoMetadata, injectSeoIntoHtml } from '../lib/seo.js';
import { IDS, login, mutate, resetDb, seedFixtures, setupTestApp } from './helpers.js';

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

function extractJsonLd(html: string): Record<string, unknown> {
  const match = html.match(/<script\s+type="application\/ld\+json"\s+id="seo-structured-data">([\s\S]*?)<\/script>/i);
  expect(match).toBeTruthy();
  return JSON.parse(match![1]) as Record<string, unknown>;
}

function assertHtmlSeoHygiene(html: string, baseUrl: string, routePath: string) {
  const seo = getSeoMetadata(db, routePath, baseUrl);
  expect(seo.title.length).toBeGreaterThan(0);
  expect(seo.title.length).toBeLessThanOrEqual(60);
  expect(seo.description.length).toBeGreaterThan(0);
  expect(seo.description.length).toBeLessThanOrEqual(160);

  const injected = injectSeoIntoHtml(html, seo);
  const titleMatches = injected.match(/<title>[\s\S]*?<\/title>/gi) ?? [];
  const canonicalMatches = injected.match(/<link\s+rel="canonical"/gi) ?? [];
  const h1Matches = injected.match(/<h1\b/gi) ?? [];

  expect(titleMatches).toHaveLength(1);
  expect(canonicalMatches).toHaveLength(1);
  if (!seo.noindex) {
    expect(h1Matches).toHaveLength(1);
    expect(injected).toContain('index, follow');
  }
  const ld = extractJsonLd(injected);
  expect(ld['@context']).toBe('https://schema.org');
  return { seo, injected, ld };
}

describe('Pan-Himalayan SEO architecture, Anti-Doorway gates, GI verification & content quality', () => {
  it('1. validates titles <=60, descriptions <=160, 1 H1, 1 canonical & valid JSON-LD across all indexable page types', async () => {
    const baseHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    // Enrich fixture product with Pan-Himalayan metadata
    execute(
      db,
      `UPDATE products
          SET region = 'Himachal Pradesh', region_slug = 'himachal-pradesh',
              district_village = 'Kullu', craft_type = 'Kullu & Kinnauri Shawls', craft_slug = 'kullu-kinnauri-shawls',
              technique = 'handloom', materials = 'Handspun mountain wool', gi_tagged = 1, gi_name = 'Kullu Shawl',
              gi_registration_ref = 'GI-123'
        WHERE id = ?`,
      IDS.product,
    );

    const routesToCheck = [
      '/',
      '/himalayan-handmade-products',
      '/gi-tagged',
      '/regions/himachal-pradesh',
      '/regions/uttarakhand',
      '/regions/jammu-and-kashmir',
      '/regions/ladakh',
      '/regions/sikkim',
      '/regions/arunachal-pradesh',
      '/regions/darjeeling-kalimpong',
      '/crafts/pashmina-shawls',
      '/crafts/aipan-art',
      '/shop/test-shawl',
      '/makers/test-loom',
      '/guides',
      `/guides/${HIMALAYAN_GUIDES[0].slug}`,
    ];

    for (const route of routesToCheck) {
      const { seo, ld } = assertHtmlSeoHygiene(baseHtml, 'www.dearhills.in', route);
      expect(seo.statusCode ?? 200).toBe(200);
      expect(seo.noindex).toBeFalsy();
      expect(Array.isArray(ld['@graph'])).toBe(true);
    }

    // Verify Product JSON-LD attributes & zero fake AggregateRating when review count = 0
    const { ld: productLd } = assertHtmlSeoHygiene(baseHtml, 'www.dearhills.in', '/shop/test-shawl');
    const graph = productLd['@graph'] as Array<Record<string, unknown>>;
    const prodNode = graph.find((n) => n['@type'] === 'Product')!;
    expect(prodNode).toBeTruthy();
    expect(prodNode.countryOfOrigin).toBeTruthy();
    expect(prodNode.material).toBe('Handspun mountain wool');
    expect(prodNode.aggregateRating).toBeUndefined();
    const additionalProps = prodNode.additionalProperty as Array<{ name: string; value: string }>;
    expect(additionalProps.some((p) => p.name === 'Region' && p.value === 'Himachal Pradesh')).toBe(true);
    expect(additionalProps.some((p) => p.name === 'GI Tagged' && p.value === 'Kullu Shawl')).toBe(true);
  });

  it('2. enforces strict Anti-Doorway 404 gate on /regions/:region/:craft when <3 real approved non-demo products', async () => {
    // Seed 2 real approved products + 2 demo products in Ladakh Pashmina Shawls (only 2 real < 3 threshold!)
    for (let i = 1; i <= 2; i++) {
      execute(
        db,
        `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku,
            status, is_demo, region, region_slug, craft_type, craft_slug, technique)
         VALUES (?, ?, ?, ?, ?, 'Real Ladakh wrap', 'Detailed genuine Ladakh woollen wrap crafted slowly by Changthangi artisans.', 450000, ?,
            'approved', 0, 'Ladakh', 'ladakh', 'Pashmina Shawls', 'pashmina-shawls', 'handloom')`,
        `prd_ladakh_real_${i}`,
        IDS.seller,
        IDS.category,
        `Ladakh Pashmina Wrap ${i}`,
        `ladakh-pashmina-wrap-${i}`,
        `LDK-REAL-${i}`,
      );
      execute(db, 'INSERT INTO inventory (product_id, quantity) VALUES (?, 5)', `prd_ladakh_real_${i}`);

      execute(
        db,
        `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku,
            status, is_demo, region, region_slug, craft_type, craft_slug, technique)
         VALUES (?, ?, ?, ?, ?, 'Demo wrap', 'Demo item excluded from doorway count.', 450000, ?,
            'approved', 1, 'Ladakh', 'ladakh', 'Pashmina Shawls', 'pashmina-shawls', 'handloom')`,
        `prd_ladakh_demo_${i}`,
        IDS.seller,
        IDS.category,
        `Demo Ladakh Wrap ${i}`,
        `demo-ladakh-wrap-${i}`,
        `DEMO-LDK-${i}`,
      );
      execute(db, 'INSERT INTO inventory (product_id, quantity) VALUES (?, 5)', `prd_ladakh_demo_${i}`);
    }

    // With 2 real + 2 demo products -> strictly 404 + noindex + absent from sitemap
    const resBelow = await request(app).get('/api/regions/ladakh/pashmina-shawls');
    expect(resBelow.status).toBe(404);
    const seoBelow = getSeoMetadata(db, '/regions/ladakh/pashmina-shawls', 'www.dearhills.in');
    expect(seoBelow.statusCode).toBe(404);
    expect(seoBelow.noindex).toBe(true);

    const sitemapBelow = await request(app).get('/sitemap.xml');
    expect(sitemapBelow.text).not.toContain('/regions/ladakh/pashmina-shawls');

    // Add 3rd real approved non-demo product -> crosses >= 3 gate cleanly!
    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku,
          status, is_demo, region, region_slug, craft_type, craft_slug, technique)
       VALUES ('prd_ladakh_real_3', ?, ?, 'Ladakh Pashmina Wrap 3', 'ladakh-pashmina-wrap-3',
          'Real Ladakh wrap 3', 'Third authentic Changthangi shawl woven slowly on wooden handlooms in Leh.', 480000, 'LDK-REAL-3',
          'approved', 0, 'Ladakh', 'ladakh', 'Pashmina Shawls', 'pashmina-shawls', 'handloom')`,
      IDS.seller,
      IDS.category,
    );
    execute(db, "INSERT INTO inventory (product_id, quantity) VALUES ('prd_ladakh_real_3', 5)");

    const resAbove = await request(app).get('/api/regions/ladakh/pashmina-shawls');
    expect(resAbove.status).toBe(200);
    expect(resAbove.body.products.total).toBe(3);

    const seoAbove = getSeoMetadata(db, '/regions/ladakh/pashmina-shawls', 'www.dearhills.in');
    expect(seoAbove.statusCode ?? 200).toBe(200);
    expect(seoAbove.noindex).toBeFalsy();

    const sitemapAbove = await request(app).get('/sitemap.xml');
    expect(sitemapAbove.text).toContain('/regions/ladakh/pashmina-shawls');
  });

  it('3. excludes demo products from Merchant feed and hubs while emitting region & craft custom_labels for real items', async () => {
    execute(
      db,
      `UPDATE products SET region = 'Uttarakhand', region_slug = 'uttarakhand', craft_type = 'Aipan Art', craft_slug = 'aipan-art' WHERE id = ?`,
      IDS.product,
    );
    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku,
          status, is_demo, region, region_slug, craft_type, craft_slug)
       VALUES ('prd_demo_uttarakhand', ?, ?, 'Demo Aipan Board', 'demo-aipan-board',
          'Demo product', 'Demo product.', 10000, 'DEMO-AIPAN-1', 'approved', 1, 'Uttarakhand', 'uttarakhand', 'Aipan Art', 'aipan-art')`,
      IDS.seller,
      IDS.category,
    );

    const feedRes = await request(app).get('/feeds/google-merchant.xml');
    expect(feedRes.status).toBe(200);
    expect(feedRes.text).toContain('Test Shawl');
    expect(feedRes.text).toContain('<g:custom_label_0>Uttarakhand</g:custom_label_0>');
    expect(feedRes.text).toContain('<g:custom_label_1>Aipan Art</g:custom_label_1>');
    expect(feedRes.text).not.toContain('Demo Aipan Board');

    const regionRes = await request(app).get('/api/regions/uttarakhand');
    expect(regionRes.status).toBe(200);
    const slugs = (regionRes.body.products.items as Array<{ slug: string }>).map((p) => p.slug);
    expect(slugs).toContain('test-shawl');
    expect(slugs).not.toContain('demo-aipan-board');
  });

  it('4. aligns Product schema price identically with active campaign promo price', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 3600_000).toISOString();
    const future = new Date(now.getTime() + 86400_000).toISOString();
    execute(
      db,
      `INSERT INTO campaigns (id, name, slug, status, starts_at, ends_at)
       VALUES ('cmp_test_promo', 'Winter Heritage Sale', 'winter-sale', 'active', ?, ?)`,
      past,
      future,
    );
    execute(
      db,
      `INSERT INTO campaign_products (campaign_id, product_id, promo_price_paise)
       VALUES ('cmp_test_promo', ?, 80000)`,
      IDS.product,
    );

    const seo = getSeoMetadata(db, '/shop/test-shawl', 'www.dearhills.in');
    const jsonLdObj = seo.jsonLd as { '@graph': Array<Record<string, unknown>> };
    const graph = jsonLdObj['@graph'];
    const prodNode = graph.find((n) => n['@type'] === 'Product')!;
    const offer = prodNode.offers as { price: string; priceCurrency: string };
    expect(offer.priceCurrency).toBe('INR');
    // 100_000 paise (₹1000) with 20% (2000 bp) discount -> ₹800.00
    expect(offer.price).toBe('800.00');
  });

  it('5. marks admin, cart, checkout, account, seller & filter/sort/search query pages strictly noindex', () => {
    const noindexRoutes = [
      '/admin',
      '/admin/products',
      '/cart',
      '/checkout',
      '/account',
      '/seller',
      '/shop?q=pashmina',
      '/shop?sort=price_asc',
      '/shop?page=2',
      '/shop?region=Ladakh',
      '/shop?craft=pashmina-shawls',
      '/shop?giTagged=true',
    ];
    for (const r of noindexRoutes) {
      const seo = getSeoMetadata(db, r, 'www.dearhills.in');
      expect(seo.noindex, `Expected noindex on ${r}`).toBe(true);
    }
  });

  it('6. handles 301 region/product slug redirects, blocks unverified GI/claim abuse & validates all 30 guides >=900 words', async () => {
    // 6a. Region alias 301 redirect
    const redirectRes = await request(app).get('/regions/kashmir');
    expect(redirectRes.status).toBe(301);
    expect(redirectRes.headers.location).toBe('/regions/jammu-and-kashmir');

    // 6b. Seller cannot self-mark giTagged or submit prohibited claim without proof
    const sellerAgent = await login(app, 'seller@test.local');
    const badGi = await mutate(sellerAgent.post('/api/seller/products')).send({
      categoryId: IDS.category,
      name: 'Attempted Self GI Product',
      shortDescription: 'Attempt to set giTagged flag',
      description: 'Detailed craft story description with materials and region clearly set for testing.',
      pricePaise: 150000,
      sku: 'SELF-GI-1',
      giTagged: true,
    });
    expect(badGi.status).toBe(400);

    // Create legitimate seller product with prohibited "Pure Pashmina" claim lacking proof -> blocked on submit!
    const created = await mutate(sellerAgent.post('/api/seller/products')).send({
      categoryId: IDS.category,
      name: 'Pure Pashmina Claim Wrap',
      shortDescription: 'Soft wrap from Kullu mountains',
      description: 'This description claims pure pashmina without accepted craft documentation on file.',
      pricePaise: 250000,
      sku: 'CLAIM-PASH-1',
      region: 'Himachal Pradesh',
      districtVillage: 'Kullu',
      craftType: 'Kullu & Kinnauri Shawls',
      technique: 'handloom',
      materials: 'Wool',
      careInstructions: 'Dry clean only',
      weightG: 350,
    });
    expect(created.status).toBe(201);
    const createdId = created.body.id as string;

    // Upload dummy product image so submit reaches compliance & protected-claim checks
    execute(
      db,
      `INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES ('img_claim_1', ?, '/images/product-shawl.jpg', 'Wrap', 0)`,
      createdId,
    );

    const submitBlocked = await mutate(sellerAgent.post(`/api/seller/products/${createdId}/submit`)).send({});
    expect(submitBlocked.status).toBe(400);
    expect(JSON.stringify(submitBlocked.body)).toMatch(/Pure Pashmina|proof|documentation/i);

    // 6c. Admin product slug rename inserts 301 redirect cleanly
    const adminAgent = await login(app, 'admin@test.local');
    const patchRes = await mutate(adminAgent.patch(`/api/admin/products/${IDS.product}`)).send({
      slug: 'kullu-handloom-shawl-renamed',
    });
    expect(patchRes.status).toBe(200);
    const oldSlugRes = await request(app).get('/shop/test-shawl');
    expect(oldSlugRes.status).toBe(301);
    expect(oldSlugRes.headers.location).toBe('/shop/kullu-handloom-shawl-renamed');

    // Confirm row saved in slug_redirects
    const redirectRow = queryOne<{ new_path: string }>(
      db,
      'SELECT new_path FROM slug_redirects WHERE old_path = ?',
      '/shop/test-shawl',
    );
    expect(redirectRow?.new_path).toBe('/shop/kullu-handloom-shawl-renamed');

    // 6d. Verify all 30 guides meet 900+ words, <=60 title, <=160 desc & appear in /sitemap.xml
    expect(HIMALAYAN_GUIDES).toHaveLength(30);
    const sitemap = await request(app).get('/sitemap.xml');
    for (const guide of HIMALAYAN_GUIDES) {
      const words = guide.content.trim().split(/\s+/).filter(Boolean).length;
      expect(words, `${guide.slug} word count`).toBeGreaterThanOrEqual(900);
      expect(guide.metaTitle.length, `${guide.slug} title length`).toBeLessThanOrEqual(60);
      expect(guide.metaDescription.length, `${guide.slug} desc length`).toBeLessThanOrEqual(160);
      expect(sitemap.text).toContain(`/guides/${guide.slug}`);
    }
  });
});
