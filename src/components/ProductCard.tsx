import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useCartQuery } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { useInView } from '@/lib/useInView';

export function ProductCard({
  product,
  priority = false,
  showAddToCart = false,
}: {
  product: ProductSummary;
  priority?: boolean;
  showAddToCart?: boolean;
}) {
  const { user, config } = useAuth();
  const cartQuery = useCartQuery();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [imageError, setImageError] = useState(false);

  const qtyInCart = cartQuery.data?.cart.lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  const freeShippingThreshold = config?.shipping.freeThresholdPaise ?? 69900;
  const freeDeliveryEligible = freeShippingThreshold > 0 && product.pricePaise >= freeShippingThreshold;

  const wishlist = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api<{ items: { productId: string }[] }>('/account/wishlist'),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  });

  const isSaved = wishlist.data?.items.some((item) => item.productId === product.id) ?? false;

  const toggleWishlist = useMutation({
    mutationFn: async (currentlySaved: boolean) => {
      if (!user) {
        navigate('/login');
        return;
      }
      await api(`/account/wishlist/${product.id}`, { method: currentlySaved ? 'DELETE' : 'POST' });
    },
    onSuccess: async (_data, currentlySaved) => {
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.push(currentlySaved ? 'Removed from saved items.' : 'Saved to your wishlist.');
    },
    onError: (err) => toast.push(errorMessage(err), 'error'),
  });

  const soldOut = product.stock <= 0;
  // A live campaign price is the authoritative selling price supplied by the
  // server. The pre-campaign price is only shown when the server confirms a
  // valid promotion, never inferred in the browser.
  const campaignOriginal =
    product.originalPricePaise && product.originalPricePaise > product.pricePaise ? product.originalPricePaise : null;
  const compareOriginal =
    product.compareAtPricePaise && product.compareAtPricePaise > product.pricePaise ? product.compareAtPricePaise : null;
  const strikePrice = campaignOriginal ?? compareOriginal;
  const discountPercent =
    campaignOriginal && product.discountPercent
      ? product.discountPercent
      : compareOriginal
        ? Math.round(((compareOriginal - product.pricePaise) / compareOriginal) * 100)
        : null;

  const addToCart = useMutation({
    mutationFn: () => api('/cart/items', { method: 'POST', body: { productId: product.id, quantity: 1 } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.push(`${product.name} added to your bag.`);
    },
    onError: (err) => toast.push(errorMessage(err), 'error'),
  });

  return (
    <article className="group relative flex flex-col justify-between transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-forest/5 hover:border-terra/40 bg-white rounded-2xl sm:rounded-lg border border-slate-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.04)] p-2 sm:p-2.5 sm:border-[#E4DACE]/60 sm:bg-white/95 sm:shadow-[0_1px_4px_rgba(23,35,33,0.03)] h-full w-full min-w-0">
      <div>
        <div className="relative aspect-square sm:aspect-[4/5] w-full overflow-hidden rounded-xl sm:rounded-sm bg-gradient-to-b from-[#FAF7F2] to-[#F1E9DE] border border-slate-100 sm:border-line/60">
          <Link to={`/shop/${product.slug}`} className="block h-full w-full" aria-label={`View ${product.name}`}>
            {product.imageUrl && !imageError ? (
              <img
                src={product.imageUrl}
                alt={product.imageAlt ?? product.name}
                loading={priority ? 'eager' : 'lazy'}
                onError={() => setImageError(true)}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-2.5 text-center text-xs text-muted bg-sand/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5 text-muted/70 mb-1" aria-hidden>
                  <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                  <path d="M21 15l-5-5L5 21" strokeWidth="1.5" />
                </svg>
                <span className="text-[10px]">No photo</span>
              </div>
            )}
          </Link>

          {/* Badges */}
          <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1 pointer-events-none">
            {discountPercent ? (
              <span className="rounded-md bg-gradient-to-r from-[#E11D48] to-[#F97316] sm:bg-none sm:bg-[#C96B4B] px-1.5 py-0.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                {discountPercent}% OFF
              </span>
            ) : null}
            {product.giTagged ? (
              <span className="sm:hidden rounded-md bg-emerald-600/95 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-xs">
                ✓ GI
              </span>
            ) : null}
            {soldOut ? (
              <span className="rounded-md border border-ink/20 bg-paper/95 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink shadow-xs">
                Sold out
              </span>
            ) : null}
          </div>

          {/* Wishlist button (44px Android touch target) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleWishlist.mutate(isSaved);
            }}
            aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            className={`absolute right-1.5 top-1.5 sm:right-2 sm:top-2 flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 hover:scale-105 active:scale-90 ${
              isSaved
                ? 'animate-heart-pop border-rose-500 bg-rose-500 sm:border-terra sm:bg-terra text-white shadow-sm'
                : 'border-slate-200/90 sm:border-[#E4DACE]/80 bg-white/95 backdrop-blur-sm sm:bg-paper/90 text-slate-600 sm:text-ink/75 hover:bg-paper hover:text-terra shadow-xs'
            }`}
          >
            <svg viewBox="0 0 20 20" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" className={`h-[18px] w-[18px] transition-transform ${isSaved ? 'animate-heart-pop' : ''}`}>
              <path
                d="M10 16.5l-6-6a4.2 4.2 0 0 1 0-6 4.2 4.2 0 0 1 6 0l0 0 0 0a4.2 4.2 0 0 1 6 0 4.2 4.2 0 0 1 0 6l-6 6Z"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="mt-2 sm:mt-3 flex flex-col">
          <div className="flex items-center justify-between gap-1.5 text-[9.5px] sm:text-[10.5px] uppercase tracking-[0.1em] text-muted">
            <span className="min-w-0 truncate font-bold text-[#0F766E] sm:text-[#B96243]">{product.sellerName}</span>
            {product.region ? (
              <span className="shrink-0 truncate max-w-[44%] rounded-full bg-amber-50 sm:bg-transparent px-1.5 py-0.5 sm:p-0 text-right text-[9px] sm:text-[10px] font-semibold sm:font-normal text-amber-800 sm:text-muted">
                {product.region}
              </span>
            ) : null}
          </div>

          <h3 className="mt-1 line-clamp-2 text-[13px] sm:text-[17px] font-semibold sm:font-normal leading-snug text-slate-900 sm:text-[#172321] group-hover:text-terra transition-colors min-h-[34px] sm:min-h-[44px]">
            <Link to={`/shop/${product.slug}`} className="hover:text-terra transition-colors duration-150">
              {product.name}
            </Link>
          </h3>

          <div className="mt-1 flex items-center justify-between gap-1.5 text-[10.5px] sm:text-[11px] text-muted">
            <span className="min-w-0 truncate text-slate-500 sm:text-muted/85">
              {product.categoryName}
              {product.campaignName ? <span className="text-rose-600 sm:text-terra font-medium"> · {product.campaignName}</span> : null}
            </span>
            {product.ratingCount > 0 && product.ratingAverage ? (
              <span className="sm:hidden inline-flex items-center gap-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[9.5px] font-bold text-white shrink-0 tabular-nums shadow-2xs">
                {product.ratingAverage.toFixed(1)} ★ <span className="font-normal text-white/90">({product.ratingCount})</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-t border-slate-100 pt-2 sm:mt-2.5 sm:border-line/50 sm:pt-2.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-[15px] sm:text-[15px] font-extrabold sm:font-semibold text-slate-950 sm:text-[#172321] tabular-nums">
              {formatINR(product.pricePaise)}
            </span>
            {strikePrice ? (
              <span className="text-[10.5px] sm:text-xs text-slate-400 sm:text-muted/75 line-through tabular-nums">
                {formatINR(strikePrice)}
              </span>
            ) : null}
          </div>

          <div className="shrink-0">
            {product.ratingCount > 0 && product.ratingAverage ? (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted tabular-nums">
                <span className="text-terra">★</span>
                <span className="font-medium text-ink">{product.ratingAverage.toFixed(1)}</span>
                <span className="text-muted/60">({product.ratingCount})</span>
              </div>
            ) : !soldOut && product.stock <= 3 ? (
              <span className="text-[10px] sm:text-[10.5px] font-semibold text-orange-600 sm:text-warning">Only {product.stock} left</span>
            ) : freeDeliveryEligible && !soldOut ? (
              <span className="sm:hidden text-[9.5px] font-bold text-emerald-700">Free Delivery</span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => addToCart.mutate()}
          disabled={soldOut || addToCart.isPending}
          className={`mt-2 inline-flex min-h-11 sm:min-h-10 w-full items-center justify-center gap-1.5 rounded-xl sm:rounded-sm border px-3 py-2 text-[11.5px] sm:text-[11px] font-bold sm:font-semibold tracking-wide sm:uppercase sm:tracking-[0.14em] transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 sm:disabled:border-line sm:disabled:bg-sand/40 disabled:text-muted ${
            qtyInCart > 0
              ? 'border-emerald-700 bg-emerald-700 text-white sm:border-forest sm:bg-forest sm:text-paper'
              : 'border-[#F59E0B] bg-gradient-to-r from-[#FF9F00] to-[#F59E0B] text-slate-950 shadow-2xs sm:shadow-none sm:bg-none sm:border-forest sm:bg-forest sm:text-paper hover:brightness-95 sm:hover:bg-forest/90'
          } ${
            showAddToCart ? '' : 'sm:hidden'
          }`}
          aria-label={`Add ${product.name} to bag`}
        >
          {soldOut
            ? 'Out of stock'
            : addToCart.isPending
              ? 'Adding…'
              : qtyInCart > 0
                ? `In Bag (${qtyInCart}) · +1`
                : 'Add to Cart'}
        </button>
      </div>
    </article>
  );
}

function ProductGridItem({
  product,
  index,
  showAddToCart,
}: {
  product: ProductSummary;
  index: number;
  showAddToCart: boolean;
}) {
  const { ref, isInView } = useInView({ threshold: 0.05, rootMargin: '0px 0px -30px 0px' });

  return (
    <div
      ref={ref}
      className={`flex flex-col h-full transition-all duration-500 ease-out transform ${
        isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: isInView ? `${(index % 4) * 75}ms` : '0ms' }}
    >
      <ProductCard product={product} priority={index < 4} showAddToCart={showAddToCart} />
    </div>
  );
}

export function ProductGrid({ products, showAddToCart = false }: { products: ProductSummary[]; showAddToCart?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-x-6 sm:gap-y-11 md:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <ProductGridItem key={product.id} product={product} index={index} showAddToCart={showAddToCart} />
      ))}
    </div>
  );
}
