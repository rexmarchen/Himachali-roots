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
  const order = queryOne<{ status: string; paid_at: string | null }>(
    db,
    'SELECT status, paid_at FROM orders WHERE id = ?',
    orderId,
  );
  if (!order) return 'unknown';
  if (['pending_payment', 'expired', 'refunded', 'partially_refunded'].includes(order.status)) return order.status;
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
  } else if (order.paid_at) next = 'paid';

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
