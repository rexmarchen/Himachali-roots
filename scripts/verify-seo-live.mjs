import assert from 'node:assert';

const BASE = process.env.SEO_VERIFY_URL ?? 'http://localhost:8787';

async function runTests() {
  console.log(`--- Starting Live SEO Verification (${BASE}) ---`);

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
  assert.ok(!robotsText.includes('\nDisallow: /sell\n'), 'Robots.txt does not block /sell landing page');
  assert.ok(robotsText.includes('Sitemap:'), 'Robots.txt has Sitemap directive');
  console.log('✓ /robots.txt verified');

  // 3. Sitemap.xml
  const sitemapRes = await fetch(`${BASE}/sitemap.xml`);
  assert.strictEqual(sitemapRes.status, 200, 'Sitemap.xml status 200');
  assert.ok(sitemapRes.headers.get('content-type')?.includes('xml'), 'Sitemap content-type is xml');
  const sitemapXml = await sitemapRes.text();
  assert.ok(sitemapXml.includes('<loc>'), 'Sitemap has loc tags');
  assert.ok(sitemapXml.includes('/shop'), 'Sitemap has /shop');
  assert.ok(sitemapXml.includes('/faq'), 'Sitemap has /faq');
  assert.ok(sitemapXml.includes('/blog/best-himachali-products-to-buy-online'), 'Sitemap has blog articles');
  assert.ok(!sitemapXml.includes('-demo</loc>'), 'Sitemap excludes demo sellers');
  assert.ok(!sitemapXml.includes('/shop/fresh-banana</loc>'), 'Sitemap excludes ₹1 test listing');
  assert.ok(sitemapXml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'), 'Sitemap has image namespace');
  console.log('✓ /sitemap.xml verified (length: ' + sitemapXml.length + ' chars)');

  // 4. Google Merchant Feed
  const feedRes = await fetch(`${BASE}/feeds/google-merchant.xml`);
  assert.strictEqual(feedRes.status, 200, 'Merchant feed status 200');
  assert.ok(feedRes.headers.get('content-type')?.includes('xml'), 'Merchant feed content-type is xml');
  const feedXml = await feedRes.text();
  assert.ok(feedXml.includes('xmlns:g="http://base.google.com/ns/1.0"'), 'Merchant feed has Google namespace');
  assert.ok(!feedXml.includes('DEMO-'), 'Merchant feed excludes demo SKUs');
  assert.ok(!feedXml.includes('fresh-banana'), 'Merchant feed excludes ₹1 test listing');
  console.log('✓ /feeds/google-merchant.xml verified');

  // 5. Homepage Pre-rendered HTML
  const homeRes = await fetch(`${BASE}/`, { headers: { 'x-forwarded-host': 'www.dearhills.in' } });
  assert.strictEqual(homeRes.status, 200, 'Homepage status 200');
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes('DEAR HILLS — Authentic Himalayan Handloom'), 'Home has title');
  assert.ok(homeHtml.includes('<link rel="canonical" href="https://www.dearhills.in/" />'), 'Home has canonical');
  assert.ok(homeHtml.includes('id="seo-structured-data"'), 'Home has JSON-LD');
  assert.ok(homeHtml.includes('"@type":"Organization"'), 'Home has Organization schema');
  assert.ok(homeHtml.includes('"@type":"WebSite"'), 'Home has WebSite schema');
  console.log('✓ Homepage SEO Pre-rendering & Organization Schema verified');

  // 6. Demo Product Noindex Guard & Category-Aware Title Check
  const demoProductRes = await fetch(`${BASE}/shop/kullu-handwoven-wool-shawl`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.strictEqual(demoProductRes.status, 200, 'Demo product page status 200');
  const demoProductHtml = await demoProductRes.text();
  assert.ok(demoProductHtml.includes('<meta name="robots" content="noindex, nofollow" />'), 'Demo product has noindex');
  assert.ok(demoProductHtml.includes('"@type":"Product"'), 'Demo product still has Product schema');
  assert.ok(demoProductHtml.includes('"@type":"BreadcrumbList"'), 'Demo product has BreadcrumbList');
  assert.ok(
    demoProductHtml.includes('Authentic Handloom Himachal | Dear Hills'),
    'Shawl product uses handloom title template',
  );
  console.log('✓ Demo Product Noindex Guard verified');

  // 6b. Category-Aware Non-Handcrafted SEO Title Checks (Tea + Produce if present)
  const teaRes = await fetch(`${BASE}/shop/kangra-valley-green-tea`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.strictEqual(teaRes.status, 200, 'Tea product page status 200');
  const teaHtml = await teaRes.text();
  assert.ok(
    teaHtml.includes('Authentic Himachal Tea | Dear Hills') && !teaHtml.includes('Authentic Handcrafted Himachal'),
    'Tea product uses tea-specific non-handcrafted title',
  );

  const applesRes = await fetch(`${BASE}/shop/apples`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  if (applesRes.status === 200) {
    const applesHtml = await applesRes.text();
    assert.ok(
      applesHtml.includes('Fresh Himachal Harvest | Dear Hills') && !applesHtml.includes('Handcrafted'),
      'Apples produce page uses Fresh Himachal Harvest title without Handcrafted',
    );
    console.log('✓ /shop/apples produce SEO title verified');
  }
  console.log('✓ Category-aware product SEO titles verified');

  // 7. FAQ Page & FAQPage Structured Data
  const faqRes = await fetch(`${BASE}/faq`, { headers: { 'x-forwarded-host': 'www.dearhills.in' } });
  assert.strictEqual(faqRes.status, 200, 'FAQ status 200');
  const faqHtml = await faqRes.text();
  assert.ok(faqHtml.includes('<link rel="canonical" href="https://www.dearhills.in/faq" />'), 'FAQ has canonical');
  assert.ok(faqHtml.includes('"@type":"FAQPage"'), 'FAQ has FAQPage schema');
  console.log('✓ FAQPage Schema verified');

  // 8. Blog Post FAQPage Schema
  const blogRes = await fetch(`${BASE}/blog/best-himachali-products-to-buy-online`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.strictEqual(blogRes.status, 200, 'Blog post status 200');
  const blogHtml = await blogRes.text();
  assert.ok(blogHtml.includes('"@type":"BlogPosting"'), 'Blog post has BlogPosting schema');
  assert.ok(blogHtml.includes('"@type":"FAQPage"'), 'Blog post has FAQPage schema');
  console.log('✓ Blog Post BlogPosting & FAQPage Schema verified');

  // 9. Private Route Noindex
  const accountRes = await fetch(`${BASE}/account`, { headers: { 'x-forwarded-host': 'www.dearhills.in' } });
  assert.strictEqual(accountRes.status, 200, 'Account page status 200');
  const accountHtml = await accountRes.text();
  assert.ok(accountHtml.includes('<meta name="robots" content="noindex, nofollow" />'), 'Account has noindex');
  console.log('✓ Private Account Route Noindex verified');

  // 10. Repeated Query Params, Malformed URLs & 404 Soft-404 Guard
  const dupQRes = await fetch(`${BASE}/shop?q=shawl&q=honey`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.strictEqual(dupQRes.status, 200, 'Repeated query param status 200');
  assert.strictEqual(dupQRes.headers.get('x-robots-tag'), 'noindex, nofollow', 'Repeated query param has X-Robots-Tag noindex');

  const makersQRes = await fetch(`${BASE}/makers?q=kullu`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.strictEqual(makersQRes.headers.get('x-robots-tag'), 'noindex, nofollow', 'Filtered makers has X-Robots-Tag noindex');

  const featuredCatRes = await fetch(`${BASE}/categories/shawls-and-weaves?featured=true`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.strictEqual(
    featuredCatRes.headers.get('x-robots-tag'),
    'noindex, nofollow',
    'Featured-filtered category has X-Robots-Tag noindex',
  );

  // 11. Demo-only active campaign must stay excluded from sitemap and marked noindex
  const offerApiRes = await fetch(`${BASE}/api/campaigns/pahadi-festive-glow`);
  if (offerApiRes.status === 200) {
    const offerApi = await offerApiRes.json();
    const offerItems = offerApi.items || [];
    const hasRealOfferProduct = offerItems.some((item) => {
      const sku = (item.sku || '').trim().toUpperCase();
      const shortDesc = (item.shortDescription || '').trim().toLowerCase();
      const sellerSlug = (item.sellerSlug || '').trim().toLowerCase();
      const sellerName = (item.sellerName || '').trim().toLowerCase();
      return (
        !item.isDemo &&
        !sku.startsWith('DEMO-') &&
        typeof item.pricePaise === 'number' &&
        item.pricePaise > 100 &&
        !shortDesc.includes('test transaction') &&
        sellerSlug !== 'demo' &&
        !sellerSlug.endsWith('-demo') &&
        !sellerName.includes('(demo)')
      );
    });
    const campaignSlug = offerApi.campaign?.slug || 'pahadi-festive-glow';
    const offerHtmlRes = await fetch(`${BASE}/offers/${campaignSlug}`, {
      headers: { 'x-forwarded-host': 'www.dearhills.in' },
    });
    assert.strictEqual(offerHtmlRes.status, 200, 'Offer SSR status 200');
    const offerHtml = await offerHtmlRes.text();
    if (!hasRealOfferProduct) {
      assert.ok(
        !sitemapXml.includes(`/offers/${campaignSlug}`),
        `Demo-only campaign /offers/${campaignSlug} must be excluded from sitemap.xml`,
      );
      assert.ok(
        offerHtml.includes('<meta name="robots" content="noindex, nofollow" />'),
        `Demo-only campaign /offers/${campaignSlug} must carry noindex, nofollow`,
      );
      console.log(`✓ Demo-only campaign /offers/${campaignSlug} excluded from sitemap & marked noindex`);
    } else {
      assert.ok(
        sitemapXml.includes(`/offers/${campaignSlug}`),
        `Active campaign with real products /offers/${campaignSlug} should be included in sitemap.xml`,
      );
      console.log(`✓ Active campaign /offers/${campaignSlug} with real products verified in sitemap`);
    }
  }

  const badPctRes = await fetch(`${BASE}/shop/%E0%A4%A`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.ok(
    badPctRes.status === 404 || badPctRes.status === 400,
    `Malformed percent encoding returns 400 (proxy) or 404 (app), got ${badPctRes.status}`,
  );
  if (badPctRes.status === 404) {
    assert.strictEqual(badPctRes.headers.get('x-robots-tag'), 'noindex, nofollow', 'Malformed percent encoding has noindex');
  }

  const missingProdRes = await fetch(`${BASE}/shop/nonexistent-seo-check-item`, {
    headers: { 'x-forwarded-host': 'www.dearhills.in' },
  });
  assert.strictEqual(missingProdRes.status, 404, 'Missing product returns 404');
  assert.strictEqual(missingProdRes.headers.get('x-robots-tag'), 'noindex, nofollow', 'Missing product has noindex');
  console.log('✓ Query filter, malformed URL & 404 noindex guards verified');

  console.log('\n🌟 ALL LIVE SEO & INDEXING TESTS PASSED! 🌟');
}

runTests().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
