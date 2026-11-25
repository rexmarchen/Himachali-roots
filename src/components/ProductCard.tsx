import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
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
    <article className="group relative flex flex-col justify-between transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-forest/5 hover:border-terra/40 bg-white rounded-xl sm:rounded-lg border border-[#E4DACE]/80 shadow-[0_1px_4px_rgba(23,35,33,0.03)] p-2 sm:p-2.5 sm:border-[#E4DACE]/60 sm:bg-white/95 h-full w-full min-w-0">
      <div>
        <div className="relative aspect-square sm:aspect-[4/5] w-full overflow-hidden rounded-lg sm:rounded-sm bg-gradient-to-b from-[#FAF7F2] to-[#F1E9DE] border border-[#E4DACE]/40 sm:border-line/60">
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
              <span className="rounded bg-[#C96B4B] px-1.5 py-0.5 text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                {discountPercent}% off
              </span>
            ) : null}
            {soldOut ? (
              <span className="rounded border border-ink/20 bg-paper/95 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink shadow-xs">
                Sold out
              </span>
            ) : null}
          </div>

          {/* Wishlist button (40-44px hit box for Android comfort) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleWishlist.mutate(isSaved);
            }}
            aria-label={isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            className={`absolute right-1.5 top-1.5 sm:right-2 sm:top-2 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border transition-all duration-200 hover:scale-105 active:scale-90 ${
              isSaved
                ? 'animate-heart-pop border-terra bg-terra text-white shadow-sm'
                : 'border-[#E4DACE]/80 bg-white/95 backdrop-blur-sm sm:bg-paper/90 text-ink/75 hover:bg-paper hover:text-terra shadow-xs'
            }`}
          >
            <svg viewBox="0 0 20 20" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" className={`h-4 w-4 transition-transform ${isSaved ? 'animate-heart-pop' : ''}`}>
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
          <div className="flex items-center justify-between gap-2 text-[9.5px] sm:text-[10.5px] uppercase tracking-[0.12em] text-muted">
            <span className="min-w-0 truncate font-bold text-[#B96243]">{product.sellerName}</span>
            {product.region ? (
              <span className="shrink-0 truncate max-w-[44%] text-right text-[9.5px] sm:text-[10px]">
                {product.region}
              </span>
            ) : null}
          </div>

          <h3 className="mt-1 line-clamp-2 text-[12.5px] sm:text-[17px] font-semibold sm:font-normal leading-snug text-[#172321] group-hover:text-terra transition-colors min-h-[34px] sm:min-h-[44px]">
            <Link to={`/shop/${product.slug}`} className="hover:text-terra transition-colors duration-150">
              {product.name}
            </Link>
          </h3>

          <div className="mt-1 flex items-center justify-between gap-1.5 text-[10.5px] sm:text-[11px] text-muted">
            <span className="min-w-0 truncate text-muted/85">
              {product.categoryName}
              {product.campaignName ? <span className="text-terra"> · {product.campaignName}</span> : null}
            </span>
            {product.ratingCount > 0 && product.ratingAverage ? (
              <span className="sm:hidden inline-flex items-center gap-0.5 rounded bg-[#F4E8CE] border border-[#D4A373]/30 px-1.5 py-0.5 text-[9.5px] font-bold text-[#172321] shrink-0 tabular-nums">
                ★ {product.ratingAverage.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/40 pt-2 sm:mt-2.5 sm:border-line/50 sm:pt-2.5">
          <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline gap-0 sm:gap-2">
            <span className="text-[13.5px] sm:text-[15px] font-bold sm:font-semibold text-[#172321] tabular-nums">
              {formatINR(product.pricePaise)}
            </span>
            {strikePrice ? (
              <span className="text-[10.5px] sm:text-xs text-muted/75 line-through tabular-nums">
                {formatINR(strikePrice)}
              </span>
            ) : null}
          </div>

          {/* Desktop rating or low stock info */}
          <div className="hidden sm:block shrink-0">
            {product.ratingCount > 0 && product.ratingAverage ? (
              <div className="flex items-center gap-1 text-[11px] text-muted tabular-nums">
                <span className="text-terra">★</span>
                <span className="font-medium text-ink">{product.ratingAverage.toFixed(1)}</span>
                <span className="text-muted/60">({product.ratingCount})</span>
              </div>
            ) : !soldOut && product.stock <= 3 ? (
              <span className="text-[10.5px] font-medium text-warning">Only {product.stock} left</span>
            ) : null}
          </div>

          {/* Mobile Instant ADD Button (thumb-friendly touch target) */}
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
            className={`sm:hidden h-9 min-h-[36px] min-w-[54px] px-2.5 rounded-lg font-bold text-[10.5px] uppercase tracking-wider transition-all duration-150 active:scale-95 flex items-center justify-center gap-0.5 shrink-0 shadow-2xs ${
              soldOut
                ? 'bg-sand/30 text-muted border border-line cursor-not-allowed'
                : 'border border-[#C96B4B] bg-[#FAF3EF] text-[#B85738] hover:bg-[#C96B4B] hover:text-white'
            }`}
            aria-label={`Add ${product.name} to bag`}
          >
            {soldOut ? (
              <span>Out</span>
            ) : addToCart.isPending ? (
              <span>…</span>
            ) : (
              <>
                <span className="text-[11px] font-black leading-none">+</span>
                <span>Add</span>
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
          className="mt-3 hidden sm:inline-flex min-h-10 w-full items-center justify-center rounded-sm border border-forest bg-forest px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-paper transition-colors hover:bg-forest/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra disabled:cursor-not-allowed disabled:border-line disabled:bg-sand/40 disabled:text-muted"
        >
          {soldOut ? 'Sold out' : addToCart.isPending ? 'Adding…' : 'Add to bag'}
        </button>
      ) : null}
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
