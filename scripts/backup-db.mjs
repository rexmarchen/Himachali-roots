#!/usr/bin/env node
/**
 * Online SQLite backup using the node:sqlite backup API.
 *
 * Usage:
 *   npm run db:backup
 *   npm run db:backup -- ./data/pahadi-roots.db ./backups
 *
 * The server may keep running. The backup is a consistent snapshot; uploaded
 * files are stored separately and must be backed up with the storage directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const source = path.resolve(
  process.argv[2] ?? process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'pahadi-roots.db'),
);
const outputDir = path.resolve(process.argv[3] ?? path.join(process.cwd(), 'backups'));

if (!fs.existsSync(source)) {
  console.error(JSON.stringify({ level: 'error', msg: 'database_not_found', path: source }));
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(outputDir, `pahadi-roots-${stamp}.db`);

const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, target);
} finally {
  db.close();
}

const size = fs.statSync(target).size;
console.log(
  JSON.stringify({
    level: 'info',
    msg: 'database_backup_complete',
    source,
    target,
    bytes: size,
    reminder: 'Back up the storage directory (uploads and private seller documents) separately.',
  }),
);
