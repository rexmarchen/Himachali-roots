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
