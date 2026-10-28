import { Link } from 'react-router-dom';
import type { CartView } from '@shared/types';
import { formatINR } from '@shared/types';
import { Input } from '@/components/ui';
import { CheckoutAction, ProductThumb } from './CheckoutParts';
import type { AppliedCoupon, Totals } from './checkoutUtils';

export function OrderSummary({
  cart,
  totals,
  coupon,
  couponInput,
  couponError,
  applyingCoupon,
  onCouponInput,
  onApplyCoupon,
  onRemoveCoupon,
}: {
  cart: CartView;
  totals: Totals;
  coupon: AppliedCoupon | null;
  couponInput: string;
  couponError: string | null;
  applyingCoupon: boolean;
  onCouponInput: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
}) {
  return (
    <div className="border border-line bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="font-serif text-[22px] text-forest">Order summary</h2>
        <Link
          to="/cart"
          className="text-[11.5px] text-muted underline decoration-line underline-offset-4 transition-colors hover:text-forest"
        >
          Edit bag
        </Link>
      </div>

      <ul className="divide-y divide-line px-5">
        {cart.lines.map((line) => (
          <li key={line.productId} className="flex gap-3 py-3.5">
            <ProductThumb line={line} size="sm" />
            <div className="min-w-0 flex-1">
              <Link
                to={`/products/${line.slug}`}
                className="block truncate text-[12.5px] font-medium text-forest hover:underline hover:underline-offset-2"
              >
                {line.name}
              </Link>
              <p className="mt-0.5 truncate text-[10.5px] text-muted">{line.sellerName}</p>
              <p className="mt-0.5 text-[10.5px] text-muted">
                Qty {line.quantity} · {formatINR(line.unitPricePaise)} each
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12.5px] tabular-nums text-forest">{formatINR(line.lineTotalPaise)}</p>
              {line.originalUnitPricePaise && line.originalUnitPricePaise > line.unitPricePaise ? (
                <p className="text-[10px] tabular-nums text-muted line-through">
                  {formatINR(line.originalUnitPricePaise * line.quantity)}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-line px-5 py-4">
        {totals.amountToFreeShippingPaise > 0 ? (
          <p className="text-[11px] leading-relaxed text-muted">
            Add <span className="font-semibold text-forest">{formatINR(totals.amountToFreeShippingPaise)}</span> more to
            reach complimentary shipping. Orders of {formatINR(cart.freeShippingThresholdPaise)} or more after discounts
            ship free.
          </p>
        ) : totals.shippingPaise === 0 && cart.subtotalPaise > 0 ? (
          <p className="text-[11px] text-forest">Complimentary shipping applied.</p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted">
            A flat shipping fee applies to orders below {formatINR(cart.freeShippingThresholdPaise)} after discounts.
          </p>
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        {coupon ? (
          <div className="border border-forest/20 bg-forest/[0.045] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11.5px] font-semibold text-forest">Coupon {coupon.code}</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                  {coupon.description ?? 'Validated against your account and live bag.'} Saving{' '}
                  {formatINR(coupon.discountPaise)}.
                </p>
              </div>
              <button
                type="button"
                onClick={onRemoveCoupon}
                className="shrink-0 text-[10.5px] text-muted underline underline-offset-2 hover:text-forest"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="checkout-coupon" className="text-[11px] font-medium text-ink">
              Coupon code
            </label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="checkout-coupon"
                value={couponInput}
                onChange={(event) => onCouponInput(event.target.value.toUpperCase().replace(/\s/g, ''))}
                placeholder="Enter code"
                maxLength={40}
                autoComplete="off"
                aria-invalid={couponError ? true : undefined}
                aria-describedby="checkout-coupon-help"
                className="h-10 text-[12px] uppercase tracking-[0.06em]"
                invalid={Boolean(couponError)}
              />
              <CheckoutAction
                type="button"
                variant="secondary"
                onClick={onApplyCoupon}
                loading={applyingCoupon}
                disabled={couponInput.trim().length < 2}
                className="h-10 shrink-0 px-4 text-[12px]"
              >
                Apply
              </CheckoutAction>
            </div>
            <p
              id="checkout-coupon-help"
              className={`mt-1.5 text-[10px] leading-relaxed ${couponError ? 'text-danger' : 'text-muted'}`}
              role={couponError ? 'alert' : undefined}
            >
              {couponError ?? 'Coupons are rechecked against the live bag before the order is placed.'}
            </p>
          </div>
        )}
      </div>

      <dl className="space-y-2.5 border-t border-line px-5 py-4 text-[12.5px]" aria-live="polite">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Subtotal</dt>
          <dd className="tabular-nums text-forest">{formatINR(totals.subtotalPaise)}</dd>
        </div>
        {totals.discountPaise > 0 ? (
          <div className="flex justify-between gap-4 text-forest">
            <dt>Coupon discount</dt>
            <dd className="tabular-nums">−{formatINR(totals.discountPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Shipping</dt>
          <dd className="tabular-nums text-forest">
            {totals.shippingPaise === 0 ? 'Complimentary' : formatINR(totals.shippingPaise)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">GST</dt>
          <dd className="text-[11px] text-muted">Included in item prices</dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <dt className="text-[13px] font-semibold text-forest">Total payable</dt>
          <dd className="font-serif text-[24px] leading-none text-forest" data-testid="checkout-total">
            {formatINR(totals.totalPaise)}
          </dd>
        </div>
      </dl>

      {totals.savingsPaise > 0 ? (
        <p className="border-t border-line px-5 py-3 text-[11px] text-danger">
          You save {formatINR(totals.savingsPaise)} on this order.
        </p>
      ) : null}

      <p className="border-t border-line bg-paper px-5 py-3 text-[10px] leading-relaxed text-muted">
        Totals shown are an estimate. The server recalculates stock, the coupon, shipping and the final payable amount when
        the order is created.
      </p>
    </div>
  );
}
