#!/usr/bin/env node
/**
 * Read-only audit of demo, sample and placeholder data.
 *
 * Usage:
 *   npm run audit:demo-data
 *   npm run audit:demo-data -- /var/lib/pahadi-roots/dearhills.db
 *   npm run audit:demo-data -- --strict   # exit 1 when anything is found
 *
 * The database is opened read-only, so this cannot migrate, write or delete.
 * Output is JSON lines. It reports counts, record ids and URL hosts only:
 * never email addresses, names, phone numbers or bank details.
 *
 * Nothing is removed by this script. Deletion requires the plan in
 * docs/DEMO_DATA_CLEANUP_PLAN.md and an explicit approval gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const explicit = args.find((arg) => !arg.startsWith('-'));

const databasePath = path.resolve(
  explicit ?? process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'pahadi-roots.db'),
);

const out = (level, check, detail) => {
  const line = JSON.stringify({ level, check, detail });
  if (level === 'critical') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

if (!fs.existsSync(databasePath)) {
  out('critical', 'database', `not found at ${databasePath}`);
  process.exit(1);
}

let db;
try {
  db = new DatabaseSync(databasePath, { readOnly: true });
} catch (error) {
  out('critical', 'database', `cannot open read-only: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const hasTable = (name) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

const hasColumn = (table, column) => {
  if (!hasTable(table)) return false;
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
};

const count = (sql, ...params) => {
  try {
    return Number(db.prepare(sql).get(...params)?.count ?? 0);
  } catch {
    return -1;
  }
};

const ids = (sql, ...params) => {
  try {
    return db
      .prepare(sql)
      .all(...params)
      .map((row) => row.id);
  } catch {
    return [];
  }
};

/** Host-only image source, so third-party placeholders are discoverable without dumping URLs. */
const urlHosts = (sql) => {
  try {
    const rows = db.prepare(sql).all();
    const tally = new Map();
    for (const row of rows) {
      let host = 'relative';
      try {
        const url = String(row.url ?? '');
        host = url.startsWith('/') ? 'relative' : new URL(url).host;
      } catch {
        host = 'unparseable';
      }
      tally.set(host, (tally.get(host) ?? 0) + 1);
    }
    return Object.fromEntries([...tally.entries()].sort((a, b) => b[1] - a[1]));
  } catch {
    return {};
  }
};

const findings = [];
const record = (level, check, detail) => {
  findings.push({ level, check, detail });
  out(level, check, detail);
};

// --- Sellers -----------------------------------------------------------------
if (!hasTable('seller_profiles')) {
  record('critical', 'table.seller_profiles', 'missing');
} else {
  const totalSellers = count('SELECT COUNT(*) AS count FROM seller_profiles');
  const demoName =
    count("SELECT COUNT(*) AS count FROM seller_profiles WHERE business_name LIKE '%(demo)%'") +
    count("SELECT COUNT(*) AS count FROM seller_profiles WHERE business_name LIKE '%demo%'") -
    count("SELECT COUNT(*) AS count FROM seller_profiles WHERE business_name LIKE '%(demo)%' AND business_name LIKE '%demo%'");
  const demoSlug = count("SELECT COUNT(*) AS count FROM seller_profiles WHERE slug LIKE '%demo%'");
  const demoProfileIds = ids(
    "SELECT id FROM seller_profiles WHERE business_name LIKE '%demo%' OR slug LIKE '%demo%' ORDER BY id LIMIT 50",
  );
  record(totalSellers === 0 ? 'warn' : 'ok', 'sellers.total', String(totalSellers));
  record(
    demoName + demoSlug === 0 ? 'ok' : 'warn',
    'sellers.demo-named',
    JSON.stringify({ businessName: demoName, slug: demoSlug, sampleIds: demoProfileIds }),
  );

  const sellerEmailPatterns = {
    dotTest: count(
      "SELECT COUNT(*) AS count FROM users u JOIN seller_profiles s ON s.user_id = u.id WHERE u.email LIKE '%.test'",
    ),
    exampleDomain: count(
      "SELECT COUNT(*) AS count FROM users u JOIN seller_profiles s ON s.user_id = u.id WHERE u.email LIKE '%@example.%' OR u.email LIKE '%@example.com'",
    ),
    plusAddressing: count(
      "SELECT COUNT(*) AS count FROM users u JOIN seller_profiles s ON s.user_id = u.id WHERE u.email LIKE '%+%@%'",
    ),
  };
  record(
    Object.values(sellerEmailPatterns).every((value) => value === 0) ? 'ok' : 'warn',
    'sellers.placeholder-email-patterns',
    JSON.stringify(sellerEmailPatterns),
  );
}

