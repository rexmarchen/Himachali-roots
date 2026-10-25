import process from 'node:process';
import { env } from '../env.js';
import { execute, initDb, queryOne, tx, type Db } from '../db.js';
import { hashPassword, normalizeEmail } from '../lib/auth.js';
import { newId } from '../lib/ids.js';

/**
 * Provision an administrator.
 *
 * Usage:
 *   npm run admin:create -- admin@example.com "Full Name"
 *   ADMIN_PASSWORD='…' npm run admin:create -- admin@example.com "Full Name"
 *
 * The password is never echoed. It is prompted twice when a terminal is
 * attached. This command operates on DATABASE_PATH, so point it at the
 * production database when provisioning production. Existing accounts can be
 * granted the admin role without resetting their password.
 */

function fail(message: string): never {
  console.error(`admin:create: ${message}`);
  process.exit(1);
}

function validateEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('That does not look like an email address.');
  return email;
}

function validatePassword(password: string): void {
  if (password.length < 12) fail('Use at least 12 characters.');
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (classes < 3) fail('Use at least three of: lowercase, uppercase, number, symbol.');
  if (/^(?:password|admin|pahadi|demo)/i.test(password)) fail('Choose a password that is not based on a common word.');
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY) {
      reject(new Error('No terminal available. Set ADMIN_PASSWORD instead.'));
      return;
    }
    stdout.write(question);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let value = '';
    const cleanup = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function getPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) {
    validatePassword(fromEnv);
    return fromEnv;
  }
  const first = await promptHidden('Password (not echoed): ');
  validatePassword(first);
  const second = await promptHidden('Repeat password: ');
  if (first !== second) fail('Passwords did not match.');
  return first;
}

function grantAdmin(db: Db, userId: string, email: string): void {
  const existing = queryOne<{ user_id: string }>(
    db,
    "SELECT user_id FROM user_roles WHERE user_id = ? AND role = 'admin'",
    userId,
  );
  if (existing) {
    console.log(`admin:create: ${email} is already an administrator. No changes made.`);
    return;
  }
  tx(db, () => {
    execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')", userId);
    execute(
      db,
      `INSERT INTO audit_logs (id, actor_id, actor_email, action, entity_type, entity_id, after_json, created_at)
       VALUES (?, NULL, 'cli:admin:create', 'admin.granted', 'user', ?, ?, ?)`,
      newId('aud_'),
      userId,
      JSON.stringify({ email, source: 'server/scripts/create-admin.ts' }),
      new Date().toISOString(),
    );
  });
  console.log(`admin:create: granted administrator role to ${email}.`);
}

async function main(): Promise<void> {
  const [rawEmail, ...nameParts] = process.argv.slice(2);
  if (!rawEmail) {
    fail('Usage: npm run admin:create -- email@example.com "Full Name"');
  }
  const email = validateEmail(rawEmail);
  const fullName = nameParts.join(' ').trim() || 'Administrator';

  const db = initDb(env.databasePath);
  const existing = queryOne<{ id: string }>(db, 'SELECT id FROM users WHERE email = ?', email);

  if (existing) {
    const wantsReset = process.argv.includes('--reset-password');
    if (wantsReset) {
      const password = await getPassword();
      tx(db, () => {
        execute(
          db,
          'UPDATE users SET password_hash = ?, is_disabled = 0, updated_at = ? WHERE id = ?',
          hashPassword(password),
          new Date().toISOString(),
          existing.id,
        );
        execute(db, 'DELETE FROM sessions WHERE user_id = ?', existing.id);
        execute(
          db,
          `INSERT INTO audit_logs (id, actor_id, actor_email, action, entity_type, entity_id, after_json, created_at)
           VALUES (?, NULL, 'cli:admin:create', 'admin.password_reset', 'user', ?, ?, ?)`,
          newId('aud_'),
          existing.id,
          JSON.stringify({ email }),
          new Date().toISOString(),
        );
      });
      console.log(`admin:create: password reset for ${email}; all sessions revoked.`);
    }
    grantAdmin(db, existing.id, email);
    return;
  }

  const password = await getPassword();
  const userId = newId('usr_');
  const now = new Date().toISOString();
  tx(db, () => {
    execute(
      db,
      `INSERT INTO users (id, email, password_hash, email_verified, is_disabled, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?)`,
      userId,
      email,
      hashPassword(password),
      now,
      now,
    );
    execute(db, 'INSERT INTO profiles (id, full_name, marketing_consent, updated_at) VALUES (?, ?, 0, ?)', userId, fullName, now);
    execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'customer')", userId);
    execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')", userId);
    execute(
      db,
      `INSERT INTO audit_logs (id, actor_id, actor_email, action, entity_type, entity_id, after_json, created_at)
       VALUES (?, NULL, 'cli:admin:create', 'admin.created', 'user', ?, ?, ?)`,
      newId('aud_'),
      userId,
      JSON.stringify({ email, fullName }),
      now,
    );
  });
  console.log(`admin:create: created administrator ${email}.`);
}

main().catch((error) => {
  console.error(`admin:create: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
