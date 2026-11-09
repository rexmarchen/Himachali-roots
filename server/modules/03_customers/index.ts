/**
 * Module 03: Customer Profiles
 * Bounded Context: Customer details, delivery addresses, wishlist management.
 */
import type { Db } from '../../db.js';
import { queryAll, queryOne } from '../../db.js';
import type { OrderAddress } from '../../../shared/types.js';

export class CustomerProfileService {
  static getProfile(db: Db, userId: string): { fullName: string; phone: string | null } | undefined {
    return queryOne(db, 'SELECT full_name as fullName, phone FROM profiles WHERE id = ?', userId);
  }

  static getAddresses(db: Db, userId: string): (OrderAddress & { id: string; isDefault: boolean })[] {
    const rows = queryAll<{
      id: string;
      full_name: string;
      phone: string;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      pincode: string;
      is_default: number;
    }>(db, 'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', userId);

    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      phone: r.phone,
      line1: r.line1,
      line2: r.line2 ?? undefined,
      city: r.city,
      state: r.state,
      pincode: r.pincode,
      isDefault: r.is_default === 1,
    }));
  }
}
