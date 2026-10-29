export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on?: (event: string, handler: (response: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpay = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout. Check your connection.'));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export async function openRazorpay(options: {
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  orderNumber: string;
  customer: { name?: string; email?: string; phone?: string };
  onSuccess: (response: RazorpaySuccess) => void;
  onDismiss: () => void;
}): Promise<void> {
  await loadScript();
  if (!window.Razorpay) throw new Error('Razorpay Checkout did not initialise.');
  const instance = new window.Razorpay({
    key: options.keyId,
    amount: options.amountPaise,
    currency: 'INR',
    name: 'DEAR HILLS',
    description: `Order ${options.orderNumber}`,
    order_id: options.providerOrderId,
    prefill: {
      name: options.customer.name,
      email: options.customer.email,
      contact: options.customer.phone,
    },
    notes: { order_number: options.orderNumber },
    theme: { color: '#234638' },
    handler: options.onSuccess,
    modal: { ondismiss: options.onDismiss },
  });
  instance.open();
}

/**
 * Standard Web Checkout helper.
 * 1. Calls /api/create-order
 * 2. Opens Razorpay modal
 * 3. Sends received signature to /api/verify-payment
 */
export async function standardRazorpayCheckout(params: {
  amountPaise: number;
  name?: string;
  description?: string;
  customer?: { name?: string; email?: string; contact?: string };
  onSuccess?: (verifyResult: { success: boolean; message: string; payment_id?: string; order_id?: string }) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
}): Promise<void> {
  const keyId = (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || 'rzp_test_TteMaYpK4DXgNw';

  // 1. Call backend /api/create-order
  const res = await fetch('/api/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: 'INR',
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to create Razorpay order.');
  }
  const orderData = (await res.json()) as { order_id: string; amount: number; currency: string };

  // 2. Open Razorpay modal
  await loadScript();
  if (!window.Razorpay) throw new Error('Razorpay Checkout failed to initialize.');

  const rzp = new window.Razorpay({
    key: keyId,
    amount: orderData.amount,
    currency: orderData.currency,
    name: params.name || 'DEAR HILLS',
    description: params.description || 'Himalayan Artisanal Products',
    order_id: orderData.order_id,
    prefill: params.customer,
    theme: { color: '#234638' },
    handler: async (response: RazorpaySuccess) => {
      try {
        // 3. Send to verify endpoint
        const verifyRes = await fetch('/api/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          }),
        });
        const verifyData = (await verifyRes.json()) as { success: boolean; message: string; error?: string };
        if (!verifyRes.ok || !verifyData.success) {
          throw new Error(verifyData.error || 'Payment signature verification failed.');
        }
        params.onSuccess?.(verifyData);
      } catch (err: unknown) {
        params.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    modal: {
      ondismiss: () => {
        params.onDismiss?.();
      },
    },
  });

  if (rzp.on) {
    rzp.on('payment.failed', (response: unknown) => {
      const err = response as { error?: { description?: string; code?: string } };
      params.onError?.(new Error(err.error?.description || 'Payment failed'));
    });
  }

  rzp.open();
}
