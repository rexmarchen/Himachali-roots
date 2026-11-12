#!/usr/bin/env node
/**
 * Read-only payout and settlement verification report.
 *
 * Usage:
 *   npm run report:payouts
 *   npm run report:payouts -- /var/lib/pahadi-roots/dearhills.db
 *   npm run report:payouts -- --strict   # exit 1 on any critical finding
 *
 * Opened read-only. Prints counts, ids, amounts and status values only. It never
 * prints bank account numbers, IFSC codes, UPI ids, names or email addresses.
 *
 * What it checks
 *   - payout_status distribution across sellers
 *   - sellers that hold eligible ledger money but are not verified (blocked)
 *   - paid settlements with a missing or implausible bank/UPI reference
 *   - paid settlements whose settlement.paid actor equals the creator (no dual control)
 *   - settlement arithmetic: net = gross - commission - refunds + adjustments
 *
 * The arithmetic check is a report, not a correction: mismatches require a human
 * investigation and never an automatic ledger edit.
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

const findings = [];
const record = (level, check, detail) => {
  findings.push({ level, check, detail });
  const line = JSON.stringify({ level, check, detail });
  if (level === 'critical') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

if (!fs.existsSync(databasePath)) {
  record('critical', 'database', `not found at ${databasePath}`);
  process.exit(1);
}

let db;
try {
  db = new DatabaseSync(databasePath, { readOnly: true });
} catch (error) {
  record('critical', 'database', `cannot open read-only: ${error instanceof Error ? error.message : String(error)}`);
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

// --- Payout status -----------------------------------------------------------
if (!hasTable('seller_profiles')) {
  record('critical', 'table.seller_profiles', 'missing');
} else {
  const distribution = db
    .prepare('SELECT payout_status, COUNT(*) AS count FROM seller_profiles GROUP BY payout_status ORDER BY payout_status')
    .all()
    .map((row) => ({ status: row.payout_status, count: Number(row.count) }));
  record('ok', 'payout_status.distribution', JSON.stringify(distribution));

  if (hasColumn('seller_profiles', 'payout_details_json')) {
    const awaiting = count(
      "SELECT COUNT(*) AS count FROM seller_profiles WHERE payout_details_json IS NOT NULL AND payout_details_json != '' AND payout_status != 'verified'",
    );
    record(
      awaiting === 0 ? 'ok' : 'critical',
      'payout_status.details-not-verified',
      `${awaiting} seller(s) have payout details on file but are not verified; settlement creation and payment are blocked for them.`,
    );

    const verifiedWithoutDetails = count(
      "SELECT COUNT(*) AS count FROM seller_profiles WHERE payout_status = 'verified' AND (payout_details_json IS NULL OR payout_details_json = '')",
    );
    record(
      verifiedWithoutDetails === 0 ? 'ok' : 'critical',
      'payout_status.verified-without-details',
      `${verifiedWithoutDetails} seller(s) are marked verified but have no payout details on file.`,
    );

    const held = count("SELECT COUNT(*) AS count FROM seller_profiles WHERE payout_status = 'blocked'");
    record(held === 0 ? 'ok' : 'warn', 'payout_status.held', `${held} seller(s) currently on payout hold.`);
  }
}

// --- Eligible money held behind an unverified seller -------------------------
if (hasTable('seller_ledger_entries') && hasTable('seller_profiles')) {
  const stuck = db
    .prepare(
      `SELECT s.id AS seller_id, s.payout_status, COUNT(l.id) AS entries, COALESCE(SUM(l.amount_paise), 0) AS amount_paise
         FROM seller_ledger_entries l
         JOIN seller_profiles s ON s.id = l.seller_id
        WHERE l.status = 'eligible' AND l.settlement_id IS NULL
          AND s.payout_status != 'verified'
        GROUP BY s.id, s.payout_status
        ORDER BY amount_paise DESC`,
    )
    .all()
    .map((row) => ({
      sellerId: row.seller_id,
      payoutStatus: row.payout_status,
      entries: Number(row.entries),
      amountPaise: Number(row.amount_paise),
    }));
  record(
    stuck.length === 0 ? 'ok' : 'warn',
    'ledger.eligible-unverified',
    JSON.stringify({ sellers: stuck.length, totalPaise: stuck.reduce((sum, row) => sum + row.amountPaise, 0), rows: stuck }),
  );
}

// --- Settlement integrity ----------------------------------------------------
if (!hasTable('settlement_batches')) {
  record('critical', 'table.settlement_batches', 'missing');
} else {
  const paid = count("SELECT COUNT(*) AS count FROM settlement_batches WHERE status = 'paid'");
  const drafts = count("SELECT COUNT(*) AS count FROM settlement_batches WHERE status = 'draft'");
  record('ok', 'settlements.counts', JSON.stringify({ paid, drafts }));

  const missingReference = db
    .prepare(
      `SELECT id FROM settlement_batches
        WHERE status = 'paid'
          AND (provider_reference IS NULL OR trim(provider_reference) = '' OR length(trim(provider_reference)) < 4)
        ORDER BY id LIMIT 50`,
    )
    .all()
    .map((row) => row.id);
  record(
    missingReference.length === 0 ? 'ok' : 'critical',
    'settlements.paid-without-reference',
    `${missingReference.length} paid settlement(s) lack a usable bank/UPI reference. sample=${JSON.stringify(missingReference)}`,
  );

  const paidWithoutTimestamp = count(
    "SELECT COUNT(*) AS count FROM settlement_batches WHERE status = 'paid' AND (paid_at IS NULL OR paid_at = '')",
  );
  record(
    paidWithoutTimestamp === 0 ? 'ok' : 'critical',
    'settlements.paid-without-timestamp',
    String(paidWithoutTimestamp),
  );

  const arithmetic = db
    .prepare(
      `SELECT id, gross_paise, commission_paise, refunds_paise, adjustments_paise, net_paise
         FROM settlement_batches
        WHERE net_paise != gross_paise - commission_paise - refunds_paise + adjustments_paise
        ORDER BY id LIMIT 50`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      gross: Number(row.gross_paise),
      commission: Number(row.commission_paise),
      refunds: Number(row.refunds_paise),
      adjustments: Number(row.adjustments_paise),
      net: Number(row.net_paise),
    }));
  record(
    arithmetic.length === 0 ? 'ok' : 'critical',
    'settlements.arithmetic',
    `${arithmetic.length} mismatch(es); sample=${JSON.stringify(arithmetic)}`,
  );

  // Dual control: the person who recorded payment should not be the creator.
  if (hasTable('audit_logs') && hasColumn('settlement_batches', 'created_by')) {
    const sameActor = db
      .prepare(
        `SELECT b.id
           FROM settlement_batches b
           JOIN audit_logs a ON a.entity_type = 'settlement' AND a.entity_id = b.id AND a.action = 'settlement.paid'
          WHERE b.status = 'paid'
            AND b.created_by IS NOT NULL
            AND a.actor_id IS NOT NULL
            AND a.actor_id = b.created_by
          GROUP BY b.id
          LIMIT 50`,
      )
      .all()
      .map((row) => row.id);
    record(
      sameActor.length === 0 ? 'ok' : 'warn',
      'settlements.single-actor',
      `${sameActor.length} paid settlement(s) were created and paid by the same account; dual control is not evidenced. sample=${JSON.stringify(sameActor)}`,
    );

    const noAudit = count(
      `SELECT COUNT(*) AS count FROM settlement_batches b
        WHERE b.status = 'paid'
          AND NOT EXISTS (
            SELECT 1 FROM audit_logs a
             WHERE a.entity_type = 'settlement' AND a.entity_id = b.id AND a.action = 'settlement.paid'
          )`,
    );
    record(noAudit === 0 ? 'ok' : 'critical', 'settlements.paid-without-audit', String(noAudit));
  }
}

// --- Ledger release consistency ---------------------------------------------
if (hasTable('seller_ledger_entries')) {
  const settledButEligible = count(
    "SELECT COUNT(*) AS count FROM seller_ledger_entries WHERE status = 'settled' AND settlement_id IS NULL",
  );
  record(
    settledButEligible === 0 ? 'ok' : 'critical',
    'ledger.settled-without-batch',
    `${settledButEligible} ledger entr(ies) are marked settled but reference no settlement batch.`,
  );
}

db.close();

const critical = findings.filter((finding) => finding.level === 'critical');
console.log(
  JSON.stringify({
    level: 'info',
    msg: 'payout_report_complete',
    database: databasePath,
    critical: critical.length,
    actionable: findings.filter((finding) => finding.level !== 'ok').length,
    readOnly: true,
  }),
);

if (critical.length > 0) process.exit(2);
if (strict && findings.some((finding) => finding.level !== 'ok')) process.exit(1);
