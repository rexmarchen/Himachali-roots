-- PAHADI ROOTS — SQLite schema (development / single-instance deployment)
-- All money is stored as INTEGER paise. Timestamps are ISO-8601 UTC strings.
-- This schema is the source of truth for the local database; docs/DATABASE.md
-- describes the PostgreSQL/Supabase migration path and RLS equivalents.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_disabled INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  deletion_requested_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer','seller','admin')),
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- External identity providers. The provider's stable subject identifier is the
-- key; email is only descriptive and is never used to merge accounts.
CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_sign_in_at TEXT,
  UNIQUE (provider, provider_user_id),
  UNIQUE (provider, user_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities(provider_email);

-- A short-lived, single-use proof that the owner of an existing password
-- account agreed to attach a provider identity. Only the hash is stored.
CREATE TABLE IF NOT EXISTS auth_link_challenges (
  token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  avatar_url TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_link_expires ON auth_link_challenges(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Cryptographically secure 6-digit OTPs for account recovery. The OTP hash is
-- stored, never plaintext. Enforces 5-minute expiry and 5 max attempts.
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

-- Short-lived, single-use authorizations issued only after successful OTP verification.
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

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS seller_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  seller_type TEXT NOT NULL DEFAULT 'individual',
  seller_category TEXT
    CHECK (seller_category IS NULL OR seller_category IN
      ('farmer_grower','artisan_craftsperson','food_producer','home_business','local_brand','retailer')),
  tagline TEXT,
  story TEXT,
  logo_url TEXT,
  cover_url TEXT,
  region TEXT,
  village TEXT,
  operating_address TEXT,
  pickup_address TEXT,
  gstin TEXT,
  pan_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','under_review','approved','rejected','suspended','more_info_required')),
  store_status TEXT NOT NULL DEFAULT 'setup_incomplete'
    CHECK (store_status IN ('setup_incomplete','pending_activation','active','suspended')),
  store_status_reason TEXT,
  payout_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (payout_status IN ('not_started','pending_configuration','pending_verification','verified','blocked')),
  rejection_reason TEXT,
  commission_rate_bp INTEGER,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  approved_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_store_status ON seller_profiles(store_status);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_category ON seller_profiles(seller_category);

CREATE TABLE IF NOT EXISTS seller_applications (
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
CREATE INDEX IF NOT EXISTS idx_seller_app_status ON seller_applications(status);
CREATE INDEX IF NOT EXISTS idx_seller_app_seller ON seller_applications(seller_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_app_one_draft
  ON seller_applications(seller_id) WHERE status = 'draft';

CREATE TABLE IF NOT EXISTS seller_application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES seller_applications(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  actor_id TEXT,
  actor_email TEXT,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seller_app_events ON seller_application_events(application_id, created_at);

CREATE TABLE IF NOT EXISTS seller_documents (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  application_id TEXT REFERENCES seller_applications(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL,
  doc_label TEXT,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','accepted','rejected')),
  review_note TEXT,
  expires_at TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seller_documents_seller ON seller_documents(seller_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS seller_notifications (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  read_at TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seller_notifications_unread ON seller_notifications(seller_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES categories(id),
  description TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  compare_at_price_paise INTEGER CHECK (compare_at_price_paise IS NULL OR compare_at_price_paise >= price_paise),
  sku TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece',
  weight_g INTEGER,
  dimensions TEXT,
  materials TEXT,
  care_instructions TEXT,
  food_info TEXT,
  compliance_json TEXT,
  origin_place TEXT,
  origin_verified INTEGER NOT NULL DEFAULT 0,
  region TEXT,
  variety_grade TEXT,
  harvest_info TEXT,
  dispatch_conditions TEXT,
  estimated_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_paise >= 0),
  packaging_cost_paise INTEGER NOT NULL DEFAULT 0 CHECK (packaging_cost_paise >= 0),
  attributes TEXT,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  hsn_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending','approved','rejected','paused','archived')),
  moderation_note TEXT,
  changes_requested_at TEXT,
  published_at TEXT,
  rejection_reason TEXT,
  is_featured INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (seller_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price_paise);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL,
  credit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

CREATE TABLE IF NOT EXISTS inventory (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (reserved_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  change INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('seed','restock','reservation','release','sale','cancellation','adjustment','return')),
  reference TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_movements_product ON inventory_movements(product_id);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','abandoned')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_one_active_user ON carts(user_id) WHERE user_id IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 99),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('pending_payment','paid','partially_fulfilled','fulfilled','cancelled','partially_refunded','refunded','expired')),
  subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  shipping_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  coupon_code TEXT,
  shipping_address TEXT NOT NULL,
  customer_note TEXT,
  reservation_expires_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  placed_at TEXT NOT NULL,
  paid_at TEXT,
  cancelled_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_demo ON orders(is_demo);

CREATE TABLE IF NOT EXISTS seller_orders (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','packed','shipped','delivered','cancelled','returned','refunded')),
  subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  shipping_paise INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  commission_rate_bp INTEGER NOT NULL,
  commission_paise INTEGER NOT NULL,
  seller_earning_paise INTEGER NOT NULL,
  dispatch_by TEXT,
  shipped_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_seller_orders_seller ON seller_orders(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_seller_orders_order ON seller_orders(order_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_order_id TEXT NOT NULL REFERENCES seller_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  image_url TEXT,
  unit_price_paise INTEGER NOT NULL,
  original_unit_price_paise INTEGER,
  quantity INTEGER NOT NULL,
  line_subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  tax_paise INTEGER NOT NULL DEFAULT 0,
  commission_rate_bp INTEGER NOT NULL,
  commission_paise INTEGER NOT NULL,
  seller_earning_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ordered'
    CHECK (status IN ('ordered','shipped','delivered','cancelled','returned','refunded')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_order ON order_items(seller_order_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT UNIQUE,
  amount_paise INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('created','pending','paid','failed','cancelled')),
  method TEXT,
  verified_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  order_id TEXT,
  type TEXT NOT NULL,
  summary TEXT,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  seller_order_id TEXT NOT NULL UNIQUE REFERENCES seller_orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  tracking_url TEXT,
  status TEXT NOT NULL DEFAULT 'shipped'
    CHECK (status IN ('shipped','in_transit','out_for_delivery','delivered','failed','rto')),
  shipped_at TEXT NOT NULL,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  description TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS cancellation_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_order_id TEXT REFERENCES seller_orders(id),
  order_item_id TEXT REFERENCES order_items(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','cancelled_by_customer','completed')),
  resolution_note TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS return_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_order_id TEXT REFERENCES seller_orders(id),
  order_item_id TEXT REFERENCES order_items(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  description TEXT,
  requested_amount_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','pickup_scheduled','received','refunded','closed')),
  resolution_note TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_seller_order ON return_requests(seller_order_id);

-- A return may cover only part of a line (for example 1 of 2 shawls). Each row
-- is the quantity and snapshotted value the customer asked to return.
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

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  seller_order_id TEXT REFERENCES seller_orders(id),
  payment_id TEXT REFERENCES payments(id),
  return_request_id TEXT REFERENCES return_requests(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','approved','rejected','processing','completed','failed')),
  requested_by TEXT NOT NULL,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  provider_refund_id TEXT UNIQUE,
  provider_status TEXT,
  dedupe_key TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_dedupe ON refunds(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_seller_order ON refunds(seller_order_id);

-- Append-only business timeline. audit_logs answers "who changed what"; this
-- answers "what happened to this order", and is safe to show to staff/customers.
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

CREATE TABLE IF NOT EXISTS commission_rules (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global','category','seller')),
  category_id TEXT REFERENCES categories(id),
  seller_id TEXT REFERENCES seller_profiles(id),
  rate_bp INTEGER NOT NULL CHECK (rate_bp >= 0 AND rate_bp <= 5000),
  is_active INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((scope = 'global' AND category_id IS NULL AND seller_id IS NULL)
      OR (scope = 'category' AND category_id IS NOT NULL AND seller_id IS NULL)
      OR (scope = 'seller' AND seller_id IS NOT NULL AND category_id IS NULL))
);

CREATE TABLE IF NOT EXISTS commission_entries (
  id TEXT PRIMARY KEY,
  seller_order_id TEXT NOT NULL UNIQUE REFERENCES seller_orders(id),
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  basis_paise INTEGER NOT NULL,
  rate_bp INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS seller_ledger_entries (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  order_id TEXT REFERENCES orders(id),
  seller_order_id TEXT REFERENCES seller_orders(id),
  type TEXT NOT NULL CHECK (type IN ('sale','commission','refund','adjustment','settlement')),
  amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','eligible','settled','reversed')),
  reference TEXT NOT NULL UNIQUE,
  note TEXT,
  available_at TEXT,
  settlement_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_seller ON seller_ledger_entries(seller_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_settlement_ref ON seller_ledger_entries(settlement_id, reference) WHERE settlement_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS settlement_batches (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES seller_profiles(id),
  reference TEXT NOT NULL UNIQUE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  gross_paise INTEGER NOT NULL DEFAULT 0,
  commission_paise INTEGER NOT NULL DEFAULT 0,
  refunds_paise INTEGER NOT NULL DEFAULT 0,
  adjustments_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending','processing','paid','failed','reversed')),
  provider_reference TEXT,
  note TEXT,
  created_by TEXT REFERENCES users(id),
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settlement_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES settlement_batches(id) ON DELETE CASCADE,
  ledger_entry_id TEXT NOT NULL UNIQUE REFERENCES seller_ledger_entries(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('percent','fixed')),
  value INTEGER NOT NULL,
  min_order_paise INTEGER NOT NULL DEFAULT 0,
  max_discount_paise INTEGER,
  usage_limit INTEGER,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL REFERENCES coupons(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  discount_paise INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Seasonal campaigns. The stored status is the editorial state (draft/active/
-- archived); scheduled and expired are derived from the time window so a
-- campaign cannot keep selling after its end date because nobody edited it.
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  poster_url TEXT,
  poster_alt TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  starts_at TEXT,
  ends_at TEXT,
  max_discount_bp INTEGER NOT NULL DEFAULT 3000
    CHECK (max_discount_bp >= 0 AND max_discount_bp <= 10000),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

CREATE TABLE IF NOT EXISTS campaign_products (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  promo_price_paise INTEGER NOT NULL CHECK (promo_price_paise > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (campaign_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_products_product ON campaign_products(product_id);

-- One authoritative promotional price per product: the lowest valid price from
-- a live campaign. Validity is re-checked against the product's current base
-- price and the campaign's maximum discount, so a later price edit cannot leave
-- a stale or misleading badge in place.
CREATE VIEW IF NOT EXISTS active_campaign_prices AS
  SELECT cp.product_id, MIN(cp.promo_price_paise) AS promo_price_paise
    FROM campaign_products cp
    JOIN campaigns c ON c.id = cp.campaign_id
    JOIN products p ON p.id = cp.product_id
   WHERE c.status = 'active'
     AND (c.starts_at IS NULL OR c.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     AND (c.ends_at IS NULL OR c.ends_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     AND cp.promo_price_paise < p.price_paise
     AND (p.price_paise - cp.promo_price_paise) * 10000 <= c.max_discount_bp * p.price_paise
   GROUP BY cp.product_id;

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  sent_at TEXT,
  error TEXT,
  provider_message_id TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  order_number TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  consent_at TEXT NOT NULL,
  unsubscribed_at TEXT,
  source TEXT NOT NULL DEFAULT 'footer'
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS integration_settings (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'unconfigured' CHECK (mode IN ('unconfigured','test','live')),
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
