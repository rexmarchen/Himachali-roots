import { Link } from 'react-router-dom';
import type { CartView, OrderAddress } from '@shared/types';
import { formatINR } from '@shared/types';
import { Alert } from '@/components/ui';
import type { SiteConfig } from '@/lib/session';
import { BackLink, CheckoutAction, CheckoutPanel, SectionHeading } from './CheckoutParts';
import type { AppliedCoupon, PaymentMethod, Totals } from './checkoutUtils';

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] text-[#6B7269] underline decoration-[#C9BFB0] underline-offset-4 transition-colors hover:text-[#234638]"
    >
      Edit
    </button>
  );
}

export function ReviewStep({
  cart,
  address,
  method,
  config,
  coupon,
  note,
  totals,
  cartUnavailable,
  onEditDelivery,
  onEditPayment,
  onPlaceOrder,
  submitting,
  error,
}: {
  cart: CartView;
  address: OrderAddress;
  method: PaymentMethod;
  config: SiteConfig | null;
  coupon: AppliedCoupon | null;
  note: string;
  totals: Totals;
  cartUnavailable: boolean;
  onEditDelivery: () => void;
  onEditPayment: () => void;
  onPlaceOrder: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const methodLabel =
    method === 'razorpay'
      ? config?.payments.mode === 'test'
        ? 'Razorpay secure checkout · test mode'
        : 'Razorpay secure checkout'
      : 'Development test payment (no money moves)';

  return (
    <CheckoutPanel className="p-5 sm:p-6">
      <SectionHeading
        step="Step three"
        title="Review and place your order"
        description="Check the delivery details and payment method. The server recalculates stock, coupon, shipping and the final payable amount when you place the order."
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="border border-[#E3D9C9] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A8179]">Delivery address</h3>
            <EditButton onClick={onEditDelivery} />
          </div>
          <p className="mt-2 text-[13px] font-medium text-[#234638]">{address.fullName}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#5E675F]">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}
            <br />
            {address.city}, {address.state} {address.pincode}
            <br />
            +91 {address.phone}
          </p>
        </div>

        <div className="border border-[#E3D9C9] p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A8179]">Payment</h3>
            <EditButton onClick={onEditPayment} />
          </div>
          <p className="mt-2 text-[13px] font-medium text-[#234638]">{methodLabel}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#5E675F]">
            {method === 'razorpay'
              ? 'After the order is saved you will be asked to pay in Razorpay’s secure window. The order is confirmed only after server-side verification.'
              : 'The order is saved first, then marked paid through the local development simulation. This order is a demo, not a real sale.'}
          </p>
        </div>
      </div>

      <div className="mt-4 border border-[#E3D9C9]">
        <div className="flex items-center justify-between gap-3 border-b border-[#EDE5D8] px-4 py-2.5">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A8179]">
            Items · {cart.itemCount}
          </h3>
          <Link
            to="/cart"
            className="text-[11px] text-[#6B7269] underline decoration-[#C9BFB0] underline-offset-4 hover:text-[#234638]"
          >
            Edit bag
          </Link>
        </div>
        <ul className="divide-y divide-[#F0E9DE] px-4">
          {cart.lines.map((line) => (
            <li key={line.productId} className="flex items-baseline justify-between gap-4 py-2.5 text-[12px]">
              <span className="min-w-0">
                <span className="block truncate text-[#234638]">{line.name}</span>
                <span className="text-[10.5px] text-[#7A8179]">
                  {line.sellerName} · Qty {line.quantity}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-[#234638]">{formatINR(line.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
      </div>

      {coupon ? (
        <p className="mt-4 border border-[#234638]/20 bg-[#234638]/[0.04] px-4 py-2.5 text-[11.5px] text-[#234638]">
          Coupon <span className="font-semibold">{coupon.code}</span> applied — {formatINR(totals.discountPaise)} off. It will
          be checked once more on the server.
        </p>
      ) : null}

      {note ? (
        <div className="mt-4 border-l-2 border-[#D98060] bg-[#FBF8F2] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A8179]">Delivery instructions</p>
          <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-[#5E675F]">{note}</p>
        </div>
      ) : null}

      <div className="mt-4 flex items-baseline justify-between border border-[#E3D9C9] bg-[#FBF8F2] px-4 py-3">
        <span className="text-[12.5px] text-[#5E675F]">Total payable</span>
        <span className="font-serif text-[26px] leading-none text-[#234638]">{formatINR(totals.totalPaise)}</span>
      </div>

      {cartUnavailable ? (
        <div className="mt-4">
          <Alert tone="error" title="One or more items are no longer available">
            Return to your bag and remove or replace the unavailable item before placing the order.{' '}
            <Link to="/cart" className="underline underline-offset-2">
              Edit bag
            </Link>
          </Alert>
        </div>
      ) : null}

      {method === 'development' ? (
        <div className="mt-4">
          <Alert tone="warning" title="Development simulation">
            Placing this order creates a demonstration order. No payment provider is contacted, no money moves, and the order
            will be labelled as a demo. Do not use this for a real purchase.
          </Alert>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 border-t border-[#EDE5D8] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <BackLink onClick={onEditPayment}>Payment method</BackLink>
        <div className="w-full sm:w-auto">
          <CheckoutAction
            type="button"
            onClick={onPlaceOrder}
            loading={submitting}
            disabled={cartUnavailable}
            fullWidth
          >
            Place order
            <span className="opacity-70">·</span>
            <span className="tabular-nums">{formatINR(totals.totalPaise)}</span>
          </CheckoutAction>
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-[#7A8179]">
        By placing this order you accept the{' '}
        <Link to="/policies/terms" className="underline underline-offset-2 hover:text-[#234638]">
          terms
        </Link>{' '}
        and{' '}
        <Link to="/policies/returns" className="underline underline-offset-2 hover:text-[#234638]">
          returns policy
        </Link>
        . These documents are drafts pending legal review. Your order is confirmed only after the server records payment.
      </p>
    </CheckoutPanel>
  );
}
