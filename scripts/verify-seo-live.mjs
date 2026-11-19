import assert from 'node:assert';

const BASE = 'http://localhost:8787';

async function runTests() {
  console.log('--- Starting Live SEO Verification ---');

  // 1. Health
  const health = await fetch(`${BASE}/api/health/ready`).then((r) => r.json());
  assert.strictEqual(health.status, 'ok', 'Health status should be ok');
  console.log('✓ Health ready check passed');

  // 2. Robots.txt
  const robotsRes = await fetch(`${BASE}/robots.txt`);
  assert.strictEqual(robotsRes.status, 200, 'Robots.txt status 200');
  const robotsText = await robotsRes.text();
  assert.ok(robotsText.includes('User-agent: *'), 'Robots.txt has user-agent');
  assert.ok(robotsText.includes('Disallow: /admin'), 'Robots.txt disallows admin');
  assert.ok(robotsText.includes('Disallow: /checkout'), 'Robots.txt disallows checkout');
  assert.ok(robotsText.includes('Sitemap:'), 'Robots.txt has Sitemap directive');
  console.log('✓ /robots.txt verified:\n' + robotsText.trim());

  // 3. Sitemap.xml
  const sitemapRes = await fetch(`${BASE}/sitemap.xml`);
  assert.strictEqual(sitemapRes.status, 200, 'Sitemap.xml status 200');
  assert.ok(sitemapRes.headers.get('content-type')?.includes('xml'), 'Sitemap content-type is xml');
  const sitemapXml = await sitemapRes.text();
  assert.ok(sitemapXml.includes('<loc>'), 'Sitemap has loc tags');
  assert.ok(sitemapXml.includes('/shop'), 'Sitemap has /shop');
  assert.ok(sitemapXml.includes('/shop?category='), 'Sitemap has category URLs');
  assert.ok(sitemapXml.includes('/shop/kullu-handwoven-wool-shawl'), 'Sitemap has Kullu shawl product');
  assert.ok(sitemapXml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'), 'Sitemap has image namespace');
  assert.ok(sitemapXml.includes('<image:image>'), 'Sitemap has product image tags');
  console.log('✓ /sitemap.xml verified (length: ' + sitemapXml.length + ' chars)');

  // 4. Homepage Pre-rendered HTML
  const homeRes = await fetch(`${BASE}/`, { headers: { 'x-forwarded-host': 'dearhills.in' } });
  assert.strictEqual(homeRes.status, 200, 'Homepage status 200');
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes('DEAR HILLS — Authentic Himalayan Handloom'), 'Home has title');
  assert.ok(homeHtml.includes('<link rel="canonical" href="https://dearhills.in/" />'), 'Home has canonical');
  assert.ok(homeHtml.includes('id="seo-structured-data"'), 'Home has JSON-LD');
  assert.ok(homeHtml.includes('"@type":"Organization"'), 'Home has Organization schema');
  assert.ok(homeHtml.includes('"@type":"WebSite"'), 'Home has WebSite schema');
  console.log('✓ Homepage SEO Pre-rendering & Organization Schema verified');

  // 5. Product Page Pre-rendered HTML
  const productRes = await fetch(`${BASE}/shop/kullu-handwoven-wool-shawl`, { headers: { 'x-forwarded-host': 'dearhills.in' } });
  assert.strictEqual(productRes.status, 200, 'Product page status 200');
  const productHtml = await productRes.text();
  assert.ok(productHtml.includes('<title>Kullu handwoven wool shawl — Authentic Handcrafted Himachal | Dear Hills</title>'), 'Product has title');
  assert.ok(productHtml.includes('<link rel="canonical" href="https://dearhills.in/shop/kullu-handwoven-wool-shawl" />'), 'Product has canonical');
  assert.ok(productHtml.includes('"@type":"Product"'), 'Product has Product schema');
  assert.ok(productHtml.includes('"priceCurrency":"INR"'), 'Product has priceCurrency INR');
  assert.ok(productHtml.includes('"price":"6800.00"'), 'Product has price 6800.00');
  assert.ok(productHtml.includes('"availability":"https://schema.org/InStock"'), 'Product has InStock');
  assert.ok(productHtml.includes('"@type":"BreadcrumbList"'), 'Product has BreadcrumbList');
  console.log('✓ Product Page Pre-rendering & Google Shopping Product Schema verified');

  // 6. Shop Catalog Pre-rendered HTML
  const shopRes = await fetch(`${BASE}/shop`, { headers: { 'x-forwarded-host': 'dearhills.in' } });
  assert.strictEqual(shopRes.status, 200, 'Shop page status 200');
  const shopHtml = await shopRes.text();
  assert.ok(shopHtml.includes('<title>Shop Authentic Himachal Handloom, Organic Foods &amp; Mountain Crafts | Dear Hills</title>'), 'Shop has title');
  assert.ok(shopHtml.includes('"@type":"CollectionPage"'), 'Shop has CollectionPage schema');
  console.log('✓ Shop Catalog SEO Pre-rendering verified');

  // 7. Private Route Noindex
  const accountRes = await fetch(`${BASE}/account`, { headers: { 'x-forwarded-host': 'dearhills.in' } });
  assert.strictEqual(accountRes.status, 200, 'Account page status 200');
  const accountHtml = await accountRes.text();
  assert.ok(accountHtml.includes('<meta name="robots" content="noindex, nofollow" />'), 'Account has noindex');
  console.log('✓ Private Account Route Noindex verified');

  console.log('\n🌟 ALL LIVE SEO & INDEXING TESTS PASSED PERFECTLY! 🌟');
}

runTests().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
