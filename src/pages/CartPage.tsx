import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatINR } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useCartQuery } from '@/lib/session';
import { useToast } from '@/lib/toast';
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
  const { user } = useAuth();

  const updateQuantity = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      api('/cart/items/' + encodeURIComponent(productId), { method: 'PATCH', body: { quantity } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const removeItem = useMutation({
    mutationFn: (productId: string) =>
      api('/cart/items/' + encodeURIComponent(productId), { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.push('Item removed from your bag.');
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const cart = cartQuery.data?.cart;
  const remainingForFreeShipping = cart ? Math.max(0, cart.freeShippingThresholdPaise - cart.subtotalPaise) : 0;
  const progress = cart ? Math.min(100, Math.round((cart.subtotalPaise / cart.freeShippingThresholdPaise) * 100)) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Bag' }]} />
      <PageHeader eyebrow="Your selection" title="The bag" lede="Stock is not reserved until you place the order. You can review delivery and payment on the next step." />

      {cartQuery.isLoading ? (
        <div className="mt-10"><LoadingBlock rows={3} /></div>
      ) : cartQuery.isError ? (
        <div className="mt-10"><ErrorState onRetry={() => void cartQuery.refetch()} /></div>
      ) : !cart || cart.lines.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            eyebrow="Nothing here yet"
            title="Your bag is empty"
            body="Browse the shelves for shawls, tea, honey, orchard fruit and small mountain goods. Guest bags are kept for this browser."
            action={<LinkButton to="/shop">Browse the catalogue</LinkButton>}
          />
        </div>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_0.6fr] lg:gap-14">
          <div>
            {cart.hasUnavailable ? (
              <div className="mb-5">
                <Alert tone="warning" title="One item needs attention">
                  An item in your bag is no longer available in the requested quantity. Update or remove it before checkout.
                </Alert>
              </div>
            ) : null}

            <ul className="border-t border-line">
              {cart.lines.map((line) => (
                <li key={line.productId} className="flex gap-4 border-b border-line py-5 sm:gap-5">
                  <Link to={`/shop/${line.slug}`} className="h-28 w-24 shrink-0 overflow-hidden bg-sand/40">
                    {line.imageUrl ? (
                      <img src={line.imageUrl} alt={line.imageAlt ?? line.name} className="h-full w-full object-cover" />
                    ) : null}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 sm:flex-row">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.13em] text-muted">{line.sellerName}</p>
                      <h2 className="mt-1 font-serif text-lg leading-snug text-forest">
                        <Link to={`/shop/${line.slug}`} className="hover:text-terra">{line.name}</Link>
                      </h2>
                      <p className="mt-1 text-xs text-muted">
                        {formatINR(line.unitPricePaise)} each
                        {line.stock <= 3 ? ` · only ${line.stock} left` : ''}
                      </p>
                      {line.status !== 'approved' ? (
                        <p className="mt-2 text-[11px] text-terra">This listing is no longer published.</p>
                      ) : line.quantity > line.stock ? (
                        <p className="mt-2 text-[11px] text-terra">Only {line.stock} available. Reduce the quantity to continue.</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem.mutate(line.productId)}
                        disabled={removeItem.isPending}
                        className="mt-2 text-[11px] text-muted underline underline-offset-4 hover:text-terra"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                      <div className="flex h-9 items-center border border-sand bg-surface">
                        <button
                          type="button"
                          onClick={() => updateQuantity.mutate({ productId: line.productId, quantity: Math.max(1, line.quantity - 1) })}
                          className="h-full px-3 text-muted hover:text-ink"
                          aria-label={`Decrease quantity of ${line.name}`}
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-xs tabular-nums">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity.mutate({ productId: line.productId, quantity: Math.min(line.maxQuantity, line.quantity + 1) })}
                          className="h-full px-3 text-muted hover:text-ink disabled:opacity-40"
                          disabled={line.quantity >= line.maxQuantity}
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
                <p>Secure payment · Razorpay when configured</p>
                <p className="mt-1">Need help? <Link to="/contact" className="underline underline-offset-2">Contact support</Link></p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
