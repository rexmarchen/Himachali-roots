import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { OrderView } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, ApiError, errorMessage } from '@/lib/api';
import { openRazorpay, type RazorpaySuccess } from '@/lib/razorpay';
import { Alert, Spinner } from '@/components/ui';
import { CheckoutAction, CheckoutPanel } from './CheckoutParts';
import { isOrderPaid, orderItemCount, type PaymentInit } from './checkoutUtils';

type Busy = null | 'razorpay' | 'verifying' | 'dev' | 'status';

function reservationTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function CheckoutPaymentPanel({
  order,
  payment,
  customer,
  developmentAllowed,
  onConfirmed,
}: {
  order: OrderView;
  payment: PaymentInit | null;
  customer: { name?: string; email?: string; phone?: string };
  developmentAllowed: boolean;
  onConfirmed: (order: OrderView) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const razorpay =
    payment?.provider === 'razorpay' && payment.keyId && payment.providerOrderId
      ? { keyId: payment.keyId, providerOrderId: payment.providerOrderId }
      : null;
  const development = Boolean(!razorpay && payment?.devPaymentsEnabled && developmentAllowed);
  const expiresAt = reservationTime(order.reservationExpiresAt);

  const verify = async (response: RazorpaySuccess) => {
    setBusy('verifying');
    setWaiting(false);
    setError(null);
    setNotice(null);
    setExpired(false);
    try {
      const result = await api<{ order: OrderView; alreadyProcessed: boolean }>('/payments/verify', {
        method: 'POST',
        body: {
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        },
      });
      if (!isOrderPaid(result.order)) {
        setError(
          `The provider reported a successful payment, but our server has not marked order ${order.orderNumber} paid. Do not pay again. Check the order status below or contact support.`,
        );
        return;
      }
      onConfirmed(result.order);
    } catch (verifyError) {
      if (verifyError instanceof ApiError && verifyError.status === 401) setExpired(true);
      setError(
        `${errorMessage(verifyError)} If money was deducted, do not pay again. Check the order status below or contact support with order ${order.orderNumber}.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const payWithRazorpay = async () => {
    if (!razorpay) return;
    setBusy('razorpay');
    setError(null);
    setNotice(null);
    setExpired(false);
    try {
      await openRazorpay({
        keyId: razorpay.keyId,
        providerOrderId: razorpay.providerOrderId,
        amountPaise: payment!.amountPaise,
        orderNumber: order.orderNumber,
        customer,
        onSuccess: (response) => {
          void verify(response);
        },
        onDismiss: () => {
          setWaiting(false);
          setBusy(null);
          setNotice(
            'The Razorpay window closed before payment completed. Your order is still saved. You can try again while the reservation is active.',
          );
        },
      });
      setBusy(null);
      setWaiting(true);
    } catch (razorpayError) {
      setBusy(null);
      setWaiting(false);
      setError(errorMessage(razorpayError));
    }
  };

  const simulatePayment = async () => {
    setBusy('dev');
    setError(null);
    setNotice(null);
    setExpired(false);
    try {
      const result = await api<{ order: OrderView; demoLabel?: string }>(
        `/dev/orders/${encodeURIComponent(order.orderNumber)}/pay`,
        { method: 'POST' },
      );
      if (!isOrderPaid(result.order)) {
        setError('The development simulation did not mark this order paid. No confirmation has been shown.');
        return;
      }
      onConfirmed(result.order);
    } catch (simulationError) {
      if (simulationError instanceof ApiError && simulationError.status === 401) setExpired(true);
      setError(errorMessage(simulationError));
    } finally {
      setBusy(null);
    }
  };

  const checkStatus = async () => {
    setBusy('status');
    setError(null);
    setExpired(false);
    try {
      const result = await api<{ order: OrderView }>(`/orders/${encodeURIComponent(order.orderNumber)}`);
      if (isOrderPaid(result.order)) {
        setWaiting(false);
        onConfirmed(result.order);
        return;
      }
      setNotice(
        result.order.status === 'expired'
          ? 'The stock reservation for this order expired. Return to your bag and place the order again.'
          : 'The server still shows this order as awaiting payment. If money was deducted, wait a moment and check again.',
      );
    } catch (statusError) {
      if (statusError instanceof ApiError && statusError.status === 401) setExpired(true);
      setError(errorMessage(statusError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-terra">Payment</p>
      <h1 className="mt-1 font-serif text-[34px] leading-tight text-forest sm:text-[40px]">
        Complete your payment
      </h1>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        Order <span className="font-semibold text-forest">{order.orderNumber}</span> is saved and stock is reserved. It
        is not a paid order until the server records confirmation from the payment provider.
      </p>

      <CheckoutPanel className="mt-6 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Amount due</p>
            <p className="mt-1 font-serif text-[34px] leading-none text-forest">{formatINR(order.totalPaise)}</p>
          </div>
          <div className="text-right text-[10.5px] leading-relaxed text-muted">
            <p>{order.email}</p>
            <p>
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
            </p>
            {expiresAt ? <p className="mt-1">Reservation active until {expiresAt}</p> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[10.5px] text-muted">
          <span>{orderItemCount(order)} item(s)</span>
          <span>·</span>
          <span>
            {razorpay
              ? 'Razorpay secure checkout'
              : development
                ? 'Development simulation'
                : 'Payment provider unavailable'}
          </span>
        </div>
      </CheckoutPanel>

      <div className="mt-4 space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {expired ? (
          <Alert tone="warning" title="Your session expired">
            Order {order.orderNumber} is still saved. Sign in again to resume this payment. Do not pay twice.{' '}
            <Link
              to={`/login?next=${encodeURIComponent(`/checkout?resume=${order.orderNumber}`)}`}
              className="underline underline-offset-2"
            >
              Sign in
            </Link>
          </Alert>
        ) : null}
        {notice ? <Alert tone="warning">{notice}</Alert> : null}
        {busy === 'verifying' ? (
          <Alert tone="info">
            <span className="inline-flex items-center gap-2">
              <Spinner className="h-4 w-4" /> Verifying the payment with our server. Keep this page open.
            </span>
          </Alert>
        ) : null}

        {razorpay ? (
          <CheckoutPanel className="p-5">
            <Alert tone="info">
              Razorpay handles the payment. A browser callback alone is never treated as payment — the order is confirmed
              only after our server verifies the checkout signature.
            </Alert>
            <CheckoutAction
              type="button"
              onClick={() => void payWithRazorpay()}
              loading={busy === 'razorpay'}
              disabled={busy !== null || waiting}
              fullWidth
              className="mt-4 h-12"
              data-testid="checkout-pay-razorpay"
            >
              Pay {formatINR(order.totalPaise)} securely
            </CheckoutAction>
            {waiting ? (
              <p className="mt-3 flex items-center justify-center gap-2 text-[11.5px] text-muted">
                <Spinner className="h-4 w-4 text-forest" /> Razorpay window is open. Complete the payment there.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void checkStatus()}
                disabled={busy !== null}
                className="text-[11px] text-muted underline decoration-line underline-offset-4 hover:text-forest disabled:opacity-50"
              >
                Check payment status
              </button>
              <p className="text-[10px] text-muted">Card and CVV details are never stored by DEAR HILLS.</p>
            </div>
            <p className="mt-4 border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted">
              If the window closed, reopen it here. Do not pay twice. If money was deducted and the order still shows as
              unpaid after a short wait, contact support with order {order.orderNumber}.
            </p>
          </CheckoutPanel>
        ) : development ? (
          <CheckoutPanel className="p-5">
            <Alert tone="warning" title="Development test payment">
              Razorpay is not configured on this deployment. Pressing the button below records a simulated payment through
              the local development endpoint. No money moves, no provider is contacted, and the resulting order is a demo.
            </Alert>
            <CheckoutAction
              type="button"
              variant="danger"
              onClick={() => void simulatePayment()}
              loading={busy === 'dev'}
              disabled={busy !== null}
              fullWidth
              className="mt-4"
              data-testid="checkout-pay-development"
            >
              Simulate successful payment
            </CheckoutAction>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void checkStatus()}
                disabled={busy !== null}
                className="text-[11px] text-muted underline decoration-line underline-offset-4 hover:text-forest disabled:opacity-50"
              >
                Check payment status
              </button>
              <p className="text-[10px] text-muted">DEMO ORDER — NOT A REAL PURCHASE</p>
            </div>
          </CheckoutPanel>
        ) : (
          <CheckoutPanel className="p-5">
            <Alert tone="error" title="Payment could not be started">
              {payment?.message ??
                'No online payment provider is configured on this deployment, so no payment can be taken.'}
            </Alert>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              The order remains awaiting payment and its stock reservation will expire. Configure{' '}
              <code className="text-[10.5px]">RAZORPAY_KEY_ID</code> and{' '}
              <code className="text-[10.5px]">RAZORPAY_KEY_SECRET</code> to enable online payment. Cash on delivery is not
              supported.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Link
                to={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
                className="text-[12px] text-forest underline decoration-line underline-offset-4 hover:decoration-forest"
              >
                View the saved order
              </Link>
              <button
                type="button"
                onClick={() => void checkStatus()}
                disabled={busy !== null}
                className="text-[11px] text-muted underline decoration-line underline-offset-4 hover:text-forest disabled:opacity-50"
              >
                Check payment status
              </button>
            </div>
          </CheckoutPanel>
        )}

        <p className="text-center text-[10px] leading-relaxed text-muted">
          Need help with this order?{' '}
          <Link to="/contact" className="underline underline-offset-2 hover:text-forest">
            Contact support
          </Link>{' '}
          and include order {order.orderNumber}.
        </p>
      </div>
    </div>
  );
}

export function OrderConfirmation({ order }: { order: OrderView }) {
  const demo = Boolean(order.isDemo || order.payment?.provider === 'dev-simulation');
  const items = order.sellerOrders.flatMap((sellerOrder) => sellerOrder.items);
  const address = order.shippingAddress;

  return (
    <div className="mx-auto max-w-2xl">
      <CheckoutPanel className="p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-forest/25 bg-forest/[0.06]">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-forest" fill="none" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-terra">Payment confirmed</p>
        <h1 className="mt-1 font-serif text-[36px] leading-tight text-forest sm:text-[42px]">Order confirmed</h1>
        <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">
          Our server has recorded payment for order{' '}
          <span className="font-semibold text-forest">{order.orderNumber}</span>. Thank you for supporting Himalayan
          makers.
        </p>

        {demo ? (
          <div className="mt-5 text-left">
            <Alert tone="warning" title="Development demo order — not a real purchase">
              This order was paid through simulated checkout. No money moved, no payment provider was contacted, and no
              items will be shipped as part of a real sale.
            </Alert>
          </div>
        ) : null}

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-4 text-left">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Order number</dt>
            <dd className="mt-0.5 text-[12.5px] font-medium text-forest">{order.orderNumber}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Amount paid</dt>
            <dd className="mt-0.5 font-serif text-[22px] leading-none text-forest">{formatINR(order.totalPaise)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Updates</dt>
            <dd className="mt-0.5 text-[11px] leading-relaxed text-muted">{order.email}</dd>
          </div>
          <div className="text-right">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Items</dt>
            <dd className="mt-0.5 text-[12px] text-muted">{orderItemCount(order)}</dd>
          </div>
        </dl>

        <div className="mt-4 border border-line bg-paper p-4 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Delivering to</p>
          <p className="mt-1 text-[12.5px] font-medium text-forest">{address.fullName}</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}
            <br />
            {address.city}, {address.state} {address.pincode}
            <br />
            +91 {address.phone}
          </p>
        </div>

        <ul className="mt-4 divide-y divide-line border border-line text-left">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[12px] text-forest">{item.name}</span>
                <span className="text-[10.5px] text-muted">
                  {item.sellerName} · Qty {item.quantity}
                </span>
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-forest">
                {formatINR(item.lineSubtotalPaise)}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-left text-[10.5px] leading-relaxed text-muted">
          Each seller packs and dispatches their own items, so parcels can arrive separately. Follow dispatch and tracking
          updates on your order page. This confirmation reflects the status recorded by our server, not a browser callback.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
            className="inline-flex h-11 items-center justify-center border border-forest bg-forest px-5 text-[13px] font-medium text-paper transition-colors hover:bg-forest-deep"
          >
            View order details
          </Link>
          <Link
            to="/shop"
            className="inline-flex h-11 items-center justify-center border border-forest/25 bg-white px-5 text-[13px] font-medium text-forest transition-colors hover:border-forest"
          >
            Continue shopping
          </Link>
        </div>
      </CheckoutPanel>
    </div>
  );
}
