import { env } from '../env.js';
import { execute, queryOne, type Db } from '../db.js';
import { newId } from './ids.js';

interface NotificationInput {
  userId?: string | null;
  email: string;
  type: string;
  subject: string;
  body: string;
  dedupeKey?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shell(subject: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F7F3EB;font-family:Arial,Helvetica,sans-serif;color:#20231F">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#243D32;font-weight:700">Pahadi Roots</div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:26px;line-height:1.25;color:#243D32;margin:16px 0">${escapeHtml(subject)}</h1>
    <div style="font-size:15px;line-height:1.7;color:#3A3E38">${body}</div>
    <hr style="border:none;border-top:1px solid #DCD2C2;margin:28px 0" />
    <p style="font-size:12px;color:#6B6F68;line-height:1.6">From the Himalayas, with heart.<br/>This is a transactional message from PAHADI ROOTS. Support: ${escapeHtml(env.smtp.supportEmail)}</p>
  </div></body></html>`;
}

async function smtpSend(to: string, subject: string, body: string): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject,
    text: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    html: shell(subject, body),
  });
}

/**
 * Persist then send a transactional email. Safe to call after a committed
 * transaction; dedupeKey makes webhook retries harmless.
 */
export async function notify(db: Db, input: NotificationInput): Promise<void> {
  const id = newId('ntf_');
  if (input.dedupeKey) {
    const existing = queryOne<{ id: string }>(db, 'SELECT id FROM notifications WHERE dedupe_key = ?', input.dedupeKey);
    if (existing) return;
  }
  execute(
    db,
    `INSERT INTO notifications (id, user_id, email, type, subject, body, status, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`,
    id,
    input.userId ?? null,
    input.email,
    input.type,
    input.subject,
    input.body,
    input.dedupeKey ?? null,
  );

  if (!env.smtp.configured) {
    execute(
      db,
      "UPDATE notifications SET status = 'skipped', error = ? WHERE id = ?",
      'SMTP is not configured. Email was recorded but not delivered.',
      id,
    );
    return;
  }
  try {
    await smtpSend(input.email, input.subject, input.body);
    execute(db, "UPDATE notifications SET status = 'sent', sent_at = ? WHERE id = ?", new Date().toISOString(), id);
  } catch (error) {
    execute(
      db,
      "UPDATE notifications SET status = 'failed', error = ? WHERE id = ?",
      error instanceof Error ? error.message.slice(0, 300) : 'Unknown SMTP error',
      id,
    );
  }
}

export function notificationQueueSummary(db: Db): { queued: number; failed: number; skipped: number; sent: number } {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS count FROM notifications GROUP BY status')
    .all() as { status: string; count: number }[];
  const out = { queued: 0, failed: 0, skipped: 0, sent: 0 };
  for (const row of rows) {
    if (row.status in out) out[row.status as keyof typeof out] = row.count;
  }
  return out;
}
