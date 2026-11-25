import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BLOG_POSTS } from '../../shared/blog.js';
import {
  buildCategoryFallbackDescription,
  buildCategorySeoTitle,
  buildProductFallbackDescription,
  buildProductSeoTitle,
  buildProductShortFallback,
  isDemoProductInput,
} from '../../shared/seo.js';
import { closeDb, execute, type Db } from '../db.js';
import { countRealCampaignProducts, getSeoMetadata, injectSeoIntoHtml } from '../lib/seo.js';
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

function extractJsonLd(html: string): Record<string, unknown> {
  const match = html.match(/<script\s+type="application\/ld\+json"\s+id="seo-structured-data">([\s\S]*?)<\/script>/i);
  expect(match).toBeTruthy();
  return JSON.parse(match![1]) as Record<string, unknown>;
}

describe('SEO, structured data, sitemap, merchant feed, and demo noindex guard', () => {
  it('excludes demo/test products, demo sellers, and empty categories from dynamic /sitemap.xml', async () => {
    // Empty category (0 products)
    execute(
      db,
      "INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES ('cat_empty', 'Empty Crafts', 'empty-crafts', 'Empty', 99, 1)",
    );

    // Demo seller + demo product + ₹1 test product
    execute(
      db,
      "INSERT INTO users (id, email, password_hash, email_verified) VALUES ('usr_demo', 'demo@demo.pahadiroots.test', 'x', 1)",
    );
    execute(
      db,
      `INSERT INTO seller_profiles (id, user_id, business_name, slug, seller_type, region, status, store_status)
       VALUES ('sel_demo', 'usr_demo', 'Kullu Demo Collective (demo)', 'kullu-collective-demo', 'cooperative', 'Kullu', 'approved', 'active')`,
    );
    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, status, is_demo)
       VALUES ('prd_demo_1', 'sel_demo', ?, 'Demo Wool Shawl', 'demo-wool-shawl', 'Demo item', 'Long demo description for testing.', 250000, 'DEMO-SHW-01', 'approved', 1)`,
      IDS.category,
    );
    execute(db, "INSERT INTO inventory (product_id, quantity) VALUES ('prd_demo_1', 10)");

    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, status, is_demo)
       VALUES ('prd_1rupee', ?, ?, 'Fresh Banana', 'fresh-banana', 'Fresh mountain banana listed for ₹1 test transaction.', 'Test transaction listing.', 100, 'TEST-1RUPEE', 'approved', 0)`,
      IDS.seller,
      IDS.category,
    );
    execute(db, "INSERT INTO inventory (product_id, quantity) VALUES ('prd_1rupee', 50)");

    // Second image on real product to verify multi-image sitemap
    execute(
      db,
      "INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES ('img_extra', ?, '/images/weaving.jpg', 'Loom detail', 1)",
      IDS.product,
    );

    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');

    // Real entities included
    expect(res.text).toContain('/shop/test-shawl');
    expect(res.text).toContain('/makers/test-loom');
    expect(res.text).toContain('/categories/test-weaves');
    expect(res.text).toContain('/faq');
    expect(res.text).toContain('/become-a-maker');
    expect(res.text).toContain('/blog/best-himachali-products-to-buy-online');
    expect(res.text).toContain('/images/product-shawl.jpg');
    expect(res.text).toContain('/images/weaving.jpg');

    // Demo, ₹1 test, and empty category excluded
    expect(res.text).not.toContain('/shop/demo-wool-shawl');
    expect(res.text).not.toContain('/shop/fresh-banana');
    expect(res.text).not.toContain('/makers/kullu-collective-demo');
    expect(res.text).not.toContain('/categories/empty-crafts');
  });

  it('publishes /robots.txt allowing /sell and /sellers/ while blocking private routes', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Allow: /');
    expect(res.text).toContain('Allow: /sellers/');
    expect(res.text).toContain('Disallow: /admin');
    expect(res.text).toContain('Disallow: /seller');
    expect(res.text).toContain('Disallow: /cart');
    expect(res.text).not.toMatch(/^Disallow:\s*\/sell\s*$/m);
    expect(res.text).toContain('Sitemap:');
  });

  it('serves a compliant Google Merchant Center XML product feed excluding demo/test items', async () => {
    // Add demo product & ₹1 test product
    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, status, is_demo)
       VALUES ('prd_demo_feed', ?, ?, 'Demo Feed Shawl', 'demo-feed-shawl', 'Demo item', 'Demo', 200000, 'DEMO-FEED-1', 'approved', 1)`,
      IDS.seller,
      IDS.category,
    );
    execute(db, "INSERT INTO inventory (product_id, quantity) VALUES ('prd_demo_feed', 10)");

    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, status, is_demo)
       VALUES ('prd_test_1r', ?, ?, 'Fresh Banana', 'fresh-banana', 'Listed for ₹1 test transaction.', 'Test', 100, 'BANANA-1', 'approved', 0)`,
      IDS.seller,
      IDS.category,
    );
    execute(db, "INSERT INTO inventory (product_id, quantity) VALUES ('prd_test_1r', 99)");

    // Mark second-shawl out of stock (quantity 2, reserved 2)
    execute(db, 'UPDATE inventory SET quantity = 2, reserved_quantity = 2 WHERE product_id = ?', IDS.product2);

    // Extra image + active campaign discount on primary product
    execute(
      db,
      "INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES ('img_2', ?, '/images/weaving.jpg', 'Weave detail', 1)",
      IDS.product,
    );
    execute(
      db,
      `INSERT INTO campaigns (id, name, slug, description, status, max_discount_bp)
       VALUES ('cmp_feed', 'Winter Sale', 'winter-sale', 'Seasonal promo', 'active', 3000)`,
    );
    execute(
      db,
      'INSERT INTO campaign_products (campaign_id, product_id, promo_price_paise) VALUES (?, ?, 75000)',
      'cmp_feed',
      IDS.product,
    );

    const res = await request(app).get('/feeds/google-merchant.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('xmlns:g="http://base.google.com/ns/1.0"');

    // Primary product with promo price & free shipping (> 699 INR)
    expect(res.text).toContain('<g:id>TEST-SHAWL</g:id>');
    expect(res.text).toContain('<g:price>1000.00 INR</g:price>');
    expect(res.text).toContain('<g:sale_price>750.00 INR</g:sale_price>');
    expect(res.text).toContain('<g:availability>in_stock</g:availability>');
    expect(res.text).toContain('<g:additional_image_link>');
    expect(res.text).toContain('/images/weaving.jpg</g:additional_image_link>');
    expect(res.text).toContain('<g:identifier_exists>false</g:identifier_exists>');

    // Out of stock second product (< 699 INR => 29.00 INR shipping)
    expect(res.text).toContain('<g:id>TEST-SHAWL-2</g:id>');
    expect(res.text).toContain('<g:availability>out_of_stock</g:availability>');
    expect(res.text).toContain('<g:price>29.00 INR</g:price>');

    // Demo & ₹1 test listings excluded
    expect(res.text).not.toContain('DEMO-FEED-1');
    expect(res.text).not.toContain('fresh-banana');
  });

  it('reflects live stock availability, promo price, and aggregateRating in Product structured data', async () => {
    const baseHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    // 1. In stock, no reviews yet => InStock, no aggregateRating
    const seoInStock = getSeoMetadata(db, '/shop/test-shawl', 'www.dearhills.in');
    expect(seoInStock.noindex).toBe(false);
    const htmlInStock = injectSeoIntoHtml(baseHtml, seoInStock);
    const ld1 = extractJsonLd(htmlInStock) as { '@graph': Record<string, unknown>[] };
    const prod1 = ld1['@graph'].find((n) => n['@type'] === 'Product') as {
      offers: { availability: string; price: string };
      aggregateRating?: unknown;
    };
    expect(prod1.offers.availability).toBe('https://schema.org/InStock');
    expect(prod1.offers.price).toBe('1000.00');
    expect(prod1.aggregateRating).toBeUndefined();

    // 2. Out of stock + active campaign + published & rejected reviews
    execute(db, 'UPDATE inventory SET quantity = 3, reserved_quantity = 3 WHERE product_id = ?', IDS.product);
    execute(
      db,
      `INSERT INTO campaigns (id, name, slug, description, status, max_discount_bp)
       VALUES ('cmp_seo', 'Winter Offer', 'winter-offer', 'Promo', 'active', 3000)`,
    );
    execute(
      db,
      'INSERT INTO campaign_products (campaign_id, product_id, promo_price_paise) VALUES (?, ?, 70000)',
      'cmp_seo',
      IDS.product,
    );

    // Create dummy order + order_items for FK integrity on reviews
    execute(
      db,
      `INSERT INTO orders (id, order_number, user_id, email, status, subtotal_paise, total_paise, shipping_address, idempotency_key, placed_at, is_demo)
       VALUES ('ord_rev', 'PR-REV-1', ?, 'customer@test.local', 'fulfilled', 100000, 100000, '{}', 'idk_rev_1', '2026-11-01T00:00:00Z', 0)`,
      IDS.customer,
    );
    execute(
      db,
      `INSERT INTO seller_orders (id, order_id, seller_id, reference, status, subtotal_paise, total_paise, commission_rate_bp, commission_paise, seller_earning_paise)
       VALUES ('so_rev', 'ord_rev', ?, 'PR-REV-1-1', 'delivered', 100000, 100000, 1200, 12000, 88000)`,
      IDS.seller,
    );
    execute(
      db,
      `INSERT INTO order_items (id, order_id, seller_order_id, product_id, seller_id, name, sku, unit_price_paise, quantity, line_subtotal_paise, commission_rate_bp, commission_paise, seller_earning_paise)
       VALUES ('oi_rev1', 'ord_rev', 'so_rev', ?, ?, 'Test Shawl', 'TEST-SHAWL', 100000, 1, 100000, 1200, 12000, 88000),
              ('oi_rev2', 'ord_rev', 'so_rev', ?, ?, 'Test Shawl', 'TEST-SHAWL', 100000, 1, 100000, 1200, 12000, 88000)`,
      IDS.product,
      IDS.seller,
      IDS.product,
      IDS.seller,
    );
    execute(
      db,
      `INSERT INTO reviews (id, product_id, user_id, order_item_id, rating, title, body, status)
       VALUES ('rev_1', ?, ?, 'oi_rev1', 5, 'Warm and authentic', 'Genuine wool shawl.', 'published'),
              ('rev_2', ?, ?, 'oi_rev2', 1, 'Spam', 'Ignored rejected review', 'rejected')`,
      IDS.product,
      IDS.customer,
      IDS.product,
      IDS.otherCustomer,
    );

    const seoOut = getSeoMetadata(db, '/shop/test-shawl', 'www.dearhills.in');
    const htmlOut = injectSeoIntoHtml(baseHtml, seoOut);
    const ld2 = extractJsonLd(htmlOut) as { '@graph': Record<string, unknown>[] };
    const prod2 = ld2['@graph'].find((n) => n['@type'] === 'Product') as {
      offers: { availability: string; price: string };
      aggregateRating: { ratingValue: number; reviewCount: number };
      review: Array<{ reviewBody: string }>;
    };
    expect(prod2.offers.availability).toBe('https://schema.org/OutOfStock');
    expect(prod2.offers.price).toBe('700.00');
    expect(prod2.aggregateRating).toMatchObject({ ratingValue: 5, reviewCount: 1 });
    expect(prod2.review).toHaveLength(1);
    expect(prod2.review[0].reviewBody).toBe('Genuine wool shawl.');

    // HTTP route check when dist exists
    const httpRes = await request(app).get('/shop/test-shawl');
    if (httpRes.headers['content-type']?.includes('text/html')) {
      expect(httpRes.status).toBe(200);
      expect(httpRes.headers['x-robots-tag']).toContain('index, follow');
      expect(httpRes.text).toContain('OutOfStock');
      expect(httpRes.text).toContain('"@type":"AggregateRating"');
    }
  });

  it('enforces demo noindex guard on demo products, ₹1 test listings, demo makers, and demo-only categories', async () => {
    execute(
      db,
      "INSERT INTO users (id, email, password_hash, email_verified) VALUES ('usr_d2', 'kullu@demo.pahadiroots.test', 'x', 1)",
    );
    execute(
      db,
      `INSERT INTO seller_profiles (id, user_id, business_name, slug, seller_type, region, status, store_status)
       VALUES ('sel_d2', 'usr_d2', 'Kullu Loom (demo)', 'kullu-loom-demo', 'cooperative', 'Kullu', 'approved', 'active')`,
    );
    execute(
      db,
      "INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES ('cat_demo_only', 'Demo Only Cat', 'demo-only-cat', 'Demo', 50, 1)",
    );
    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, status, is_demo)
       VALUES ('prd_d2', 'sel_d2', 'cat_demo_only', 'Demo Shawl', 'demo-shawl', 'Demo shawl', 'Long description.', 300000, 'DEMO-SHW-2', 'approved', 1)`,
    );
    execute(db, "INSERT INTO inventory (product_id, quantity) VALUES ('prd_d2', 5)");

    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, status, is_demo)
       VALUES ('prd_banana', ?, ?, 'Fresh Banana', 'fresh-banana', 'Listed for ?1 test transaction.', 'Test.', 100, 'BANANA-01', 'approved', 0)`,
      IDS.seller,
      IDS.category,
    );
    execute(db, "INSERT INTO inventory (product_id, quantity) VALUES ('prd_banana', 99)");

    expect(getSeoMetadata(db, '/shop/demo-shawl', 'www.dearhills.in').noindex).toBe(true);
    expect(getSeoMetadata(db, '/shop/fresh-banana', 'www.dearhills.in').noindex).toBe(true);
    expect(getSeoMetadata(db, '/makers/kullu-loom-demo', 'www.dearhills.in').noindex).toBe(true);
    expect(getSeoMetadata(db, '/categories/demo-only-cat', 'www.dearhills.in').noindex).toBe(true);
    expect(getSeoMetadata(db, '/shop', 'www.dearhills.in', { q: 'shawl' }).noindex).toBe(true);
    expect(getSeoMetadata(db, '/cart', 'www.dearhills.in').noindex).toBe(true);
    expect(getSeoMetadata(db, '/forgot-password', 'www.dearhills.in').noindex).toBe(true);

    const missing = getSeoMetadata(db, '/shop/does-not-exist', 'www.dearhills.in');
    expect(missing.noindex).toBe(true);
    expect(missing.statusCode).toBe(404);

    const httpDemo = await request(app).get('/shop/demo-shawl');
    if (httpDemo.headers['content-type']?.includes('text/html')) {
      expect(httpDemo.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(httpDemo.text).toContain('<meta name="robots" content="noindex, nofollow" />');
    }
  });

  it('emits FAQPage structured data on /faq and blog posts, and handles all public routes cleanly', () => {
    const baseHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');

    const faqSeo = getSeoMetadata(db, '/faq', 'www.dearhills.in');
    expect(faqSeo.noindex).toBeFalsy();
    expect(faqSeo.canonicalUrl).toBe('https://www.dearhills.in/faq');
    const faqHtml = injectSeoIntoHtml(baseHtml, faqSeo);
    const faqLd = extractJsonLd(faqHtml) as { '@graph': Array<{ '@type': string; mainEntity?: unknown[] }> };
    const faqNode = faqLd['@graph'].find((n) => n['@type'] === 'FAQPage');
    expect(faqNode).toBeTruthy();
    expect(faqNode!.mainEntity!.length).toBeGreaterThanOrEqual(5);

    for (const post of BLOG_POSTS) {
      const blogSeo = getSeoMetadata(db, `/blog/${post.slug}`, 'www.dearhills.in');
      expect(blogSeo.noindex).toBeFalsy();
      expect(blogSeo.canonicalUrl).toBe(`https://www.dearhills.in/blog/${post.slug}`);
      const blogHtml = injectSeoIntoHtml(baseHtml, blogSeo);
      const blogLd = extractJsonLd(blogHtml) as { '@graph': Array<{ '@type': string }> };
      expect(blogLd['@graph'].some((n) => n['@type'] === 'BlogPosting')).toBe(true);
      expect(blogLd['@graph'].some((n) => n['@type'] === 'FAQPage')).toBe(true);
      expect(blogLd['@graph'].some((n) => n['@type'] === 'BreadcrumbList')).toBe(true);
    }

    const sellSeo = getSeoMetadata(db, '/sell', 'www.dearhills.in');
    expect(sellSeo.noindex).toBeFalsy();
    expect(sellSeo.canonicalUrl).toBe('https://www.dearhills.in/become-a-maker');

    const contactSeo = getSeoMetadata(db, '/contact', 'www.dearhills.in');
    expect(contactSeo.canonicalUrl).toBe('https://www.dearhills.in/contact');

    const policySeo = getSeoMetadata(db, '/policies/shipping', 'www.dearhills.in');
    expect(policySeo.canonicalUrl).toBe('https://www.dearhills.in/policies/shipping');
  });

  it('prevents duplicate canonical/og:url/robots/json-ld tags and escapes </script> in JSON-LD', () => {
    const baseHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const seo = getSeoMetadata(db, '/shop/test-shawl', 'www.dearhills.in');
    seo.jsonLd = { '@context': 'https://schema.org', '@type': 'Thing', name: '</script><script>alert(1)</script>' };

    const out = injectSeoIntoHtml(baseHtml, seo);
    expect(out.match(/rel="canonical"/gi)).toHaveLength(1);
    expect(out.match(/property="og:url"/gi)).toHaveLength(1);
    expect(out.match(/name="robots"/gi)).toHaveLength(1);
    expect(out.match(/id="seo-structured-data"/gi)).toHaveLength(1);
    expect(out).toContain('content="Test Shawl — Authentic Handloom Himachal | Dear Hills"');
    expect(out).toContain('<meta name="twitter:title" content="Test Shawl');
    expect(out).not.toContain('</script><script>alert(1)');
    expect(out).toContain('\\u003c/script>');
  });

  it('keeps all blog post relatedProductSlugs aligned with seeded catalog slugs', () => {
    const seedSrc = fs.readFileSync(path.resolve(process.cwd(), 'server', 'seed.ts'), 'utf8');
    const seededSlugs = new Set([...seedSrc.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]));
    for (const post of BLOG_POSTS) {
      expect(post.relatedProductSlugs.length).toBeGreaterThan(0);
      for (const productSlug of post.relatedProductSlugs) {
        expect(seededSlugs.has(productSlug)).toBe(true);
      }
    }
  });

  it('handles repeated query params, malformed percent-encoding, and filtered maker/offer pages safely', async () => {
    const dupQuerySeo = getSeoMetadata(db, '/shop', 'www.dearhills.in', {
      q: ['shawl', 'honey'],
      page: ['2', '3'],
    });
    expect(dupQuerySeo.noindex).toBe(true);
    expect(dupQuerySeo.title).toContain('shawl');

    const dupCatSeo = getSeoMetadata(db, '/shop', 'www.dearhills.in', {
      category: ['test-weaves', 'other'],
    });
    expect(dupCatSeo.canonicalUrl).toBe('https://www.dearhills.in/categories/test-weaves');
    expect(dupCatSeo.noindex).toBe(false);

    const malformedProduct = getSeoMetadata(db, '/shop/%E0%A4%A', 'www.dearhills.in');
    expect(malformedProduct.statusCode).toBe(404);
    expect(malformedProduct.noindex).toBe(true);

    const filteredMakers = getSeoMetadata(db, '/makers', 'www.dearhills.in', { q: 'kullu' });
    expect(filteredMakers.noindex).toBe(true);

    const filteredOffer = getSeoMetadata(db, '/offers/pahadi-festive-glow', 'www.dearhills.in', { sort: 'price_asc' });
    expect(filteredOffer.noindex).toBe(true);

    const httpDupQ = await request(app).get('/shop?q=shawl&q=honey');
    if (httpDupQ.headers['content-type']?.includes('text/html')) {
      expect(httpDupQ.status).toBe(200);
      expect(httpDupQ.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(httpDupQ.text).toContain('<meta name="robots" content="noindex, nofollow" />');
    }

    const httpMalformed = await request(app).get('/shop/%E0%A4%A');
    if (httpMalformed.headers['content-type']?.includes('text/html')) {
      expect(httpMalformed.status).toBe(404);
      expect(httpMalformed.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
  });

  it('disambiguates duplicate SKUs across sellers, strips XML control chars, and includes parent categories in sitemap', async () => {
    // Give second seller's product the SAME sku as primary seller's product
    execute(db, "UPDATE products SET sku = 'SHARED-SKU' WHERE id = ?", IDS.product);
    execute(db, "UPDATE products SET sku = 'SHARED-SKU', description = ? WHERE id = ?", 'Clean\u000b description', IDS.product2);

    // Add a campaign with explicit timestamps to verify clean ISO-8601 without ms in sale_price_effective_date
    execute(
      db,
      `INSERT INTO campaigns (id, name, slug, description, status, starts_at, ends_at, max_discount_bp)
       VALUES ('cmp_dates', 'Spring Offer', 'spring-offer', 'Promo', 'active', '2026-01-01T00:00:00.000Z', '2099-12-31T23:59:59.000Z', 3000)`,
    );
    execute(
      db,
      'INSERT INTO campaign_products (campaign_id, product_id, promo_price_paise) VALUES (?, ?, 75000)',
      'cmp_dates',
      IDS.product,
    );

    // Create a parent category wrapping cat_test
    execute(
      db,
      "INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES ('cat_parent', 'All Textiles', 'all-textiles', 'Parent category', 0, 1)",
    );
    execute(db, "UPDATE categories SET parent_id = 'cat_parent' WHERE id = ?", IDS.category);

    const feedRes = await request(app).get('/feeds/google-merchant.xml');
    expect(feedRes.status).toBe(200);
    const idMatches = [...feedRes.text.matchAll(/<g:id>([^<]+)<\/g:id>/g)].map((m) => m[1]);
    expect(idMatches).toHaveLength(2);
    expect(new Set(idMatches).size).toBe(2);
    expect(feedRes.text).not.toContain('\u000b');
    expect(feedRes.text).toContain('<g:sale_price_effective_date>2026-01-01T00:00:00Z/2099-12-31T23:59:59Z</g:sale_price_effective_date>');

    const sitemapRes = await request(app).get('/sitemap.xml');
    expect(sitemapRes.status).toBe(200);
    expect(sitemapRes.text).toContain('/categories/all-textiles');
    expect(getSeoMetadata(db, '/categories/all-textiles', 'www.dearhills.in').noindex).toBe(false);
  });

  it('preserves $&, $$, and $1 sequences in injectSeoIntoHtml without regex replacement corruption', () => {
    const baseHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const seo = getSeoMetadata(db, '/shop/test-shawl', 'www.dearhills.in');
    seo.title = 'Save $$ & $100 $& Deal | Dear Hills';
    seo.description = 'Special $& price $1 description.';
    const out = injectSeoIntoHtml(baseHtml, seo);
    expect(out).toContain('<title>Save $$ &amp; $100 $&amp; Deal | Dear Hills</title>');
    expect(out).toContain('content="Special $&amp; price $1 description."');
  });

  it('uses accurate category-aware titles and fallback descriptions without mislabeling food/produce as Handcrafted', () => {
    const categories = [
      { id: 'cat_produce', name: 'Fruits & Fresh Produce', slug: 'fruits-and-fresh-produce' },
      { id: 'cat_tea', name: 'Kangra Orthodox Tea', slug: 'tea-and-infusions' },
      { id: 'cat_pantry', name: 'Wild Honey & Preserves', slug: 'pantry-and-preserves' },
      { id: 'cat_nuts', name: 'Dry Fruit & Nuts', slug: 'dry-fruit-and-nuts' },
      { id: 'cat_oils', name: 'Cold-Pressed Oils', slug: 'cold-pressed-oils' },
      { id: 'cat_craft', name: 'Handmade Crafts & Handicrafts', slug: 'crafts-and-handicrafts' },
    ];
    for (const c of categories) {
      execute(
        db,
        'INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, 10, 1)',
        c.id,
        c.name,
        c.slug,
        '',
      );
    }

    const items = [
      { id: 'prd_apples', cat: 'cat_produce', name: 'Apples', slug: 'apples', sku: 'APL-1', origin: null, region: 'Kinnaur' },
      { id: 'prd_tea', cat: 'cat_tea', name: 'Kangra valley green tea', slug: 'kangra-green-tea', sku: 'TEA-1', origin: 'Palampur, Kangra', region: 'Kangra' },
      { id: 'prd_honey', cat: 'cat_pantry', name: 'Lahaul wildflower honey', slug: 'lahaul-honey', sku: 'HON-1', origin: null, region: null },
      { id: 'prd_walnut', cat: 'cat_nuts', name: 'Kinnaur walnut kernels', slug: 'kinnaur-walnuts', sku: 'WAL-1', origin: 'Sangla Valley', region: 'Kinnaur' },
      { id: 'prd_oil', cat: 'cat_oils', name: 'Wild apricot kernel oil', slug: 'chuli-oil', sku: 'OIL-1', origin: 'Kalpa, Kinnaur', region: 'Kinnaur' },
      { id: 'prd_craft', cat: 'cat_craft', name: 'Carved Cedar Box', slug: 'carved-cedar-box', sku: 'CRF-1', origin: 'Chamba', region: 'Chamba' },
    ];
    for (const item of items) {
      execute(
        db,
        `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, origin_place, region, status, is_demo)
         VALUES (?, ?, ?, ?, ?, '', '', 60000, ?, ?, ?, 'approved', 0)`,
        item.id,
        IDS.seller,
        item.cat,
        item.name,
        item.slug,
        item.sku,
        item.origin,
        item.region,
      );
      execute(db, 'INSERT INTO inventory (product_id, quantity) VALUES (?, 5)', item.id);
    }

    const applesSeo = getSeoMetadata(db, '/shop/apples', 'www.dearhills.in');
    expect(applesSeo.title).toBe('Apples — Fresh Himachal Harvest | Dear Hills');
    expect(applesSeo.title.toLowerCase()).not.toContain('handcrafted');
    expect(applesSeo.description).toBe(
      'Buy fresh Apples harvested in Kinnaur. Direct from verified Himalayan growers on Dear Hills.',
    );
    expect(applesSeo.description.toLowerCase()).not.toContain('handcrafted');
    expect(applesSeo.title).toBe(
      buildProductSeoTitle({ name: 'Apples', categorySlug: 'fruits-and-fresh-produce', categoryName: 'Fruits & Fresh Produce' }),
    );
    expect(applesSeo.description).toBe(
      buildProductFallbackDescription({
        name: 'Apples',
        categorySlug: 'fruits-and-fresh-produce',
        categoryName: 'Fruits & Fresh Produce',
        originPlace: null,
        region: 'Kinnaur',
      }),
    );

    const teaSeo = getSeoMetadata(db, '/shop/kangra-green-tea', 'www.dearhills.in');
    expect(teaSeo.title).toBe('Kangra valley green tea — Authentic Himachal Tea | Dear Hills');
    expect(teaSeo.description).toContain('Palampur, Kangra');
    expect(teaSeo.title.toLowerCase()).not.toContain('handcrafted');
    expect(teaSeo.description.toLowerCase()).not.toContain('handcrafted');

    const honeySeo = getSeoMetadata(db, '/shop/lahaul-honey', 'www.dearhills.in');
    expect(honeySeo.title).toBe('Lahaul wildflower honey — Pure Himachal Pantry | Dear Hills');
    expect(honeySeo.description).toContain('Kullu');
    expect(honeySeo.title.toLowerCase()).not.toContain('handcrafted');
    expect(honeySeo.description.toLowerCase()).not.toContain('handcrafted');

    expect(
      buildProductFallbackDescription({
        name: 'Lahaul wildflower honey',
        categorySlug: 'pantry-and-preserves',
        categoryName: 'Wild Honey & Preserves',
        originPlace: null,
        region: null,
      }),
    ).toBe(
      'Buy pure Lahaul wildflower honey sourced from Himachal Pradesh. Authentic Himalayan harvest from verified local producers on Dear Hills.',
    );

    const walnutSeo = getSeoMetadata(db, '/shop/kinnaur-walnuts', 'www.dearhills.in');
    expect(walnutSeo.title).toBe('Kinnaur walnut kernels — Authentic Himalayan Harvest | Dear Hills');
    expect(walnutSeo.title.toLowerCase()).not.toContain('handcrafted');

    const oilSeo = getSeoMetadata(db, '/shop/chuli-oil', 'www.dearhills.in');
    expect(oilSeo.title).toBe('Wild apricot kernel oil — Pure Himachal Harvest | Dear Hills');
    expect(oilSeo.title.toLowerCase()).not.toContain('handcrafted');

    const craftSeo = getSeoMetadata(db, '/shop/carved-cedar-box', 'www.dearhills.in');
    expect(craftSeo.title).toBe('Carved Cedar Box — Authentic Handcrafted Himachal | Dear Hills');
    expect(craftSeo.description).toContain('handcrafted in Chamba');

    const produceCatSeo = getSeoMetadata(db, '/categories/fruits-and-fresh-produce', 'www.dearhills.in');
    expect(produceCatSeo.title).toBe('Fruits & Fresh Produce — Fresh Himachal Harvest | Dear Hills');
    expect(produceCatSeo.title.toLowerCase()).not.toContain('handcrafted');
    expect(produceCatSeo.description).toBe(
      buildCategoryFallbackDescription({ name: 'Fruits & Fresh Produce', slug: 'fruits-and-fresh-produce' }),
    );
    expect(produceCatSeo.title).toBe(
      buildCategorySeoTitle({ name: 'Fruits & Fresh Produce', slug: 'fruits-and-fresh-produce' }),
    );

    const knitwearCatTitle = buildCategorySeoTitle({ name: 'Knitwear', slug: 'knitwear' });
    expect(knitwearCatTitle).toBe('Knitwear — Authentic Himachali Woollens & Apparel | Dear Hills');
  });

  it('excludes demo-only active campaigns from sitemap and marks them noindex, while indexing campaigns with real products', async () => {
    const now = new Date().toISOString();
    execute(
      db,
      "INSERT INTO users (id, email, password_hash, email_verified) VALUES ('usr_demo_cmp', 'democmp@demo.pahadiroots.test', 'x', 1)",
    );
    execute(
      db,
      `INSERT INTO seller_profiles (id, user_id, business_name, slug, seller_type, region, status, store_status, created_at, updated_at)
       VALUES ('slr_demo_cmp', 'usr_demo_cmp', 'Kullu Loom (Demo)', 'kullu-loom-demo', 'cooperative', 'Kullu', 'approved', 'active', ?, ?)`,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, is_demo, status, created_at, updated_at)
       VALUES ('prd_demo_cmp', 'slr_demo_cmp', ?, 'Demo Shawl Offer', 'demo-shawl-offer', 'Demo item', 'Demo listing description long enough to pass checks cleanly.', 150000, 'DEMO-CMP-1', 1, 'approved', ?, ?)`,
      IDS.category,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO inventory (product_id, quantity, reserved_quantity) VALUES ('prd_demo_cmp', 5, 0)`,
    );

    execute(
      db,
      `INSERT INTO campaigns (id, name, slug, description, max_discount_bp, status, created_at, updated_at)
       VALUES ('cmp_demo_only', 'Demo Only Festival', 'demo-only-festival', 'Demo campaign summary', 2000, 'active', ?, ?)`,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO campaign_products (campaign_id, product_id, promo_price_paise, created_at)
       VALUES ('cmp_demo_only', 'prd_demo_cmp', 120000, ?)`,
      now,
    );

    execute(
      db,
      `INSERT INTO campaigns (id, name, slug, description, max_discount_bp, status, created_at, updated_at)
       VALUES ('cmp_real_offer', 'Real Harvest Edit', 'real-harvest-edit', 'Curated harvest collection from approved makers.', 2000, 'active', ?, ?)`,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO campaign_products (campaign_id, product_id, promo_price_paise, created_at)
       VALUES ('cmp_real_offer', ?, 85000, ?)`,
      IDS.product,
      now,
    );

    expect(countRealCampaignProducts(db, 'cmp_demo_only')).toBe(0);
    expect(countRealCampaignProducts(db, 'cmp_real_offer')).toBe(1);

    const sitemap = await request(app).get('/sitemap.xml').set('Host', 'www.dearhills.in');
    expect(sitemap.status).toBe(200);
    expect(sitemap.text).not.toContain('https://www.dearhills.in/offers/demo-only-festival');
    expect(sitemap.text).toContain('https://www.dearhills.in/offers/real-harvest-edit');

    const demoOfferSeo = getSeoMetadata(db, '/offers/demo-only-festival', 'www.dearhills.in');
    expect(demoOfferSeo.noindex).toBe(true);

    const realOfferSeo = getSeoMetadata(db, '/offers/real-harvest-edit', 'www.dearhills.in');
    expect(realOfferSeo.noindex).toBe(false);
  });

  it('marks ?featured=true category routes as noindex and uses seller region/fallback description in Merchant feed', async () => {
    const featuredCat = getSeoMetadata(db, '/categories/shawls?featured=true', 'www.dearhills.in');
    expect(featuredCat.noindex).toBe(true);

    const now = new Date().toISOString();
    execute(
      db,
      "INSERT INTO users (id, email, password_hash, email_verified) VALUES ('usr_kangra_orchard', 'kangra@orchard.example.in', 'x', 1)",
    );
    execute(
      db,
      `INSERT INTO seller_profiles (id, user_id, business_name, slug, seller_type, region, status, store_status, created_at, updated_at)
       VALUES ('slr_kangra_orchard', 'usr_kangra_orchard', 'Kangra Orchards', 'kangra-orchards', 'orchard', 'Kangra', 'approved', 'active', ?, ?)`,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES ('cat_orchard', 'Fruits & Fresh Produce', 'fruits-and-fresh-produce', 'Orchard fruit', 15, 1)`,
    );
    execute(
      db,
      `INSERT INTO products (id, seller_id, category_id, name, slug, short_description, description, price_paise, sku, region, is_demo, status, created_at, updated_at)
       VALUES ('prd_kangra_apples', 'slr_kangra_orchard', 'cat_orchard', 'Organic Apples', 'organic-apples', '<p> </p>', '   ', 45000, 'KNG-APL-1', NULL, 0, 'approved', ?, ?)`,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO inventory (product_id, quantity, reserved_quantity) VALUES ('prd_kangra_apples', 12, 0)`,
    );

    const feed = await request(app).get('/feeds/google-merchant.xml').set('Host', 'www.dearhills.in');
    expect(feed.status).toBe(200);
    expect(feed.text).toContain('<g:custom_label_0>Kangra</g:custom_label_0>');
    expect(feed.text).toContain('Buy fresh Organic Apples harvested in Kangra. Direct from verified Himalayan growers on Dear Hills.');
  });

  it('keeps fallback short/full descriptions non-handcrafted for produce/food and avoids duplicated Himachal labels', () => {
    const groups = [
      { slug: 'fruits-and-fresh-produce', name: 'Fruits & Fresh Produce', forbidHandcrafted: true },
      { slug: 'tea-and-infusions', name: 'Tea & Infusions', forbidHandcrafted: true },
      { slug: 'pantry-and-preserves', name: 'Wild Honey & Preserves', forbidHandcrafted: true },
      { slug: 'cold-pressed-oils', name: 'Cold-Pressed Oils', forbidHandcrafted: true },
      { slug: 'shawls-and-weaves', name: 'Shawls & Weaves', forbidHandcrafted: true },
      { slug: 'knitwear', name: 'Knitwear', forbidHandcrafted: true },
      { slug: 'crafts-and-handicrafts', name: 'Crafts & Handicrafts', forbidHandcrafted: false },
    ];

    for (const group of groups) {
      const shortBlank = buildProductShortFallback({
        name: 'Apples',
        categorySlug: group.slug,
        categoryName: group.name,
        originPlace: null,
        region: null,
      });
      const shortHp = buildProductShortFallback({
        name: 'Apples',
        categorySlug: group.slug,
        categoryName: group.name,
        originPlace: 'Himachal Pradesh',
        region: 'Himachal Pradesh',
      });
      const fullShortest = buildProductFallbackDescription({
        name: 'Hi',
        categorySlug: group.slug,
        categoryName: group.name,
        originPlace: null,
        region: null,
      });

      expect(shortBlank).not.toContain('Himachal Pradesh, Himachal Pradesh');
      expect(shortHp).not.toContain('Himachal Pradesh, Himachal Pradesh');
      expect(fullShortest.length).toBeGreaterThanOrEqual(80);
      if (group.forbidHandcrafted) {
        expect(shortBlank.toLowerCase()).not.toContain('handcrafted');
        expect(fullShortest.toLowerCase()).not.toContain('handcrafted');
      }
    }

    expect(isDemoProductInput({ sku: 'DEMO-100', pricePaise: 50000 })).toBe(true);
    expect(isDemoProductInput({ pricePaise: 100, sku: 'REAL-1' })).toBe(true);
    expect(isDemoProductInput({ sellerSlug: 'demo', pricePaise: 50000 })).toBe(true);
    expect(isDemoProductInput({ sellerSlug: 'kullu-demo', pricePaise: 50000 })).toBe(true);
    expect(isDemoProductInput({ sellerName: 'Orchard (Demo)', pricePaise: 50000 })).toBe(true);
    expect(isDemoProductInput({ shortDescription: 'Created for Test Transaction checks', pricePaise: 50000 })).toBe(true);
    expect(
      isDemoProductInput({
        isDemo: false,
        sku: 'KNG-01',
        pricePaise: 45000,
        shortDescription: 'Fresh orchard harvest',
        sellerSlug: 'kangra-orchards',
        sellerName: 'Kangra Orchards',
      }),
    ).toBe(false);
  });

  it('emits dearhills alternateName, 192x192 PNG ImageObject logo, first-byte SSR shell, and manifest/icons', () => {
    const baseHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    expect(baseHtml).toContain('href="/favicon-48x48.png"');
    expect(baseHtml).toContain('href="/favicon-192x192.png"');
    expect(baseHtml).toContain('href="/site.webmanifest"');

    const homeSeo = getSeoMetadata(db, '/', 'www.dearhills.in');
    expect(homeSeo.title).toContain('DearHills.in');
    expect(homeSeo.description.toLowerCase()).toContain('dearhills');
    const htmlHome = injectSeoIntoHtml(baseHtml, homeSeo);
    const ldHome = extractJsonLd(htmlHome) as {
      '@graph': Array<{ '@type': string; alternateName?: string[]; logo?: { '@type': string; url: string; width: number; height: number } }>;
    };
    const org = ldHome['@graph'].find((n) => n['@type'] === 'Organization');
    const site = ldHome['@graph'].find((n) => n['@type'] === 'WebSite');
    expect(org?.alternateName).toEqual(expect.arrayContaining(['DEAR HILLS', 'DearHills', 'dearhills', 'dearhills.in']));
    expect(site?.alternateName).toEqual(expect.arrayContaining(['DearHills', 'dearhills']));
    expect(org?.logo).toMatchObject({
      '@type': 'ImageObject',
      url: 'https://www.dearhills.in/favicon-192x192.png',
      width: 192,
      height: 192,
    });
    expect(htmlHome).toContain('<h1>DEAR HILLS');
    expect(htmlHome).toContain('<nav aria-label="Dear Hills primary navigation"');

    const noindexSeo = getSeoMetadata(db, '/cart', 'www.dearhills.in');
    const htmlCart = injectSeoIntoHtml(baseHtml, noindexSeo);
    expect(htmlCart).not.toContain('Dear Hills primary navigation');
  });
});
