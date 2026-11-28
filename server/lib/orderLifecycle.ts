import type { Db } from '../db.js';
import { execute, queryAll, queryOne } from '../db.js';
import type { SessionUser } from '../../shared/types.js';
import { newId } from './ids.js';

/**
 * Append a business-readable event. Unlike audit_logs (which records staff
 * changes), this timeline is safe to show on an order because it contains no
 * internal margin, payment secret or provider payload data.
 */
export function recordOrderEvent(
  db: Db,
  params: {
    orderId: string;
    sellerOrderId?: string | null;
    type: string;
    description: string;
    actor?: (Pick<SessionUser, 'id'> & { roles?: string[] }) | null;
    metadata?: Record<string, unknown>;
  },
): void {
  const role = params.actor
    ? params.actor.roles?.includes('admin')
      ? 'admin'
      : params.actor.roles?.includes('seller')
        ? 'seller'
        : 'customer'
    : 'system';
  execute(
    db,
    `INSERT INTO order_events (id, order_id, seller_order_id, type, description, actor_id, actor_role, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('oev_'),
    params.orderId,
    params.sellerOrderId ?? null,
    params.type.slice(0, 80),
    params.description.slice(0, 500),
    params.actor?.id ?? null,
    role,
    params.metadata ? JSON.stringify(params.metadata).slice(0, 2000) : null,
  );
}

export function refreshOrderStatus(db: Db, orderId: string): string {
  const order = queryOne<{ status: string; confirmed_at: string | null; paid_at: string | null; payment_method: string }>(
    db,
    'SELECT status, confirmed_at, paid_at, payment_method FROM orders WHERE id = ?',
    orderId,
  );
  if (!order) return 'unknown';
  if (['pending_payment', 'pending_cod_confirmation', 'expired', 'refunded', 'partially_refunded'].includes(order.status)) {
    return order.status;
  }
  const statuses = queryAll<{ status: string }>(db, 'SELECT status FROM seller_orders WHERE order_id = ?', orderId).map(
    (row) => row.status,
  );
  if (statuses.length === 0) return order.status;
  let next = order.status;
  if (statuses.every((status) => status === 'cancelled')) next = 'cancelled';
  else if (statuses.every((status) => ['delivered', 'returned', 'refunded', 'cancelled'].includes(status))) next = 'fulfilled';
  else if (statuses.every((status) => ['shipped', 'delivered', 'returned', 'cancelled'].includes(status))) {
    next = 'partially_fulfilled';
  } else if (statuses.some((status) => ['shipped', 'delivered', 'returned'].includes(status))) {
    next = 'partially_fulfilled';
  } else if (order.payment_method === 'cod' && order.confirmed_at && !order.paid_at) {
    next = 'confirmed';
  } else if (order.paid_at) {
    next = 'paid';
  } else if (order.confirmed_at) {
    next = 'confirmed';
  }

  const refunded = queryOne<{ total: number }>(
    db,
    "SELECT COALESCE(SUM(amount_paise),0) AS total FROM refunds WHERE order_id = ? AND status = 'completed'",
    orderId,
  );
  if ((refunded?.total ?? 0) > 0) {
    const total = queryOne<{ total_paise: number }>(db, 'SELECT total_paise FROM orders WHERE id = ?', orderId);
    if (total && (refunded?.total ?? 0) >= total.total_paise) next = 'refunded';
    else if (next !== 'cancelled') next = 'partially_refunded';
  }
  if (next !== order.status) {
    execute(db, 'UPDATE orders SET status = ? WHERE id = ?', next, orderId);
  }
  return next;
}

export function markCodDeliveredIfSettled(db: Db, orderId: string, collectedAt = new Date().toISOString()): void {
  const order = queryOne<{ id: string; payment_method: string; paid_at: string | null }>(
    db,
    'SELECT id, payment_method, paid_at FROM orders WHERE id = ?',
    orderId,
  );
  if (!order || order.payment_method !== 'cod' || order.paid_at) return;

  const statuses = queryAll<{ status: string }>(db, 'SELECT status FROM seller_orders WHERE order_id = ?', orderId).map(
    (row) => row.status,
  );
  const allDelivered =
    statuses.length > 0 &&
    statuses.some((s) => s === 'delivered') &&
    statuses.every((s) => ['delivered', 'returned', 'refunded', 'cancelled'].includes(s));
  if (!allDelivered) return;

  execute(
    db,
    `UPDATE payments
        SET status = 'paid', method = 'cod_collected', verified_at = COALESCE(verified_at, ?)
      WHERE order_id = ? AND provider = 'cod' AND status != 'paid'`,
    collectedAt,
    orderId,
  );
  execute(db, 'UPDATE orders SET paid_at = COALESCE(paid_at, ?) WHERE id = ?', collectedAt, orderId);
  execute(
    db,
    `INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, order_id, type, summary)
     VALUES (?, 'cod', ?, ?, 'cod.collected', ?)`,
    newId('pev_'),
    `cod-collected:${orderId}`,
    orderId,
    JSON.stringify({ collectedAt }),
  );
}
