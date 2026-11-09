/**
 * Module 20: Admin Management
 * Bounded Context: Operational controls, maker approval workflows, compliance overrides, site content settings.
 */
import type { Db } from '../../db.js';
import { queryOne } from '../../db.js';

export class AdminManagementService {
  static getPlatformSummary(db: Db) {
    const sellers = queryOne<{ total: number }>(db, 'SELECT COUNT(*) as total FROM seller_profiles');
    const products = queryOne<{ total: number }>(db, 'SELECT COUNT(*) as total FROM products WHERE status = "approved"');
    const orders = queryOne<{ total: number }>(db, 'SELECT COUNT(*) as total FROM orders WHERE status != "pending_payment"');

    return {
      totalSellers: sellers?.total ?? 0,
      approvedProducts: products?.total ?? 0,
      totalOrders: orders?.total ?? 0,
    };
  }
}

