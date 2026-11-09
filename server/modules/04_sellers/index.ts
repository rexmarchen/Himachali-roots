/**
 * Module 04: Seller Management
 * Bounded Context: Maker storefront, maker profiles, store status, bank payout details.
 */
import type { Db } from '../../db.js';
import { queryOne } from '../../db.js';
import type { SellerStatus } from '../../../shared/types.js';

export class SellerService {
  static getSellerById(db: Db, sellerId: string) {
    return queryOne<{
      id: string;
      userId: string;
      businessName: string;
      slug: string;
      status: SellerStatus;
      storeStatus: string;
    }>(
      db,
      `SELECT id, user_id as userId, business_name as businessName, slug, status,
              store_status as storeStatus
       FROM seller_profiles WHERE id = ?`,
      sellerId,
    );
  }

  static getSellerByUserId(db: Db, userId: string) {
    return queryOne<{ id: string; status: SellerStatus; storeStatus: string }>(
      db,
      'SELECT id, status, store_status as storeStatus FROM seller_profiles WHERE user_id = ?',
      userId,
    );
  }
}
