/**
 * Module 12: Payment Processing
 * Bounded Context: Razorpay integration, HMAC SHA256 signature verification, webhooks, payment reconciliation.
 */
import crypto from 'node:crypto';
import { env } from '../../env.js';

export class PaymentService {
  /**
   * Verifies Razorpay HMAC SHA256 signature using constant-time equality check.
   */
  static verifyRazorpaySignature(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    if (!env.razorpay.keySecret) return false;
    const body = `${params.orderId}|${params.paymentId}`;
    const expected = crypto.createHmac('sha256', env.razorpay.keySecret).update(body).digest('hex');
    try {
      const expBuf = Buffer.from(expected);
      const actBuf = Buffer.from(params.signature);
      return expBuf.length === actBuf.length && crypto.timingSafeEqual(expBuf, actBuf);
    } catch {
      return false;
    }
  }

  /**
   * Verifies incoming webhook raw body signature.
   */
  static verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    if (!env.razorpay.webhookSecret) return false;
    const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
    try {
      const expBuf = Buffer.from(expected);
      const actBuf = Buffer.from(signature);
      return expBuf.length === actBuf.length && crypto.timingSafeEqual(expBuf, actBuf);
    } catch {
      return false;
    }
  }
}

