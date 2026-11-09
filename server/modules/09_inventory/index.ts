/**
 * Module 09: Inventory Management
 * Bounded Context: Stock levels, atomic reservations, stock movement ledger, low stock alerts.
 */
import type { Db } from '../../db.js';
import { execute } from '../../db.js';
import { conflict } from '../../lib/http.js';
import { newId } from '../../lib/ids.js';

export class InventoryService {
  /**
   * Atomically reserve stock inside an active transaction.
   * Throws 409 conflict if stock is insufficient, preventing overselling.
   */
  static reserveStock(
    db: Db,
    productId: string,
    quantity: number,
    orderNumber: string,
    now = new Date().toISOString(),
  ): void {
    const result = execute(
      db,
      `UPDATE inventory
       SET reserved_quantity = reserved_quantity + ?, updated_at = ?
       WHERE product_id = ? AND quantity - reserved_quantity >= ?`,
      quantity,
      now,
      productId,
      quantity,
    );

    if (Number(result.changes) !== 1) {
      throw conflict('Insufficient stock available for this product.', 'insufficient_stock');
    }

    execute(
      db,
      `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
       VALUES (?, ?, ?, 'reservation', ?, 'Reserved at checkout')`,
      newId('mov_'),
      productId,
      quantity,
      orderNumber,
    );
  }

  /**
   * Release reserved stock on order cancellation or reservation timeout.
   */
  static releaseReservation(
    db: Db,
    productId: string,
    quantity: number,
    orderNumber: string,
  ): void {
    execute(
      db,
      `UPDATE inventory
       SET reserved_quantity = MAX(0, reserved_quantity - ?), updated_at = ?
       WHERE product_id = ?`,
      quantity,
      new Date().toISOString(),
      productId,
    );

    execute(
      db,
      `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
       VALUES (?, ?, ?, 'release', ?, 'Reservation released')`,
      newId('mov_'),
      productId,
      -quantity,
      orderNumber,
    );
  }

  /**
   * Commit reservation to permanent deduction upon successful payment confirmation.
   */
  static commitReservation(
    db: Db,
    productId: string,
    quantity: number,
    orderNumber: string,
  ): void {
    execute(
      db,
      `UPDATE inventory
       SET quantity = MAX(0, quantity - ?),
           reserved_quantity = MAX(0, reserved_quantity - ?),
           updated_at = ?
       WHERE product_id = ?`,
      quantity,
      quantity,
      new Date().toISOString(),
      productId,
    );

    execute(
      db,
      `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
       VALUES (?, ?, ?, 'sale', ?, 'Committed on payment')`,
      newId('mov_'),
      productId,
      -quantity,
      orderNumber,
    );
  }
}
