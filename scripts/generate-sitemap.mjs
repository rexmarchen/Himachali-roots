#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const dbPath = path.resolve(root, 'data', 'pahadi-roots.db');
const isDirectRun = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!fs.existsSync(dbPath)) {
  console.log('Database not found at data/pahadi-roots.db, skipping static sitemap generation.');
  // `build-web.mjs` imports this module. Exiting here would terminate the
  // whole build process before Vite runs, so only exit when executed directly.
  if (isDirectRun) process.exit(0);
  throw new Error('Sitemap generation skipped: database not found');
}

const db = new DatabaseSync(dbPath);
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

const escape = (value) =>
  String(value)
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
  { path: '/about', priority: '0.7', changefreq: 'monthly' },
  { path: '/sourcing', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact', priority: '0.6', changefreq: 'monthly' },
  { path: '/faq', priority: '0.6', changefreq: 'monthly' },
];

const policyPaths = ['shipping', 'returns', 'privacy', 'terms', 'seller-terms', 'authenticity', 'cookies'].map(
  (key) => `/policies/${key}`,
);

const categories = db
  .prepare('SELECT slug FROM categories WHERE is_active = 1 ORDER BY sort_order ASC')
  .all();

const products = db
  .prepare(
    `SELECT p.slug, p.name, p.updated_at,
            (SELECT url FROM product_images WHERE product_id = p.id ORDER BY sort_order ASC LIMIT 1) as image_url
     FROM products p
     JOIN seller_profiles s ON s.id = p.seller_id
     WHERE p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'`,
  )
  .all();

const sellers = db
  .prepare("SELECT slug FROM seller_profiles WHERE status = 'approved' AND store_status = 'active'")
  .all();

const campaigns = db
  .prepare("SELECT slug FROM campaigns WHERE status = 'active'")
  .all();

const urls = [
  ...staticEntries.map(
    (e) =>
      `<url><loc>${escape(BASE_URL + e.path)}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
  ),
  ...categories.map(
    (c) =>
      `<url><loc>${escape(`${BASE_URL}/categories/${c.slug}`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
  ),
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
    const lastmod = p.updated_at ? p.updated_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
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
Disallow: /account
Disallow: /admin
Disallow: /seller
Disallow: /sell
Disallow: /checkout
Disallow: /api/
Disallow: /onboarding

Sitemap: ${BASE_URL}/sitemap.xml
`;

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'sitemap.xml'), sitemapXml, 'utf8');
fs.writeFileSync(path.join(root, 'public', 'robots.txt'), robotsTxt, 'utf8');

if (fs.existsSync(path.join(root, 'dist'))) {
  fs.writeFileSync(path.join(root, 'dist', 'sitemap.xml'), sitemapXml, 'utf8');
  fs.writeFileSync(path.join(root, 'dist', 'robots.txt'), robotsTxt, 'utf8');
}

console.log(
  `Generated sitemap.xml with ${
    staticEntries.length + categories.length + campaigns.length + sellers.length + products.length + policyPaths.length
  } URLs and updated robots.txt.`,
);
