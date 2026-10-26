#!/usr/bin/env node
/**
 * Non-destructive verification of a SQLite backup.
 *
 * Usage:
 *   npm run db:verify -- ./backups/pahadi-roots-<timestamp>.db
 *
 * The file is opened read-only. This checks structural integrity and that the
 * tables a restore depends on are present, but it is not a substitute for a
 * full restore into a separate environment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const target = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(target)) {
  console.error(JSON.stringify({ level: 'error', msg: 'backup_not_found', usage: 'npm run db:verify -- <backup.db>' }));
  process.exit(1);
}

const db = new DatabaseSync(target, { readOnly: true });
try {
  const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check;
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  const required = ['users', 'profiles', 'sessions', 'orders', 'products', 'schema_migrations'];
  const missing = required.filter((table) => !tables.includes(table));
  let migrations = [];
  if (tables.includes('schema_migrations')) {
    migrations = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version);
  }
  const counts = {};
  for (const table of ['users', 'orders', 'products', 'sessions', 'auth_identities']) {
    if (!tables.includes(table)) continue;
    counts[table] = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }
  const ok = integrity === 'ok' && missing.length === 0 && foreignKeys.length === 0;
  console.log(
    JSON.stringify({
      level: ok ? 'info' : 'error',
      msg: ok ? 'backup_verified' : 'backup_failed_verification',
      target,
      bytes: fs.statSync(target).size,
      integrity,
      foreignKeyViolations: foreignKeys.length,
      missingRequiredTables: missing,
      migrations,
      counts,
      note: 'Restore into a non-production environment before declaring disaster recovery verified.',
    }),
  );
  if (!ok) process.exitCode = 1;
} finally {
  db.close();
}
