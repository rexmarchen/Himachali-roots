import process from 'node:process';
import { env } from '../env.js';
import { initDb } from '../db.js';
import { notificationQueueSummary, retryFailedNotifications } from '../lib/email.js';

/**
 * Inspect or retry failed transactional email.
 *
 * Usage:
 *   npm run email:retry                     # dry run: queue summary only
 *   npm run email:retry -- --send           # send up to 20 failed notifications
 *   npm run email:retry -- --send --limit 5
 *
 * Dry run is the default on purpose: sending is a production side effect and
 * must be an explicit choice. Requires the same DATABASE_PATH and email
 * configuration as the server. Output contains counts only, never addresses or
 * message bodies.
 */

const args = process.argv.slice(2);
const send = args.includes('--send');
const limitIndex = args.indexOf('--limit');
const parsedLimit = limitIndex >= 0 ? Number.parseInt(args[limitIndex + 1] ?? '', 10) : 20;
const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 20;

const db = initDb(env.databasePath);
const before = notificationQueueSummary(db);

console.log(
  JSON.stringify({
    level: 'info',
    msg: 'email_queue_summary',
    mode: send ? 'send' : 'dry-run',
    provider: env.email.provider,
    ...before,
  }),
);

if (!send) {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'email_retry_skipped',
      detail: 'dry run only; pass --send to attempt delivery',
    }),
  );
} else if (env.email.provider === 'none') {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'email_provider_not_configured',
      detail: 'set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS before sending',
    }),
  );
  process.exitCode = 1;
} else {
  const attempted = await retryFailedNotifications(db, limit);
  const after = notificationQueueSummary(db);
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'email_retry_complete',
      attempted,
      ...after,
    }),
  );
}

db.close();
