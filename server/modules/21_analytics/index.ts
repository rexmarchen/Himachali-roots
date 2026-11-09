/**
 * Module 21: Analytics & Reporting
 * Bounded Context: GMV calculation, net revenue, seller performance, conversion rate metrics.
 */
import type { Db } from '../../db.js';
import { queryOne } from '../../db.js';

export class AnalyticsService {
  static getRevenueMetrics(db: Db, sinceIso?: string): { gmvPaise: number; commissionPaise: number; orderCount: number } {
    const since = sinceIso ?? new Date(0).toISOString();
    const row = queryOne<{ gmv: number; commission: number; orders: number }>(
      db,
      `SELECT
         COALESCE(SUM(o.total_paise), 0) as gmv,
         (SELECT COALESCE(SUM(so.commission_paise), 0)
            FROM seller_orders so
            JOIN orders ord ON ord.id = so.order_id
           WHERE ord.paid_at IS NOT NULL AND ord.is_demo = 0
             AND ord.created_at >= ? AND so.status != 'cancelled') as commission,
         COUNT(o.id) as orders
       FROM orders o
       WHERE o.paid_at IS NOT NULL AND o.is_demo = 0 AND o.created_at >= ?`,
      since,
      since,
    );

    return {
      gmvPaise: row?.gmv ?? 0,
      commissionPaise: row?.commission ?? 0,
      orderCount: row?.orders ?? 0,
    };
  }
}
