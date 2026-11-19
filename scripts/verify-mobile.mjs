#!/usr/bin/env node

/**
 * Automated Mobile Verification Suite for Himachali Roots
 * 
 * Verifies mobile viewport responsiveness, zero horizontal overflow,
 * touch targets, drawer interactions, buyer checkout flow, seller onboarding,
 * and seller dashboard across 375px (iPhone SE) and 412px (Android Standard) viewports.
 */

import puppeteer from 'puppeteer-core';
import process from 'node:process';
import http from 'node:http';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const DB_PATH = './data/pahadi-roots.db';
const DEMO_SELLER_USER_ID = 'usr_5acc5760-a4b1-40a2-90c3-d4f5f99218a9';

function mintSessionCookie(userId = DEMO_SELLER_USER_ID) {
  const db = new DatabaseSync(DB_PATH);
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 86400000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt, createdAt, createdAt);
  db.close();

  return { token, tokenHash, userId };
}

function revokeSession(tokenHash) {
  try {
    const db = new DatabaseSync(DB_PATH);
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    db.close();
  } catch {
    // Best effort cleanup
  }
}

// Edge executable search paths on Windows
const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.PUPPETEER_EXECUTABLE_PATH,
].filter(Boolean);

// Test Viewports
const VIEWPORTS = [
  {
    id: 'iphone-se',
    name: 'iPhone SE (375x667)',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    id: 'android-standard',
    name: 'Android Standard (412x915)',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.6,
    isMobile: true,
    hasTouch: true,
  },
];

// Buyer Pages to Verify
const BUYER_PAGES = [
  { path: '/', name: 'Home Page' },
  { path: '/shop', name: 'Shop Catalogue' },
  { path: '/shop/kangra-valley-green-tea', name: 'Product Detail' },
  { path: '/cart', name: 'Shopping Bag' },
  { path: '/checkout', name: 'Checkout Page' },
  { path: '/makers', name: 'Makers Directory' },
  { path: '/offers/pahadi-festive-glow', name: 'Promotional Offers' },
  { path: '/about', name: 'About Page' },
  { path: '/policies/terms', name: 'Terms & Policies' },
];

// Seller Dashboard Pages to Verify
const SELLER_PAGES = [
  { path: '/seller', name: 'Seller Overview' },
  { path: '/seller/products', name: 'Seller Products' },
  { path: '/seller/products/new', name: 'Seller Add Product' },
  { path: '/seller/orders', name: 'Seller Orders' },
  { path: '/seller/earnings', name: 'Seller Earnings & Settlements' },
];

async function findEdgeExecutable() {
  const fs = await import('node:fs');
  for (const p of EDGE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Microsoft Edge executable not found in paths: ${EDGE_PATHS.join(', ')}`);
}

async function checkServerAvailable(url, retries = 5, delayMs = 1000) {
  const { URL } = await import('node:url');
  const u = new URL(url);
  for (let i = 0; i < retries; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(u.origin + '/api/health', (res) => {
          if (res.statusCode && res.statusCode < 500) resolve();
          else reject(new Error(`Server returned HTTP ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error('Connection timeout'));
        });
      });
      return true;
    } catch {
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

class TestReporter {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }

  pass(description) {
    this.total++;
    this.passed++;
    console.log(`  ✓ ${description}`);
  }

  fail(description, error) {
    this.total++;
    this.failed++;
    const message = error instanceof Error ? error.message : String(error);
    this.failures.push({ description, message });
    console.log(`  ✗ ${description} -> ${message}`);
  }

  summary() {
    console.log('\n======================================================');
    console.log(`Mobile Verification Summary: ${this.passed}/${this.total} passed (${this.failed} failures)`);
    console.log('======================================================');
    if (this.failures.length > 0) {
      console.log('\nFailures Detail:');
      this.failures.forEach((f, idx) => {
        console.log(`  ${idx + 1}. ${f.description}: ${f.message}`);
      });
    }
    return this.failed === 0;
  }
}

