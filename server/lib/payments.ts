import crypto from 'node:crypto';
import { env } from '../env.js';
import { AppError } from './http.js';

const RAZORPAY_API = 'https://api.razorpay.com/v1';

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64')}`;
}

async function razorpayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.razorpay.configured) {
    throw new AppError(
      503,
      'payment_not_configured',
      'Online payments are not configured. Add Razorpay test keys to enable checkout.',
    );
  }
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const description =
      (body.error as { description?: string } | undefined)?.description ?? `Razorpay request failed (${response.status}).`;
    throw new AppError(502, 'payment_provider_error', description);
  }
  return body as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
  notes: Record<string, string>,
): Promise<RazorpayOrder> {
  return razorpayRequest<RazorpayOrder>('/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes, payment_capture: 1 }),
  });
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}

export async function createRazorpayRefund(
  providerPaymentId: string,
  amountPaise: number,
  notes: Record<string, string>,
): Promise<RazorpayRefund> {
  return razorpayRequest<RazorpayRefund>(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amount: amountPaise, notes, speed: 'normal' }),
  });
}

/** Razorpay Checkout handler signature: HMAC_SHA256(`${order_id}|${payment_id}`, key_secret). */
export function verifyCheckoutSignature(providerOrderId: string, paymentId: string, signature: string): boolean {
  if (!env.razorpay.configured || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${providerOrderId}|${paymentId}`)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
}

/** Webhook header `x-razorpay-signature` is HMAC_SHA256 of the raw request body. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(expected: string, received: string): boolean {
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(received, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function paymentProviderStatus(): {
  provider: string;
  configured: boolean;
  webhookConfigured: boolean;
  mode: 'test' | 'live' | 'unconfigured';
  devPaymentsEnabled: boolean;
} {
  const configured = env.razorpay.configured;
  const testKey = env.razorpay.keyId.startsWith('rzp_test_');
  return {
    provider: 'razorpay',
    configured,
    webhookConfigured: Boolean(env.razorpay.webhookSecret),
    mode: configured ? (testKey ? 'test' : 'live') : 'unconfigured',
    // Surface the same development capability that the checkout route uses.
    devPaymentsEnabled: env.allowDevPayments || env.simulatedCheckoutEnabled,
  };
}
