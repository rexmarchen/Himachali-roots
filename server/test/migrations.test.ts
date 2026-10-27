import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase, queryAll, queryOne } from '../db.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pahadi-migration-'));

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

/**
 * A database created before seller onboarding keeps the original table shapes.
 * schema.sql is idempotent for tables, but its indexes reference newer columns,
 * so opening a legacy file must reconcile those columns before running the
 * script. This guards against a release that cannot start on existing data.
 */
describe('legacy database migrations', () => {
  it('opens a pre-onboarding database and upgrades it without losing rows', () => {
    const file = path.join(directory, 'legacy.db');
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-01-01T00:00:00.000Z'), (2, '2026-01-01T00:00:00.000Z');

      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE);
      INSERT INTO users (id, email) VALUES ('user_legacy', 'legacy@example.com');

      CREATE TABLE seller_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        business_name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        seller_type TEXT NOT NULL DEFAULT 'individual',
        tagline TEXT,
        story TEXT,
        region TEXT,
        village TEXT,
        operating_address TEXT,
        pickup_address TEXT,
        gstin TEXT,
        pan_last4 TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        rejection_reason TEXT,
        commission_rate_bp INTEGER,
        approved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO seller_profiles (id, user_id, business_name, slug, status)
      VALUES ('sel_legacy', 'user_legacy', 'Legacy Loom', 'legacy-loom', 'approved');

      CREATE TABLE seller_applications (
        id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'submitted',
        business_name TEXT NOT NULL DEFAULT '',
        seller_type TEXT NOT NULL DEFAULT 'individual',
        categories TEXT NOT NULL DEFAULT '[]',
        address TEXT NOT NULL DEFAULT '{}',
        gstin TEXT,
        phone TEXT,
        notes TEXT,
        rejection_reason TEXT,
        submitted_at TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT
      );
      INSERT INTO seller_applications (id, seller_id, status, business_name, submitted_at)
      VALUES ('app_legacy', 'sel_legacy', 'approved', 'Legacy Loom', '2026-01-01T00:00:00.000Z');
    `);
    legacy.close();

    const db = openDatabase(file);
    try {
      const versions = queryAll<{ version: number }>(db, 'SELECT version FROM schema_migrations ORDER BY version').map(
        (row) => row.version,
      );
      expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const profile = queryOne<{ status: string; store_status: string; payout_status: string }>(
        db,
        'SELECT status, store_status, payout_status FROM seller_profiles WHERE id = ?',
        'sel_legacy',
      );
      expect(profile).toMatchObject({ status: 'approved', store_status: 'active', payout_status: 'not_started' });

      const application = queryOne<{ status: string; revision: number; current_step: number; data_json: string; created_at: string }>(
        db,
        'SELECT status, revision, current_step, data_json, created_at FROM seller_applications WHERE id = ?',
        'app_legacy',
      );
      expect(application?.status).toBe('approved');
      expect(application?.revision).toBe(1);
      expect(application?.current_step).toBe(1);
      expect(application?.data_json).toBe('{}');
      expect(application?.created_at).toBe('2026-01-01T00:00:00.000Z');

      const tables = queryAll<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('seller_application_events','seller_notifications','auth_recovery_otps','auth_reset_authorizations')",
      );
      expect(tables).toHaveLength(4);
      expect(queryOne(db, 'PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
    } finally {
      db.close();
    }
  });

  it('opens a v7 database whose refund/return/notification tables predate migration 8', () => {
    const file = path.join(directory, 'legacy-v7.db');
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES
        (1, '2026-01-01T00:00:00.000Z'), (2, '2026-01-01T00:00:00.000Z'),
        (3, '2026-01-01T00:00:00.000Z'), (4, '2026-01-01T00:00:00.000Z'),
        (5, '2026-01-01T00:00:00.000Z'), (6, '2026-01-01T00:00:00.000Z'),
        (7, '2026-01-01T00:00:00.000Z');

      CREATE TABLE refunds (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        seller_order_id TEXT,
        payment_id TEXT,
        amount_paise INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        provider TEXT,
        provider_refund_id TEXT UNIQUE,
        provider_status TEXT,
        requested_by TEXT,
        decided_by TEXT,
        decided_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO refunds (id, order_id, amount_paise, reason, status)
      VALUES ('ref_legacy', 'ord_legacy', 10000, 'Legacy refund', 'requested');

      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        email TEXT NOT NULL,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        sent_at TEXT,
        error TEXT,
        dedupe_key TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO notifications (id, email, type, subject, body)
      VALUES ('ntf_legacy', 'legacy@example.com', 'legacy', 'Legacy notice', 'Body');

      CREATE TABLE return_requests (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        seller_order_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'requested',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT
      );
      INSERT INTO return_requests (id, order_id, seller_order_id, reason)
      VALUES ('ret_legacy', 'ord_legacy', 'so_legacy', 'Legacy return');
    `);
    legacy.close();

    const db = openDatabase(file);
    try {
      const versions = queryAll<{ version: number }>(db, 'SELECT version FROM schema_migrations ORDER BY version');
      expect(versions.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const [table, column] of [
        ['refunds', 'dedupe_key'],
        ['refunds', 'return_request_id'],
        ['notifications', 'provider_message_id'],
        ['return_requests', 'requested_amount_paise'],
      ]) {
        const columns = queryAll<{ name: string }>(db, `PRAGMA table_info(${table})`).map((row) => row.name);
        expect(columns, `${table}.${column}`).toContain(column);
      }
      expect(queryOne(db, "SELECT id FROM refunds WHERE id = 'ref_legacy'")).toBeTruthy();
      expect(queryOne(db, "SELECT id FROM notifications WHERE id = 'ntf_legacy'")).toBeTruthy();
      expect(queryOne(db, "SELECT id FROM return_requests WHERE id = 'ret_legacy'")).toBeTruthy();
      expect(queryOne(db, 'PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
    } finally {
      db.close();
    }
  });

  it('can open the upgraded database again without duplicating migrations', () => {
    const file = path.join(directory, 'legacy.db');
    const db = openDatabase(file);
    try {
      const versions = queryAll<{ version: number }>(db, 'SELECT version FROM schema_migrations ORDER BY version');
      expect(versions.map((row) => row.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      const orderItemColumns = queryAll<{ name: string }>(db, 'PRAGMA table_info(order_items)').map((row) => row.name);
      expect(orderItemColumns).toContain('original_unit_price_paise');
      const sessionColumns = queryAll<{ name: string }>(db, 'PRAGMA table_info(sessions)').map((row) => row.name);
      expect(sessionColumns).toContain('last_seen_at');
      const userColumns = queryAll<{ name: string }>(db, 'PRAGMA table_info(users)').map((row) => row.name);
      expect(userColumns).toContain('password_changed_at');
      const authTables = queryAll<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('auth_identities','auth_link_challenges','auth_recovery_otps','auth_reset_authorizations')",
      );
      expect(authTables).toHaveLength(4);
      const applications = queryAll(db, 'SELECT id FROM seller_applications');
      expect(applications).toHaveLength(1);
      const refundColumns = queryAll<{ name: string }>(db, 'PRAGMA table_info(refunds)').map((row) => row.name);
      expect(refundColumns).toContain('dedupe_key');
      expect(refundColumns).toContain('return_request_id');
      const integrityTables = queryAll<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('order_events','return_request_items')",
      );
      expect(integrityTables).toHaveLength(2);
    } finally {
      db.close();
    }
  });
});
