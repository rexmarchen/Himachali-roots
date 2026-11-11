import process from 'node:process';
import { env } from '../env.js';
import { execute, initDb, queryOne, tx } from '../db.js';
import { normalizeEmail } from '../lib/auth.js';
import { newId } from '../lib/ids.js';

/**
 * Clear a user's TOTP second factor.
 *
 * This is the documented recovery path when an administrator loses the
 * authenticator. It requires shell access to the server, so it is deliberately
 * not exposed as a self-service web endpoint.
 *
 * Usage:
 *   npm run mfa:reset -- admin@example.com
 */

function fail(message: string): never {
  console.error(`mfa:reset: ${message}`);
  process.exit(1);
}

function main(): void {
  const rawEmail = process.argv[2];
  if (!rawEmail) fail('Usage: npm run mfa:reset -- email@example.com');
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('That does not look like an email address.');

  const db = initDb(env.databasePath);
  const user = queryOne<{ id: string; email: string; mfa_enabled_at: string | null }>(
    db,
    'SELECT id, email, mfa_enabled_at FROM users WHERE email = ?',
    email,
  );
  if (!user) fail(`no account found for ${email}.`);
  if (!user.mfa_enabled_at) {
    console.log(`mfa:reset: ${email} does not have two-step verification enabled. Nothing changed.`);
    return;
  }

  tx(db, () => {
    execute(
      db,
      'UPDATE users SET mfa_secret = NULL, mfa_enabled_at = NULL, updated_at = ? WHERE id = ?',
      new Date().toISOString(),
      user.id,
    );
    execute(db, 'DELETE FROM mfa_challenges WHERE user_id = ?', user.id);
    execute(
      db,
      `INSERT INTO audit_logs (id, actor_id, actor_email, action, entity_type, entity_id, after_json, created_at)
       VALUES (?, NULL, 'cli:mfa:reset', 'auth.mfa.reset_by_operator', 'user', ?, ?, ?)`,
      newId('aud_'),
      user.id,
      JSON.stringify({ email, source: 'server/scripts/reset-mfa.ts' }),
      new Date().toISOString(),
    );
  });
  console.log(`mfa:reset: two-step verification cleared for ${email}. Enrol a new authenticator from Profile & security.`);
}

main();
