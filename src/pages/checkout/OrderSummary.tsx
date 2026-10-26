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
    <div className="border border-[#E3D9C9] bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-[#EDE5D8] px-5 py-4">
        <h2 className="font-serif text-[22px] text-[#234638]">Order summary</h2>
        <Link
          to="/cart"
          className="text-[11.5px] text-[#6B7269] underline decoration-[#C9BFB0] underline-offset-4 transition-colors hover:text-[#234638]"
        >
          Edit bag
        </Link>
      </div>

      <ul className="divide-y divide-[#F0E9DE] px-5">
        {cart.lines.map((line) => (
          <li key={line.productId} className="flex gap-3 py-3.5">
            <ProductThumb line={line} size="sm" />
            <div className="min-w-0 flex-1">
              <Link
                to={`/products/${line.slug}`}
                className="block truncate text-[12.5px] font-medium text-[#234638] hover:underline hover:underline-offset-2"
              >
                {line.name}
              </Link>
              <p className="mt-0.5 truncate text-[10.5px] text-[#7A8179]">{line.sellerName}</p>
              <p className="mt-0.5 text-[10.5px] text-[#7A8179]">
                Qty {line.quantity} · {formatINR(line.unitPricePaise)} each
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12.5px] tabular-nums text-[#234638]">{formatINR(line.lineTotalPaise)}</p>
              {line.originalUnitPricePaise && line.originalUnitPricePaise > line.unitPricePaise ? (
                <p className="text-[10px] tabular-nums text-[#9A9F97] line-through">
                  {formatINR(line.originalUnitPricePaise * line.quantity)}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-[#EDE5D8] px-5 py-4">
        {totals.amountToFreeShippingPaise > 0 ? (
          <p className="text-[11px] leading-relaxed text-[#6B7269]">
            Add <span className="font-semibold text-[#234638]">{formatINR(totals.amountToFreeShippingPaise)}</span> more to
            reach complimentary shipping. Orders of {formatINR(cart.freeShippingThresholdPaise)} or more after discounts
            ship free.
          </p>
        ) : totals.shippingPaise === 0 && cart.subtotalPaise > 0 ? (
          <p className="text-[11px] text-[#234638]">Complimentary shipping applied.</p>
        ) : (
          <p className="text-[11px] leading-relaxed text-[#6B7269]">
            A flat shipping fee applies to orders below {formatINR(cart.freeShippingThresholdPaise)} after discounts.
          </p>
        )}
      </div>

      <div className="border-t border-[#EDE5D8] px-5 py-4">
        {coupon ? (
          <div className="border border-[#234638]/20 bg-[#234638]/[0.045] px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11.5px] font-semibold text-[#234638]">Coupon {coupon.code}</p>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#6B7269]">
                  {coupon.description ?? 'Validated against your account and live bag.'} Saving{' '}
                  {formatINR(coupon.discountPaise)}.
                </p>
              </div>
              <button
                type="button"
                onClick={onRemoveCoupon}
                className="shrink-0 text-[10.5px] text-[#6B7269] underline underline-offset-2 hover:text-[#234638]"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="checkout-coupon" className="text-[11px] font-medium text-[#3F4A44]">
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
              className={`mt-1.5 text-[10px] leading-relaxed ${couponError ? 'text-[#A5502F]' : 'text-[#7A8179]'}`}
              role={couponError ? 'alert' : undefined}
            >
              {couponError ?? 'Coupons are rechecked against the live bag before the order is placed.'}
            </p>
          </div>
        )}
      </div>

      <dl className="space-y-2.5 border-t border-[#EDE5D8] px-5 py-4 text-[12.5px]" aria-live="polite">
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7269]">Subtotal</dt>
          <dd className="tabular-nums text-[#234638]">{formatINR(totals.subtotalPaise)}</dd>
        </div>
        {totals.discountPaise > 0 ? (
          <div className="flex justify-between gap-4 text-[#234638]">
            <dt>Coupon discount</dt>
            <dd className="tabular-nums">−{formatINR(totals.discountPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7269]">Shipping</dt>
          <dd className="tabular-nums text-[#234638]">
            {totals.shippingPaise === 0 ? 'Complimentary' : formatINR(totals.shippingPaise)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#6B7269]">GST</dt>
          <dd className="text-[11px] text-[#7A8179]">Included in item prices</dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-[#EDE5D8] pt-3">
          <dt className="text-[13px] font-semibold text-[#234638]">Total payable</dt>
          <dd className="font-serif text-[24px] leading-none text-[#234638]" data-testid="checkout-total">
            {formatINR(totals.totalPaise)}
          </dd>
        </div>
      </dl>

      {totals.savingsPaise > 0 ? (
        <p className="border-t border-[#EDE5D8] px-5 py-3 text-[11px] text-[#A85F3F]">
          You save {formatINR(totals.savingsPaise)} on this order.
        </p>
      ) : null}

      <p className="border-t border-[#EDE5D8] bg-[#FBF8F2] px-5 py-3 text-[10px] leading-relaxed text-[#7A8179]">
        Totals shown are an estimate. The server recalculates stock, the coupon, shipping and the final payable amount when
        the order is created.
      </p>
    </div>
  );
}
