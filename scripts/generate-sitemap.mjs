#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const dbPath = path.resolve(root, 'data', 'pahadi-roots.db');
const isDirectRun = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const distOnly = process.argv.includes('--dist-only');

const BASE_URL = 'https://www.dearhills.in';

const BLOG_POSTS = [
  {
    slug: 'best-himachali-products-to-buy-online',
    title: 'Best Himachali Products to Buy Online: From Kullu Shawls to Wild Forest Honey',
    coverImage: '/images/home/kalpa-dawn-1100.jpg',
    publishedAt: '2026-11-10',
  },
  {
    slug: 'kullu-vs-kinnauri-shawl-difference',
    title: 'Kullu vs Kinnauri Shawl: Weaving Techniques, Geometric Motifs & How to Tell the Difference',
    coverImage: '/images/product-shawl.jpg',
    publishedAt: '2026-11-08',
  },
  {
    slug: 'famous-authentic-gifts-from-himachal-pradesh',
    title: '7 Famous Souvenirs & Gifts from Himachal Pradesh That Support Local Artisans',
    coverImage: '/images/editorial-terrace.jpg',
    publishedAt: '2026-11-05',
  },
  {
    slug: 'how-to-identify-authentic-pahadi-honey',
    title: 'How to Identify Pure, Raw Pahadi Honey vs Supermarket Adulterated Honey',
    coverImage: '/images/product-honey.jpg',
    publishedAt: '2026-11-01',
  },
  {
    slug: 'kangra-orthodox-tea-first-flush-guide',
    title: 'Kangra Orthodox Tea Guide: Why Himachal’s First Flush is India’s Hidden Gem',
    coverImage: '/images/product-tea.jpg',
    publishedAt: '2026-10-28',
  },
];

const stripXmlControlChars = (value) => {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code !== 0x7f)) {
      out += value[i];
    }
  }
  return out;
};

const escape = (value) =>
  stripXmlControlChars(String(value))
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const staticEntries = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/shop', priority: '0.9', changefreq: 'daily' },
  { path: '/blog', priority: '0.8', changefreq: 'daily' },
  { path: '/makers', priority: '0.8', changefreq: 'weekly' },
  { path: '/become-a-maker', priority: '0.8', changefreq: 'weekly' },
  { path: '/about', priority: '0.7', changefreq: 'monthly' },
  { path: '/sourcing', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/faq', priority: '0.6', changefreq: 'monthly' },
];

const policyPaths = ['shipping', 'returns', 'privacy', 'terms', 'seller-terms', 'authenticity', 'cookies'].map(
  (key) => `/policies/${key}`,
);

const DEMO_SELLER_SQL = `(
  LOWER(s.slug) LIKE '%-demo'
  OR LOWER(s.slug) = 'demo'
  OR LOWER(s.business_name) LIKE '%(demo)%'
  OR (u.email IS NOT NULL AND LOWER(u.email) LIKE '%.test')
)`;

const DEMO_PRODUCT_SQL = `(
  p.is_demo = 1
  OR UPPER(p.sku) LIKE 'DEMO-%'
  OR p.price_paise <= 100
  OR LOWER(p.short_description) LIKE '%test transaction%'
  OR ${DEMO_SELLER_SQL}
)`;

let categories = [];
let products = [];
let sellers = [];
let campaigns = [];

