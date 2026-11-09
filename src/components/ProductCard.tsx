import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';

export function ProductCard({
  product,
  priority = false,
  showAddToCart = false,
}: {
  product: ProductSummary;
  priority?: boolean;
  showAddToCart?: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [imageError, setImageError] = useState(false);

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
    <article className="group relative flex flex-col justify-between transition-all duration-200 bg-white rounded-lg border border-[#E4DACE]/80 shadow-[0_1px_4px_rgba(23,35,33,0.03)] p-1.5 sm:p-0 sm:border-0 sm:bg-transparent sm:shadow-none sm:rounded-none h-full">
      <div>
        <div className="relative aspect-square sm:aspect-[4/5] w-full overflow-hidden rounded-md sm:rounded-none bg-gradient-to-b from-[#FAF7F2] to-[#F1E9DE] border border-[#E4DACE]/40 sm:border-line/60">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5 text-sand mb-1" aria-hidden>
                  <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                  <path d="M21 15l-5-5L5 21" strokeWidth="1.5" />
                </svg>
                <span className="text-[9px]">No photo</span>
              </div>
            )}
          </Link>

          {/* Badges */}
          <div className="absolute left-1 top-1 flex flex-col items-start gap-0.5 pointer-events-none">
            {discountPercent ? (
              <span className="rounded sm:rounded-none bg-[#D98263] px-1 py-0.2 text-[8px] font-black uppercase tracking-wider text-white shadow-2xs">
                {discountPercent}% off
              </span>
            ) : null}
            {product.region ? (
              <span className="sm:hidden rounded-full bg-[#172321]/80 backdrop-blur-xs px-1.5 py-0.2 text-[7.5px] font-semibold text-white tracking-wider shadow-2xs">
                📍 {product.region}
              </span>
            ) : null}
            {soldOut ? (
              <span className="rounded sm:rounded-none border border-ink/20 bg-paper/95 px-1 py-0.2 text-[8px] font-semibold uppercase tracking-wider text-ink shadow-2xs">
                Sold out
              </span>
            ) : null}
          </div>

          {/* Wishlist button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleWishlist.mutate(isSaved);
            }}
            aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            className={`absolute right-1 top-1 sm:right-2 sm:top-2 flex h-6 w-6 sm:h-11 sm:w-11 min-h-[24px] min-w-[24px] sm:min-h-[44px] sm:min-w-[44px] items-center justify-center rounded-full border transition-all duration-200 active:scale-90 ${
              isSaved
                ? 'border-terra bg-terra text-white shadow-sm'
                : 'border-[#E4DACE]/80 bg-white/95 backdrop-blur-sm sm:bg-paper/90 text-ink/70 hover:bg-paper hover:text-terra shadow-2xs'
            }`}
          >
            <svg viewBox="0 0 20 20" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" className="h-2.5 w-2.5 sm:h-4 sm:w-4">
              <path
                d="M10 16.5l-6-6a4.2 4.2 0 0 1 0-6 4.2 4.2 0 0 1 6 0l0 0 0 0a4.2 4.2 0 0 1 6 0 4.2 4.2 0 0 1 0 6l-6 6Z"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="mt-1 sm:mt-3.5 flex flex-col">
          <div className="flex items-center justify-between text-[8.5px] sm:text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="truncate max-w-[70%] font-bold text-[#D98263]">{product.sellerName}</span>
            {product.region ? <span className="hidden sm:inline shrink-0">{product.region}</span> : null}
          </div>

          <h3 className="mt-0.5 line-clamp-2 text-[11px] sm:text-[17px] font-bold sm:font-normal leading-tight text-[#172321] group-hover:text-terra transition-colors min-h-[24px] sm:min-h-0">
            <Link to={`/shop/${product.slug}`} className="hover:text-terra transition-colors duration-150">
              {product.name}
            </Link>
          </h3>

          <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px] sm:text-[11px] text-muted">
            <span className="truncate text-muted/80">
              {product.categoryName}
              {product.campaignName ? <span className="text-terra"> · {product.campaignName}</span> : null}
            </span>
            {product.ratingCount > 0 && product.ratingAverage ? (
              <span className="sm:hidden inline-flex items-center gap-0.5 rounded bg-[#F4E8CE] border border-[#D4A373]/30 px-1 py-0.2 text-[8px] font-bold text-[#172321] shrink-0">
                ★ {product.ratingAverage.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <div className="mt-1 flex items-center justify-between gap-1 border-t border-line/30 pt-1 sm:mt-2.5 sm:border-line/50 sm:pt-2.5">
          <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline gap-0 sm:gap-2">
            <div className="flex items-baseline gap-1">
              <span className="text-[12.5px] sm:text-[14px] font-extrabold sm:font-medium text-[#172321]">{formatINR(product.pricePaise)}</span>
              {discountPercent ? <span className="sm:hidden text-[8.5px] font-bold text-emerald-700">{discountPercent}% off</span> : null}
            </div>
            {strikePrice ? <span className="text-[9px] sm:text-xs text-muted/70 line-through">{formatINR(strikePrice)}</span> : null}
          </div>

          {/* Desktop rating or low stock info */}
          <div className="hidden sm:block">
            {product.ratingCount > 0 && product.ratingAverage ? (
              <div className="flex items-center gap-1 text-[11px] text-muted">
                <span className="text-terra">★</span>
                <span className="font-medium text-ink">{product.ratingAverage.toFixed(1)}</span>
                <span className="text-muted/60">({product.ratingCount})</span>
              </div>
            ) : !soldOut && product.stock <= 3 ? (
              <span className="text-[10.5px] font-medium text-warning">Only {product.stock} left</span>
            ) : null}
          </div>

          {/* Mobile Instant ADD Button (Flipkart / Blinkit / Instamart style inline with price) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!soldOut && !addToCart.isPending) {
                addToCart.mutate();
              }
            }}
            disabled={soldOut || addToCart.isPending}
            className={`sm:hidden h-6 px-2 rounded-md font-black text-[9px] uppercase tracking-wider transition-all duration-150 active:scale-90 flex items-center justify-center gap-0.5 shrink-0 shadow-2xs ${
              soldOut
                ? 'bg-sand/30 text-muted border border-line cursor-not-allowed'
                : 'border border-[#D98263] bg-[#FAF3EF] text-[#D98263] hover:bg-[#D98263] hover:text-white'
            }`}
            aria-label={`Add ${product.name} to bag`}
          >
            {soldOut ? (
              <span>Out</span>
            ) : addToCart.isPending ? (
              <span>…</span>
            ) : (
              <>
                <span className="text-[10px] font-black leading-none">+</span>
                <span>ADD</span>
              </>
            )}
          </button>
        </div>
      </div>

      {showAddToCart ? (
        <button
          type="button"
          onClick={() => addToCart.mutate()}
          disabled={soldOut || addToCart.isPending}
          className="mt-3 hidden sm:block w-full border border-forest bg-forest px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-paper transition-colors hover:bg-forest/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra disabled:cursor-not-allowed disabled:border-line disabled:bg-sand/40 disabled:text-muted"
        >
          {soldOut ? 'Sold out' : addToCart.isPending ? 'Adding…' : 'Add to bag'}
        </button>
      ) : null}
    </article>
  );
}

export function ProductGrid({ products, showAddToCart = false }: { products: ProductSummary[]; showAddToCart?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-x-6 sm:gap-y-11 md:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 4} showAddToCart={showAddToCart} />
      ))}
    </div>
  );
}
