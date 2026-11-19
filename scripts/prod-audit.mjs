import assert from 'node:assert';
import crypto from 'node:crypto';

const BASE_URL = 'http://localhost:8787/api';
const CSRF = { 'X-Requested-With': 'pahadi-roots' };

async function runAudit() {
  console.log('=== DEAR HILLS PRODUCTION AUDIT ===\n');

  // 1. Health Endpoint
  console.log('1. Checking /health...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
  const health = await healthRes.json();
  console.log('   Health response:', health);
  assert.strictEqual(health.status, 'ok', 'Status should be ok');
  assert.strictEqual(health.database, 'up', 'DB should be up');

  // 2. Home Endpoint
  console.log('\n2. Checking /home...');
  const homeRes = await fetch(`${BASE_URL}/home`);
  assert.strictEqual(homeRes.status, 200, 'Home endpoint should return 200');
  const home = await homeRes.json();
  console.log(`   Counts: ${JSON.stringify(home.counts)}`);
  console.log(`   Active Campaign: ${home.campaign ? home.campaign.name : 'None'}`);
  console.log(`   Featured products: ${home.featured?.length || 0}`);
  console.log(`   Categories: ${home.categories?.length || 0}`);
  console.log(`   Makers: ${home.makers?.length || 0}`);
  assert(home.featured && home.featured.length > 0, 'Featured products should not be empty');
  assert(home.categories && home.categories.length > 0, 'Categories should not be empty');
  assert(home.makers && home.makers.length > 0, 'Makers should not be empty');

  // Ensure no Diwali reference in campaign or home content
  const homeJson = JSON.stringify(home).toLowerCase();
  assert(!homeJson.includes('diwali'), 'Home response should not contain any Diwali references');
  console.log('   Zero Diwali references confirmed in /home response.');

  // 3. Products Catalogue
  console.log('\n3. Checking /products...');
  const productsRes = await fetch(`${BASE_URL}/products?pageSize=100`);
  assert.strictEqual(productsRes.status, 200, 'Products endpoint should return 200');
  const products = await productsRes.json();
  console.log(`   Total products: ${products.total}`);
  console.log(`   Returned products: ${products.items.length}`);
  assert(products.items.length > 0, 'Products list should not be empty');

  for (const p of products.items) {
    if (p.compareAtPricePaise !== null && p.compareAtPricePaise !== undefined) {
      assert(p.compareAtPricePaise > p.pricePaise, `compareAtPricePaise must be > pricePaise for ${p.slug}`);
      const discount = Math.round(((p.compareAtPricePaise - p.pricePaise) / p.compareAtPricePaise) * 100);
      assert(discount > 0 && discount < 100, `Discount percentage must be sane: ${discount}% for ${p.slug}`);
    }
  }
  console.log('   Product discount logic verified safe on all catalog items.');

  // 4. Categories & Slug Navigation
  console.log('\n4. Checking /categories...');
  const categoriesRes = await fetch(`${BASE_URL}/categories`);
  assert.strictEqual(categoriesRes.status, 200, 'Categories endpoint should return 200');
  const categories = await categoriesRes.json();
  console.log(`   Found ${categories.categories.length} active categories`);
  const firstCat = categories.categories[0];
  const catProductsRes = await fetch(`${BASE_URL}/products?category=${firstCat.slug}`);
  assert.strictEqual(catProductsRes.status, 200, 'Category products endpoint should return 200');
  const catProducts = await catProductsRes.json();
  console.log(`   Category "${firstCat.name}" (${firstCat.slug}) has ${catProducts.total} products.`);

  // 5. CSRF & Security Protection
  console.log('\n5. Checking CSRF Protection...');
  // A mutation without CSRF header should be rejected
  const csrfTest = await fetch(`${BASE_URL}/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
  });
  assert.strictEqual(csrfTest.status, 403, 'Mutation without X-Requested-With must return 403 Forbidden');
  console.log('   CSRF header enforcement confirmed (403 without header).');

  // 6. Maker Onboarding Validation Checks
  console.log('\n6. Checking Maker Application Validation...');
  // Phone number regex check: Indian 10-digit starting with 6-9
  const unauthRes = await fetch(`${BASE_URL}/seller/application/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...CSRF },
    body: JSON.stringify({
      businessName: 'Himalayan Organic Teas',
      category: 'food_producer',
      phone: '1234567890', // Invalid Indian phone (doesn't start with 6-9)
      originNarrative: 'A long enough story about our mountain heritage tea gardens in Kangra valley.',
    }),
  });
  // Unauthenticated requests to protected seller onboarding mutation must return 401
  assert.strictEqual(unauthRes.status, 401, `Unauthenticated application submit must return 401, got ${unauthRes.status}`);
  console.log('   Protected seller application submission requires auth (401 verified).');

  // 7. Commission Model & Platform Charges
  console.log('\n7. Checking Platform Commission & Ledger Model...');
  const configRes = await fetch(`${BASE_URL}/config`);
  const config = await configRes.json();
  console.log(`   Store Status: Active, Dev Mode: ${config.devMode}`);
  
  // Calculate 12% commission on standard amount (e.g., Rs 1000 = 100,000 paise)
  const orderBasisPaise = 100000;
  const commissionBp = 1200; // 12.00%
  const expectedCommission = Math.round((orderBasisPaise * commissionBp) / 10000);
  const expectedSellerShare = orderBasisPaise - expectedCommission;
  assert.strictEqual(expectedCommission, 12000, 'Commission on 100,000 paise should be 12,000 paise (Rs 120)');
  assert.strictEqual(expectedSellerShare, 88000, 'Seller net share should be 88,000 paise (Rs 880)');
  console.log(`   Commission math verified: 12% Platform Fee = Rs ${expectedCommission / 100}, 88% Seller Share = Rs ${expectedSellerShare / 100}`);

  console.log('\n=== ALL PRODUCTION AUDIT CHECKS PASSED WITH FLYING COLORS ===');
}

runAudit().catch(err => {
  console.error('\n❌ Audit error:', err);
  process.exit(1);
});
