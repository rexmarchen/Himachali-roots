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
}: {
  product: ProductSummary;
  priority?: boolean;
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
  const discountPercent =
    product.compareAtPricePaise && product.compareAtPricePaise > product.pricePaise
      ? Math.round(((product.compareAtPricePaise - product.pricePaise) / product.compareAtPricePaise) * 100)
      : null;

  return (
    <article className="group relative flex flex-col justify-between transition-all duration-300">
      <div>
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-sand/30 border border-line/60">
          <Link to={`/shop/${product.slug}`} className="block h-full w-full" aria-label={`View ${product.name}`}>
            {product.imageUrl && !imageError ? (
              <img
                src={product.imageUrl}
                alt={product.imageAlt ?? product.name}
                loading={priority ? 'eager' : 'lazy'}
                onError={() => setImageError(true)}
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-muted bg-sand/20">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-8 w-8 text-sand mb-2" aria-hidden>
                  <rect width="18" height="18" x="3" y="3" rx="2" strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="1.5" />
                  <path d="M21 15l-5-5L5 21" strokeWidth="1.5" />
                </svg>
                <span>Himalayan Craft</span>
              </div>
            )}
          </Link>

          {/* Badges */}
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5 pointer-events-none">
            {soldOut ? (
              <span className="border border-ink/20 bg-paper/95 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink shadow-xs">
                Sold out
              </span>
            ) : null}
            {discountPercent ? (
              <span className="border border-terra/30 bg-terra px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white shadow-xs">
                {discountPercent}% less
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
            className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 ${
              isSaved
                ? 'border-terra bg-terra text-white shadow-sm'
                : 'border-line/70 bg-paper/85 text-ink/70 hover:bg-paper hover:text-terra hover:scale-105'
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
        </div>

        {/* Content */}
        <div className="mt-3.5 flex flex-col">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted">
            <span className="truncate max-w-[70%]">{product.sellerName}</span>
            {product.region ? <span className="shrink-0">{product.region}</span> : null}
          </div>

          <h3 className="mt-1 line-clamp-2 font-serif text-[16px] leading-snug text-forest sm:text-[17px]">
            <Link to={`/shop/${product.slug}`} className="hover:text-terra transition-colors duration-150">
              {product.name}
            </Link>
          </h3>

          <p className="mt-0.5 text-xs text-muted/90 truncate">{product.categoryName}</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-t border-line/50 pt-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-medium text-ink">{formatINR(product.pricePaise)}</span>
          {product.compareAtPricePaise && product.compareAtPricePaise > product.pricePaise ? (
            <span className="text-xs text-muted/80 line-through">{formatINR(product.compareAtPricePaise)}</span>
          ) : null}
        </div>

        {product.ratingCount > 0 && product.ratingAverage ? (
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <span className="text-terra">★</span>
            <span className="font-medium text-ink">{product.ratingAverage.toFixed(1)}</span>
            <span className="text-muted/60">({product.ratingCount})</span>
          </div>
        ) : (
          <span className="hidden text-[10.5px] italic text-muted/70 sm:inline">Verified source</span>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-7 sm:gap-y-12 lg:grid-cols-4">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 4} />
      ))}
    </div>
  );
}
