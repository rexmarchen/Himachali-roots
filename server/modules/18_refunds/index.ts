/**
 * Module 18: Refund Management
 * Bounded Context: Pre-dispatch cancellations, post-delivery returns, pro-rata 12% commission reversals.
 */
import type { Db } from '../../db.js';
import { queryAll, queryOne } from '../../db.js';

export class RefundService {
  static getOrderRefunds(db: Db, orderId: string) {
    return queryAll(db, 'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC', orderId);
  }

  static getTotalRefundedPaise(db: Db, orderId: string): number {
    const row = queryOne<{ total: number }>(
      db,
      'SELECT COALESCE(SUM(amount_paise), 0) as total FROM refunds WHERE order_id = ? AND status = "processed"',
      orderId,
    );
    return row?.total ?? 0;
  }
}

