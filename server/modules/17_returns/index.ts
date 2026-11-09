/**
 * Module 17: Return Management
 * Bounded Context: Post-delivery 7-day return claims, item eligibility inspection, replacement/return workflows.
 */
import type { Db } from '../../db.js';
import { queryOne } from '../../db.js';

export class ReturnService {
  /** Inspection window in days */
  static readonly RETURN_WINDOW_DAYS = 7;

  static isWithinReturnWindow(deliveredAtIso: string, now = new Date()): boolean {
    const delivered = new Date(deliveredAtIso);
    const windowEnds = new Date(delivered.getTime() + ReturnService.RETURN_WINDOW_DAYS * 86400_000);
    return now.getTime() <= windowEnds.getTime();
  }

  static getReturnRequest(db: Db, returnId: string) {
    return queryOne(db, 'SELECT * FROM return_requests WHERE id = ?', returnId);
  }
}
