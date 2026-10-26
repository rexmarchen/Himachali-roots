import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address, OrderView } from '@shared/types';
import { FLAT_SHIPPING_PAISE, formatINR } from '@shared/types';
import { api, ApiError, errorFields, errorMessage } from '@/lib/api';
import { useAuth, useCartQuery } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePageMeta } from '@/lib/usePageMeta';
import { Alert, ErrorState, LoadingBlock, Modal } from '@/components/ui';
import { CheckoutAction, CheckoutProgress } from './checkout/CheckoutParts';
import { DeliveryStep, AddressFields } from './checkout/DeliveryStep';
import { OrderSummary } from './checkout/OrderSummary';
import { PaymentStep } from './checkout/PaymentStep';
import { ReviewStep } from './checkout/ReviewStep';
import { CheckoutPaymentPanel, OrderConfirmation } from './checkout/CheckoutPaymentPanel';
import {
  computeTotals,
  draftFromAddress,
  draftToAddressBody,
  EMPTY_ADDRESS_DRAFT,
  isOrderPaid,
  paymentOptions,
  toOrderAddress,
  validateAddressDraft,
  type AddressDraft,
  type AppliedCoupon,
  type CheckoutStage,
  type FieldErrors,
  type PaymentInit,
  type PaymentMethod,
} from './checkout/checkoutUtils';

const ADDRESS_FIELD_NAMES = new Set(['fullName', 'phone', 'line1', 'line2', 'city', 'state', 'pincode', 'label']);

function normalizeAddressFields(fields: Record<string, string>): FieldErrors {
  const next: FieldErrors = {};
  for (const [key, value] of Object.entries(fields)) {
    const name = key.startsWith('address.') ? key.slice('address.'.length) : key;
    if (ADDRESS_FIELD_NAMES.has(name)) next[name] = value;
  }
  return next;
}

function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F6F0E6]">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">{children}</div>
    </div>
  );
}

