import crypto from 'node:crypto';
import { execute, queryAll } from '../../db.js';
import type { EnqueueEventInput, OutboxEvent } from './types.js';

export class OutboxService {
  /**
   * Enqueue an event atomically into the outbox within the current database transaction.
   * If the enclosing transaction rolls back, this event is never written.
   */
  static enqueue<T extends Record<string, unknown>>(db: any, input: EnqueueEventInput<T>): OutboxEvent<T> {
    const id = input.id ?? `evt_${crypto.randomUUID()}`;
    const now = new Date();
    const scheduledAt = input.delayMs
      ? new Date(now.getTime() + input.delayMs).toISOString()
      : now.toISOString();

    const event: OutboxEvent<T> = {
      id,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
      status: 'pending',
      retryCount: 0,
      maxRetries: input.maxRetries ?? 5,
      lastError: null,
      scheduledAt,
      processedAt: null,
      createdAt: now.toISOString(),
    };

    execute(
      db,
      `INSERT INTO outbox_events (
        id, aggregate_type, aggregate_id, event_type, payload_json,
        status, retry_count, max_retries, last_error, scheduled_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
      event.status,
      event.retryCount,
      event.maxRetries,
      event.lastError ?? null,
      event.scheduledAt,
      event.createdAt,
    );

    return event;
  }

  /**
   * Fetch pending events scheduled to run up to `now`
   */
  static fetchPending(db: any, limit = 50): OutboxEvent[] {
    const now = new Date().toISOString();
    const rows = queryAll<{
      id: string;
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload_json: string;
      status: string;
      retry_count: number;
      max_retries: number;
      last_error: string | null;
      scheduled_at: string;
      processed_at: string | null;
      created_at: string;
    }>(
      db,
      `SELECT * FROM outbox_events
       WHERE status = 'pending' AND scheduled_at <= ?
       ORDER BY scheduled_at ASC
       LIMIT ?`,
      now,
      limit,
    );

    return rows.map((r) => ({
      id: r.id,
      aggregateType: r.aggregate_type,
      aggregateId: r.aggregate_id,
      eventType: r.event_type,
      payload: JSON.parse(r.payload_json),
      status: r.status as OutboxEvent['status'],
      retryCount: r.retry_count,
      maxRetries: r.max_retries,
      lastError: r.last_error,
      scheduledAt: r.scheduled_at,
      processedAt: r.processed_at,
      createdAt: r.created_at,
    }));
  }

  /**
   * Attempt to lock an event for processing using optimistic concurrency
   */
  static claim(db: any, eventId: string): boolean {
    const result = execute(
      db,
      `UPDATE outbox_events
       SET status = 'processing'
       WHERE id = ? AND status = 'pending'`,
      eventId,
    );
    return Number(result.changes) === 1;
  }

  /**
   * Mark event successfully published
   */
  static markPublished(db: any, eventId: string): void {
    const now = new Date().toISOString();
    execute(
      db,
      `UPDATE outbox_events
       SET status = 'published', processed_at = ?
       WHERE id = ?`,
      now,
      eventId,
    );
  }

  /**
   * Record failure and schedule retry with exponential backoff or send to dead-letter queue
   */
  static markFailed(db: any, eventId: string, error: Error | string, retryCount: number, maxRetries: number): void {
    const nextRetry = retryCount + 1;
    const errorMessage = typeof error === 'string' ? error : error.message || String(error);

    if (nextRetry >= maxRetries) {
      execute(
        db,
        `UPDATE outbox_events
         SET status = 'dead_letter', retry_count = ?, last_error = ?
         WHERE id = ?`,
        nextRetry,
        errorMessage.slice(0, 1000),
        eventId,
      );
    } else {
      // Exponential backoff: base 2s * 2^(retry) + random jitter (0-1s)
      const delayMs = Math.min(300_000, 2000 * Math.pow(2, nextRetry) + Math.floor(Math.random() * 1000));
      const nextSchedule = new Date(Date.now() + delayMs).toISOString();

      execute(
        db,
        `UPDATE outbox_events
         SET status = 'pending', retry_count = ?, last_error = ?, scheduled_at = ?
         WHERE id = ?`,
        nextRetry,
        errorMessage.slice(0, 1000),
        nextSchedule,
        eventId,
      );
    }
  }
}
