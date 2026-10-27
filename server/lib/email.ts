import { env } from '../env.js';
import { execute, queryAll, type Db } from '../db.js';
import { newId } from './ids.js';

export interface NotificationInput {
  userId?: string | null;
  email: string;
  type: string;
  subject: string;
  body: string;
  dedupeKey?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface EmailTransport {
  name: 'resend' | 'smtp' | 'test';
  configured: boolean;
  send(message: EmailMessage): Promise<{ providerMessageId?: string }>;
}

interface ResendOptions {
  apiKey: string;
  from: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Never let a provider body or an API key reach the notification log. */
export function sanitizeEmailError(error: unknown, secret?: string): string {
  let message = error instanceof Error ? error.message : String(error);
  if (secret) message = message.replaceAll(secret, '[redacted]');
  message = message.replace(/\bre_[A-Za-z0-9_-]{8,}/g, '[redacted]');
  return message.slice(0, 300) || 'Email delivery failed.';
}

/**
 * Resend transactional email. The API key is read from env only, never logged,
 * and every request carries an Idempotency-Key so provider retries cannot send
 * duplicate order mail.
 */
export function createResendTransport(options: ResendOptions): EmailTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retryDelayMs = options.retryDelayMs ?? 400;

  return {
    name: 'resend',
    configured: Boolean(options.apiKey),
    async send(message) {
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetchImpl(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': message.idempotencyKey.slice(0, 256),
            },
            body: JSON.stringify({
              from: options.from,
              to: [message.to],
              subject: message.subject,
              html: message.html,
              text: message.text,
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (response.ok) {
            const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
            return { providerMessageId: typeof payload?.id === 'string' ? payload.id : undefined };
          }
          // 4xx (except rate limiting) will not succeed on retry.
          if (response.status !== 429 && response.status < 500) {
            throw new Error(`Resend rejected the message (HTTP ${response.status}).`);
          }
          lastError = new Error(`Resend temporarily unavailable (HTTP ${response.status}).`);
        } catch (error) {
          lastError = error;
          if (error instanceof Error && /^Resend rejected/.test(error.message)) throw error;
        }
        if (attempt < maxAttempts) await sleep(retryDelayMs * attempt);
      }
      throw lastError instanceof Error ? lastError : new Error('Resend delivery failed.');
    },
  };
}

function createSmtpTransport(): EmailTransport {
  return {
    name: 'smtp',
    configured: env.smtp.configured,
    async send(message) {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        auth: { user: env.smtp.user, pass: env.smtp.pass },
      });
      const info = await transport.sendMail({
        from: env.email.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { providerMessageId: typeof info.messageId === 'string' ? info.messageId : undefined };
    },
  };
}

let defaultTransport: EmailTransport | null = null;

export function getEmailTransport(): EmailTransport {
  if (defaultTransport) return defaultTransport;
  if (env.email.provider === 'resend') {
    defaultTransport = createResendTransport({
      apiKey: env.email.resendApiKey,
      from: env.email.from,
      timeoutMs: env.email.timeoutMs,
      maxAttempts: env.email.maxAttempts,
      retryDelayMs: env.isTest ? 0 : 400,
    });
  } else {
    defaultTransport = createSmtpTransport();
  }
  return defaultTransport;
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
    <p style="font-size:12px;color:#6B6F68;line-height:1.6">From the Himalayas, with heart.<br/>This is a transactional message from PAHADI ROOTS. Support: ${escapeHtml(env.email.supportEmail)}</p>
  </div></body></html>`;
}

/**
 * Persist then send a transactional email. Dedupe is claimed with an atomic
 * INSERT OR IGNORE so two webhook deliveries cannot both send. Delivery happens
 * after the write; failures are recorded for retry and never roll back business
 * state.
 */
export async function notify(db: Db, input: NotificationInput, transport?: EmailTransport): Promise<void> {
  const id = newId('ntf_');
  const inserted = execute(
    db,
    `INSERT OR IGNORE INTO notifications (id, user_id, email, type, subject, body, status, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`,
    id,
    input.userId ?? null,
    input.email,
    input.type,
    input.subject,
    input.body,
    input.dedupeKey ?? null,
  );
  if (Number(inserted.changes) === 0) return;

  const activeTransport = transport ?? getEmailTransport();
  if (!activeTransport.configured) {
    execute(
      db,
      "UPDATE notifications SET status = 'skipped', error = ? WHERE id = ?",
      'No email provider is configured. Email was recorded but not delivered.',
      id,
    );
    return;
  }

  try {
    const result = await activeTransport.send({
      to: input.email,
      subject: input.subject,
      html: shell(input.subject, input.body),
      text: input.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      idempotencyKey: input.dedupeKey ?? id,
    });
    execute(
      db,
      "UPDATE notifications SET status = 'sent', sent_at = ?, provider_message_id = ?, error = NULL WHERE id = ?",
      new Date().toISOString(),
      result.providerMessageId ?? null,
      id,
    );
  } catch (error) {
    execute(
      db,
      "UPDATE notifications SET status = 'failed', error = ? WHERE id = ?",
      sanitizeEmailError(error, env.email.resendApiKey),
      id,
    );
  }
}

/**
 * Operational retry for failed notifications. Safe to run manually or from a
 * scheduled job; it uses the same idempotency key as the original attempt.
 */
export async function retryFailedNotifications(db: Db, limit = 20): Promise<number> {
  const rows = queryAll<{
    id: string;
    user_id: string | null;
    email: string;
    subject: string;
    body: string;
    dedupe_key: string | null;
  }>(
    db,
    "SELECT id, user_id, email, subject, body, dedupe_key FROM notifications WHERE status = 'failed' ORDER BY created_at LIMIT ?",
    limit,
  );
  const activeTransport = getEmailTransport();
  if (!activeTransport.configured) return 0;

  let sent = 0;
  for (const row of rows) {
    try {
      const result = await activeTransport.send({
        to: row.email,
        subject: row.subject,
        html: shell(row.subject, row.body),
        text: row.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        idempotencyKey: row.dedupe_key ?? row.id,
      });
      execute(
        db,
        "UPDATE notifications SET status = 'sent', sent_at = ?, provider_message_id = ?, error = NULL WHERE id = ?",
        new Date().toISOString(),
        result.providerMessageId ?? null,
        row.id,
      );
      sent += 1;
    } catch (error) {
      execute(
        db,
        "UPDATE notifications SET error = ? WHERE id = ?",
        sanitizeEmailError(error, env.email.resendApiKey),
        row.id,
      );
    }
  }
  return sent;
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

/** Test-only reset so a suite can exercise both Resend and SMTP resolution. */
export function resetEmailTransportForTests(): void {
  defaultTransport = null;
}
