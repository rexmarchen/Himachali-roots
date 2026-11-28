import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatINR } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useCartQuery } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePageMeta } from '@/lib/usePageMeta';
import { useKeyboardOpen } from '@/lib/useKeyboardOpen';
import {
  Alert,
  Breadcrumbs,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingBlock,
  PageHeader,
} from '@/components/ui';

export function CartPage() {
  const cartQuery = useCartQuery();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user, config } = useAuth();
  const keyboardOpen = useKeyboardOpen();

  const updateQuantity = useMutation({
    mutationFn: ({ productId, variantId, quantity }: { productId: string; variantId?: string | null; quantity: number }) =>
      api('/cart/items/' + encodeURIComponent(productId), {
        method: 'PATCH',
        body: { quantity, ...(variantId ? { variantId } : {}) },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const removeItem = useMutation({
    mutationFn: ({ productId, variantId }: { productId: string; variantId?: string | null }) =>
      api('/cart/items/' + encodeURIComponent(productId) + (variantId ? `?variantId=${encodeURIComponent(variantId)}` : ''), {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.push('Item removed from your bag.');
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const cart = cartQuery.data?.cart;
  const remainingForFreeShipping = cart ? Math.max(0, cart.freeShippingThresholdPaise - cart.subtotalPaise) : 0;
  const progress = cart ? Math.min(100, Math.round((cart.subtotalPaise / cart.freeShippingThresholdPaise) * 100)) : 0;
  const hasLines = Boolean(cart && cart.lines.length > 0);
  const totalSavingsPaise = cart
    ? cart.lines.reduce(
        (sum, line) =>
          line.originalUnitPricePaise && line.originalUnitPricePaise > line.unitPricePaise
            ? sum + (line.originalUnitPricePaise - line.unitPricePaise) * line.quantity
            : sum,
        0,
      )
    : 0;

  usePageMeta({
    title: 'Your bag · Dear Hills',
    description: 'Review the authentic Himalayan products in your Dear Hills bag before checkout.',
    canonicalPath: '/cart',
    noindex: true,
  });

  return (
    <div className={`mx-auto max-w-7xl px-3.5 py-5 sm:px-6 lg:px-8 lg:py-12 ${hasLines ? 'pb-28 lg:pb-12' : ''}`}>
      <div className="hidden sm:block">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Bag' }]} />
      </div>
      <div className="md:hidden mb-4 rounded-2xl bg-gradient-to-r from-[#0F4C3A] to-[#166D55] p-4 text-white shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">Your Shopping Bag</p>
        <h1 className="mt-1 font-serif text-2xl font-medium text-white">
          {hasLines ? `${cart?.itemCount} Item${cart?.itemCount === 1 ? '' : 's'} Ready` : 'The Bag'}
        </h1>
        {totalSavingsPaise > 0 ? (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
            ✨ Saving {formatINR(totalSavingsPaise)} on festive pricing
          </p>
        ) : null}
      </div>
      <PageHeader className="hidden md:flex" eyebrow="Your selection" title="The bag" lede="Stock is not reserved until you place the order. You can review delivery and payment on the next step." />

      {cartQuery.isLoading ? (
        <div className="mt-8"><LoadingBlock rows={3} /></div>
      ) : cartQuery.isError ? (
        <div className="mt-8"><ErrorState onRetry={() => void cartQuery.refetch()} /></div>
      ) : !cart || cart.lines.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            eyebrow="Nothing here yet"
            title="Your bag is empty"
            body="Browse the shelves for shawls, tea, honey, orchard fruit and small mountain goods. Guest bags are kept for this browser."
            action={<LinkButton to="/shop">Browse the catalogue</LinkButton>}
          />
        </div>
      ) : (
        <div className="mt-5 md:mt-10 grid gap-6 md:gap-10 lg:grid-cols-[1.4fr_0.6fr] lg:gap-14">
          <div>
            {remainingForFreeShipping === 0 && cart.freeShippingThresholdPaise > 0 ? (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 md:hidden">
                <span>🎉 Free delivery unlocked on this order!</span>
              </div>
            ) : remainingForFreeShipping > 0 ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 md:hidden">
                <div className="flex items-center justify-between text-xs font-semibold text-amber-950">
                  <span>Add {formatINR(remainingForFreeShipping)} for FREE shipping</span>
                  <span className="tabular-nums">{progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/70">
                  <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}

            {cart.hasUnavailable ? (
              <div className="mb-5">
                <Alert tone="warning" title="One item needs attention">
                  An item in your bag is no longer available in the requested quantity. Update or remove it before checkout.
                </Alert>
              </div>
            ) : null}

            <ul className="space-y-3 md:space-y-0 md:border-t md:border-line">
              {cart.lines.map((line) => (
                <li key={`${line.productId}::${line.variantId ?? ''}`} className="flex gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:border-line md:bg-transparent md:px-0 md:py-5 md:shadow-none sm:gap-5">
                  <Link to={`/shop/${line.slug}`} className="h-24 w-24 md:h-28 md:w-24 shrink-0 overflow-hidden rounded-xl md:rounded-none bg-sand/40">
                    {line.imageUrl ? (
                      <img src={line.imageUrl} alt={line.imageAlt ?? line.name} className="h-full w-full object-cover" />
                    ) : null}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5 sm:flex-row">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0F766E] md:text-muted md:font-normal">{line.sellerName}</p>
                      <h2 className="mt-0.5 font-serif text-base md:text-lg font-semibold md:font-normal leading-snug text-forest">
                        <Link to={`/shop/${line.slug}`} className="hover:text-terra">{line.name}</Link>
                      </h2>
                      {line.variantLabel ? (
                        <p className="mt-0.5 inline-flex items-center rounded-sm bg-sand/30 px-2 py-0.5 text-[10.5px] font-medium text-forest">
                          Option: {line.variantLabel}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted">
                        {formatINR(line.unitPricePaise)} each
                        {line.originalUnitPricePaise ? (
                          <span className="ml-1.5 line-through">{formatINR(line.originalUnitPricePaise)}</span>
                        ) : null}
                        {line.stock <= 3 ? ` · only ${line.stock} left` : ''}
                      </p>
                      {line.originalUnitPricePaise ? (
                        <p className="mt-1 text-[11px] text-terra">Festive promotional price applied.</p>
                      ) : null}
                      {line.status !== 'approved' ? (
                        <p className="mt-2 text-[11px] text-terra">This listing is no longer published.</p>
                      ) : line.quantity > line.stock ? (
                        <p className="mt-2 text-[11px] text-terra">Only {line.stock} available. Reduce the quantity to continue.</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem.mutate({ productId: line.productId, variantId: line.variantId })}
                        disabled={removeItem.isPending}
                        className="mt-1 inline-flex min-h-11 items-center text-[11px] text-muted underline underline-offset-4 hover:text-terra disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                      <div className="flex h-11 items-center border border-sand bg-surface">
                        <button
                          type="button"
                          onClick={() => updateQuantity.mutate({ productId: line.productId, variantId: line.variantId, quantity: Math.max(1, line.quantity - 1) })}
                          className="h-full min-w-11 px-3 text-muted hover:text-ink disabled:opacity-40"
                          disabled={updateQuantity.isPending || line.quantity <= 1}
                          aria-label={`Decrease quantity of ${line.name}`}
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-xs tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity.mutate({ productId: line.productId, variantId: line.variantId, quantity: Math.min(line.maxQuantity, line.quantity + 1) })}
                          className="h-full min-w-11 px-3 text-muted hover:text-ink disabled:opacity-40"
                          disabled={updateQuantity.isPending || line.quantity >= line.maxQuantity}
                          aria-label={`Increase quantity of ${line.name}`}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-sm font-medium">{formatINR(line.lineTotalPaise)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Link to="/shop" className="mt-5 inline-block text-xs text-muted underline underline-offset-4 hover:text-forest">
              Continue browsing
            </Link>
          </div>

          <aside>
            <div className="sticky top-32 border border-line bg-surface p-5">
              <h2 className="font-serif text-xl text-forest">Order summary</h2>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Subtotal ({cart.itemCount} item{cart.itemCount === 1 ? '' : 's'})</dt>
                  <dd>{formatINR(cart.subtotalPaise)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Shipping estimate</dt>
                  <dd>{cart.shippingEstimatePaise === 0 ? 'Complimentary' : formatINR(cart.shippingEstimatePaise)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-medium">
                  <dt>Estimated total</dt>
                  <dd>{formatINR(cart.subtotalPaise + cart.shippingEstimatePaise)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                GST is included in listed prices. Coupons and the final amount are confirmed on the checkout step. Stock is
                reserved for 30 minutes once the order is placed.
              </p>

              <div className="mt-5">
                <div className="h-1 w-full bg-sand/60">
                  <div className="h-full bg-forest transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {remainingForFreeShipping > 0
                    ? `${formatINR(remainingForFreeShipping)} more for complimentary shipping`
                    : 'Complimentary shipping applied'}
                </p>
              </div>

              {user ? (
                <LinkButton to="/checkout" size="lg" className="mt-5 w-full">
                  Continue to checkout
                </LinkButton>
              ) : (
                <>
                  <LinkButton to={`/login?next=${encodeURIComponent('/checkout')}`} size="lg" className="mt-5 w-full">
                    Sign in to checkout
                  </LinkButton>
                  <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
                    Checkout requires an account so the order, seller and refund records have an owner. Guest checkout is
                    not supported in this build.
                  </p>
                </>
              )}
              <div className="mt-5 border-t border-line pt-4 text-[10.5px] leading-relaxed text-muted">
                <p>
                  {config?.payments.configured
                    ? 'Secure online payment · UPI, cards & netbanking via Razorpay'
                    : 'Secure online payment enabled when gateway is configured'}
                </p>
                <p className="mt-1">Need help? <Link to="/contact" className="underline underline-offset-2">Contact support</Link></p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {hasLines && cart && !keyboardOpen ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/98 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_24px_rgba(15,23,42,0.12)] backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                {cart.shippingEstimatePaise === 0 ? 'Free Shipping · ' : ''}{cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}
              </p>
              <p className="font-serif text-xl font-bold text-slate-950 tabular-nums">
                {formatINR(cart.subtotalPaise + cart.shippingEstimatePaise)}
              </p>
            </div>
            {user ? (
              <LinkButton to="/checkout" size="md" className="shrink-0 rounded-xl !border-[#F59E0B] !bg-gradient-to-r !from-[#FF9F00] !to-[#F59E0B] !text-slate-950 font-bold shadow-sm">
                Continue to Checkout →
              </LinkButton>
            ) : (
              <LinkButton to={`/login?next=${encodeURIComponent('/checkout')}`} size="md" className="shrink-0 rounded-xl !border-[#0F766E] !bg-[#0F766E] !text-white font-bold shadow-sm">
                Sign in &amp; Checkout →
              </LinkButton>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
