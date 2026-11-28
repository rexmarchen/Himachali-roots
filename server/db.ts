import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_HIMALAYAN_CRAFTS, DEFAULT_HIMALAYAN_REGIONS } from './lib/himalayanSeeds.js';

export type Db = DatabaseSync;

const here = path.dirname(fileURLToPath(import.meta.url));

function schemaSql(): string {
  const candidates = [
    path.join(here, 'schema.sql'), // compiled: dist-server/server/schema.sql
    path.resolve(process.cwd(), 'server', 'schema.sql'), // dev/tsx
    path.join(here, '..', 'schema.sql'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  throw new Error('schema.sql not found. Rebuild with `npm run build:server`.');
}

function columns(db: Db, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
}

function addColumn(db: Db, table: string, column: string, definition: string): void {
  if (!columns(db, table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function markMigration(db: Db, version: number): void {
  const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
  if (!applied) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
  }
}

function tableExists(db: Db, table: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

/**
 * schema.sql can create missing tables on an existing database, but its index
 * statements reference columns added by later migrations. On a database created
 * before those columns existed the script would fail before the migrations get a
 * chance to run, so reconcile the affected columns first. The full migration
 * below still owns validation and data backfills.
 */
function reconcileLegacySchema(db: Db): void {
  if (tableExists(db, 'users')) {
    addColumn(db, 'users', 'password_changed_at', 'TEXT');
    addColumn(db, 'users', 'mfa_secret', 'TEXT');
    addColumn(db, 'users', 'mfa_enabled_at', 'TEXT');
    addColumn(db, 'users', 'failed_login_attempts', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'users', 'locked_until', 'TEXT');
  }
  if (tableExists(db, 'sessions')) {
    addColumn(db, 'sessions', 'scope', "TEXT NOT NULL DEFAULT 'standard'");
    addColumn(db, 'sessions', 'mfa_verified_at', 'TEXT');
  }
  if (tableExists(db, 'audit_logs')) {
    addColumn(db, 'audit_logs', 'ip_address', 'TEXT');
  }
  if (tableExists(db, 'seller_profiles')) {
    addColumn(db, 'seller_profiles', 'seller_category', 'TEXT');
    addColumn(db, 'seller_profiles', 'store_status', "TEXT NOT NULL DEFAULT 'setup_incomplete'");
    addColumn(db, 'seller_profiles', 'store_status_reason', 'TEXT');
    addColumn(db, 'seller_profiles', 'payout_status', "TEXT NOT NULL DEFAULT 'not_started'");
    addColumn(db, 'seller_profiles', 'payout_status_before_hold', 'TEXT');
    addColumn(db, 'seller_profiles', 'logo_url', 'TEXT');
    addColumn(db, 'seller_profiles', 'cover_url', 'TEXT');
    addColumn(db, 'seller_profiles', 'craft_specialty', 'TEXT');
    addColumn(db, 'seller_profiles', 'years_of_practice', 'INTEGER');
    addColumn(db, 'seller_profiles', 'workshop_photos_json', 'TEXT');
  }
  if (tableExists(db, 'seller_applications')) {
    addColumn(db, 'seller_applications', 'created_at', 'TEXT');
    addColumn(db, 'seller_applications', 'updated_at', 'TEXT');
    db.exec(`
      UPDATE seller_applications
         SET created_at = COALESCE(created_at, submitted_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
             updated_at = COALESCE(updated_at, submitted_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
    `);
  }
  if (tableExists(db, 'orders')) {
    addColumn(db, 'orders', 'is_demo', 'INTEGER NOT NULL DEFAULT 1');
  }
  if (tableExists(db, 'products')) {
    addColumn(db, 'products', 'estimated_cost_paise', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'products', 'packaging_cost_paise', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'products', 'variety_grade', 'TEXT');
    addColumn(db, 'products', 'harvest_info', 'TEXT');
    addColumn(db, 'products', 'dispatch_conditions', 'TEXT');
    addColumn(db, 'products', 'region_slug', 'TEXT');
    addColumn(db, 'products', 'district_village', 'TEXT');
    addColumn(db, 'products', 'craft_type', 'TEXT');
    addColumn(db, 'products', 'craft_slug', 'TEXT');
    addColumn(db, 'products', 'technique', 'TEXT');
    addColumn(db, 'products', 'gi_tagged', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'products', 'gi_requested', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'products', 'gi_name', 'TEXT');
    addColumn(db, 'products', 'gi_registration_ref', 'TEXT');
    addColumn(db, 'products', 'gi_verified_at', 'TEXT');
    addColumn(db, 'products', 'gi_verified_by', 'TEXT');
    addColumn(db, 'products', 'made_to_order', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(
      db,
      'products',
      'fulfilment_method',
      "TEXT NOT NULL DEFAULT 'SHIPROCKET' CHECK (fulfilment_method IN ('SHIPROCKET','OWN_DELIVERY','EXTERNAL_SUPPLIER'))",
    );
    addColumn(db, 'products', 'pickup_location_id', 'TEXT');
    addColumn(db, 'products', 'package_length_cm', 'REAL');
    addColumn(db, 'products', 'package_breadth_cm', 'REAL');
    addColumn(db, 'products', 'package_height_cm', 'REAL');
    addColumn(db, 'products', 'handling_days', 'INTEGER NOT NULL DEFAULT 2');
    addColumn(db, 'products', 'shipping_config_json', 'TEXT');
    addColumn(db, 'products', 'is_select_curated', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(
      db,
      'products',
      'availability_policy',
      "TEXT NOT NULL DEFAULT 'stock_tracked' CHECK (availability_policy IN ('stock_tracked','on_demand_external'))",
    );
    addColumn(db, 'products', 'max_order_quantity', 'INTEGER NOT NULL DEFAULT 10');
    addColumn(db, 'products', 'variants_json', 'TEXT');
    addColumn(db, 'products', 'return_policy_override', 'TEXT');
    addColumn(db, 'products', 'return_window_days', 'INTEGER');
    addColumn(db, 'products', 'return_shipping_bearer', 'TEXT');
  }
  if (tableExists(db, 'order_items')) {
    addColumn(db, 'order_items', 'fulfilment_method', "TEXT NOT NULL DEFAULT 'SHIPROCKET'");
    addColumn(db, 'order_items', 'pickup_location_id', 'TEXT');
    addColumn(db, 'order_items', 'package_weight_g', 'INTEGER');
    addColumn(db, 'order_items', 'package_length_cm', 'REAL');
    addColumn(db, 'order_items', 'package_breadth_cm', 'REAL');
    addColumn(db, 'order_items', 'package_height_cm', 'REAL');
    addColumn(db, 'order_items', 'shipping_snapshot_json', 'TEXT');
    addColumn(db, 'order_items', 'fulfilment_id', 'TEXT');
    addColumn(db, 'order_items', 'variant_id', 'TEXT');
    addColumn(db, 'order_items', 'variant_label', 'TEXT');
    addColumn(db, 'order_items', 'sourcing_cost_snapshot_paise', 'INTEGER');
  }
  if (tableExists(db, 'order_fulfilments')) {
    addColumn(db, 'order_fulfilments', 'sourcing_exception_type', 'TEXT');
    addColumn(db, 'order_fulfilments', 'sourcing_exception_new_cost_paise', 'INTEGER');
    addColumn(db, 'order_fulfilments', 'sourcing_exception_note', 'TEXT');
    addColumn(db, 'order_fulfilments', 'sourcing_exception_resolved_action', 'TEXT');
  }
  if (tableExists(db, 'shipments')) {
    addColumn(db, 'shipments', 'fulfilment_id', 'TEXT');
  }
  // Migration 8 columns must exist before schema.sql runs: its unique index on
  // refunds(dedupe_key) would otherwise fail on a database created at v7.
  if (tableExists(db, 'refunds')) {
    addColumn(db, 'refunds', 'return_request_id', 'TEXT');
    addColumn(db, 'refunds', 'dedupe_key', 'TEXT');
  }
  if (tableExists(db, 'notifications')) {
    addColumn(db, 'notifications', 'provider_message_id', 'TEXT');
  }
  if (tableExists(db, 'return_requests')) {
    addColumn(db, 'return_requests', 'requested_amount_paise', 'INTEGER NOT NULL DEFAULT 0');
  }
  if (tableExists(db, 'categories')) {
    const coreCats = [
      {
        id: 'cat_fruits_produce',
        name: 'Fruits & Fresh Produce',
        slug: 'fruits-and-fresh-produce',
        description: 'Orchard-fresh Himachali apples, Kinnaur golden pears, high-altitude plums, wild apricots, and mountain cherries.',
        imageUrl: '/images/home/apple-orchard-1100.jpg',
        brokenImageUrl: '/images/product-apple.jpg',
        sortOrder: 5,
      },
      {
        id: 'cat_crafts_handicrafts',
        name: 'Handmade Crafts & Handicrafts',
        slug: 'crafts-and-handicrafts',
        description: 'Hand-carved cedar woodcraft, pine needle basketry, traditional metalwork, and Kangra miniature art.',
        imageUrl: '/images/home/himalayan-artisan-workshop.jpg',
        brokenImageUrl: '/images/product-woodcraft.jpg',
        sortOrder: 25,
      },
      {
        id: 'cat_traditional_goods',
        name: 'Traditional Himachali Products & Goods',
        slug: 'traditional-goods-and-essentials',
        description: 'Natural Himalayan dhoop, hawan samagri, stone-carved utensils, and authentic mountain souvenirs.',
        imageUrl: '/images/editorial-terrace.jpg',
        brokenImageUrl: null,
        sortOrder: 45,
      },
    ];
    for (const c of coreCats) {
      const exists = db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(c.slug);
      if (!exists) {
        db.prepare(
          `INSERT INTO categories (id, name, slug, parent_id, description, image_url, sort_order, is_active, created_at)
           VALUES (?, ?, ?, NULL, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
        ).run(c.id, c.name, c.slug, c.description, c.imageUrl, c.sortOrder);
      } else if (c.brokenImageUrl) {
        // Repair seeded placeholder paths whose files do not exist in public/images.
        db.prepare('UPDATE categories SET image_url = ? WHERE slug = ? AND image_url = ?').run(
          c.imageUrl,
          c.slug,
          c.brokenImageUrl
        );
      }
    }
  }
}

/**
 * Migration 3 rebuilds seller_applications because its original CHECK
 * constraint predated drafts and change requests. No other table references
 * this table, so a transactional copy is safe. Everything else is additive.
 */
function migrateSellerOnboarding(db: Db): void {
  const applicationColumns = columns(db, 'seller_applications');
  const needsApplicationRebuild = !applicationColumns.includes('data_json') || !applicationColumns.includes('current_step');

  if (needsApplicationRebuild) {
    const hasTimestamps = applicationColumns.includes('created_at');
    const legacySelect = hasTimestamps
      ? 'created_at, updated_at'
      : "COALESCE(submitted_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), COALESCE(submitted_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec('BEGIN IMMEDIATE');
      db.exec('DROP INDEX IF EXISTS idx_seller_app_status');
      db.exec('DROP INDEX IF EXISTS idx_seller_app_seller');
      db.exec('DROP INDEX IF EXISTS idx_seller_app_one_draft');
      db.exec('ALTER TABLE seller_applications RENAME TO seller_applications_legacy');
      db.exec(`
        CREATE TABLE seller_applications (
          id TEXT PRIMARY KEY,
          seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN ('draft','submitted','under_review','changes_requested','approved','rejected','suspended','withdrawn')),
          revision INTEGER NOT NULL DEFAULT 1,
          current_step INTEGER NOT NULL DEFAULT 1,
          seller_category TEXT,
          business_name TEXT NOT NULL DEFAULT '',
          seller_type TEXT NOT NULL DEFAULT 'individual',
          categories TEXT NOT NULL DEFAULT '[]',
          address TEXT NOT NULL DEFAULT '{}',
          gstin TEXT,
          phone TEXT,
          notes TEXT,
          data_json TEXT NOT NULL DEFAULT '{}',
          verification_json TEXT,
          shipping_json TEXT,
          payout_json TEXT,
          agreement_json TEXT,
          rejection_reason TEXT,
          submitted_at TEXT,
          reviewed_by TEXT REFERENCES users(id),
          reviewed_at TEXT,
          last_saved_at TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
      `);
      db.exec(`
        INSERT INTO seller_applications
          (id, seller_id, status, revision, current_step, seller_type, business_name, categories, address,
           gstin, phone, notes, data_json, rejection_reason, submitted_at, reviewed_by, reviewed_at, created_at, updated_at)
        SELECT id, seller_id,
               CASE status WHEN 'more_info_required' THEN 'changes_requested' ELSE status END,
               1, 1, seller_type, business_name, categories, address,
               gstin, phone, notes, '{}', rejection_reason, submitted_at, reviewed_by, reviewed_at, ${legacySelect}
          FROM seller_applications_legacy;
      `);
      db.exec('DROP TABLE seller_applications_legacy');
      db.exec('CREATE INDEX IF NOT EXISTS idx_seller_app_status ON seller_applications(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_seller_app_seller ON seller_applications(seller_id, created_at DESC)');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_app_one_draft ON seller_applications(seller_id) WHERE status = \'draft\'');
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Already rolled back.
      }
      throw error;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }

  addColumn(db, 'seller_profiles', 'seller_category', 'TEXT');
  addColumn(db, 'seller_profiles', 'store_status', "TEXT NOT NULL DEFAULT 'setup_incomplete'");
  addColumn(db, 'seller_profiles', 'store_status_reason', 'TEXT');
  addColumn(db, 'seller_profiles', 'payout_status', "TEXT NOT NULL DEFAULT 'not_started'");
  addColumn(db, 'seller_profiles', 'onboarding_step', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'seller_profiles', 'verified_at', 'TEXT');

  addColumn(db, 'seller_documents', 'application_id', 'TEXT');
  addColumn(db, 'seller_documents', 'doc_label', 'TEXT');
  addColumn(db, 'seller_documents', 'storage_key', 'TEXT');
  addColumn(db, 'seller_documents', 'sha256', 'TEXT');
  addColumn(db, 'seller_documents', 'review_note', 'TEXT');
  addColumn(db, 'seller_documents', 'reviewed_by', 'TEXT');
  addColumn(db, 'seller_documents', 'reviewed_at', 'TEXT');
  addColumn(db, 'seller_documents', 'expires_at', 'TEXT');
  db.exec(`
    UPDATE seller_documents
       SET storage_key = COALESCE(storage_key, file_path)
     WHERE storage_key IS NULL;
  `);

  addColumn(db, 'products', 'compliance_json', 'TEXT');
  addColumn(db, 'products', 'moderation_note', 'TEXT');
  addColumn(db, 'products', 'changes_requested_at', 'TEXT');
  addColumn(db, 'products', 'published_at', 'TEXT');

  db.exec(`
    UPDATE seller_profiles
       SET store_status = CASE
             WHEN status = 'approved' THEN 'active'
             WHEN status = 'suspended' THEN 'suspended'
             WHEN status IN ('submitted','under_review','more_info_required') THEN 'pending_activation'
             ELSE 'setup_incomplete'
           END
     WHERE store_status IS NULL OR store_status = 'setup_incomplete';
  `);
  db.exec(`
    UPDATE products
       SET published_at = COALESCE(published_at, approved_at)
     WHERE status = 'approved' AND published_at IS NULL;
  `);
}

export function openDatabase(filename: string): Db {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  reconcileLegacySchema(db);
  db.exec(schemaSql());
  markMigration(db, 1);

  // Migration 2: the ledger originally lacked a timestamp, which the seller
  // earnings view and settlement period filtering both depend on.
  const ledgerColumns = db.prepare('PRAGMA table_info(seller_ledger_entries)').all() as { name: string }[];
  if (!ledgerColumns.some((column) => column.name === 'created_at')) {
    db.exec('ALTER TABLE seller_ledger_entries ADD COLUMN created_at TEXT');
    db.exec(
      "UPDATE seller_ledger_entries SET created_at = COALESCE(available_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    );
  }
  markMigration(db, 2);

  migrateSellerOnboarding(db);
  markMigration(db, 3);

  migrateDemoOrders(db);
  markMigration(db, 4);

  // Migration 5: promotional order lines record the pre-campaign price so an
  // order history can show the saving without recomputing it from live data.
  addColumn(db, 'order_items', 'original_unit_price_paise', 'INTEGER');
  markMigration(db, 5);

  migrateProviderAuth(db);
  markMigration(db, 6);

  migratePasswordRecoveryOtp(db);
  markMigration(db, 7);

  migrateOrderIntegrity(db);
  markMigration(db, 8);

  // Migration 9: allow applicants to withdraw their application without
  // deleting its history. SQLite cannot alter a CHECK constraint in place, so
  // the application table is copied transactionally and foreign keys are
  // suspended only for the duration of the swap.
  migrateApplicationWithdrawal(db);
  markMigration(db, 9);

  migrateShippingAndLedger(db);
  markMigration(db, 10);

  migrateTransactionalOutbox(db);
  markMigration(db, 11);

  migrateMfa(db);
  markMigration(db, 12);

  migratePayoutHoldStatus(db);
  markMigration(db, 13);

  migrateSecurityHardening(db);
  markMigration(db, 14);

  migratePanHimalayanSeo(db);
  markMigration(db, 15);

  migrateBrowserHandoffTokens(db);
  markMigration(db, 16);

  migrateProductFulfilmentShipping(db);
  markMigration(db, 17);

  migrateCodSupport(db);
  markMigration(db, 18);

  migrateExternalSourcingAndVariants(db);
  markMigration(db, 19);
  return db;
}

/**
 * Migration 19: External sourcing ledger (`product_sourcing`), Dear Hills Select
 * curation badge & availability controls, verified product variants across cart &
 * order snapshots, and supplier exception resolution columns on order_fulfilments.
 */
function migrateExternalSourcingAndVariants(db: Db): void {
  addColumn(db, 'products', 'is_select_curated', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(
    db,
    'products',
    'availability_policy',
    "TEXT NOT NULL DEFAULT 'stock_tracked' CHECK (availability_policy IN ('stock_tracked','on_demand_external'))",
  );
  addColumn(db, 'products', 'max_order_quantity', 'INTEGER NOT NULL DEFAULT 10');
  addColumn(db, 'products', 'variants_json', 'TEXT');
  addColumn(db, 'products', 'return_policy_override', 'TEXT');
  addColumn(db, 'products', 'return_window_days', 'INTEGER');
  addColumn(db, 'products', 'return_shipping_bearer', 'TEXT');

  addColumn(db, 'order_items', 'variant_id', 'TEXT');
  addColumn(db, 'order_items', 'variant_label', 'TEXT');
  addColumn(db, 'order_items', 'sourcing_cost_snapshot_paise', 'INTEGER');

  addColumn(db, 'order_fulfilments', 'sourcing_exception_type', 'TEXT');
  addColumn(db, 'order_fulfilments', 'sourcing_exception_new_cost_paise', 'INTEGER');
  addColumn(db, 'order_fulfilments', 'sourcing_exception_note', 'TEXT');
  addColumn(db, 'order_fulfilments', 'sourcing_exception_resolved_action', 'TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS product_sourcing (
      product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      sourcing_channel TEXT NOT NULL DEFAULT 'external',
      source_url TEXT,
      supplier_name TEXT,
      supplier_catalog_id TEXT,
      supplier_sku_ref TEXT,
      supplier_price_paise INTEGER NOT NULL DEFAULT 0 CHECK (supplier_price_paise >= 0),
      supplier_shipping_paise INTEGER NOT NULL DEFAULT 0 CHECK (supplier_shipping_paise >= 0),
      other_sourcing_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (other_sourcing_cost_paise >= 0),
      landed_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (landed_cost_paise >= 0),
      markup_paise INTEGER NOT NULL DEFAULT 10000 CHECK (markup_paise >= 0),
      price_floor_locked INTEGER NOT NULL DEFAULT 1,
      price_verified INTEGER NOT NULL DEFAULT 0,
      last_price_verified_at TEXT,
      supplier_available INTEGER NOT NULL DEFAULT 0,
      availability_verified INTEGER NOT NULL DEFAULT 0,
      last_availability_verified_at TEXT,
      image_authorization_status TEXT NOT NULL DEFAULT 'pending_authorization'
        CHECK (image_authorization_status IN ('pending_authorization','authorized','rejected')),
      image_authorization_note TEXT,
      supplier_return_policy_note TEXT,
      internal_notes TEXT,
      verified_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  if (tableExists(db, 'cart_items')) {
    const cartCols = columns(db, 'cart_items');
    if (!cartCols.includes('variant_id')) {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec('PRAGMA legacy_alter_table = ON');
      try {
        db.exec('BEGIN IMMEDIATE');
        db.exec('ALTER TABLE cart_items RENAME TO cart_items_legacy');
        db.exec(`
          CREATE TABLE cart_items (
            id TEXT PRIMARY KEY,
            cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL REFERENCES products(id),
            variant_id TEXT NOT NULL DEFAULT '',
            variant_label TEXT,
            quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 99),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            UNIQUE (cart_id, product_id, variant_id)
          );
        `);
        db.exec(`
          INSERT INTO cart_items (id, cart_id, product_id, variant_id, variant_label, quantity, created_at)
          SELECT id, cart_id, product_id, '', NULL, quantity, created_at FROM cart_items_legacy;
        `);
        db.exec('DROP TABLE cart_items_legacy');
        const fkIssues = db.prepare('PRAGMA foreign_key_check').all();
        if (fkIssues.length > 0) {
          throw new Error(`Migration 19 foreign key check failed: ${JSON.stringify(fkIssues.slice(0, 3))}`);
        }
        db.exec('COMMIT');
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Already rolled back.
        }
        throw error;
      } finally {
        db.exec('PRAGMA legacy_alter_table = OFF');
        db.exec('PRAGMA foreign_keys = ON');
      }
    }
  }
}

/**
 * Migration 18: Cash on Delivery (COD) support — adds payment_method,
 * cod_fee_paise, and confirmed_at on orders, plus pending_cod_confirmation and
 * confirmed order lifecycle statuses without breaking existing foreign keys.
 */
function migrateCodSupport(db: Db): void {
  const orderCols = columns(db, 'orders');
  const needsRebuild =
    !orderCols.includes('payment_method') ||
    !orderCols.includes('cod_fee_paise') ||
    !orderCols.includes('confirmed_at');

  if (!needsRebuild) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method, status);');
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('PRAGMA legacy_alter_table = ON');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec('DROP INDEX IF EXISTS idx_orders_user');
    db.exec('DROP INDEX IF EXISTS idx_orders_status');
    db.exec('DROP INDEX IF EXISTS idx_orders_demo');
    db.exec('DROP INDEX IF EXISTS idx_orders_payment_method');
    db.exec('ALTER TABLE orders RENAME TO orders_legacy');
    db.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id),
        email TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN ('pending_payment','pending_cod_confirmation','confirmed','paid','partially_fulfilled','fulfilled','cancelled','partially_refunded','refunded','expired')),
        payment_method TEXT NOT NULL DEFAULT 'razorpay'
          CHECK (payment_method IN ('razorpay','cod')),
        subtotal_paise INTEGER NOT NULL,
        discount_paise INTEGER NOT NULL DEFAULT 0,
        shipping_paise INTEGER NOT NULL DEFAULT 0,
        cod_fee_paise INTEGER NOT NULL DEFAULT 0,
        tax_paise INTEGER NOT NULL DEFAULT 0,
        total_paise INTEGER NOT NULL,
        coupon_code TEXT,
        shipping_address TEXT NOT NULL,
        customer_note TEXT,
        reservation_expires_at TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        placed_at TEXT NOT NULL,
        confirmed_at TEXT,
        paid_at TEXT,
        cancelled_at TEXT,
        is_demo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);
    db.exec(`
      INSERT INTO orders (
        id, order_number, user_id, email, status, payment_method,
        subtotal_paise, discount_paise, shipping_paise, cod_fee_paise,
        tax_paise, total_paise, coupon_code, shipping_address, customer_note,
        reservation_expires_at, idempotency_key, placed_at, confirmed_at, paid_at,
        cancelled_at, is_demo, created_at
      )
      SELECT
        id, order_number, user_id, email, status, 'razorpay',
        subtotal_paise, discount_paise, shipping_paise, 0,
        tax_paise, total_paise, coupon_code, shipping_address, customer_note,
        reservation_expires_at, idempotency_key, placed_at, paid_at, paid_at,
        cancelled_at, is_demo, created_at
      FROM orders_legacy;
    `);
    db.exec('DROP TABLE orders_legacy');
    db.exec('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_orders_demo ON orders(is_demo)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method, status)');
    const fkIssues = db.prepare('PRAGMA foreign_key_check').all();
    if (fkIssues.length > 0) {
      throw new Error(`Migration 18 foreign key check failed: ${JSON.stringify(fkIssues.slice(0, 3))}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Already rolled back.
    }
    throw error;
  } finally {
    db.exec('PRAGMA legacy_alter_table = OFF');
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Migration 17: Product-wise shipping/fulfilment methods, verified seller pickup
 * locations, immutable order-item shipping snapshots, order fulfilment routing,
 * Shiprocket durable sync outbox, and shipping webhook logs.
 */
function migrateProductFulfilmentShipping(db: Db): void {
  addColumn(
    db,
    'products',
    'fulfilment_method',
    "TEXT NOT NULL DEFAULT 'SHIPROCKET' CHECK (fulfilment_method IN ('SHIPROCKET','OWN_DELIVERY','EXTERNAL_SUPPLIER'))",
  );
  addColumn(db, 'products', 'pickup_location_id', 'TEXT');
  addColumn(db, 'products', 'package_length_cm', 'REAL');
  addColumn(db, 'products', 'package_breadth_cm', 'REAL');
  addColumn(db, 'products', 'package_height_cm', 'REAL');
  addColumn(db, 'products', 'handling_days', 'INTEGER NOT NULL DEFAULT 2');
  addColumn(db, 'products', 'shipping_config_json', 'TEXT');

  addColumn(db, 'order_items', 'fulfilment_method', "TEXT NOT NULL DEFAULT 'SHIPROCKET'");
  addColumn(db, 'order_items', 'pickup_location_id', 'TEXT');
  addColumn(db, 'order_items', 'package_weight_g', 'INTEGER');
  addColumn(db, 'order_items', 'package_length_cm', 'REAL');
  addColumn(db, 'order_items', 'package_breadth_cm', 'REAL');
  addColumn(db, 'order_items', 'package_height_cm', 'REAL');
  addColumn(db, 'order_items', 'shipping_snapshot_json', 'TEXT');
  addColumn(db, 'order_items', 'fulfilment_id', 'TEXT');

  addColumn(db, 'shipments', 'fulfilment_id', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_fulfilment_method ON products(fulfilment_method);
    CREATE INDEX IF NOT EXISTS idx_order_items_fulfilment ON order_items(fulfilment_id);
  `);

  // Safely copy legacy pickup addresses from seller_profiles into seller_pickup_locations
  // as unverified/unapproved records so existing sellers have a starting entry to verify
  // without ever auto-approving unverified Shiprocket addresses.
  if (tableExists(db, 'seller_profiles') && tableExists(db, 'seller_pickup_locations')) {
    const sellers = db
      .prepare(
        `SELECT sp.id, sp.business_name, sp.pickup_address, sp.operating_address, p.phone, u.email
           FROM seller_profiles sp
           JOIN users u ON u.id = sp.user_id
           LEFT JOIN profiles p ON p.id = sp.user_id
          WHERE sp.id NOT IN (SELECT seller_id FROM seller_pickup_locations)`,
      )
      .all() as Array<{
      id: string;
      business_name: string;
      pickup_address: string | null;
      operating_address: string | null;
      phone: string | null;
      email: string | null;
    }>;

    const insertPickup = db.prepare(`
      INSERT OR IGNORE INTO seller_pickup_locations
        (id, seller_id, nickname, shiprocket_location_name, contact_name, phone, email,
         line1, line2, city, state, pincode, is_verified, is_approved, is_default, is_active, verification_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, 1, ?)
    `);

    for (const seller of sellers) {
      const raw = seller.pickup_address || seller.operating_address;
      if (!raw) continue;
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        continue;
      }
      const line1 = typeof parsed?.line1 === 'string' ? parsed.line1.trim() : '';
      const city = typeof parsed?.city === 'string' ? parsed.city.trim() : '';
      const state = typeof parsed?.state === 'string' ? parsed.state.trim() : '';
      const pincode = typeof parsed?.pincode === 'string' ? parsed.pincode.trim() : '';
      if (line1.length < 4 || city.length < 2 || state.length < 2 || !/^\d{6}$/.test(pincode)) continue;
      const cleanName = seller.business_name.replace(/[^A-Za-z0-9 ]+/g, '').trim().slice(0, 18) || 'Maker';
      const srName = `${cleanName}_${seller.id.slice(-6)}`.replace(/\s+/g, '_').slice(0, 36);
      const locId = `pkl_${seller.id.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}_${pincode}`;
      const contactPhone =
        typeof parsed?.phone === 'string' && /^[6-9]\d{9}$/.test(parsed.phone.trim())
          ? parsed.phone.trim()
          : seller.phone && /^[6-9]\d{9}$/.test(seller.phone.trim())
            ? seller.phone.trim()
            : '9876543210';
      const contactName =
        typeof parsed?.fullName === 'string' && parsed.fullName.trim().length >= 2
          ? parsed.fullName.trim()
          : seller.business_name;
      insertPickup.run(
        locId,
        seller.id,
        `${seller.business_name.slice(0, 24)} Primary`,
        srName,
        contactName,
        contactPhone,
        seller.email ?? null,
        line1,
        typeof parsed?.line2 === 'string' ? parsed.line2.trim() || null : null,
        city,
        state,
        pincode,
        'Migrated from seller profile; verify with Shiprocket and approve before enabling Shiprocket shipping.',
      );
    }
  }
}

/**
 * Migration 16: Adds single-use, short-lived browser handoff tokens so native mobile
 * sessions can transition securely into web Razorpay checkout or account management.
 */
function migrateBrowserHandoffTokens(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_handoff_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_path TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_handoff_expires ON auth_handoff_tokens(expires_at);
  `);
}

/**
 * Migration 15: Adds Pan-Himalayan regions, crafts, GI/origin metadata on
 * products and makers, and slug_redirects for 301 canonical evolution.
 */
function migratePanHimalayanSeo(db: Db): void {
  addColumn(db, 'seller_profiles', 'craft_specialty', 'TEXT');
  addColumn(db, 'seller_profiles', 'years_of_practice', 'INTEGER');
  addColumn(db, 'seller_profiles', 'workshop_photos_json', 'TEXT');

  addColumn(db, 'products', 'region_slug', 'TEXT');
  addColumn(db, 'products', 'district_village', 'TEXT');
  addColumn(db, 'products', 'craft_type', 'TEXT');
  addColumn(db, 'products', 'craft_slug', 'TEXT');
  addColumn(db, 'products', 'technique', 'TEXT');
  addColumn(db, 'products', 'gi_tagged', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'products', 'gi_requested', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'products', 'gi_name', 'TEXT');
  addColumn(db, 'products', 'gi_registration_ref', 'TEXT');
  addColumn(db, 'products', 'gi_verified_at', 'TEXT');
  addColumn(db, 'products', 'gi_verified_by', 'TEXT');
  addColumn(db, 'products', 'made_to_order', 'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_region_slug ON products(region_slug);
    CREATE INDEX IF NOT EXISTS idx_products_craft_slug ON products(craft_slug);
    CREATE INDEX IF NOT EXISTS idx_products_gi_tagged ON products(gi_tagged);
  `);

  const insertRegion = db.prepare(`
    INSERT OR IGNORE INTO regions
      (id, name, slug, short_name, intro_text, hero_image, famous_crafts_json, famous_foods_json, faqs_json, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const r of DEFAULT_HIMALAYAN_REGIONS) {
    insertRegion.run(
      r.id,
      r.name,
      r.slug,
      r.shortName,
      r.introText,
      r.heroImage,
      JSON.stringify(r.famousCrafts),
      JSON.stringify(r.famousFoods),
      JSON.stringify(r.faqs),
      r.sortOrder,
    );
  }

  const insertCraft = db.prepare(`
    INSERT OR IGNORE INTO crafts
      (id, name, slug, intro_text, history, how_to_identify, hero_image, faqs_json, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const c of DEFAULT_HIMALAYAN_CRAFTS) {
    insertCraft.run(
      c.id,
      c.name,
      c.slug,
      c.introText,
      c.history,
      c.howToIdentify,
      c.heroImage,
      JSON.stringify(c.faqs),
      c.sortOrder,
    );
  }

  // Canonical regional aliases so /regions/kashmir routes cleanly to /regions/jammu-and-kashmir.
  db.prepare('INSERT OR IGNORE INTO slug_redirects (old_path, new_path) VALUES (?, ?)').run(
    '/regions/kashmir',
    '/regions/jammu-and-kashmir',
  );
  db.prepare('INSERT OR IGNORE INTO slug_redirects (old_path, new_path) VALUES (?, ?)').run(
    '/regions/darjeeling',
    '/regions/darjeeling-kalimpong',
  );
  db.prepare('INSERT OR IGNORE INTO slug_redirects (old_path, new_path) VALUES (?, ?)').run(
    '/regions/kalimpong',
    '/regions/darjeeling-kalimpong',
  );
}

/**
 * Migration 14: Adds isolated admin/customer session scopes, per-account login
 * lockout tracking, audit log IP addresses, and SQLite triggers enforcing that
 * audit_logs remain append-only.
 */
function migrateSecurityHardening(db: Db): void {
  addColumn(db, 'users', 'failed_login_attempts', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'users', 'locked_until', 'TEXT');
  addColumn(db, 'sessions', 'scope', "TEXT NOT NULL DEFAULT 'standard'");
  addColumn(db, 'sessions', 'mfa_verified_at', 'TEXT');
  addColumn(db, 'audit_logs', 'ip_address', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_scope ON sessions(user_id, scope)');
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs is append-only');
    END;
  `);
}

/**
 * A payout hold must not erase whether the seller's bank details were already
 * verified. The pre-hold status is restored on release so that releasing a hold
 * cannot silently approve details that still await review.
 */
function migratePayoutHoldStatus(db: Db): void {
  addColumn(db, 'seller_profiles', 'payout_status_before_hold', 'TEXT');
}

/**
 * TOTP second factors. The pending secret lives in `users.mfa_secret` until the
 * user confirms a code; `mfa_enabled_at` is the switch login consults. The
 * challenge table makes the second step single-use and expiring.
 */
function migrateMfa(db: Db): void {
  addColumn(db, 'users', 'mfa_secret', 'TEXT');
  addColumn(db, 'users', 'mfa_enabled_at', 'TEXT');
  if (!tableExists(db, 'mfa_challenges')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mfa_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user ON mfa_challenges(user_id);
      CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires ON mfa_challenges(expires_at);
    `);
  }
}

function migrateTransactionalOutbox(db: Db): void {
  if (!tableExists(db, 'outbox_events')) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id TEXT PRIMARY KEY,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'published', 'failed', 'dead_letter')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 5,
        last_error TEXT,
        scheduled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        processed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_events_status_scheduled ON outbox_events(status, scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);
    `);
  }
}


function migrateShippingAndLedger(db: Db): void {
  if (tableExists(db, 'shipments')) {
    addColumn(db, 'shipments', 'provider_shipment_id', 'TEXT');
    addColumn(db, 'shipments', 'label_url', 'TEXT');
    addColumn(db, 'shipments', 'pickup_scheduled_at', 'TEXT');
    addColumn(db, 'shipments', 'pickup_token', 'TEXT');
  }
  if (tableExists(db, 'seller_ledger_entries')) {
    addColumn(db, 'seller_ledger_entries', 'hold_reason', 'TEXT');
    addColumn(db, 'seller_ledger_entries', 'held_at', 'TEXT');
    addColumn(db, 'seller_ledger_entries', 'held_by', 'TEXT');
  }
  if (tableExists(db, 'seller_profiles')) {
    addColumn(db, 'seller_profiles', 'payout_details_json', 'TEXT');
  }
}

function migrateApplicationWithdrawal(db: Db): void {
  if (!tableExists(db, 'seller_applications')) return;
  const current = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'seller_applications'")
    .get() as { sql: string } | undefined;
  if (current?.sql.includes("'withdrawn'")) return;

  const columns = db.prepare('PRAGMA table_info(seller_applications)').all() as { name: string }[];
  const has = (name: string) => columns.some((column) => column.name === name);
  const select = (name: string, fallback: string) => (has(name) ? name : fallback);

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec('DROP TABLE IF EXISTS seller_applications_migrated');
    db.exec(`
      CREATE TABLE seller_applications_migrated (
        id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','submitted','under_review','changes_requested','approved','rejected','suspended','withdrawn')),
        revision INTEGER NOT NULL DEFAULT 1,
        current_step INTEGER NOT NULL DEFAULT 1,
        seller_category TEXT,
        business_name TEXT NOT NULL DEFAULT '',
        seller_type TEXT NOT NULL DEFAULT 'individual',
        categories TEXT NOT NULL DEFAULT '[]',
        address TEXT NOT NULL DEFAULT '{}',
        gstin TEXT,
        phone TEXT,
        notes TEXT,
        data_json TEXT NOT NULL DEFAULT '{}',
        verification_json TEXT,
        shipping_json TEXT,
        payout_json TEXT,
        agreement_json TEXT,
        rejection_reason TEXT,
        submitted_at TEXT,
        reviewed_by TEXT REFERENCES users(id),
        reviewed_at TEXT,
        last_saved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `);
    db.exec(`
      INSERT INTO seller_applications_migrated
        (id, seller_id, status, revision, current_step, seller_category, business_name, seller_type,
         categories, address, gstin, phone, notes, data_json, verification_json, shipping_json,
         payout_json, agreement_json, rejection_reason, submitted_at, reviewed_by, reviewed_at,
         last_saved_at, created_at, updated_at)
      SELECT id, seller_id,
             CASE status WHEN 'more_info_required' THEN 'changes_requested' ELSE status END,
             ${select('revision', '1')},
             ${select('current_step', '1')},
             ${select('seller_category', 'NULL')},
             ${select('business_name', "''")},
             ${select('seller_type', "'individual'")},
             ${select('categories', "'[]'")},
             ${select('address', "'{}'")},
             ${select('gstin', 'NULL')},
             ${select('phone', 'NULL')},
             ${select('notes', 'NULL')},
             ${select('data_json', "'{}'")},
             ${select('verification_json', 'NULL')},
             ${select('shipping_json', 'NULL')},
             ${select('payout_json', 'NULL')},
             ${select('agreement_json', 'NULL')},
             ${select('rejection_reason', 'NULL')},
             ${select('submitted_at', 'NULL')},
             ${select('reviewed_by', 'NULL')},
             ${select('reviewed_at', 'NULL')},
             ${select('last_saved_at', 'NULL')},
             ${select('created_at', "COALESCE(submitted_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))")},
             ${select('updated_at', "COALESCE(submitted_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))")}
        FROM seller_applications;
    `);
    db.exec('DROP TABLE seller_applications');
    db.exec('ALTER TABLE seller_applications_migrated RENAME TO seller_applications');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seller_app_status ON seller_applications(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seller_app_seller ON seller_applications(seller_id, created_at DESC)');
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_app_one_draft ON seller_applications(seller_id) WHERE status = 'draft'",
    );
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Already rolled back.
    }
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Migration 8 is additive. It adds the customer-visible order timeline, partial
 * return quantities, refund idempotency keys and the provider message id used by
 * transactional email delivery. Existing rows are preserved and backfilled from
 * data that was already snapshotted on the order.
 */
function migrateOrderIntegrity(db: Db): void {
  addColumn(db, 'return_requests', 'requested_amount_paise', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'refunds', 'return_request_id', 'TEXT');
  addColumn(db, 'refunds', 'dedupe_key', 'TEXT');
  addColumn(db, 'notifications', 'provider_message_id', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      seller_order_id TEXT REFERENCES seller_orders(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      actor_id TEXT,
      actor_role TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_order_events_seller_order ON order_events(seller_order_id, created_at);

    CREATE TABLE IF NOT EXISTS return_request_items (
      id TEXT PRIMARY KEY,
      return_request_id TEXT NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
      order_item_id TEXT NOT NULL REFERENCES order_items(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_paise INTEGER NOT NULL,
      line_amount_paise INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (return_request_id, order_item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_return_items_request ON return_request_items(return_request_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_order_item ON return_request_items(order_item_id);
    CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id);
    CREATE INDEX IF NOT EXISTS idx_return_requests_seller_order ON return_requests(seller_order_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_dedupe ON refunds(dedupe_key) WHERE dedupe_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
    CREATE INDEX IF NOT EXISTS idx_refunds_seller_order ON refunds(seller_order_id);
  `);
  db.exec(`
    UPDATE return_requests
       SET requested_amount_paise = COALESCE((
             SELECT SUM(oi.unit_price_paise * oi.quantity)
               FROM order_items oi
              WHERE oi.seller_order_id = return_requests.seller_order_id
           ), 0)
     WHERE requested_amount_paise = 0;
  `);
}

/**
 * Migration 7: add password_changed_at tracking and dedicated tables for
 * secure 6-digit account recovery OTPs and single-use reset authorizations.
 */
function migratePasswordRecoveryOtp(db: Db): void {
  addColumn(db, 'users', 'password_changed_at', 'TEXT');
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_recovery_otps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL COLLATE NOCASE,
      purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verification')),
      otp_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      resend_available_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_recovery_otps_user ON auth_recovery_otps(user_id, purpose);
    CREATE INDEX IF NOT EXISTS idx_recovery_otps_email ON auth_recovery_otps(email, purpose);

    CREATE TABLE IF NOT EXISTS auth_reset_authorizations (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('password_reset')),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reset_auth_user ON auth_reset_authorizations(user_id);
    CREATE INDEX IF NOT EXISTS idx_reset_auth_expires ON auth_reset_authorizations(expires_at);
  `);
}

/**
 * Migration 6 is additive: provider identities, one-time linking challenges and
 * the idle-expiry column on sessions. Existing users and orders are untouched.
 * schema.sql creates the new tables when they are absent; this function also
 * upgrades databases created before the columns existed.
 */
function migrateProviderAuth(db: Db): void {
  addColumn(db, 'sessions', 'last_seen_at', 'TEXT');
  db.exec(`
    UPDATE sessions
       SET last_seen_at = COALESCE(last_seen_at, created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     WHERE last_seen_at IS NULL;
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities(provider_email)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_auth_link_expires ON auth_link_challenges(expires_at)');
}

function migrateDemoOrders(db: Db): void {
  addColumn(db, 'orders', 'is_demo', 'INTEGER NOT NULL DEFAULT 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_demo ON orders(is_demo);');
}

export function queryAll<T>(db: Db, sql: string, ...params: SqlValue[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T>(db: Db, sql: string, ...params: SqlValue[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function execute(db: Db, sql: string, ...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint } {
  return db.prepare(sql).run(...params) as { changes: number; lastInsertRowid: number | bigint };
}

export type SqlValue = string | number | null | Uint8Array;

const txDepth = new WeakMap<Db, number>();

/**
 * Serializable write transaction. Uses BEGIN IMMEDIATE so concurrent writers
 * queue rather than interleave; nested calls use savepoints.
 */
export function tx<T>(db: Db, fn: () => T): T {
  const depth = txDepth.get(db) ?? 0;
  const savepoint = `sp_${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  txDepth.set(db, depth + 1);
  try {
    const result = fn();
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    try {
      db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    } catch {
      // The transaction may already have been rolled back by SQLite.
    }
    throw error;
  } finally {
    txDepth.set(db, depth);
  }
}

let singleton: Db | null = null;

export function getDb(): Db {
  if (!singleton) {
    throw new Error('Database not initialised. Call initDb() first.');
  }
  return singleton;
}

export function initDb(filename: string): Db {
  if (!singleton) singleton = openDatabase(filename);
  return singleton;
}

export function closeDb(): void {
  singleton?.close();
  singleton = null;
}
