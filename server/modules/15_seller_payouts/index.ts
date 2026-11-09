/**
 * Module 15: Seller Payouts
 * Bounded Context: Payout eligibility, 7-day holding period verification, settlement batches, Indian bank validation.
 */
import type { Db } from '../../db.js';
import { queryAll } from '../../db.js';

export class SellerPayoutService {
  /** Return window in days before a seller earning becomes eligible for settlement */
  static readonly RETURN_WINDOW_DAYS = 7;

  /**
   * Evaluates if a given ledger entry has completed its required 7-day holding period.
   */
  static isEntryEligibleForPayout(availableAtIso: string | null, now = new Date()): boolean {
    if (!availableAtIso) return true;
    const availableDate = new Date(availableAtIso);
    return now.getTime() >= availableDate.getTime();
  }

  /**
   * Retrieves mature unsettled entries ready for an admin settlement batch.
   */
  static getMatureUnsettledEntries(db: Db, sellerId: string) {
    const now = new Date().toISOString();
    return queryAll<{
      id: string;
      orderId: string | null;
      type: string;
      amountPaise: number;
      availableAt: string | null;
      reference: string;
    }>(
      db,
      `SELECT id, order_id as orderId, type, amount_paise as amountPaise,
              available_at as availableAt, reference
       FROM seller_ledger_entries
       WHERE seller_id = ? AND status = 'eligible' AND settlement_id IS NULL
         AND (available_at IS NULL OR available_at <= ?)
       ORDER BY created_at ASC`,
      sellerId,
      now,
    );
  }
}