if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);
  categories = db
    .prepare(
      `SELECT c.slug,
              (SELECT MAX(p.updated_at)
                 FROM products p
                 JOIN seller_profiles s ON s.id = p.seller_id
                 LEFT JOIN users u ON u.id = s.user_id
                WHERE (p.category_id = c.id OR p.category_id IN (SELECT ch.id FROM categories ch WHERE ch.parent_id = c.id AND ch.is_active = 1))
                  AND p.status = 'approved'
                  AND s.status = 'approved'
                  AND s.store_status = 'active'
                  AND NOT ${DEMO_PRODUCT_SQL}) AS last_updated
         FROM categories c
        WHERE c.is_active = 1
          AND EXISTS (
            SELECT 1
              FROM products p
              JOIN seller_profiles s ON s.id = p.seller_id
              LEFT JOIN users u ON u.id = s.user_id
             WHERE (p.category_id = c.id OR p.category_id IN (SELECT ch.id FROM categories ch WHERE ch.parent_id = c.id AND ch.is_active = 1))
               AND p.status = 'approved'
               AND s.status = 'approved'
               AND s.store_status = 'active'
               AND NOT ${DEMO_PRODUCT_SQL}
          )
        ORDER BY c.sort_order ASC`,
    )
    .all();

  products = db
    .prepare(
      `SELECT p.slug, p.name, p.updated_at,
              (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) as image_url
       FROM products p
       JOIN seller_profiles s ON s.id = p.seller_id
       LEFT JOIN users u ON u.id = s.user_id
       WHERE p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'
         AND NOT ${DEMO_PRODUCT_SQL}`,
    )
    .all();

  sellers = db
    .prepare(
      `SELECT s.slug
       FROM seller_profiles s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.status = 'approved' AND s.store_status = 'active'
         AND NOT ${DEMO_SELLER_SQL}`,
    )
    .all();

  campaigns = db
    .prepare(
      `SELECT c.slug
         FROM campaigns c
        WHERE c.status = 'active'
          AND (c.starts_at IS NULL OR c.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          AND (c.ends_at IS NULL OR c.ends_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          AND EXISTS (
            SELECT 1
              FROM campaign_products cp
              JOIN products p ON p.id = cp.product_id
              JOIN seller_profiles s ON s.id = p.seller_id
             WHERE cp.campaign_id = c.id
               AND p.status = 'approved'
               AND s.status = 'approved'
               AND cp.promo_price_paise < p.price_paise
               AND (p.price_paise - cp.promo_price_paise) * 10000 <= c.max_discount_bp * p.price_paise
          )`,
    )
    .all();

  db.close();
} else if (!isDirectRun) {
  console.log('Database not found at data/pahadi-roots.db, skipping static sitemap generation.');
}

const urls = [
  ...staticEntries.map(
    (e) =>
      `<url><loc>${escape(BASE_URL + e.path)}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
  ),
  ...categories.map((c) => {
    const lastmod = c.last_updated ? `<lastmod>${escape(String(c.last_updated).slice(0, 10))}</lastmod>` : '';
    return `<url><loc>${escape(`${BASE_URL}/categories/${c.slug}`)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority></url>`;
  }),
  ...campaigns.map(
    (c) =>
      `<url><loc>${escape(`${BASE_URL}/offers/${c.slug}`)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
  ),
  ...sellers.map(
    (s) =>
      `<url><loc>${escape(`${BASE_URL}/makers/${s.slug}`)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
  ),
  ...products.map((p) => {
    const fullImg = p.image_url
      ? p.image_url.startsWith('http')
        ? p.image_url
        : `${BASE_URL}${p.image_url}`
      : null;
    const imgTag = fullImg
      ? `<image:image><image:loc>${escape(fullImg)}</image:loc><image:title>${escape(p.name)}</image:title></image:image>`
      : '';
    const lastmod = p.updated_at ? String(p.updated_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `<url><loc>${escape(`${BASE_URL}/shop/${p.slug}`)}</loc><lastmod>${escape(lastmod)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>${imgTag}</url>`;
  }),
  ...BLOG_POSTS.map((post) => {
    const fullImg = post.coverImage.startsWith('http') ? post.coverImage : `${BASE_URL}${post.coverImage}`;
    return `<url><loc>${escape(`${BASE_URL}/blog/${post.slug}`)}</loc><lastmod>${escape(post.publishedAt)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority><image:image><image:loc>${escape(fullImg)}</image:loc><image:title>${escape(post.title)}</image:title></image:image></url>`;
  }),
  ...policyPaths.map(
    (p) =>
      `<url><loc>${escape(BASE_URL + p)}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
  ),
].join('');

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;

const robotsTxt = `User-agent: *
Allow: /
Allow: /sellers/
Disallow: /account
Disallow: /admin
Disallow: /seller
Disallow: /checkout
Disallow: /api/
Disallow: /onboarding
Disallow: /cart
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /verify-email

Sitemap: ${BASE_URL}/sitemap.xml
`;

if (!distOnly) {
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), sitemapXml, 'utf8');
  fs.writeFileSync(path.join(root, 'public', 'robots.txt'), robotsTxt, 'utf8');
}

if (fs.existsSync(path.join(root, 'dist'))) {
  fs.writeFileSync(path.join(root, 'dist', 'sitemap.xml'), sitemapXml, 'utf8');
  fs.writeFileSync(path.join(root, 'dist', 'robots.txt'), robotsTxt, 'utf8');
}

console.log(
  `Generated sitemap.xml with ${
    staticEntries.length + categories.length + campaigns.length + sellers.length + products.length + BLOG_POSTS.length + policyPaths.length
  } URLs and updated robots.txt.`,
);
