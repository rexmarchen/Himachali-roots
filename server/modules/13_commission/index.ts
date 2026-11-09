/**
 * Module 13: Commission Management
 * Bounded Context: Dear Hills 12% platform fee engine (1200 basis points) and seller 88% share calculation.
 */
import { env } from '../../env.js';

export class CommissionService {
  /** Default 12% Dear Hills platform fee in basis points */
  static readonly DEFAULT_COMMISSION_BP = env.defaultCommissionBp ?? 1200;

  /**
   * Calculates the exact commission in integer paise from net product value.
   */
  static calculateCommissionPaise(netValuePaise: number, rateBp = CommissionService.DEFAULT_COMMISSION_BP): number {
    if (netValuePaise <= 0) return 0;
    return Math.round((netValuePaise * rateBp) / 10000);
  }

  /**
   * Calculates the seller's earning in integer paise.
   */
  static calculateSellerEarningPaise(netValuePaise: number, rateBp = CommissionService.DEFAULT_COMMISSION_BP): number {
    const commission = CommissionService.calculateCommissionPaise(netValuePaise, rateBp);
    return Math.max(0, netValuePaise - commission);
  }
}

