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
  showAddToCart = true,
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
    <article className="group relative flex flex-col justify-between">
      <div>
        <div className="frame aspect-[4/5] w-full">
          <Link to={`/shop/${product.slug}`} className="block h-full w-full" aria-label={`View ${product.name}`}>
            {product.imageUrl && !imageError ? (
              <img
                src={product.imageUrl}
                alt={product.imageAlt ?? product.name}
                loading={priority ? 'eager' : 'lazy'}
                onError={() => setImageError(true)}
                className="img-brand h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(120%_90%_at_50%_0%,#efe7d8_0%,#e2d5c0_100%)] p-5 text-center">
                <span className="font-serif text-5xl leading-none text-forest/25" aria-hidden>
                  {product.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted/80">
                  {product.categoryName ?? 'Himachal Pradesh'}
                </span>
              </div>
            )}
          </Link>

          {/* Badges */}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
            {soldOut ? (
              <span className="rounded-full bg-paper/95 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ink shadow-soft">
                Sold out
              </span>
            ) : null}
            {discountPercent ? (
              <span className="rounded-full bg-terra px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-soft">
                {campaignOriginal ? `${discountPercent}% off` : `${discountPercent}% less`}
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
            className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200 ${
              isSaved
                ? 'border-terra bg-terra text-white shadow-soft'
                : 'border-white/50 bg-paper/85 text-ink/70 hover:bg-paper hover:text-terra'
            }`}
          >
            <svg viewBox="0 0 20 20" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" className="h-4 w-4">
              <path
                d="M10 16.5l-6-6a4.2 4.2 0 0 1 0-6 4.2 4.2 0 0 1 6 0l0 0 0 0a4.2 4.2 0 0 1 6 0 4.2 4.2 0 0 1 0 6l-6 6Z"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Quick add — slides up on hover (desktop) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-3 p-3 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 sm:block">
            <button
              type="button"
              onClick={() => addToCart.mutate()}
              disabled={soldOut || addToCart.isPending}
              className="pointer-events-auto w-full rounded-full bg-paper/95 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-forest shadow-lift backdrop-blur transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:text-muted"
            >
              {soldOut ? 'Sold out' : addToCart.isPending ? 'Adding…' : 'Add to bag'}
            </button>
          </div>

          {/* Quick add — compact on touch */}
          {!soldOut ? (
            <button
              type="button"
              onClick={() => addToCart.mutate()}
              disabled={addToCart.isPending}
              aria-label={`Add ${product.name} to bag`}
              className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-paper/95 text-forest shadow-soft transition-colors hover:bg-paper sm:hidden"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* Content */}
        <div className="mt-4 flex flex-col">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-terra">
            {product.sellerName}
          </p>

          <h3 className="mt-1.5 line-clamp-2 font-serif text-[17px] font-medium leading-snug text-forest sm:text-[18.5px]">
            <Link to={`/shop/${product.slug}`} className="transition-colors duration-150 hover:text-terra">
              {product.name}
            </Link>
          </h3>

          <p className="mt-1 truncate text-[12.5px] text-muted">
            {product.region ? <span className="text-terra/80">{product.region} · </span> : null}
            {product.categoryName}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-t border-line/60 pt-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-tight text-ink sm:text-[18px]">{formatINR(product.pricePaise)}</span>
          {strikePrice ? <span className="text-[13px] text-muted/70 line-through">{formatINR(strikePrice)}</span> : null}
        </div>

        {product.ratingCount > 0 && product.ratingAverage ? (
          <div className="flex items-center gap-1 text-[12px] font-medium text-muted">
            <span className="text-terra">★</span>
            <span className="font-medium text-ink">{product.ratingAverage.toFixed(1)}</span>
            <span className="text-muted/60">({product.ratingCount})</span>
          </div>
        ) : !soldOut && product.stock <= 3 ? (
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-warning">Only {product.stock} left</span>
        ) : null}
      </div>

      {showAddToCart ? (
        <button
          type="button"
          onClick={() => addToCart.mutate()}
          disabled={soldOut || addToCart.isPending}
          className="mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-forest bg-forest px-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-paper shadow-sm transition-all duration-200 hover:bg-forest-deep hover:shadow active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra disabled:cursor-not-allowed disabled:border-line disabled:bg-sand/40 disabled:text-muted"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M4 6h12l1.2 11H2.8L4 6z" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M7 6V4.5a3 3 0 0 1 6 0V6" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>{soldOut ? 'Sold out' : addToCart.isPending ? 'Adding…' : 'Add to bag'}</span>
        </button>
      ) : null}
    </article>
  );
}

export function ProductGrid({ products, showAddToCart = true }: { products: ProductSummary[]; showAddToCart?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-12 md:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 4} showAddToCart={showAddToCart} />
      ))}
    </div>
  );
}
