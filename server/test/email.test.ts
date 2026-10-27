import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, queryAll, queryOne, type Db } from '../db.js';
import {
  createResendTransport,
  notify,
  sanitizeEmailError,
  type EmailMessage,
  type EmailTransport,
} from '../lib/email.js';
import { resetDb, setupTestApp } from './helpers.js';

let db: Db;

beforeEach(() => {
  if (!db) ({ db } = setupTestApp());
  resetDb(db);
});

afterAll(() => {
  closeDb();
});

function captureTransport(options: { fail?: Error } = {}): EmailTransport & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'test',
    configured: true,
    sent,
    async send(message) {
      if (options.fail) throw options.fail;
      sent.push(message);
      return { providerMessageId: 'msg_test_1' };
    },
  };
}

describe('transactional email', () => {
  it('sends once, records the provider id, and dedupes repeat notifications', async () => {
    const transport = captureTransport();
    await notify(
      db,
      {
        email: 'customer@test.local',
        type: 'order_paid',
        subject: 'Payment received',
        body: '<p>Thanks</p>',
        dedupeKey: 'order-paid:one',
      },
      transport,
    );
    await notify(
      db,
      {
        email: 'customer@test.local',
        type: 'order_paid',
        subject: 'Payment received',
        body: '<p>Thanks</p>',
        dedupeKey: 'order-paid:one',
      },
      transport,
    );

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].idempotencyKey).toBe('order-paid:one');
    expect(transport.sent[0].html).toContain('Thanks');
  });

  it('marks the row sent and stores the provider message id', async () => {
    const transport = captureTransport();
    await notify(db, { email: 'a@test.local', type: 'test', subject: 'Hello', body: '<p>Hi</p>' }, transport);
    expect(
      queryOne<{ status: string; provider_message_id: string }>(
        db,
        "SELECT status, provider_message_id FROM notifications WHERE type = 'test'",
      ),
    ).toMatchObject({ status: 'sent', provider_message_id: 'msg_test_1' });
  });

  it('records a failed delivery without leaking a key', async () => {
    const transport = captureTransport({ fail: new Error('upstream rejected re_abcdefgh12345678') });
    await notify(db, { email: 'a@test.local', type: 'failure', subject: 'Hello', body: '<p>Hi</p>' }, transport);
    const row = queryOne<{ status: string; error: string }>(
      db,
      "SELECT status, error FROM notifications WHERE type = 'failure'",
    );
    expect(row?.status).toBe('failed');
    expect(row?.error).not.toContain('re_abcdefgh12345678');
    expect(row?.error).toContain('[redacted]');
    expect(sanitizeEmailError(new Error('bad re_secret12345678'))).not.toContain('re_secret12345678');
  });

  it('marks skipped when no provider is configured', async () => {
    await notify(
      db,
      { email: 'a@test.local', type: 'skipped', subject: 'Hello', body: '<p>Hi</p>' },
      { name: 'test', configured: false, async send() { return {}; } },
    );
    expect(queryAll<{ status: string }>(db, "SELECT status FROM notifications WHERE type = 'skipped'")[0]?.status).toBe(
      'skipped',
    );
  });
});

describe('resend transport', () => {
  it('retries a 429 and sends with an idempotency key', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }));
    const transport = createResendTransport({
      apiKey: 're_test_12345678',
      from: 'PAHADI ROOTS <no-reply@example.in>',
      maxAttempts: 2,
      retryDelayMs: 0,
      fetchImpl,
    });

    const result = await transport.send({
      to: 'a@test.local',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
      idempotencyKey: 'order:1',
    });

    expect(result.providerMessageId).toBe('email_123');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, init] = fetchImpl.mock.calls[1];
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe('order:1');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer re_test_12345678');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: 'PAHADI ROOTS <no-reply@example.in>',
      to: ['a@test.local'],
      subject: 'Hello',
    });
  });

  it('does not retry a rejected key and never exposes it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 }));
    const transport = createResendTransport({
      apiKey: 're_live_should_not_leak',
      from: 'PAHADI ROOTS <no-reply@example.in>',
      maxAttempts: 3,
      retryDelayMs: 0,
      fetchImpl,
    });
    await expect(
      transport.send({ to: 'a@test.local', subject: 'Hello', html: '', text: '', idempotencyKey: 'x' }),
    ).rejects.toThrow('HTTP 401');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sanitizeEmailError(new Error('re_live_should_not_leak'), 're_live_should_not_leak')).not.toContain(
      're_live_should_not_leak',
    );
  });
});