export function CheckoutPage() {
  usePageMeta({
    title: 'Checkout — PAHADI ROOTS',
    description: 'A secure checkout for authentic Himachali goods, shipped across India by the makers themselves.',
    canonicalPath: '/checkout',
  });

  const { config } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const resumeOrderNumber = searchParams.get('resume');

  const cartQuery = useCartQuery();
  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<{ addresses: Address[] }>('/account/addresses'),
  });

  const resumeOrderQuery = useQuery({
    queryKey: ['order', resumeOrderNumber],
    queryFn: () => api<{ order: OrderView }>(`/orders/${encodeURIComponent(resumeOrderNumber!)}`),
    enabled: Boolean(resumeOrderNumber),
    retry: false,
  });
  const resumeStatus = resumeOrderQuery.data?.order.status;
  const resumePaymentQuery = useQuery({
    queryKey: ['checkout-payment', resumeOrderNumber],
    queryFn: () =>
      api<{ payment: PaymentInit; order: OrderView }>(
        `/orders/${encodeURIComponent(resumeOrderNumber!)}/payment`,
        { method: 'POST' },
      ),
    enabled: Boolean(resumeOrderNumber) && resumeStatus === 'pending_payment',
    retry: false,
    staleTime: Infinity,
  });

  const [stage, setStage] = useState<CheckoutStage>(1);
  const [selectedAddressId, setSelectedAddressId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_ADDRESS_DRAFT);
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ order: OrderView; payment: PaymentInit } | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<OrderView | null>(null);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [editDraft, setEditDraft] = useState<AddressDraft>(EMPTY_ADDRESS_DRAFT);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const cart = cartQuery.data?.cart;
  const addressList = useMemo(() => addressesQuery.data?.addresses ?? [], [addressesQuery.data]);
  const preferredAddressId = addressList.find((address) => address.isDefault)?.id ?? addressList[0]?.id;
  const selectedAddress = addressList.find((address) => address.id === selectedAddressId);
  // A selected address can disappear in another tab. Fall back to the
  // new-address form rather than silently using a different saved address.
  const effectiveAddressId: string | 'new' = selectedAddressId
    ? (selectedAddress?.id ?? 'new')
    : (preferredAddressId ?? 'new');

  const orderAddress = useMemo(() => {
    if (effectiveAddressId !== 'new') {
      const match = addressList.find((address) => address.id === effectiveAddressId);
      if (match) return toOrderAddress(match);
    }
    return toOrderAddress(draft);
  }, [effectiveAddressId, addressList, draft]);

  const totals = cart
    ? computeTotals(cart, coupon?.discountPaise ?? 0, config?.shipping.flatRatePaise ?? FLAT_SHIPPING_PAISE)
    : null;
  const options = paymentOptions(config);
  const effectiveMethod: PaymentMethod | null =
    paymentMethod === 'razorpay' && options.razorpay
      ? 'razorpay'
      : paymentMethod === 'development' && options.development
        ? 'development'
        : options.razorpay
          ? 'razorpay'
          : options.development
            ? 'development'
            : null;

  const resumeOrder = resumeOrderQuery.data?.order;
  const resumePaidOrder =
    resumeOrder &&
    isOrderPaid(resumeOrder) &&
    !['refunded', 'partially_refunded', 'cancelled'].includes(resumeOrder.status)
      ? resumeOrder
      : null;
  const resumePendingOrder =
    resumeOrderQuery.data?.order.status === 'pending_payment' ? resumeOrderQuery.data.order : null;
  const resumeUnauthorized = resumeOrderQuery.error instanceof ApiError && resumeOrderQuery.error.status === 401;
  const resumePaymentUnauthorized =
    resumePaymentQuery.error instanceof ApiError && resumePaymentQuery.error.status === 401;

  const goToStage = (next: CheckoutStage) => {
    setStage(next);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const handleConfirmed = (order: OrderView) => {
    setCreated(null);
    setOrderError(null);
    setConfirmedOrder(order);
    queryClient.setQueryData(['order', order.orderNumber], { order });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['cart'] });
  };

  const updateDraft = (patch: Partial<AddressDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFieldErrors((current) => {
      if (!Object.keys(patch).some((key) => key in current)) return current;
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[key];
      return next;
    });
  };

  const continueFromDelivery = async () => {
    setOrderError(null);
    if (addressesQuery.isLoading) return;
    if (!cart || cart.lines.length === 0) {
      setOrderError('Your bag is empty. Add something from the catalogue before checking out.');
      return;
    }
    if (cart.hasUnavailable) {
      setOrderError('One or more items in your bag are no longer available. Edit your bag before continuing.');
      return;
    }
    if (effectiveAddressId === 'new') {
      const errors = validateAddressDraft(draft);
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) {
        setOrderError('Complete the delivery address to continue.');
        return;
      }
    }

    if (effectiveAddressId === 'new' && saveNewAddress) {
      setSavingAddress(true);
      try {
        const result = await api<{ id: string }>('/account/addresses', {
          method: 'POST',
          body: draftToAddressBody({ ...draft, isDefault: addressList.length === 0 }),
        });
        setSelectedAddressId(result.id);
        await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      } catch (error) {
        const errors = normalizeAddressFields(errorFields(error));
        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors);
          setOrderError(errorMessage(error));
          setSavingAddress(false);
          return;
        }
        toast.push(`This address will be used for this order, but it could not be saved. ${errorMessage(error)}`, 'error');
      } finally {
        setSavingAddress(false);
      }
    }

    goToStage(2);
  };

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (code.length < 2) {
      setCouponError('Enter a coupon code.');
      return;
    }
    setCouponChecking(true);
    setCouponError(null);
    try {
      const result = await api<AppliedCoupon>('/coupons/validate', { method: 'POST', body: { code } });
      setCoupon(result);
      setCouponInput(result.code);
      setOrderError(null);
      toast.push(`Coupon ${result.code} applied.`);
    } catch (error) {
      setCoupon(null);
      setCouponError(errorMessage(error));
    } finally {
      setCouponChecking(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

  const continueToReview = async () => {
    setOrderError(null);
    if (!cart || cart.lines.length === 0) {
      setOrderError('Your bag is empty. Add something from the catalogue before checking out.');
      return;
    }
    if (cart.hasUnavailable) {
      setOrderError('One or more items in your bag are no longer available. Edit your bag before continuing.');
      return;
    }
    if (!effectiveMethod) {
      setOrderError('Choose an available payment method before continuing.');
      return;
    }
    if (coupon) {
      setCouponChecking(true);
      try {
        const result = await api<AppliedCoupon>('/coupons/validate', {
          method: 'POST',
          body: { code: coupon.code },
        });
        setCoupon(result);
      } catch (error) {
        setCoupon(null);
        setCouponError(errorMessage(error));
        setOrderError(
          `The coupon ${coupon.code} is no longer valid for this bag. Remove or change it, then continue.`,
        );
        setCouponChecking(false);
        return;
      } finally {
        setCouponChecking(false);
      }
    }
    goToStage(3);
  };

  const placeOrder = async () => {
    if (!cart || !effectiveMethod) return;
    setSubmitting(true);
    setOrderError(null);
    setFieldErrors({});
    try {
      const result = await api<{ order: OrderView; payment: PaymentInit }>('/checkout', {
        method: 'POST',
        body: {
          address: {
            ...orderAddress,
            line2: orderAddress.line2 || undefined,
          },
          couponCode: coupon?.code,
          customerNote: note.trim() || undefined,
          idempotencyKey: idempotencyKey.current,
        },
      });
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      const message = errorMessage(error);
      setOrderError(message);
      const rawFields = errorFields(error);
      const addressErrors = normalizeAddressFields(rawFields);
      if (Object.keys(addressErrors).length > 0) {
        setFieldErrors(addressErrors);
        goToStage(1);
      }
      if (rawFields.coupon) {
        setCoupon(null);
        setCouponError(rawFields.coupon);
      }
      if (
        error instanceof ApiError &&
        ['reservation_expired', 'insufficient_stock', 'item_unavailable'].includes(error.code)
      ) {
        await queryClient.invalidateQueries({ queryKey: ['cart'] });
      }
      if (error instanceof ApiError && error.status === 401) {
        navigate(`/login?next=${encodeURIComponent('/checkout')}`, { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openAddressEditor = (address: Address) => {
    setEditingAddress(address);
    setEditDraft(draftFromAddress(address));
    setEditErrors({});
  };

  const saveAddressEdit = async () => {
    if (!editingAddress) return;
    const errors = validateAddressDraft(editDraft);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSavingEdit(true);
    try {
      await api(`/account/addresses/${encodeURIComponent(editingAddress.id)}`, {
        method: 'PATCH',
        body: draftToAddressBody(editDraft),
      });
      setSelectedAddressId(editingAddress.id);
      setEditingAddress(null);
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      toast.push('Delivery address updated.');
    } catch (error) {
      setEditErrors(normalizeAddressFields(errorFields(error)));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  if (confirmedOrder) {
    return (
      <CheckoutShell>
        <OrderConfirmation order={confirmedOrder} />
      </CheckoutShell>
    );
  }

  if (created) {
    return (
      <CheckoutShell>
        <CheckoutPaymentPanel
          order={created.order}
          payment={created.payment}
          customer={{
            name: created.order.shippingAddress.fullName,
            email: created.order.email,
            phone: created.order.shippingAddress.phone,
          }}
          developmentAllowed={Boolean(config?.devMode)}
          onConfirmed={handleConfirmed}
        />
      </CheckoutShell>
    );
  }

  if (resumeOrderNumber) {
    if (resumeOrderQuery.isLoading) {
      return (
        <CheckoutShell>
          <div className="mx-auto max-w-2xl">
            <h1 className="font-serif text-3xl text-[#234638]">Loading your order</h1>
            <p className="mt-2 text-[12.5px] text-[#6B7269]">Checking the payment status of order {resumeOrderNumber}…</p>
            <div className="mt-6">
              <LoadingBlock rows={3} label="Loading order" />
            </div>
          </div>
        </CheckoutShell>
      );
    }

    if (resumeOrderQuery.isError) {
      return (
        <CheckoutShell>
          <div className="mx-auto max-w-2xl">
            <ErrorState
              title="We could not load that order"
              body={`${errorMessage(resumeOrderQuery.error)} Check your account orders, or return to your bag and start again.`}
              onRetry={() => void resumeOrderQuery.refetch()}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-[12px]">
              {resumeUnauthorized ? (
                <Link
                  to={`/login?next=${encodeURIComponent(`/checkout?resume=${resumeOrderNumber}`)}`}
                  className="text-[#234638] underline underline-offset-4"
                >
                  Sign in again
                </Link>
              ) : null}
              <Link to="/account/orders" className="text-[#234638] underline underline-offset-4">
                Your orders
              </Link>
              <Link to="/cart" className="text-[#234638] underline underline-offset-4">
                Your bag
              </Link>
            </div>
          </div>
        </CheckoutShell>
      );
    }

    if (resumePaidOrder) {
      return (
        <CheckoutShell>
          <OrderConfirmation order={resumePaidOrder} />
        </CheckoutShell>
      );
    }

    if (resumePendingOrder) {
      if (resumePaymentQuery.isLoading) {
        return (
          <CheckoutShell>
            <div className="mx-auto max-w-2xl">
              <h1 className="font-serif text-3xl text-[#234638]">Preparing secure payment</h1>
              <p className="mt-2 text-[12.5px] text-[#6B7269]">Reopening payment for order {resumePendingOrder.orderNumber}…</p>
              <div className="mt-6">
                <LoadingBlock rows={2} label="Preparing payment" />
              </div>
            </div>
          </CheckoutShell>
        );
      }

      if (resumePaymentQuery.data) {
        return (
          <CheckoutShell>
            <CheckoutPaymentPanel
              order={resumePaymentQuery.data.order}
              payment={resumePaymentQuery.data.payment}
              customer={{
                name: resumePaymentQuery.data.order.shippingAddress.fullName,
                email: resumePaymentQuery.data.order.email,
                phone: resumePaymentQuery.data.order.shippingAddress.phone,
              }}
              developmentAllowed={Boolean(config?.devMode)}
              onConfirmed={handleConfirmed}
            />
          </CheckoutShell>
        );
      }

      return (
        <CheckoutShell>
          <div className="mx-auto max-w-2xl">
            <Alert tone="error" title="Payment could not be restarted">
              {resumePaymentQuery.error
                ? errorMessage(resumePaymentQuery.error)
                : 'The server did not return payment details for this order.'}{' '}
              The order may still be awaiting payment; do not pay twice. Check the order page before trying again.
            </Alert>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <CheckoutAction
                variant="secondary"
                onClick={() => void resumePaymentQuery.refetch()}
                loading={resumePaymentQuery.isFetching}
              >
                Try again
              </CheckoutAction>
              {resumePaymentUnauthorized ? (
                <Link
                  to={`/login?next=${encodeURIComponent(`/checkout?resume=${resumeOrderNumber}`)}`}
                  className="text-[12px] text-[#234638] underline underline-offset-4"
                >
                  Sign in again
                </Link>
              ) : null}
              <Link
                to={`/account/orders/${encodeURIComponent(resumePendingOrder.orderNumber)}`}
                className="text-[12px] text-[#234638] underline underline-offset-4"
              >
                View the saved order
              </Link>
            </div>
          </div>
        </CheckoutShell>
      );
    }

    const statusOrder = resumeOrderQuery.data?.order;
    if (!statusOrder) {
      return (
        <CheckoutShell>
          <ErrorState
            title="We could not load that order"
            body="The server did not return this order. Check your account orders, or return to your bag and start again."
            onRetry={() => void resumeOrderQuery.refetch()}
          />
        </CheckoutShell>
      );
    }

    return (
      <CheckoutShell>
        <div className="mx-auto max-w-2xl">
          <Alert
            tone={statusOrder.status === 'cancelled' ? 'warning' : 'error'}
            title={statusOrder.status === 'expired' ? 'This payment window expired' : 'This order cannot take a payment'}
          >
            {statusOrder.status === 'expired'
              ? 'Stock was released when the reservation expired. Return to your bag and place the order again.'
              : `Order ${statusOrder.orderNumber} is currently marked “${statusOrder.status.replaceAll('_', ' ')}”, so there is no payment to complete.`}
          </Alert>
          <div className="mt-4 flex flex-wrap gap-4 text-[12px]">
            <Link to="/cart" className="text-[#234638] underline underline-offset-4">
              Return to your bag
            </Link>
            <Link
              to={`/account/orders/${encodeURIComponent(statusOrder.orderNumber)}`}
              className="text-[#234638] underline underline-offset-4"
            >
              View order details
            </Link>
          </div>
        </div>
      </CheckoutShell>
    );
  }

  if (cartQuery.isLoading) {
    return (
      <CheckoutShell>
        <div className="mx-auto max-w-4xl">
          <LoadingBlock rows={4} label="Loading your bag" />
        </div>
      </CheckoutShell>
    );
  }

  if (cartQuery.isError || !cart) {
    return (
      <CheckoutShell>
        <div className="mx-auto max-w-3xl">
          <ErrorState onRetry={() => void cartQuery.refetch()} />
        </div>
      </CheckoutShell>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <CheckoutShell>
        <div className="mx-auto max-w-xl border border-[#E3D9C9] bg-white p-8 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D98060]">Checkout</p>
          <h1 className="mt-2 font-serif text-[34px] text-[#234638]">Your bag is empty</h1>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-[#6B7269]">
            Add something from the catalogue before checking out. Saved addresses and your account stay exactly as they are.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex h-11 items-center justify-center border border-[#234638] bg-[#234638] px-5 text-[13px] font-medium text-[#FDFBF7] transition-colors hover:bg-[#1B382D]"
          >
            Browse the catalogue
          </Link>
        </div>
      </CheckoutShell>
    );
  }

  const unavailable = cart.hasUnavailable;
  const activeAddressId = effectiveAddressId;
  const cartEmpty = cart.lines.length === 0;

  return (
    <div className="min-h-screen bg-[#F6F0E6]">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-7 sm:px-6 lg:px-8 lg:pb-16 lg:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#D98060]">Secure checkout</p>
            <h1 className="mt-1 font-serif text-[34px] leading-none text-[#234638] sm:text-[42px]">Checkout</h1>
            <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-[#6B7269]">
              Three short steps. The maker dispatches directly, and every total is checked again by the server before your
              order is created.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10.5px] text-[#6B7269]">
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#234638]" fill="none" aria-hidden>
              <rect x="4" y="8.5" width="12" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <path d="M7 8.5V6.4a3 3 0 0 1 6 0v2.1" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Payment confirmed only after server verification
          </div>
        </header>

        <div className="mt-5">
          <CheckoutProgress
            stage={stage}
            onNavigate={(next) => {
              if (next < stage) goToStage(next);
            }}
          />
        </div>

        {ordersNote(unavailable, cartEmpty)}

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-10">
          <div className="min-w-0 space-y-4">
            {orderError && stage !== 3 ? <Alert tone="error">{orderError}</Alert> : null}

            {stage === 1 ? (
              <DeliveryStep
                addresses={addressList}
                addressesLoading={addressesQuery.isLoading}
                addressesError={addressesQuery.isError ? errorMessage(addressesQuery.error) : null}
                selectedId={activeAddressId}
                onSelect={(id) => {
                  setSelectedAddressId(id);
                  setFieldErrors({});
                  setOrderError(null);
                }}
                draft={draft}
                onChangeDraft={updateDraft}
                errors={fieldErrors}
                note={note}
                onNoteChange={setNote}
                saveNewAddress={saveNewAddress}
                onSaveNewAddressChange={setSaveNewAddress}
                onEditAddress={openAddressEditor}
                onContinue={() => void continueFromDelivery()}
                saving={savingAddress}
              />
            ) : null}

            {stage === 2 ? (
              <PaymentStep
                config={config}
                method={effectiveMethod}
                onSelect={setPaymentMethod}
                amountPaise={totals?.totalPaise ?? 0}
                onBack={() => goToStage(1)}
                onContinue={() => void continueToReview()}
                checkingCoupon={couponChecking}
                cartUnavailable={unavailable}
              />
            ) : null}

            {stage === 3 && totals ? (
              <ReviewStep
                cart={cart}
                address={orderAddress}
                method={effectiveMethod ?? 'razorpay'}
                config={config}
                coupon={coupon}
                note={note.trim()}
                totals={totals}
                cartUnavailable={unavailable}
                onEditDelivery={() => goToStage(1)}
                onEditPayment={() => goToStage(2)}
                onPlaceOrder={() => void placeOrder()}
                submitting={submitting}
                error={orderError}
              />
            ) : null}
          </div>

          {totals ? (
            <aside className="lg:sticky lg:top-[96px]">
              <OrderSummary
                cart={cart}
                totals={totals}
                coupon={coupon}
                couponInput={couponInput}
                couponError={couponError}
                applyingCoupon={couponChecking}
                onCouponInput={setCouponInput}
                onApplyCoupon={() => void applyCoupon()}
                onRemoveCoupon={removeCoupon}
              />
            </aside>
          ) : null}
        </div>
      </div>

      {totals ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#DCD1C0] bg-[#F6F0E6]/97 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-[1200px] items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[9.5px] uppercase tracking-[0.14em] text-[#7A8179]">Total payable</p>
              <p className="font-serif text-[21px] leading-tight text-[#234638]">{formatINR(totals.totalPaise)}</p>
            </div>
            {stage === 1 ? (
              <CheckoutAction
                type="button"
                onClick={() => void continueFromDelivery()}
                loading={savingAddress || addressesQuery.isLoading}
                className="shrink-0"
              >
                Continue
              </CheckoutAction>
            ) : stage === 2 ? (
              <CheckoutAction
                type="button"
                onClick={() => void continueToReview()}
                loading={couponChecking}
                disabled={!effectiveMethod || unavailable}
                className="shrink-0"
              >
                Review order
              </CheckoutAction>
            ) : (
              <CheckoutAction
                type="button"
                onClick={() => void placeOrder()}
                loading={submitting}
                disabled={unavailable}
                className="shrink-0"
              >
                Place order
              </CheckoutAction>
            )}
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(editingAddress)}
        onClose={() => {
          if (!savingEdit) setEditingAddress(null);
        }}
        title="Edit delivery address"
        wide
        footer={
          <div className="flex items-center justify-end gap-2">
            <CheckoutAction
              type="button"
              variant="quiet"
              onClick={() => setEditingAddress(null)}
              disabled={savingEdit}
            >
              Cancel
            </CheckoutAction>
            <CheckoutAction type="button" onClick={() => void saveAddressEdit()} loading={savingEdit}>
              Save address
            </CheckoutAction>
          </div>
        }
      >
        <div className="space-y-4">
          <AddressFields
            draft={editDraft}
            errors={editErrors}
            onChange={(patch) => {
              setEditDraft((current) => ({ ...current, ...patch }));
              setEditErrors((current) => {
                const next = { ...current };
                for (const key of Object.keys(patch)) delete next[key];
                return next;
              });
            }}
            idPrefix="edit-address"
          />
          <label className="flex cursor-pointer items-start gap-2.5 text-[11.5px] leading-relaxed text-[#5E675F]">
            <input
              type="checkbox"
              checked={editDraft.isDefault}
              onChange={(event) => setEditDraft((current) => ({ ...current, isDefault: event.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[#234638]"
            />
            Make this my default delivery address.
          </label>
        </div>
      </Modal>
    </div>
  );
}

function ordersNote(unavailable: boolean, empty: boolean) {
  if (empty) return null;
  if (!unavailable) return null;
  return (
    <div className="mt-4">
      <Alert tone="error" title="Some items in your bag are unavailable">
        Remove or replace the unavailable items in your{' '}
        <Link to="/cart" className="underline underline-offset-2">
          bag
        </Link>{' '}
        before continuing. Stock and prices are checked again when the order is placed.
      </Alert>
    </div>
  );
}