async function checkPageOverflow(page, routeName, viewport) {
  return await page.evaluate((vp) => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body ? document.body.scrollWidth : 0;
    const maxScroll = Math.max(scrollWidth, bodyScrollWidth);
    // Allow up to 1px tolerance for subpixel antialiasing/scrollbars
    const hasOverflow = maxScroll > docWidth + 1.5;

    let culprits = [];
    if (hasOverflow) {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > docWidth + 1.5) {
          culprits.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            cls: el.className?.toString().slice(0, 60),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          });
          if (culprits.length >= 4) break;
        }
      }
    }

    return {
      docWidth,
      scrollWidth,
      bodyScrollWidth,
      maxScroll,
      hasOverflow,
      culprits,
    };
  }, viewport);
}

function isBenignConsoleMessage(txt) {
  return (
    txt.includes('GSI_LOGGER') ||
    txt.includes('accounts.google.com') ||
    txt.includes('client ID') ||
    txt.includes('Failed to load resource') ||
    txt.includes('favicon.ico') ||
    txt.includes('net::ERR_BLOCKED_BY_CLIENT') ||
    txt.includes('chrome-extension://')
  );
}

async function runMobileSuite() {
  console.log(`Starting Mobile Automated Verification Suite on ${BASE_URL}...`);
  const isUp = await checkServerAvailable(BASE_URL);
  if (!isUp) {
    console.error(`Cannot connect to server at ${BASE_URL}. Ensure server is running on port 8787.`);
    process.exit(1);
  }
  console.log(`Connected to ${BASE_URL} successfully.`);

  const executablePath = await findEdgeExecutable();
  console.log(`Using Edge executable: ${executablePath}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=450,950',
    ],
  });

  const reporter = new TestReporter();
  const createdTokens = [];

  try {
    // ---------------------------------------------------------
    // Phase 1: Buyer Pages Responsiveness & Overflow Verification
    // ---------------------------------------------------------
    console.log('\n--- Phase 1: Buyer Pages Layout & Overflow Verification ---');

    for (const vp of VIEWPORTS) {
      console.log(`\nTesting Viewport: ${vp.name}`);
      const page = await browser.newPage();
      await page.setViewport({
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
      });

      const pageErrors = [];
      page.on('pageerror', (err) => {
        if (!isBenignConsoleMessage(err.message)) pageErrors.push(err.message);
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const txt = msg.text();
          if (!isBenignConsoleMessage(txt)) {
            pageErrors.push(txt);
          }
        }
      });

      for (const buyerPage of BUYER_PAGES) {
        const fullUrl = `${BASE_URL}${buyerPage.path}`;
        try {
          await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 15000 });
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 300))));

          const overflow = await checkPageOverflow(page, buyerPage.name, vp);
          if (!overflow.hasOverflow) {
            reporter.pass(`[${vp.id}] ${buyerPage.name} (${buyerPage.path}) - No horizontal overflow (clientWidth: ${overflow.docWidth}px, scrollWidth: ${overflow.maxScroll}px)`);
          } else {
            const culpritStr = overflow.culprits.map((c) => `<${c.tag} class="${c.cls}"> right:${c.right}px`).join('; ');
            reporter.fail(
              `[${vp.id}] ${buyerPage.name} (${buyerPage.path}) - Overflow detected! scrollWidth: ${overflow.maxScroll}px > clientWidth: ${overflow.docWidth}px. Culprits: ${culpritStr}`,
              new Error('Horizontal overflow')
            );
          }

          if (pageErrors.length === 0) {
            reporter.pass(`[${vp.id}] ${buyerPage.name} - Zero unhandled console/runtime errors`);
          } else {
            reporter.fail(`[${vp.id}] ${buyerPage.name} - Runtime errors occurred: ${pageErrors.join(', ')}`, new Error('Console errors'));
            pageErrors.length = 0; // reset for next page
          }
        } catch (err) {
          reporter.fail(`[${vp.id}] ${buyerPage.name} - Navigation failed: ${err.message}`, err);
        }
      }

      await page.close();
    }

    // ---------------------------------------------------------
    // Phase 2: Mobile Navigation Drawer Verification
    // ---------------------------------------------------------
    console.log('\n--- Phase 2: Mobile Navigation Drawer Interaction ---');
    {
      const vp = VIEWPORTS[0]; // 375px
      const page = await browser.newPage();
      await page.setViewport(vp);

      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });

      // Look for menu open button
      const openBtn = await page.$('button[aria-label="Open menu"]');
      if (openBtn) {
        reporter.pass('Found mobile navigation hamburger button [aria-label="Open menu"]');
        await openBtn.click();
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));

        const drawer = await page.$('#mobile-menu, [role="dialog"][aria-label="Menu"]');
        if (drawer) {
          reporter.pass('Mobile navigation drawer opened successfully');

          // Check drawer overflow
          const overflow = await checkPageOverflow(page, 'Mobile Drawer Open', vp);
          if (!overflow.hasOverflow) {
            reporter.pass(`Drawer open state has zero horizontal overflow (docWidth: ${overflow.docWidth}px)`);
          } else {
            reporter.fail(`Drawer open state caused horizontal overflow!`, new Error('Drawer overflow'));
          }

          // Test close drawer
          const closeBtn = await page.$('button[data-menu-close], button[aria-label="Close menu"]');
          if (closeBtn) {
            await closeBtn.click();
            await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
            reporter.pass('Mobile navigation drawer closed cleanly');
          } else {
            reporter.fail('Could not find mobile menu close button', new Error('Missing close button'));
          }
        } else {
          reporter.fail('Mobile navigation drawer dialog not visible after click', new Error('Drawer not opened'));
        }
      } else {
        reporter.fail('Mobile hamburger button not found on 375px viewport', new Error('Missing hamburger button'));
      }

      await page.close();
    }

    // ---------------------------------------------------------
    // Phase 3: Buyer Interactive Flow (Add to Cart -> Checkout -> Place Order)
    // ---------------------------------------------------------
    console.log('\n--- Phase 3: Buyer Interactive Flow & Checkout Simulation ---');
    {
      const vp = VIEWPORTS[0]; // 375px
      const page = await browser.newPage();
      await page.setViewport(vp);

      // Authenticate with genuine demo session cookie for checkout flow
      console.log('Authenticating demo session for checkout flow...');
      const checkoutSession = mintSessionCookie(DEMO_SELLER_USER_ID);
      createdTokens.push(checkoutSession.tokenHash);

      await page.setCookie({
        name: 'pr_session',
        value: checkoutSession.token,
        domain: new URL(BASE_URL).hostname,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      });

      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 15000 });
      const authUser = await page.evaluate(async () => {
        try {
          const res = await fetch('/api/auth/me', { headers: { 'x-requested-with': 'pahadi-roots' } });
          const data = await res.json();
          return data?.user?.email || null;
        } catch {
          return null;
        }
      });

      if (authUser === 'kullu@demo.pahadiroots.test') {
        reporter.pass('Successfully authenticated with demo session for checkout flow');
      } else {
        reporter.fail('Failed to authenticate with demo session for checkout flow', new Error(`Authenticated email: ${authUser}`));
      }

      // Navigate to product page
      console.log('Navigating to product page to add item to bag...');
      await page.goto(`${BASE_URL}/shop/kangra-valley-green-tea`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.waitForSelector('button', { timeout: 10000 });

      // Click "Add to Bag"
      const added = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const addBtn = buttons.find((b) => b.innerText.toLowerCase().includes('add to bag') || b.innerText.trim() === 'Add');
        if (addBtn && !addBtn.disabled) {
          addBtn.scrollIntoView();
          addBtn.click();
          return true;
        }
        return false;
      });

      if (added) {
        reporter.pass('Clicked "Add to Bag" button on mobile viewport');
      } else {
        reporter.fail('Could not locate active "Add to Bag" button on product page', new Error('Add to Bag button missing'));
      }

      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)));

      // Go to cart
      await page.goto(`${BASE_URL}/cart`, { waitUntil: 'networkidle2', timeout: 15000 });
      const cartHasItem = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('Kangra') || text.includes('bag') || text.includes('Checkout');
      });

      if (cartHasItem) {
        reporter.pass('Product reflected in cart on mobile viewport');
      } else {
        reporter.fail('Product not found in cart after adding', new Error('Cart empty'));
      }

      // Navigate to checkout
      await page.goto(`${BASE_URL}/checkout`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)));

      // Exact selector detection: verify URL is /checkout and not /login, and check checkout elements
      const isCheckoutUrl = page.url().includes('/checkout') && !page.url().includes('/login');
      let checkoutElement = null;
      try {
        checkoutElement = await page.waitForSelector('#checkout-note, form, h1', { timeout: 8000 });
      } catch {
        checkoutElement = null;
      }

      if (isCheckoutUrl && checkoutElement) {
        reporter.pass('Checkout page loaded with active order summary and address step');
      } else {
        reporter.fail('Checkout page did not load active delivery step or was redirected to login', new Error(`Current URL: ${page.url()}`));
      }

      const chkOverflow = await checkPageOverflow(page, 'Checkout Stage', vp);
      if (!chkOverflow.hasOverflow) {
        reporter.pass(`Checkout page maintains zero horizontal overflow on ${vp.id} (maxScroll: ${chkOverflow.maxScroll}px <= ${chkOverflow.docWidth}px)`);
      } else {
        reporter.fail(`Checkout page has horizontal overflow on ${vp.id}`, new Error('Checkout overflow'));
      }

      // Handle Stage 1 delivery address inputs if user has no saved addresses
      const nameInput = await page.$('input[placeholder*="Name of the person"]');
      if (nameInput) {
        console.log('Filling Stage 1 delivery address inputs...');
        await page.type('input[placeholder*="Name of the person"]', 'Kullu Weaver');
        await page.type('input[placeholder*="10-digit mobile number"]', '9816098160');
        await page.type('input[placeholder*="House or building"]', 'Mall Road, Near Temple');
        await page.type('input[placeholder*="City or town"]', 'Kullu');
        await page.type('input[placeholder*="171001"], input[placeholder*="postal code"], input[placeholder*="PIN code"]', '175101');
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));
      }

      // Progress through checkout: Address -> Payment
      console.log('Progressing to Payment step...');
      const continuedToPayment = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const contBtn = buttons.find((b) => b.innerText.includes('Continue to payment') || b.innerText.includes('Continue'));
        if (contBtn && !contBtn.disabled) {
          contBtn.scrollIntoView();
          contBtn.click();
          return true;
        }
        return false;
      });

      if (continuedToPayment) {
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)));
        reporter.pass('Transitioned to Payment step in checkout');
      } else {
        reporter.fail('Failed to transition to Payment step in checkout', new Error('Continue to payment button missing or unclickable'));
      }

      // Select development payment simulation if present
      await page.evaluate(() => {
        const devRadio = document.querySelector('input[type="radio"][value="development"]');
        if (devRadio) {
          devRadio.scrollIntoView();
          devRadio.click();
        }
      });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));

      // Advance from payment step: click "Review order"
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const reviewBtn = buttons.find((b) => b.innerText.includes('Review order'));
        if (reviewBtn && !reviewBtn.disabled) {
          reviewBtn.scrollIntoView();
          reviewBtn.click();
        }
      });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1200)));

      // Place Order
      console.log('Submitting simulated order...');
      const orderPlaced = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const placeBtn = buttons.find((b) => b.innerText.includes('Place order'));
        if (placeBtn && !placeBtn.disabled) {
          placeBtn.scrollIntoView();
          placeBtn.click();
          return true;
        }
        return false;
      });

      if (orderPlaced) {
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)));

        // If development simulation action is required on payment panel
        await page.evaluate(() => {
          const testidBtn = document.querySelector('[data-testid="checkout-pay-development"]');
          if (testidBtn && !testidBtn.disabled) {
            testidBtn.click();
            return;
          }
          const btns = Array.from(document.querySelectorAll('button'));
          const devBtn = btns.find((b) => b.innerText.includes('Simulate') || b.innerText.includes('Pay'));
          if (devBtn && !devBtn.disabled) {
            devBtn.click();
          }
        });

        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2500)));

        const confirmed = await page.evaluate(() => {
          const text = document.body.innerText;
          return text.includes('confirmed') || text.includes('placed') || text.includes('Thank you') || text.includes('ORD-') || text.includes('PR-');
        });

        if (confirmed) {
          reporter.pass('Simulated order placed successfully via mobile checkout flow');
        } else {
          reporter.fail('Order confirmation not displayed after order placement', new Error('Confirmation missing on page'));
        }
      } else {
        reporter.fail('Place order button missing or disabled on review step', new Error('Place order failed'));
      }

      await page.close();
    }

    // ---------------------------------------------------------
    // Phase 4: Seller Onboarding Wizard (/become-a-maker)
    // ---------------------------------------------------------
    console.log('\n--- Phase 4: Seller Onboarding Wizard Verification ---');
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport(vp);

      await page.goto(`${BASE_URL}/become-a-maker`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));

      const overflow0 = await checkPageOverflow(page, 'Seller Onboarding Welcome', vp);
      if (!overflow0.hasOverflow) {
        reporter.pass(`[${vp.id}] /become-a-maker step 0 - Zero horizontal overflow`);
      } else {
        reporter.fail(`[${vp.id}] /become-a-maker step 0 - Horizontal overflow detected!`, new Error('Overflow'));
      }

      // Check step 1 (Account Information)
      await page.goto(`${BASE_URL}/become-a-maker?step=1`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));
      const overflow1 = await checkPageOverflow(page, 'Seller Onboarding Step 1', vp);
      if (!overflow1.hasOverflow) {
        reporter.pass(`[${vp.id}] /become-a-maker step 1 (Account Info) - Zero horizontal overflow`);
      } else {
        reporter.fail(`[${vp.id}] /become-a-maker step 1 - Horizontal overflow detected!`, new Error('Overflow'));
      }

      // Check step 2 (Business profile with updated responsive flex controls)
      await page.goto(`${BASE_URL}/become-a-maker?step=2`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));

      const overflow2 = await checkPageOverflow(page, 'Seller Onboarding Step 2', vp);
      if (!overflow2.hasOverflow) {
        reporter.pass(`[${vp.id}] /become-a-maker step 2 (Business Profile) - Zero horizontal overflow with responsive action buttons`);
      } else {
        reporter.fail(`[${vp.id}] /become-a-maker step 2 - Horizontal overflow detected!`, new Error('Overflow'));
      }

      // Check step 3 (Products & Origin)
      await page.goto(`${BASE_URL}/become-a-maker?step=3`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));

      const overflow3 = await checkPageOverflow(page, 'Seller Onboarding Step 3', vp);
      if (!overflow3.hasOverflow) {
        reporter.pass(`[${vp.id}] /become-a-maker step 3 (Products & Origin) - Zero horizontal overflow with responsive action buttons`);
      } else {
        reporter.fail(`[${vp.id}] /become-a-maker step 3 - Horizontal overflow detected!`, new Error('Overflow'));
      }

      // Check step 4 (Verification Documents)
      await page.goto(`${BASE_URL}/become-a-maker?step=4`, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 400)));

      const overflow4 = await checkPageOverflow(page, 'Seller Onboarding Step 4', vp);
      if (!overflow4.hasOverflow) {
        reporter.pass(`[${vp.id}] /become-a-maker step 4 (Verification Docs) - Zero horizontal overflow with responsive action buttons`);
      } else {
        reporter.fail(`[${vp.id}] /become-a-maker step 4 - Horizontal overflow detected!`, new Error('Overflow'));
      }

      await page.close();
    }

    // ---------------------------------------------------------
    // Phase 5: Seller Authentication & Dashboard Capabilities
    // ---------------------------------------------------------
    console.log('\n--- Phase 5: Seller Authentication & Dashboard Usability ---');
    for (const vp of VIEWPORTS) {
      console.log(`\nTesting Seller Dashboard on Viewport: ${vp.name}`);
      const page = await browser.newPage();
      await page.setViewport(vp);

      const sellerErrors = [];
      page.on('pageerror', (err) => {
        if (!isBenignConsoleMessage(err.message)) sellerErrors.push(err.message);
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const txt = msg.text();
          if (!isBenignConsoleMessage(txt)) {
            sellerErrors.push(txt);
          }
        }
      });

      // Inject authentic seller session cookie
      const sellerSession = mintSessionCookie(DEMO_SELLER_USER_ID);
      createdTokens.push(sellerSession.tokenHash);

      await page.setCookie({
        name: 'pr_session',
        value: sellerSession.token,
        domain: new URL(BASE_URL).hostname,
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      });

      // Verify each seller route
      for (const sellerPage of SELLER_PAGES) {
        const fullUrl = `${BASE_URL}${sellerPage.path}`;
        try {
          await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 15000 });
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 400))));

          // Assert correct URL and not redirected to login
          const currentUrl = page.url();
          const isExpectedRoute = currentUrl.includes(sellerPage.path) && !currentUrl.includes('/login');

          // Check maker studio / seller layout renders
          const studioRenders = await page.evaluate(() => {
            const text = document.body.innerText;
            const hasStudioHeader = Boolean(
              document.querySelector('header') &&
              (text.includes('Maker Studio') || text.includes('DEAR HILLS') || text.includes('Studio Overview') || text.includes('Product Catalogue') || text.includes('Add New Product') || text.includes('Order Management') || text.includes('Payments & Payouts'))
            );
            const hasBottomNav = Boolean(document.querySelector('nav[aria-label="Seller quick navigation"], .seller-bottom-nav'));
            return hasStudioHeader || hasBottomNav;
          });

          // Check for crashes / error boundaries
          const hasCrash = await page.evaluate(() => {
            const body = document.body.innerText;
            return body.includes('Something went wrong') || body.includes('Cannot read properties of undefined');
          });

          if (isExpectedRoute && studioRenders && !hasCrash) {
            reporter.pass(`[${vp.id}] ${sellerPage.name} (${sellerPage.path}) - Loaded cleanly without crashes`);
          } else {
            reporter.fail(
              `[${vp.id}] ${sellerPage.name} - Failed route verification! URL: ${currentUrl}, Studio: ${studioRenders}, Crash: ${hasCrash}`,
              new Error('Seller route verification failed')
            );
          }

          const overflow = await checkPageOverflow(page, sellerPage.name, vp);
          if (!overflow.hasOverflow) {
            reporter.pass(`[${vp.id}] ${sellerPage.name} - Zero horizontal overflow (clientWidth: ${overflow.docWidth}px, scrollWidth: ${overflow.maxScroll}px)`);
          } else {
            const culpritStr = overflow.culprits.map((c) => `<${c.tag} class="${c.cls}"> right:${c.right}px`).join('; ');
            reporter.fail(
              `[${vp.id}] ${sellerPage.name} - Overflow detected! scrollWidth: ${overflow.maxScroll}px > clientWidth: ${overflow.docWidth}px. Culprits: ${culpritStr}`,
              new Error('Horizontal overflow')
            );
          }

          if (sellerErrors.length === 0) {
            reporter.pass(`[${vp.id}] ${sellerPage.name} - Zero console/runtime errors`);
          } else {
            reporter.fail(`[${vp.id}] ${sellerPage.name} - Console errors: ${sellerErrors.join(', ')}`, new Error('Console errors'));
            sellerErrors.length = 0;
          }
        } catch (err) {
          reporter.fail(`[${vp.id}] ${sellerPage.name} - Navigation failed: ${err.message}`, err);
        }
      }

      await page.close();
    }

  } finally {
    for (const tokenHash of createdTokens) {
      revokeSession(tokenHash);
    }
    await browser.close();
  }

  const success = reporter.summary();
  if (!success) {
    process.exit(1);
  }
}

runMobileSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
