import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

/**
 * Read-only production diagnostic.
 *
 * Usage:
 *   npm run diagnose
 *   DATABASE_PATH=/var/lib/pahadi-roots/dearhills.db npm run diagnose
 *
 * This script never migrates, writes or deletes. It exists because the live
 * login endpoint returned 500 while health checks stayed green: a migration
 * row alone does not prove the columns the auth code queries are present.
 *
 * Output is JSON lines. No secrets, email addresses or bank details are
 * printed; counts and column names only.
 */

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
} catch {
  // .env is optional.
}

interface Finding {
  level: 'ok' | 'warn' | 'critical';
  check: string;
  detail: string;
}

const findings: Finding[] = [];
const record = (level: Finding['level'], check: string, detail: string): void => {
  findings.push({ level, check, detail });
};

function nodeAtLeast(major: number, minor: number): boolean {
  const [currentMajor, currentMinor] = process.versions.node.split('.').map(Number);
  return currentMajor > major || (currentMajor === major && currentMinor >= minor);
}

const nodeOk = nodeAtLeast(24, 7);
record(
  nodeOk ? 'ok' : 'critical',
  'runtime',
  `Node ${process.versions.node} (requires >=24.7.0)`,
);

const argon2Supported = typeof crypto.argon2Sync === 'function';
record(
  argon2Supported ? 'ok' : 'critical',
  'crypto.argon2Sync',
  argon2Supported ? 'available' : 'missing — password sign-in will fail with 500',
);

const databasePath = path.resolve(process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'pahadi-roots.db'));
if (!fs.existsSync(databasePath)) {
  record('critical', 'database', `not found at ${databasePath}`);
} else {
  record('ok', 'database', `found at ${databasePath}`);
}

const requiredColumns: Record<string, string[]> = {
  users: ['id', 'email', 'password_hash', 'email_verified', 'is_disabled', 'password_changed_at', 'mfa_secret', 'mfa_enabled_at'],
  profiles: ['id', 'full_name'],
  sessions: ['token_hash', 'user_id', 'expires_at', 'last_seen_at', 'created_at'],
  user_roles: ['user_id', 'role'],
  auth_identities: ['user_id', 'provider'],
  mfa_challenges: ['token_hash', 'attempts', 'expires_at', 'used_at'],
  seller_profiles: ['payout_details_json', 'payout_status', 'payout_status_before_hold'],
};

const environmentKeys = [
  'NODE_ENV',
  'APP_URL',
  'DATABASE_PATH',
  'TRUST_PROXY',
  'GOOGLE_CLIENT_ID',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'SHIPPING_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'SMTP_HOST',
  'EMAIL_FROM',
  'SUPPORT_EMAIL',
  'ADMIN_NOTIFICATION_EMAIL',
];

const envReport = environmentKeys.map((key) => ({ key, set: Boolean(process.env[key]?.trim()) }));
record(
  envReport.every((entry) => entry.set) ? 'ok' : 'warn',
  'environment',
  `set=${envReport.filter((entry) => entry.set).length}/${envReport.length}`,
);

if (fs.existsSync(databasePath)) {
  let db: DatabaseSync | null = null;
  try {
    // readOnly must never create sidecar files or run migrations.
    db = new DatabaseSync(databasePath, { readOnly: true });

    const integrity = String(db.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown');
    record(integrity === 'ok' ? 'ok' : 'critical', 'sqlite.integrity_check', integrity);

    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    record(foreignKeys.length === 0 ? 'ok' : 'critical', 'sqlite.foreign_key_check', `${foreignKeys.length} violation(s)`);

    const migrations = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => Number(row.version));
    const latest = migrations.length > 0 ? Math.max(...migrations) : 0;
    record(
      latest >= 13 ? 'ok' : 'critical',
      'schema_migrations',
      `latest=${latest}; versions=${migrations.join(',') || 'none'}; requires >=13`,
    );

    for (const [table, required] of Object.entries(requiredColumns)) {
      const name = table.replaceAll("'", "''");
      const exists = Boolean(
        db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
      );
      if (!exists) {
        record('critical', `table.${table}`, 'missing');
        continue;
      }
      const columns = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => String(row.name));
      const missing = required.filter((column) => !columns.includes(column));
      record(
        missing.length === 0 ? 'ok' : 'critical',
        `table.${table}`,
        missing.length === 0 ? `${columns.length} column(s)` : `missing: ${missing.join(',')}`,
      );
    }

    const counts: Record<string, number> = {};
    const count = (key: string, sql: string): void => {
      try {
        counts[key] = Number(db!.prepare(sql).get()?.count ?? 0);
      } catch {
        counts[key] = -1;
      }
    };
    count('users', 'SELECT COUNT(*) AS count FROM users');
    count('usersWithPassword', "SELECT COUNT(*) AS count FROM users WHERE password_hash IS NOT NULL AND password_hash != ''");
    count('administrators', "SELECT COUNT(*) AS count FROM user_roles WHERE role = 'admin'");
    count(
      'sellersAwaitingPayoutVerification',
      "SELECT COUNT(*) AS count FROM seller_profiles WHERE payout_details_json IS NOT NULL AND payout_status != 'verified'",
    );
    record('ok', 'counts', JSON.stringify(counts));
  } catch (error) {
    record('critical', 'database.open', error instanceof Error ? error.message : String(error));
  } finally {
    try {
      db?.close();
    } catch {
      // Already closed.
    }
  }
}

for (const finding of findings) {
  console[levelToMethod(finding.level)](JSON.stringify(finding));
}

function levelToMethod(level: Finding['level']): 'log' | 'warn' | 'error' {
  if (level === 'critical') return 'error';
  if (level === 'warn') return 'warn';
  return 'log';
}

const critical = findings.filter((finding) => finding.level === 'critical');
if (critical.length > 0) {
  console.error(JSON.stringify({ level: 'error', msg: 'diagnose_failed', critical: critical.length }));
  process.exit(1);
}
console.log(JSON.stringify({ level: 'info', msg: 'diagnose_ok', environment: envReport }));
