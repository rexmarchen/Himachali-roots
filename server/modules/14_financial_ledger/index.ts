/**
 * Module 14: Financial Ledger
 * Bounded Context: Immutable double-entry financial ledger recording orders, commissions, holds, and payout credits.
 */
import type { Db } from '../../db.js';
import { queryOne, execute } from '../../db.js';
import { newId } from '../../lib/ids.js';

export class FinancialLedgerService {
  /**
   * Records dual-entry ledger items for an order:
   * 1. Positive credit for gross sale
   * 2. Negative debit for platform commission
   */
  static recordSaleAndCommission(
    db: Db,
    params: {
      sellerId: string;
      orderId: string;
      sellerOrderId: string;
      grossPaise: number;
      commissionPaise: number;
    },
  ): void {
    const now = new Date().toISOString();
    execute(
      db,
      `INSERT OR IGNORE INTO seller_ledger_entries
         (id, seller_id, order_id, seller_order_id, type, amount_paise, status, reference, note, created_at)
       VALUES (?, ?, ?, ?, 'sale', ?, 'pending', ?, 'Product value after discount, before commission', ?)`,
      newId('led_'),
      params.sellerId,
      params.orderId,
      params.sellerOrderId,
      params.grossPaise,
      `sale:${params.sellerOrderId}`,
      now,
    );

    execute(
      db,
      `INSERT OR IGNORE INTO seller_ledger_entries
         (id, seller_id, order_id, seller_order_id, type, amount_paise, status, reference, note, created_at)
       VALUES (?, ?, ?, ?, 'commission', ?, 'pending', ?, 'Dear Hills platform fee', ?)`,
      newId('led_'),
      params.sellerId,
      params.orderId,
      params.sellerOrderId,
      -params.commissionPaise,
      `commission:${params.sellerOrderId}`,
      now,
    );
  }

  /**
   * Computes seller balances across pending, eligible, and settled states.
   */
  static getSellerBalance(
    db: Db,
    sellerId: string,
  ): {
    totalEarnedPaise: number;
    settledPaise: number;
    pendingPaise: number;
    eligiblePaise: number;
  } {
    const earnedRow = queryOne<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(amount_paise), 0) as total FROM seller_ledger_entries
       WHERE seller_id = ? AND status IN ('pending', 'eligible', 'settled')`,
      sellerId,
    );
    const settledRow = queryOne<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(amount_paise), 0) as total FROM seller_ledger_entries
       WHERE seller_id = ? AND status = 'settled'`,
      sellerId,
    );
    const eligibleRow = queryOne<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(amount_paise), 0) as total FROM seller_ledger_entries
       WHERE seller_id = ? AND status = 'eligible'`,
      sellerId,
    );
    const pendingRow = queryOne<{ total: number }>(
      db,
      `SELECT COALESCE(SUM(amount_paise), 0) as total FROM seller_ledger_entries
       WHERE seller_id = ? AND status = 'pending'`,
      sellerId,
    );

    return {
      totalEarnedPaise: earnedRow?.total ?? 0,
      settledPaise: settledRow?.total ?? 0,
      pendingPaise: pendingRow?.total ?? 0,
      eligiblePaise: eligibleRow?.total ?? 0,
    };
  }
}
