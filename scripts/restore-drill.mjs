#!/usr/bin/env node
/**
 * Backup restore drill.
 *
 * Usage:
 *   npm run drill:restore -- ./backups/pahadi-roots-<timestamp>.db
 *   npm run drill:restore -- ./backups/<file>.db --serve
 *
 * What it does
 *   1. Copies the backup into a throwaway directory (the source is never touched).
 *   2. Verifies SHA256 equality, PRAGMA integrity_check and foreign_key_check.
 *   3. Confirms schema_migrations ends at 13 and the auth/payout tables exist.
 *   4. Reports row counts so a truncated backup is obvious.
 *   5. With --serve, boots the built server against the restored copy on a local
 *      port and probes /api/health/live, /api/health/ready, an unknown-email
 *      login (expect 401) and the product catalogue. No account is created and
 *      no order, payment or message is produced.
 *
 * This proves the backup is restorable on this machine. A clean-host drill on
 * separate infrastructure still needs host access and is tracked in
 * docs/MONITORING_AND_ALERTS.md and docs/LAUNCH_CHECKLIST.md.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const serve = args.includes('--serve');
const backupArg = args.find((arg) => !arg.startsWith('-'));

const findings = [];
const record = (level, check, detail) => {
  findings.push({ level, check, detail });
  const line = JSON.stringify({ level, check, detail });
  if (level === 'critical') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

if (!backupArg) {
  record('critical', 'usage', 'npm run drill:restore -- <backup.db> [--serve]');
  process.exit(1);
}

const source = path.resolve(backupArg);
if (!fs.existsSync(source)) {
  record('critical', 'backup', `not found at ${source}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const drillDir = fs.mkdtempSync(path.join(os.tmpdir(), `dearhills-restore-${stamp}-`));
const restored = path.join(drillDir, 'dearhills.db');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

fs.copyFileSync(source, restored);
record('ok', 'restore.copy', restored);

const sourceHash = sha256(source);
const restoredHash = sha256(restored);
record(
  sourceHash === restoredHash ? 'ok' : 'critical',
  'restore.sha256',
  sourceHash === restoredHash ? sourceHash : `mismatch source=${sourceHash} restored=${restoredHash}`,
);

const requiredTables = [
  'users',
  'profiles',
  'sessions',
  'user_roles',
  'auth_identities',
  'mfa_challenges',
  'seller_profiles',
  'products',
  'product_images',
  'inventory',
  'orders',
  'seller_orders',
  'order_items',
  'payments',
  'refunds',
  'seller_ledger_entries',
  'settlement_batches',
  'settlement_items',
  'schema_migrations',
];

let db;
try {
  db = new DatabaseSync(restored, { readOnly: true });
  const integrity = String(db.prepare('PRAGMA integrity_check').get()?.integrity_check ?? 'unknown');
  record(integrity === 'ok' ? 'ok' : 'critical', 'sqlite.integrity_check', integrity);

  const violations = db.prepare('PRAGMA foreign_key_check').all();
  record(
    violations.length === 0 ? 'ok' : 'critical',
    'sqlite.foreign_key_check',
    `${violations.length} violation(s)`,
  );

  const existing = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name),
  );
  const missingTables = requiredTables.filter((table) => !existing.has(table));
  record(
    missingTables.length === 0 ? 'ok' : 'critical',
    'schema.tables',
    missingTables.length === 0 ? `${requiredTables.length} required table(s) present` : `missing: ${missingTables.join(', ')}`,
  );

  const versions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => Number(row.version));
  const latest = versions.length > 0 ? Math.max(...versions) : 0;
  record(latest >= 13 ? 'ok' : 'critical', 'schema.migrations', `latest=${latest} requires>=13`);

  const authColumns = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((row) => row.name);
  const missingAuthColumns = ['mfa_secret', 'mfa_enabled_at', 'password_changed_at'].filter(
    (column) => !authColumns.includes(column),
  );
  record(
    missingAuthColumns.length === 0 ? 'ok' : 'critical',
    'schema.auth_columns',
    missingAuthColumns.length === 0 ? 'present' : `missing: ${missingAuthColumns.join(', ')}`,
  );

  const payoutColumns = db
    .prepare('PRAGMA table_info(seller_profiles)')
    .all()
    .map((row) => row.name);
  const missingPayoutColumns = ['payout_status', 'payout_status_before_hold', 'payout_details_json'].filter(
    (column) => !payoutColumns.includes(column),
  );
  record(
    missingPayoutColumns.length === 0 ? 'ok' : 'critical',
    'schema.payout_columns',
    missingPayoutColumns.length === 0 ? 'present' : `missing: ${missingPayoutColumns.join(', ')}`,
  );

  const counts = {};
  for (const table of ['users', 'seller_profiles', 'products', 'orders', 'payments', 'settlement_batches']) {
    if (!existing.has(table)) continue;
    try {
      counts[table] = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0);
    } catch {
      counts[table] = -1;
    }
  }
  record('ok', 'restore.row_counts', JSON.stringify(counts));
} catch (error) {
  record('critical', 'restore.open', error instanceof Error ? error.message : String(error));
} finally {
  try {
    db?.close();
  } catch {
    // Already closed.
  }
}

// --- Optional local boot against the restored copy ---------------------------
async function bootAndProbe() {
  const entry = path.resolve(process.cwd(), 'dist-server', 'server', 'index.js');
  if (!fs.existsSync(entry)) {
    record('warn', 'drill.serve', `skipped: ${entry} not found; run npm run build first`);
    return;
  }

  const port = Number(process.env.DRILL_PORT ?? 18787);
  const origin = `http://127.0.0.1:${port}`;
  const logs = [];
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      APP_URL: origin,
      DATABASE_PATH: restored,
      UPLOAD_DIR: path.join(drillDir, 'uploads'),
      PRIVATE_DOCS_DIR: path.join(drillDir, 'private'),
      TRUST_PROXY: '0',
      SEED_ON_START: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const keep = (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) logs.push(line.slice(0, 500));
    }
    if (logs.length > 200) logs.splice(0, logs.length - 200);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);

  const waitFor = async (url, attempts = 60) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        return response;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(`timed out waiting for ${url}`);
  };

  try {
    const live = await waitFor(`${origin}/api/health/live`);
    record(live.status === 200 ? 'ok' : 'critical', 'drill.health_live', `HTTP ${live.status}`);

    const ready = await waitFor(`${origin}/api/health/ready`);
    const readyBody = await ready.json().catch(() => ({}));
    record(
      ready.status === 200 && readyBody.ready === true ? 'ok' : 'critical',
      'drill.health_ready',
      `HTTP ${ready.status} ${JSON.stringify({ database: readyBody.database, schema: readyBody.schema, auth: readyBody.auth })}`,
    );

    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'pahadi-roots' },
      body: JSON.stringify({ email: 'drill-probe@example.invalid', password: 'not-a-real-password' }),
    });
    record(
      login.status === 401 ? 'ok' : 'critical',
      'drill.login_path',
      `HTTP ${login.status} (expected 401 for an unknown account; no account was created)`,
    );

    const catalogue = await fetch(`${origin}/api/products`);
    record(catalogue.status === 200 ? 'ok' : 'critical', 'drill.catalogue', `HTTP ${catalogue.status}`);
  } catch (error) {
    record('critical', 'drill.probe', error instanceof Error ? error.message : String(error));
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (child.exitCode === null) child.kill('SIGKILL');
    if (findings.some((finding) => finding.level === 'critical')) {
      record('warn', 'drill.server_log', JSON.stringify(logs.slice(-15)));
    }
  }
}

if (serve) {
  await bootAndProbe();
} else {
  record('warn', 'drill.serve', 'skipped (pass --serve to boot the built server against the restored copy)');
}

const critical = findings.filter((finding) => finding.level === 'critical');
console.log(
  JSON.stringify({
    level: 'info',
    msg: 'restore_drill_complete',
    restoredTo: restored,
    critical: critical.length,
    sourceTouched: false,
    productionMutated: false,
    note: 'A clean-host drill still requires separate infrastructure access.',
  }),
);

// Keep the restored copy only on failure so it can be inspected.
if (critical.length > 0) {
  console.error(JSON.stringify({ level: 'error', msg: 'restore_drill_failed', keptAt: restored }));
  process.exit(1);
}
fs.rmSync(drillDir, { recursive: true, force: true });
