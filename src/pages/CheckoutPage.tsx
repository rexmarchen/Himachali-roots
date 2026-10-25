import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address, OrderAddress, OrderView } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, errorFields, errorMessage, ApiError } from '@/lib/api';
import { useAuth, useCartQuery } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { openRazorpay, type RazorpaySuccess } from '@/lib/razorpay';
import {
  Alert,
  Breadcrumbs,
  Button,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Textarea,
} from '@/components/ui';

interface PaymentInit {
  provider: 'razorpay' | 'unconfigured';
  keyId?: string;
  providerOrderId?: string;
  amountPaise: number;
  orderNumber: string;
  message?: string;
  devPaymentsEnabled: boolean;
}

const EMPTY_ADDRESS: OrderAddress = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: 'Himachal Pradesh',
  pincode: '',
};

export function CheckoutPage() {
  const cartQuery = useCartQuery();
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<{ addresses: Address[] }>('/account/addresses'),
  });
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'new' | null>(null);
  const [address, setAddress] = useState<OrderAddress>(EMPTY_ADDRESS);
  const [note, setNote] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountPaise: number; description: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ order: OrderView; payment: PaymentInit } | null>(null);
  const [paying, setPaying] = useState(false);

  const cart = cartQuery.data?.cart;
  const addressList = useMemo(() => addresses.data?.addresses ?? [], [addresses.data]);
  // Until the customer chooses, prefer their default saved address. This is
  // derived rather than copied into state so a late address fetch is safe.
  const preferredAddressId = addressList.find((item) => item.isDefault)?.id ?? addressList[0]?.id;
  const effectiveAddressId: string | 'new' = selectedAddressId ?? preferredAddressId ?? 'new';

  const chosenAddress = useMemo<OrderAddress>(() => {
    if (effectiveAddressId !== 'new') {
      const match = addressList.find((item) => item.id === effectiveAddressId);
      if (match) {
        return {
          fullName: match.fullName,
          phone: match.phone,
          line1: match.line1,
          line2: match.line2 ?? '',
          city: match.city,
          state: match.state,
          pincode: match.pincode,
        };
      }
    }
    return address;
  }, [effectiveAddressId, addressList, address]);

  const couponMutation = useMutation({
    mutationFn: () =>
      api<{ code: string; description: string | null; discountPaise: number }>('/coupons/validate', {
        method: 'POST',
        body: { code: couponInput },
      }),
    onSuccess: (result) => {
      setCoupon(result);
      toast.push(`Coupon ${result.code} applied: ${formatINR(result.discountPaise)} off.`);
    },
    onError: (mutationError) => {
      setCoupon(null);
      toast.push(errorMessage(mutationError), 'error');
    },
  });

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!cart || cart.lines.length === 0) {
      setError('Your bag is empty.');
      return;
    }
    if (cart.hasUnavailable) {
      setError('Update your bag before checking out — one item is no longer available.');
      return;
    }
    if (effectiveAddressId === 'new') {
      const missing: Record<string, string> = {};
      if (chosenAddress.fullName.trim().length < 2) missing.fullName = 'Enter the recipient’s name.';
      if (!/^[6-9]\d{9}$/.test(chosenAddress.phone)) missing.phone = 'Enter a 10-digit Indian mobile number.';
      if (chosenAddress.line1.trim().length < 4) missing.line1 = 'Enter the street address.';
      if (chosenAddress.city.trim().length < 2) missing.city = 'Enter the city or town.';
      if (chosenAddress.state.trim().length < 2) missing.state = 'Enter the state.';
      if (!/^\d{6}$/.test(chosenAddress.pincode)) missing.pincode = 'Enter a 6-digit PIN code.';
      if (Object.keys(missing).length) {
        setFieldErrors(missing);
        setError('Complete the delivery address to continue.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await api<{ order: OrderView; payment: PaymentInit }>('/checkout', {
        method: 'POST',
        body: {
          address: {
            ...chosenAddress,
            line2: chosenAddress.line2 || undefined,
          },
          couponCode: coupon?.code,
          customerNote: note || undefined,
          idempotencyKey: idempotencyKey.current,
        },
      });
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      if (result.payment.provider === 'razorpay' && result.payment.keyId && result.payment.providerOrderId) {
        void startRazorpay(result.order, result.payment);
      } else {
        toast.push('Order placed. Stock is reserved while payment is completed.', 'info');
      }
    } catch (submitError) {
      setError(errorMessage(submitError));
      setFieldErrors(errorFields(submitError));
      if (submitError instanceof ApiError && submitError.code === 'reservation_expired') {
        await queryClient.invalidateQueries({ queryKey: ['cart'] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const startRazorpay = async (order: OrderView, payment: PaymentInit) => {
    if (!payment.keyId || !payment.providerOrderId) return;
    setPaying(true);
    try {
      await openRazorpay({
        keyId: payment.keyId,
        providerOrderId: payment.providerOrderId,
        amountPaise: payment.amountPaise,
        orderNumber: order.orderNumber,
        customer: { name: chosenAddress.fullName, email: user?.email, phone: chosenAddress.phone },
        onSuccess: async (response: RazorpaySuccess) => {
          try {
            await api('/payments/verify', {
              method: 'POST',
              body: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            toast.push('Payment verified. Your order is confirmed.');
            navigate(`/account/orders/${order.orderNumber}`);
          } catch (verifyError) {
            toast.push(errorMessage(verifyError), 'error');
            navigate(`/account/orders/${order.orderNumber}`);
          } finally {
            setPaying(false);
          }
        },
        onDismiss: () => {
          setPaying(false);
          toast.push('Payment window closed. The order is saved and stock is reserved until the timer expires.', 'info');
        },
      });
    } catch (razorpayError) {
      setPaying(false);
      toast.push(errorMessage(razorpayError), 'error');
    }
  };

  const simulatePayment = async () => {
    if (!created) return;
    setPaying(true);
    try {
      await api(`/dev/orders/${encodeURIComponent(created.order.orderNumber)}/pay`, { method: 'POST' });
      toast.push('Development payment simulated. No money moved.');
      await queryClient.invalidateQueries({ queryKey: ['order', created.order.orderNumber] });
      navigate(`/account/orders/${created.order.orderNumber}`);
    } catch (paymentError) {
      toast.push(errorMessage(paymentError), 'error');
    } finally {
      setPaying(false);
    }
  };

  if (cartQuery.isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-20"><LoadingBlock rows={4} /></div>;
  }

  if (cartQuery.isError || !cart) {
    return <div className="mx-auto max-w-3xl px-4 py-20"><ErrorState onRetry={() => void cartQuery.refetch()} /></div>;
  }

  if (cart.lines.length === 0 && !created) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-3xl">Nothing to check out</h1>
        <p className="mt-3 text-sm text-muted">Your bag is empty. Add something from the catalogue first.</p>
        <Link to="/shop" className="mt-6 inline-block text-sm underline underline-offset-4">Browse the catalogue</Link>
      </div>
    );
  }

  if (created) {
    const { order, payment } = created;
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Checkout' }, { label: 'Payment' }]} />
        <PageHeader
          eyebrow="Order saved"
          title={payment.provider === 'razorpay' ? 'Complete payment' : 'Payment is not configured'}
          lede={`Order ${order.orderNumber} has been recorded. Stock is reserved for a limited window; it is not a paid order until the payment provider confirms.`}
        />

        <div className="mt-8 space-y-5">
          <div className="border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Amount due</p>
                <p className="mt-1 font-serif text-3xl text-forest">{formatINR(order.totalPaise)}</p>
              </div>
              <div className="text-right text-[11px] text-muted">
                <p>{order.email}</p>
                <p>{order.shippingAddress.city}, {order.shippingAddress.state}</p>
              </div>
            </div>
            {order.reservationExpiresAt ? (
              <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
                Stock reservation expires {new Date(order.reservationExpiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.
              </p>
            ) : null}
          </div>

          {payment.provider === 'razorpay' ? (
            <div className="space-y-4">
              <Alert tone="info">
                Payment is handled by Razorpay. The order is confirmed only after the server verifies the checkout
                signature — a browser callback alone is not treated as payment.
              </Alert>
              <Button
                size="lg"
                loading={paying}
                onClick={() => void startRazorpay(order, payment)}
                className="w-full sm:w-auto"
              >
                Open Razorpay Checkout
              </Button>
              <p className="text-[11px] text-muted">
                If the window closed, you can reopen it here. Do not pay twice; if money was deducted and the order still
                shows unpaid, contact support with the order number.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert tone="warning" title="Online payment is not configured on this deployment">
                {payment.message ?? 'The order is saved with stock reserved, but no payment can be taken.'}
              </Alert>
              {payment.devPaymentsEnabled ? (
                <div className="border border-terra/30 bg-[#fff8f4] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8e4630]">Development only</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#7d3d28]">
                    This will mark the order paid through the development simulation endpoint. <strong>No money moves</strong>,
                    no payment provider is contacted, and this order must never be treated as a real sale.
                  </p>
                  <Button variant="danger" size="sm" className="mt-4" loading={paying} onClick={() => void simulatePayment()}>
                    Simulate successful payment
                  </Button>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted">
                  The order will remain awaiting payment and its reservation will expire. Configure Razorpay keys
                  (<code className="text-xs">RAZORPAY_KEY_ID</code>, <code className="text-xs">RAZORPAY_KEY_SECRET</code>) to
                  enable live checkout, or contact the store owner.
                </p>
              )}
              <Button variant="secondary" onClick={() => navigate(`/account/orders/${order.orderNumber}`)}>
                View the saved order
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Bag', to: '/cart' }, { label: 'Checkout' }]} />
      <PageHeader eyebrow="Checkout" title="Delivery and payment" lede="Review the address and total. The server recalculates stock, discounts and shipping when the order is placed." />

      <div className="mt-4 border border-sand bg-paper p-3 text-xs text-muted">
        <span className="font-semibold uppercase tracking-wider text-terra">DEMO ORDER — NOT A REAL PURCHASE</span>
        <span className="mx-2">·</span>
        Simulated checkout is enabled for local development. Demo orders are persisted safely without processing real payments.
      </div>

      <form onSubmit={submitOrder} className="mt-10 grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-14">
        <div className="space-y-8">
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl">1 · Delivery address</h2>
              <Link to="/account/addresses" className="text-[11px] text-muted underline underline-offset-4 hover:text-forest">Manage addresses</Link>
            </div>

            {addressList.length ? (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {addressList.map((item) => (
                  <label
                    key={item.id}
                    className={`cursor-pointer border p-3.5 text-[12.5px] leading-relaxed ${
                      effectiveAddressId === item.id ? 'border-forest bg-forest/[0.04]' : 'border-line bg-surface hover:border-forest/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      className="sr-only"
                      checked={effectiveAddressId === item.id}
                      onChange={() => setSelectedAddressId(item.id)}
                    />
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{item.label}</span>
                      {item.isDefault ? <span className="text-[9px] uppercase tracking-[0.1em] text-muted">Default</span> : null}
                    </span>
                    <span className="mt-1 block text-muted">{item.fullName}</span>
                    <span className="block text-muted">{item.line1}{item.line2 ? `, ${item.line2}` : ''}</span>
                    <span className="block text-muted">{item.city}, {item.state} {item.pincode}</span>
                    <span className="mt-1 block text-muted">{item.phone}</span>
                  </label>
                ))}
                <label
                  className={`cursor-pointer border p-3.5 text-[12.5px] ${
                    effectiveAddressId === 'new' ? 'border-forest bg-forest/[0.04]' : 'border-line bg-surface hover:border-forest/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="address"
                    className="sr-only"
                    checked={effectiveAddressId === 'new'}
                    onChange={() => setSelectedAddressId('new')}
                  />
                  <span className="font-medium text-ink">Use a new address</span>
                  <span className="mt-1 block text-muted">Enter it below for this order.</span>
                </label>
              </div>
            ) : null}

            {effectiveAddressId === 'new' || addressList.length === 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required error={fieldErrors.fullName}>
                  <Input
                    value={address.fullName}
                    onChange={(event) => setAddress({ ...address, fullName: event.target.value })}
                    autoComplete="name"
                    invalid={Boolean(fieldErrors.fullName)}
                  />
                </Field>
                <Field label="Mobile number" required error={fieldErrors.phone} hint="10 digits">
                  <Input
                    value={address.phone}
                    onChange={(event) => setAddress({ ...address, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })}
                    inputMode="numeric"
                    autoComplete="tel"
                    invalid={Boolean(fieldErrors.phone)}
                  />
                </Field>
                <Field label="Address line 1" required error={fieldErrors.line1} className="sm:col-span-2">
                  <Input
                    value={address.line1}
                    onChange={(event) => setAddress({ ...address, line1: event.target.value })}
                    autoComplete="address-line1"
                    placeholder="House or building, street, locality"
                    invalid={Boolean(fieldErrors.line1)}
                  />
                </Field>
                <Field label="Address line 2" hint="Optional" className="sm:col-span-2">
                  <Input
                    value={address.line2 ?? ''}
                    onChange={(event) => setAddress({ ...address, line2: event.target.value })}
                    autoComplete="address-line2"
                    placeholder="Landmark, apartment, floor"
                  />
                </Field>
                <Field label="City or town" required error={fieldErrors.city}>
                  <Input
                    value={address.city}
                    onChange={(event) => setAddress({ ...address, city: event.target.value })}
                    autoComplete="address-level2"
                    invalid={Boolean(fieldErrors.city)}
                  />
                </Field>
                <Field label="State" required error={fieldErrors.state}>
                  <Input
                    value={address.state}
                    onChange={(event) => setAddress({ ...address, state: event.target.value })}
                    autoComplete="address-level1"
                    invalid={Boolean(fieldErrors.state)}
                  />
                </Field>
                <Field label="PIN code" required error={fieldErrors.pincode} hint="6 digits">
                  <Input
                    value={address.pincode}
                    onChange={(event) => setAddress({ ...address, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    invalid={Boolean(fieldErrors.pincode)}
                  />
                </Field>
              </div>
            ) : null}
          </section>

          <section className="border-t border-line pt-7">
            <h2 className="text-xl">2 · Order note</h2>
            <p className="mt-1 text-xs text-muted">Visible to the seller. Do not include payment details.</p>
            <Textarea
              className="mt-3"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Delivery instructions, a gift note, or anything the maker should know."
            />
          </section>

          <section className="border-t border-line pt-7">
            <h2 className="text-xl">3 · Payment</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Payment is taken after the order is saved. When Razorpay is configured you will be taken to its secure
              checkout; otherwise the order remains unpaid and no money is collected. Cash on delivery is not offered in
              this build.
            </p>
          </section>
        </div>

        <aside>
          <div className="sticky top-32 border border-line bg-surface p-5">
            <h2 className="font-serif text-xl text-forest">Your order</h2>
            <ul className="mt-4 space-y-3 border-b border-line pb-4">
              {cart.lines.map((line) => (
                <li key={line.productId} className="flex items-start justify-between gap-3 text-[12.5px]">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{line.name}</span>
                    <span className="text-[10.5px] text-muted">{line.sellerName} · qty {line.quantity}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatINR(line.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4">
              <label className="text-[11px] font-medium text-ink" htmlFor="coupon">Coupon code</label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="coupon"
                  value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={couponMutation.isPending}
                  onClick={() => couponMutation.mutate()}
                  disabled={couponInput.trim().length < 2}
                >
                  Apply
                </Button>
              </div>
              {coupon ? (
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-forest">
                  <span>{coupon.code} applied{coupon.description ? ` — ${coupon.description}` : ''}</span>
                  <button type="button" className="text-muted underline underline-offset-2" onClick={() => { setCoupon(null); setCouponInput(''); }}>
                    Remove
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 text-[10.5px] text-muted">Coupons are validated against your account and the live bag.</p>
              )}
            </div>

            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatINR(cart.subtotalPaise)}</dd>
              </div>
              {coupon ? (
                <div className="flex justify-between gap-4 text-forest">
                  <dt>Coupon {coupon.code}</dt>
                  <dd>−{formatINR(coupon.discountPaise)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Shipping</dt>
                <dd>{cart.shippingEstimatePaise === 0 ? 'Complimentary' : formatINR(cart.shippingEstimatePaise)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-medium">
                <dt>Estimated total</dt>
                <dd>{formatINR(Math.max(0, cart.subtotalPaise - (coupon?.discountPaise ?? 0)) + cart.shippingEstimatePaise)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              Final totals are recalculated on the server, including commission and tax snapshots. If the amount differs,
              the order summary you receive is authoritative.
            </p>

            {error ? <div className="mt-4"><Alert tone="error">{error}</Alert></div> : null}

            <Button type="submit" size="lg" className="mt-5 w-full" loading={submitting}>
              Place order
            </Button>
            <p className="mt-3 text-center text-[10px] leading-relaxed text-muted">
              By placing the order you accept the draft <Link to="/policies/terms" className="underline underline-offset-2">terms</Link> and{' '}
              <Link to="/policies/returns" className="underline underline-offset-2">returns policy</Link>.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
