import { formatINR } from '@shared/types';
import { Alert } from '@/components/ui';
import type { SiteConfig } from '@/lib/session';
import { BackLink, CheckoutAction, CheckoutPanel, SectionHeading } from './CheckoutParts';
import { paymentOptions, type PaymentMethod } from './checkoutUtils';

export function PaymentStep({
  config,
  method,
  onSelect,
  amountPaise,
  onBack,
  onContinue,
  checkingCoupon,
  cartUnavailable,
}: {
  config: SiteConfig | null;
  method: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
  amountPaise: number;
  onBack: () => void;
  onContinue: () => void;
  checkingCoupon: boolean;
  cartUnavailable: boolean;
}) {
  const options = paymentOptions(config);
  const testMode = config?.payments.mode === 'test';

  return (
    <CheckoutPanel className="p-5 sm:p-6">
      <SectionHeading
        step="Step two"
        title="How would you like to pay?"
        description="Payment is confirmed by our server before an order is treated as paid. Your card number and CVV are entered only in the provider’s secure window."
      />

      {!config ? (
        <div className="mt-5 space-y-3" aria-busy="true" aria-label="Checking payment availability">
          <div className="h-24 shimmer rounded-sm" />
          <p className="text-[11px] text-[#7A8179]">Checking which payment methods are enabled…</p>
        </div>
      ) : options.available ? (
        <fieldset className="mt-5">
          <legend className="sr-only">Payment method</legend>
          <div className="space-y-3">
            {options.razorpay ? (
              <label
                className={`flex cursor-pointer gap-3 border p-4 transition-colors ${
                  method === 'razorpay'
                    ? 'border-[#234638] bg-[#234638]/[0.035]'
                    : 'border-[#E3D9C9] bg-white hover:border-[#234638]/35'
                }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  value="razorpay"
                  checked={method === 'razorpay'}
                  onChange={() => onSelect('razorpay')}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#234638]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-[#234638]">Razorpay secure checkout</span>
                    <span className="border border-[#234638]/20 bg-[#234638]/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#234638]">
                      {testMode ? 'Test mode' : 'Live'}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-relaxed text-[#6B7269]">
                    Pay in Razorpay’s secure window. The cards, UPI, net-banking or wallet options you see there depend on
                    what the merchant account has enabled.
                  </span>
                  {testMode ? (
                    <span className="mt-1.5 block text-[10.5px] leading-relaxed text-[#A85F3F]">
                      Razorpay test keys are configured. This is a real integration in test mode; no real money moves.
                    </span>
                  ) : null}
                </span>
              </label>
            ) : null}

            {options.development ? (
              <div className="border border-[#D98060]/40 bg-[#FDF6F1] p-4">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#A5502F]">
                  Development test payment
                </p>
                <label className="mt-2 flex cursor-pointer gap-3">
                  <input
                    type="radio"
                    name="payment-method"
                    value="development"
                    checked={method === 'development'}
                    onChange={() => onSelect('development')}
                    className="mt-1 h-4 w-4 shrink-0 accent-[#A5502F]"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-[#7D3D28]">
                      Simulate a successful payment
                    </span>
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-[#7D3D28]/85">
                      Available only because Razorpay is unconfigured and simulated checkout is enabled outside production.
                      No money moves, no provider is contacted, and the order is marked as a demo. Never use this for a real
                      sale.
                    </span>
                  </span>
                </label>
              </div>
            ) : null}
          </div>
        </fieldset>
      ) : (
        <div className="mt-5">
          <Alert tone="error" title="Online payment is not available on this deployment">
            <p>
              Razorpay keys are not configured, so this store cannot take a payment. No order will be created from this
              page until a payment method is available. Cash on delivery is not supported.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed">
              To enable checkout, set <code className="text-[10.5px]">RAZORPAY_KEY_ID</code> and{' '}
              <code className="text-[10.5px]">RAZORPAY_KEY_SECRET</code>. In local development,{' '}
              <code className="text-[10.5px]">SIMULATED_CHECKOUT_ENABLED</code> exposes the test path above.
            </p>
          </Alert>
        </div>
      )}

      <dl className="mt-6 grid gap-3 border-y border-[#EDE5D8] py-4 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-[#7A8179]">Amount due</dt>
          <dd className="mt-1 font-serif text-[22px] leading-none text-[#234638]">{formatINR(amountPaise)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-[#7A8179]">Currency</dt>
          <dd className="mt-1 text-[12.5px] text-[#234638]">Indian rupees (INR)</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.12em] text-[#7A8179]">Card data</dt>
          <dd className="mt-1 text-[12px] leading-relaxed text-[#234638]">Never stored by PAHADI ROOTS</dd>
        </div>
      </dl>

      <p className="mt-4 text-[10.5px] leading-relaxed text-[#7A8179]">
        The shipping charge shown in the summary follows the store’s current rule and is recalculated by the server when the
        order is created. An order is not paid until the server records provider confirmation.
      </p>

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 border-t border-[#EDE5D8] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <BackLink onClick={onBack}>Delivery details</BackLink>
        <div className="w-full sm:w-auto">
          <CheckoutAction
            type="button"
            onClick={onContinue}
            loading={checkingCoupon}
            disabled={!method || cartUnavailable}
            fullWidth
          >
            Review order
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </CheckoutAction>
        </div>
      </div>
    </CheckoutPanel>
  );
}
