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
      expect(versions).toEqual([1, 2, 3, 4]);

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
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('seller_application_events','seller_notifications')",
      );
      expect(tables).toHaveLength(2);
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
      expect(versions.map((row) => row.version)).toEqual([1, 2, 3, 4]);
      const applications = queryAll(db, 'SELECT id FROM seller_applications');
      expect(applications).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});