// --- Products ----------------------------------------------------------------
if (!hasTable('products')) {
  record('critical', 'table.products', 'missing');
} else {
  const totalProducts = count('SELECT COUNT(*) AS count FROM products');
  const demoFlag = hasColumn('products', 'is_demo')
    ? count('SELECT COUNT(*) AS count FROM products WHERE is_demo = 1')
    : -1;
  const testPrice = count('SELECT COUNT(*) AS count FROM products WHERE price_paise = 100');
  const testNamed = count(
    "SELECT COUNT(*) AS count FROM products WHERE lower(name) LIKE '%test%' OR lower(name) LIKE '%sample%' OR lower(name) LIKE '%demo%'",
  );
  const sampleIds = ids(
    "SELECT id FROM products WHERE price_paise = 100 OR lower(name) LIKE '%test%' OR lower(name) LIKE '%demo%' ORDER BY id LIMIT 50",
  );
  record(totalProducts === 0 ? 'warn' : 'ok', 'products.total', String(totalProducts));
  record(
    demoFlag <= 0 && testPrice + testNamed === 0 ? 'ok' : 'warn',
    'products.demo-or-test',
    JSON.stringify({ isDemo: demoFlag, oneRupeePrice: testPrice, testNamed, sampleIds }),
  );
}

if (hasTable('product_images')) {
  const hosts = urlHosts('SELECT url FROM product_images');
  const thirdParty = Object.entries(hosts).filter(([host]) =>
    /wikimedia|unsplash|pexels|placeholder|picsum|placehold|cloudinary-demo/i.test(host),
  );
  record(
    thirdParty.length === 0 ? 'ok' : 'warn',
    'product_images.hosts',
    JSON.stringify({ hosts, thirdPartyHosts: thirdParty.map(([host]) => host) }),
  );
}

// --- Orders and reviews ------------------------------------------------------
if (hasTable('orders')) {
  const totalOrders = count('SELECT COUNT(*) AS count FROM orders');
  const demoOrders = hasColumn('orders', 'is_demo')
    ? count('SELECT COUNT(*) AS count FROM orders WHERE is_demo = 1')
    : -1;
  const nonDemoOrders = hasColumn('orders', 'is_demo')
    ? count('SELECT COUNT(*) AS count FROM orders WHERE is_demo = 0')
    : -1;
  const recentSample = ids('SELECT id FROM orders ORDER BY created_at DESC LIMIT 10');
  record(
    totalOrders === 0 ? 'ok' : demoOrders <= 0 ? 'ok' : 'warn',
    'orders.demo',
    JSON.stringify({ total: totalOrders, isDemo: demoOrders, realLooking: nonDemoOrders, newestIds: recentSample }),
  );
} else {
  record('warn', 'table.orders', 'missing');
}

if (hasTable('reviews')) {
  const totalReviews = count('SELECT COUNT(*) AS count FROM reviews');
  const reviewerSample = count('SELECT COUNT(*) AS count FROM reviews WHERE lower(body) LIKE \'%test%\' OR lower(body) LIKE \'%sample%\'');
  record(totalReviews === 0 ? 'ok' : 'warn', 'reviews.total', JSON.stringify({ total: totalReviews, sampleWording: reviewerSample }));
  if (reviewerSample > 0) {
    record('warn', 'reviews.sample-ids', JSON.stringify(ids("SELECT id FROM reviews WHERE lower(body) LIKE '%test%' OR lower(body) LIKE '%sample%' ORDER BY id LIMIT 50")));
  }
}

// --- Non-seller accounts -----------------------------------------------------
if (hasTable('users')) {
  const placeholderAccounts = count(
    "SELECT COUNT(*) AS count FROM users WHERE email LIKE '%.test' OR email LIKE '%@example.%' OR email LIKE '%@example.com'",
  );
  record(placeholderAccounts === 0 ? 'ok' : 'warn', 'users.placeholder-email-patterns', String(placeholderAccounts));
}

db.close();

const actionable = findings.filter((finding) => finding.level !== 'ok');
console.log(
  JSON.stringify({
    level: 'info',
    msg: 'demo_data_audit_complete',
    database: databasePath,
    findings: findings.length,
    actionable: actionable.length,
    readOnly: true,
    deletionPerformed: false,
  }),
);

if (strict && actionable.length > 0) process.exit(1);
