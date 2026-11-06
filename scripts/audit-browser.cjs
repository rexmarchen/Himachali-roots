const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function auditUrl(browser, url, label, isMobile = false) {
  console.log(`\n========================================`);
  console.log(`AUDITING: ${url} (${label}) [mobile=${isMobile}]`);
  console.log(`========================================`);

  const page = await browser.newPage();
  if (isMobile) {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width: 1440, height: 900 });
  }

  const consoleLogs = [];
  const networkErrors = [];
  const responses = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warn') {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    }
  });

  page.on('pageerror', (err) => {
    consoleLogs.push({ type: 'pageerror', text: err.message });
  });

  page.on('requestfailed', (req) => {
    networkErrors.push({ url: req.url(), error: req.failure() ? req.failure().errorText : 'failed' });
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      responses.push({ url: res.url(), status: res.status() });
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.log(`Goto error: ${e.message}`);
  }

  // Scroll down step by step to trigger all lazy-loaded images, and wait for decoding
  await page.evaluate(async () => {
    const scrollStep = 500;
    const maxScroll = document.body.scrollHeight;
    for (let y = 0; y < maxScroll; y += scrollStep) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }

    const images = Array.from(document.querySelectorAll('img'));
    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 2500);
        });
      }),
    );

    window.scrollTo(0, 0);
  });

  // Brief pause for paint
  await new Promise((r) => setTimeout(r, 1000));

  // Evaluate DOM and image status
  const auditData = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.src,
      alt: img.alt,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      displayed: img.offsetWidth > 0 && img.offsetHeight > 0,
    }));

    const h1 = Array.from(document.querySelectorAll('h1')).map((h) => h.innerText.trim());
    const h2 = Array.from(document.querySelectorAll('h2')).map((h) => h.innerText.trim());
    const sections = Array.from(document.querySelectorAll('section')).map((s) => ({
      ariaLabel: s.getAttribute('aria-label') || '',
      className: s.className,
      textPreview: s.innerText.slice(0, 80).replace(/\s+/g, ' '),
    }));

    return {
      title: document.title,
      h1,
      h2,
      sectionsCount: sections.length,
      sections,
      totalImages: images.length,
      brokenImages: images.filter((img) => img.naturalWidth === 0),
      validImages: images.filter((img) => img.naturalWidth > 0),
    };
  });

  console.log(`Page Title: "${auditData.title}"`);
  console.log(`H1 Headings:`, auditData.h1);
  console.log(`H2 Headings:`, auditData.h2);
  console.log(`Sections count: ${auditData.sectionsCount}`);
  console.log(
    `Total images: ${auditData.totalImages}, Valid: ${auditData.validImages.length}, Broken: ${auditData.brokenImages.length}`,
  );

  if (auditData.brokenImages.length > 0) {
    console.log(`BROKEN IMAGES:`);
    auditData.brokenImages.forEach((img) => {
      console.log(`  - src: ${img.src} | alt: "${img.alt}" | complete: ${img.complete}`);
    });
  } else {
    console.log(`✓ ALL ${auditData.totalImages} IMAGES LOADED SUCCESSFULLY (naturalWidth > 0)!`);
  }

  if (responses.length > 0) {
    console.log(`HTTP >= 400 ERRORS:`);
    responses.forEach((r) => console.log(`  - ${r.status}: ${r.url}`));
  }

  if (networkErrors.length > 0) {
    console.log(`NETWORK FAILED REQUESTS:`);
    networkErrors.forEach((n) => console.log(`  - ${n.url}: ${n.error}`));
  }

  if (consoleLogs.length > 0) {
    console.log(`CONSOLE WARNINGS/ERRORS:`);
    consoleLogs.forEach((c) => console.log(`  [${c.type}] ${c.text}`));
  }

  // Save screenshot (viewport)
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${label}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved screenshot: ${screenshotPath}`);

  if (!isMobile) {
    // Save full page screenshot
    const fullScreenshotPath = path.join(SCREENSHOTS_DIR, `${label}-full.png`);
    await page.screenshot({ path: fullScreenshotPath, fullPage: true });
    console.log(`Saved full page screenshot: ${fullScreenshotPath}`);
  }

  await page.close();
  return auditData;
}

async function run() {
  console.log('Launching Edge from:', EDGE_PATH);
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    // 1. Audit Live Production (https://www.dearhills.in)
    await auditUrl(browser, 'https://www.dearhills.in', 'prod-desktop-before');

    // 2. Audit Local Dev Server (http://localhost:5173)
    await auditUrl(browser, 'http://localhost:5173', 'local-desktop');

    // 3. Audit Local Mobile (http://localhost:5173)
    await auditUrl(browser, 'http://localhost:5173', 'local-mobile', true);

    // 4. Audit Local Shop Catalog
    await auditUrl(browser, 'http://localhost:5173/shop', 'local-shop-catalog');

    // 5. Audit Local Product Detail with real slug
    await auditUrl(
      browser,
      'http://localhost:5173/shop/kangra-valley-green-tea',
      'local-product-detail',
    );
  } catch (err) {
    console.error('Fatal audit error:', err);
  } finally {
    await browser.close();
    console.log('\nAudit complete.');
  }
}

run();
