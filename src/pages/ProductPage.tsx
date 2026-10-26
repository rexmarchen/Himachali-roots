import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductDetail } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { ProductGrid } from '@/components/ProductCard';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  ErrorState,
  LinkButton,
  Spinner,
} from '@/components/ui';

/* ---------------- Line icons ---------------- */

function MountainIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 3 4 8 5-5 5 11H2L8 3z" />
    </svg>
  );
}

function ShoppingBagIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function FlashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function TruckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="13" height="11" rx="1" />
      <path d="M15 8h4l3 3v5h-7V8z" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function ShieldCheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CreditCardIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

function Stars({ rating, className = 'text-terra' }: { rating: number; className?: string }) {
  const rounded = Math.round(rating);
  return (
    <span className={className} aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rounded)}
      <span className="text-line">{'★'.repeat(Math.max(0, 5 - rounded))}</span>
    </span>
  );
}

type DetailTab = 'story' | 'ingredients' | 'maker' | 'care' | 'shipping';

export function ProductPage() {
  const { slug = '' } = useParams();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<DetailTab>('story');
  const [showStickyBar, setShowStickyBar] = useState(false);
  const buyBoxRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { user, config } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const productQuery = useQuery({
    queryKey: ['product', slug],
    queryFn: () => api<{ product: ProductDetail }>(`/products/${encodeURIComponent(slug)}`),
    retry: false,
  });

  const wishlist = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api<{ items: { productId: string }[] }>('/account/wishlist'),
    enabled: Boolean(user),
    retry: false,
  });

  // Track scroll position to show/hide the sticky buy bar
  useEffect(() => {
    const handleScroll = () => {
      if (!buyBoxRef.current) return;
      const rect = buyBoxRef.current.getBoundingClientRect();
      setShowStickyBar(rect.bottom < 0);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const addToCart = useMutation({
    mutationFn: (qty?: number) =>
      api('/cart/items', {
        method: 'POST',
        body: { productId: productQuery.data?.product.id, quantity: qty ?? quantity },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.push(`${quantity} × ${productQuery.data?.product.name ?? 'item'} added to your bag.`);
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const buyNow = useMutation({
    mutationFn: async () => {
      await api('/cart/items', {
        method: 'POST',
        body: { productId: productQuery.data?.product.id, quantity },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      navigate(user ? '/checkout' : `/login?next=${encodeURIComponent('/checkout')}`);
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  const toggleWishlist = useMutation({
    mutationFn: async (saved: boolean) => {
      if (!productQuery.data) return;
      await api(`/account/wishlist/${productQuery.data.product.id}`, { method: saved ? 'DELETE' : 'POST' });
    },
    onSuccess: async (_result, saved) => {
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.push(saved ? 'Removed from saved items.' : 'Saved for later.');
    },
    onError: (error) => toast.push(errorMessage(error), 'error'),
  });

  if (productQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-7xl items-center justify-center">
        <Spinner className="h-7 w-7 text-forest" />
      </div>
    );
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24">
        <ErrorState
          title="This listing is not available"
          body="It may be paused, awaiting review, or removed. No order was placed."
          onRetry={() => void productQuery.refetch()}
        />
        <div className="mt-6 text-center">
          <LinkButton to="/shop" variant="secondary">
            Back to the catalogue
          </LinkButton>
        </div>
      </div>
    );
  }

  const product = productQuery.data.product;
  const image = product.images[selectedImage] ?? product.images[0];
  const isSaved = wishlist.data?.items.some((item) => item.productId === product.id) ?? false;
  const soldOut = product.stock <= 0;
  const maxQuantity = Math.max(1, Math.min(10, product.stock));
  const hasReviews = product.reviewSummary.count > 0 && product.reviewSummary.average !== null;
  const attributeEntries = Object.entries(product.attributes ?? {}).filter(
    ([key, value]) => key.trim() && value.trim(),
  );

  // Cart lines are always the real listing; no invented pack variants or
  // prices are shown here.
  const currentItemPrice = product.pricePaise;
  const campaignOriginal =
    product.originalPricePaise && product.originalPricePaise > currentItemPrice ? product.originalPricePaise : null;
  const strikeOriginalPrice =
    campaignOriginal ??
    (product.compareAtPricePaise && product.compareAtPricePaise > currentItemPrice
      ? product.compareAtPricePaise
      : null);
  const calculatedTotal = currentItemPrice * quantity;
  const freeShippingThreshold = config?.shipping.freeThresholdPaise ?? 0;
  const showFreeShipping = freeShippingThreshold > 0;
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - calculatedTotal);
  const shippingProgress = showFreeShipping
    ? Math.min(100, Math.round((calculatedTotal / freeShippingThreshold) * 100))
    : 0;

  const detailTabs: { id: DetailTab; label: string }[] = [
    { id: 'story', label: 'Description' },
    ...(product.foodInfo || product.materials || attributeEntries.length
      ? [{ id: 'ingredients' as DetailTab, label: 'Ingredients & materials' }]
      : []),
    ...(product.seller.story || product.seller.tagline
      ? [{ id: 'maker' as DetailTab, label: 'Maker notes' }]
      : []),
    ...(product.careInstructions ? [{ id: 'care' as DetailTab, label: 'Care & storage' }] : []),
    { id: 'shipping', label: 'Shipping & returns' },
  ];

  const quickFacts = [
    product.originPlace ? { label: 'Origin', value: product.originPlace } : null,
    product.varietyGrade ? { label: 'Variety / grade', value: product.varietyGrade } : null,
    product.harvestInfo ? { label: 'Harvest / crafting', value: product.harvestInfo } : null,
    product.dispatchConditions ? { label: 'Dispatch', value: product.dispatchConditions } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Shop', to: '/shop' },
          { label: product.categoryName, to: `/shop?category=${product.categorySlug}` },
          { label: product.name },
        ]}
      />

      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        {/* Left column: gallery and real listing facts */}
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm border border-line bg-sand/40 shadow-xs">
            {image ? (
              <img src={image.url} alt={image.alt} className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">No photograph</div>
            )}
            <div className="absolute left-4 top-4 flex flex-col gap-2">
              {product.originVerified ? <Badge tone="forest">Origin verified</Badge> : null}
            </div>
            {product.harvestInfo ? (
              <div className="absolute bottom-4 left-4 right-4 rounded-sm border border-sand/70 bg-white/92 px-3.5 py-2.5 text-xs text-forest shadow-xs backdrop-blur-md">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
                  {product.harvestInfo}
                </p>
                {product.originPlace ? <p className="mt-0.5 text-[11px] text-muted">{product.originPlace}</p> : null}
              </div>
            ) : null}
          </div>

          {product.images.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {product.images.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  className={`h-20 w-16 shrink-0 overflow-hidden rounded-sm border ${index === selectedImage ? 'border-forest ring-1 ring-forest' : 'border-line opacity-75 hover:opacity-100'}`}
                  aria-label={`View image ${index + 1}`}
                >
                  <img src={item.url} alt={item.alt} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}

          {image?.credit ? (
            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              {image.credit} · <Link to="/credits" className="underline underline-offset-2">Credits</Link>
            </p>
          ) : null}

          {quickFacts.length ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {quickFacts.map((fact) => (
                <div key={fact.label} className="rounded-sm border border-sand bg-surface p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{fact.label}</p>
                  <p className="mt-1 text-[11px] font-semibold leading-snug text-forest">{fact.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Right column: buy box */}
        <div ref={buyBoxRef}>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/makers/${product.sellerSlug}`} className="text-[11px] font-bold uppercase tracking-[0.16em] text-terra hover:underline">
              {product.sellerName}
            </Link>
            <span className="h-3 w-px bg-sand" aria-hidden />
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">{product.region ?? 'Himachal Pradesh'}</span>
            {hasReviews ? (
              <>
                <span className="h-3 w-px bg-sand" aria-hidden />
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
                  <Stars rating={product.reviewSummary.average ?? 0} className="text-terra" /> {product.reviewSummary.average} · {product.reviewSummary.count} review{product.reviewSummary.count === 1 ? '' : 's'}
                </span>
              </>
            ) : null}
          </div>

          <h1 className="mt-3 text-3xl font-serif font-normal leading-[1.08] text-forest sm:text-[2.65rem]">{product.name}</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/75">{product.shortDescription}</p>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {product.originVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#66745A]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#66745A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#66745A]" />
                Origin verified
              </span>
            ) : null}
            {product.varietyGrade ? (
              <span className="inline-flex items-center rounded-full border border-[#D98263]/30 bg-[#FAF3EF] px-2.5 py-0.5 text-[11px] font-medium text-[#D98263]">
                {product.varietyGrade}
              </span>
            ) : null}
            {product.originPlace ? (
              <span className="inline-flex items-center rounded-full border border-[#E4DACE] bg-[#FAF7F2] px-2.5 py-0.5 text-[11px] font-medium text-[#172321]/75">
                📍 {product.originPlace}
              </span>
            ) : null}
            {product.harvestInfo ? (
              <span className="inline-flex items-center rounded-full border border-[#E4DACE] bg-[#FAF7F2] px-2.5 py-0.5 text-[11px] font-medium text-[#172321]/75">
                🗓 {product.harvestInfo}
              </span>
            ) : null}
          </div>

          <div className="mt-5 rounded-sm border border-line bg-surface p-5 shadow-xs">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="font-serif text-3xl font-medium text-forest">{formatINR(currentItemPrice)}</span>
                  {strikeOriginalPrice ? (
                    <span className="text-sm text-muted line-through">{formatINR(strikeOriginalPrice)}</span>
                  ) : null}
                  {campaignOriginal && product.discountPercent ? (
                    <span className="bg-terra px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                      {product.discountPercent}% off
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {product.unit}
                  {product.weightG ? ` · ${product.weightG} g` : ''} · Inclusive of applicable taxes
                </p>
                {product.campaignSlug && product.campaignName ? (
                  <p className="mt-1.5 text-[11px] text-terra">
                    <Link to={`/offers/${product.campaignSlug}`} className="underline underline-offset-4 hover:text-forest">
                      {product.campaignName}
                    </Link>{' '}
                    promotional price
                  </p>
                ) : null}
              </div>

              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                  <span className={`h-2 w-2 rounded-full ${soldOut ? 'bg-muted' : 'bg-emerald-600'}`} />
                  {soldOut ? 'Out of stock' : product.stock <= 3 ? `Only ${product.stock} left` : `${product.stock} in stock`}
                </span>
              </div>
            </div>

            {showFreeShipping ? (
              <div className="mt-5 rounded-sm border border-sand/70 bg-sand/25 p-3.5">
                <div className="flex items-center justify-between text-xs font-medium text-forest">
                  <span className="flex items-center gap-2">
                    <TruckIcon className="h-4 w-4 text-forest/70" />
                    {amountToFreeShipping === 0 ? (
                      <span className="font-semibold text-emerald-800">Qualified for free shipping</span>
                    ) : (
                      <span>Add {formatINR(amountToFreeShipping)} more to unlock <strong>free shipping</strong></span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted">{shippingProgress}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sand/60">
                  <div
                    className="h-full bg-forest transition-all duration-300"
                    style={{ width: `${shippingProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {soldOut ? (
              <div className="mt-5">
                <Alert tone="warning" title="Currently out of stock">
                  This listing has no available stock right now. Check back later or browse the rest of the catalogue.
                </Alert>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 items-center rounded-sm border border-sand bg-surface shadow-xs">
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      className="h-full px-4 text-lg text-muted transition-colors hover:text-ink disabled:opacity-40"
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                      className="h-full px-4 text-lg text-muted transition-colors hover:text-ink disabled:opacity-40"
                      disabled={quantity >= maxQuantity}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex-1 pl-2 text-right sm:text-left">
                    <p className="text-[10.5px] uppercase tracking-wider text-muted">Total amount</p>
                    <p className="font-serif text-lg font-bold text-forest">{formatINR(calculatedTotal)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                  <Button
                    size="lg"
                    loading={addToCart.isPending}
                    onClick={() => addToCart.mutate()}
                    className="flex w-full items-center justify-center gap-2 bg-forest font-semibold text-paper shadow-xs hover:bg-forest-deep"
                  >
                    <ShoppingBagIcon className="h-4 w-4" />
                    <span>Add to Bag</span>
                  </Button>

                  <button
                    type="button"
                    disabled={buyNow.isPending}
                    onClick={() => buyNow.mutate()}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-terra text-sm font-semibold tracking-[0.01em] text-white shadow-xs transition-all duration-150 hover:bg-[#b9694c] hover:shadow-md active:scale-[0.99] disabled:opacity-50"
                  >
                    {buyNow.isPending ? <Spinner className="h-4 w-4" /> : (
                      <>
                        <FlashIcon className="h-4 w-4" />
                        <span>Buy Now</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-center pt-2 text-xs text-muted">
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        navigate(`/login?next=${encodeURIComponent(`/shop/${product.slug}`)}`);
                        return;
                      }
                      toggleWishlist.mutate(isSaved);
                    }}
                    className="flex items-center gap-1.5 underline underline-offset-4 transition-colors hover:text-forest"
                  >
                    <span>{isSaved ? '♥' : '♡'}</span> {isSaved ? 'In saved items' : 'Save for later'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Real listing, maker and payment facts only */}
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-sm border border-line bg-surface/60 p-4 text-xs text-ink/80">
            <div className="flex items-start gap-2.5">
              <MountainIcon className="mt-0.5 h-4 w-4 shrink-0 text-terra" />
              <div>
                <p className="font-semibold text-forest"> Sold by {product.seller.name}</p>
                <p className="text-[11px] text-muted">{product.seller.region ?? product.region ?? 'Himachal Pradesh'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <TruckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terra" />
              <div>
                <p className="font-semibold text-forest">Dispatch estimate</p>
                <p className="text-[11px] text-muted">{product.shippingEstimate}</p>
              </div>
            </div>
            {product.materials ? (
              <div className="flex items-start gap-2.5">
                <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-terra" />
                <div>
                  <p className="font-semibold text-forest">Maker-declared materials</p>
                  <p className="text-[11px] text-muted">{product.materials}</p>
                </div>
              </div>
            ) : null}
            <div className="flex items-start gap-2.5">
              <CreditCardIcon className="mt-0.5 h-4 w-4 shrink-0 text-terra" />
              <div>
                <p className="font-semibold text-forest">
                  {config?.payments.configured ? 'Secure online payment' : 'Online payment not configured'}
                </p>
                <p className="text-[11px] text-muted">
                  {config?.payments.configured
                    ? 'Cards, UPI and netbanking are processed by the configured payment provider. Cash on delivery is not offered.'
                    : 'This deployment cannot collect online payments yet. Cash on delivery is not offered.'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-sm border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {product.seller.logoUrl ? (
                  <img src={product.seller.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-sm object-cover" />
                ) : null}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Sold & dispatched by</p>
                  <Link to={`/makers/${product.sellerSlug}`} className="mt-1 block font-serif text-lg font-medium text-forest hover:text-terra">
                    {product.seller.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">{product.seller.region ?? 'Himachal Pradesh'}</p>
                </div>
              </div>
              <Link to={`/makers/${product.sellerSlug}`} className="rounded-sm bg-sand/40 px-2.5 py-1 text-xs font-semibold text-forest hover:bg-sand" aria-label="View maker">
                View maker profile ↗
              </Link>
            </div>
            {product.seller.tagline ? <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink/70">{product.seller.tagline}</p> : null}
          </div>
        </div>
      </div>

      {/* Listing details */}
      <section className="mt-16 border-t border-line pt-12">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow-terra">Listing details</p>
          <h2 className="mt-2 font-serif text-3xl text-forest sm:text-4xl">{product.name}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">{product.shortDescription}</p>
        </div>

        <div className="mt-8 flex justify-center overflow-x-auto border-b border-line">
          <div className="flex gap-2 sm:gap-6">
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold tracking-wide transition-colors sm:text-sm ${
                  activeTab === tab.id
                    ? 'border-terra text-forest'
                    : 'border-transparent text-muted hover:text-forest'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-4xl">
          {activeTab === 'story' && (
            <div className="space-y-6 rounded-sm border border-line bg-surface p-6 text-[14.5px] leading-relaxed text-ink/80 sm:p-8">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-serif text-2xl text-forest">{product.name}</h3>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#66745A]">
                  {product.categoryName}
                </span>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink/85">{product.description}</p>

              {attributeEntries.length ? (
                <div className="border-t border-line pt-5">
                  <h4 className="mb-3 font-serif text-lg text-forest">Maker-declared attributes</h4>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {attributeEntries.map(([key, value]) => (
                      <div key={key} className="rounded-sm border border-sand/80 bg-sand/10 px-3 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{key}</dt>
                        <dd className="mt-0.5 text-xs font-medium text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              <div className="mt-6 overflow-hidden rounded-sm border border-line bg-white">
                <div className="flex items-center justify-between border-b border-line bg-[#FAF7F2] px-4 py-3">
                  <span className="font-serif text-sm font-bold text-forest">Listing specifications</span>
                  <span className={`rounded px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${product.originVerified ? 'bg-emerald-100/70 text-emerald-800' : 'bg-sand/40 text-muted'}`}>
                    {product.originVerified ? 'Origin verified' : 'Maker-declared origin'}
                  </span>
                </div>
                <dl className="divide-y divide-line text-xs">
                  {product.varietyGrade ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="font-medium text-muted">Variety / grade</dt>
                      <dd className="col-span-2 font-semibold text-ink">{product.varietyGrade}</dd>
                    </div>
                  ) : null}
                  {product.originPlace || product.region ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="font-medium text-muted">Origin / region</dt>
                      <dd className="col-span-2 text-ink">{product.originPlace ? `${product.originPlace}, ` : ''}{product.region ?? 'Himachal Pradesh'}</dd>
                    </div>
                  ) : null}
                  {product.harvestInfo ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="font-medium text-muted">Harvest / crafting</dt>
                      <dd className="col-span-2 text-ink">{product.harvestInfo}</dd>
                    </div>
                  ) : null}
                  {product.dispatchConditions ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="font-medium text-muted">Dispatch conditions</dt>
                      <dd className="col-span-2 text-ink">{product.dispatchConditions}</dd>
                    </div>
                  ) : null}
                  {product.materials ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="font-medium text-muted">Materials / ingredients</dt>
                      <dd className="col-span-2 text-ink">{product.materials}</dd>
                    </div>
                  ) : null}
                  {product.dimensions ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="font-medium text-muted">Dimensions / sizing</dt>
                      <dd className="col-span-2 text-ink">{product.dimensions}</dd>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-3 px-4 py-2.5">
                    <dt className="font-medium text-muted">Artisan / producer</dt>
                    <dd className="col-span-2 text-ink">
                      <Link to={`/makers/${product.sellerSlug}`} className="font-medium text-terra hover:underline">
                        {product.sellerName}
                      </Link>
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-2.5">
                    <dt className="font-medium text-muted">Unit / net quantity</dt>
                    <dd className="col-span-2 text-ink">{product.unit} {product.weightG ? `· Packed weight: ${product.weightG} g` : ''}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {activeTab === 'ingredients' && (
            <div className="space-y-5 rounded-sm border border-line bg-surface p-6 text-[14.5px] leading-relaxed text-ink/80 sm:p-8">
              <h3 className="font-serif text-2xl text-forest">Ingredients & materials</h3>
              {product.foodInfo ? (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-forest">Food information</h4>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{product.foodInfo}</p>
                </div>
              ) : null}
              {product.materials ? (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-forest">Materials / ingredients declared by the maker</h4>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{product.materials}</p>
                </div>
              ) : null}
              {attributeEntries.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-forest">Attributes</h4>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {attributeEntries.map(([key, value]) => (
                      <div key={key} className="rounded-sm border border-sand/80 bg-sand/10 px-3 py-2">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{key}</dt>
                        <dd className="mt-0.5 text-xs font-medium text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === 'maker' && (
            <div className="space-y-4 rounded-sm border border-line bg-surface p-6 text-[14.5px] leading-relaxed text-ink/80 sm:p-8">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-serif text-2xl text-forest">{product.seller.name}</h3>
                <Link to={`/makers/${product.sellerSlug}`} className="text-xs font-semibold text-terra hover:underline">
                  View maker profile ↗
                </Link>
              </div>
              {product.seller.tagline ? <p className="font-medium text-forest">{product.seller.tagline}</p> : null}
              {product.seller.story ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{product.seller.story}</p>
              ) : (
                <p className="text-sm text-muted">This maker has not published a store story yet.</p>
              )}
            </div>
          )}

          {activeTab === 'care' && (
            <div className="space-y-4 rounded-sm border border-line bg-surface p-6 text-[14.5px] leading-relaxed text-ink/80 sm:p-8">
              <h3 className="font-serif text-2xl text-forest">Care & storage</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{product.careInstructions}</p>
            </div>
          )}

          {activeTab === 'shipping' && (
            <div className="grid gap-5 rounded-sm border border-line bg-surface p-6 text-[14.5px] leading-relaxed text-ink/80 sm:grid-cols-2 sm:p-8">
              <div>
                <h3 className="mb-2 font-serif text-2xl text-forest">Dispatch</h3>
                <p className="text-sm leading-relaxed text-ink/80">{product.shippingEstimate}</p>
                {product.dispatchConditions ? (
                  <p className="mt-2 text-xs text-muted">{product.dispatchConditions}</p>
                ) : null}
              </div>
              <div>
                <h3 className="mb-2 font-serif text-2xl text-forest">Returns</h3>
                <p className="text-sm leading-relaxed text-ink/80">{product.returnPolicy}</p>
                <p className="mt-3 text-xs text-muted">
                  Read the full <Link to="/policies/shipping" className="underline underline-offset-2">shipping policy</Link> and{' '}
                  <Link to="/policies/returns" className="underline underline-offset-2">returns policy</Link>.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Reviews: rendered only from published, order-linked reviews */}
      <section className="mt-16 border-t border-line pt-12">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow-terra">Customer reviews</p>
            <h2 className="mt-2 font-serif text-3xl text-forest">What buyers said</h2>
            {hasReviews ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Stars rating={product.reviewSummary.average ?? 0} className="text-xs tracking-wider text-terra" />
                <span className="text-sm font-semibold text-forest">{product.reviewSummary.average} out of 5</span>
                <span className="text-xs text-muted">· {product.reviewSummary.count} verified review{product.reviewSummary.count === 1 ? '' : 's'}</span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                No published reviews yet. Reviews can only be written after a delivered, paid order.
              </p>
            )}
          </div>
          <Link to={user ? '/account/orders' : '/login'} className="text-xs font-semibold text-terra hover:underline">
            {user ? 'Review a delivered order →' : 'Sign in to review a purchase →'}
          </Link>
        </div>

        {hasReviews ? (
          <>
            <div className="mt-8 grid gap-6 sm:grid-cols-[240px_1fr]">
              <div className="rounded-sm border border-line bg-surface p-5">
                <p className="font-serif text-4xl text-forest">{product.reviewSummary.average}</p>
                <Stars rating={product.reviewSummary.average ?? 0} className="mt-1 block text-sm text-terra" />
                <p className="mt-1 text-xs text-muted">{product.reviewSummary.count} verified review{product.reviewSummary.count === 1 ? '' : 's'}</p>
                <div className="mt-4 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const count = product.reviewSummary.distribution[String(rating)] ?? 0;
                    const width = product.reviewSummary.count ? Math.round((count / product.reviewSummary.count) * 100) : 0;
                    return (
                      <div key={rating} className="flex items-center gap-2 text-[11px] text-muted">
                        <span className="w-3 text-right tabular-nums">{rating}</span>
                        <span className="text-terra">★</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand/60">
                          <span className="block h-full bg-terra/70" style={{ width: `${width}%` }} />
                        </span>
                        <span className="w-6 text-right tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {product.reviews.slice(0, 6).map((review) => (
                  <article key={review.id} className="flex h-full flex-col rounded-sm border border-line bg-surface p-5 shadow-xs">
                    <Stars rating={review.rating} className="text-xs tracking-wider text-terra" />
                    {review.title ? <h3 className="mt-2 font-serif text-lg text-forest">{review.title}</h3> : null}
                    <p className="mt-2 flex-1 text-xs leading-relaxed text-ink/75">{review.body}</p>
                    <p className="mt-4 border-t border-line/60 pt-3 text-[11px] text-muted">
                      {review.authorName} · {new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {review.verifiedPurchase ? <span className="ml-2 font-medium text-emerald-700">Verified purchase</span> : null}
                    </p>
                  </article>
                ))}
              </div>
            </div>
            {product.reviews.length > 6 ? (
              <p className="mt-4 text-xs text-muted">Showing the 6 most recent of {product.reviews.length} published reviews.</p>
            ) : null}
          </>
        ) : null}
      </section>

      {/* Related items */}
      {product.related.length ? (
        <section className="mt-16 border-t border-line pt-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-serif text-2xl text-forest">From the same mountain shelves</h2>
            <Link to="/shop" className="text-xs font-semibold text-terra hover:underline">
              View all catalogue →
            </Link>
          </div>
          <ProductGrid products={product.related} />
        </section>
      ) : null}

      {/* Sticky buy bar */}
      {showStickyBar && !soldOut && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-white/95 px-4 py-3 shadow-xl backdrop-blur-md transition-all duration-300">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {image && (
                <img src={image.url} alt={product.name} className="h-12 w-12 rounded-sm border border-line object-cover" />
              )}
              <div className="hidden sm:block">
                <p className="line-clamp-1 text-xs font-semibold text-forest">{product.name}</p>
                <p className="text-[11px] text-muted">{product.unit}{product.weightG ? ` · ${product.weightG} g` : ''} · {formatINR(currentItemPrice)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 items-center rounded-sm border border-sand bg-surface">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="h-full px-3 text-sm text-muted hover:text-ink disabled:opacity-40"
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-8 text-center text-xs font-semibold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                  className="h-full px-3 text-sm text-muted hover:text-ink disabled:opacity-40"
                  disabled={quantity >= maxQuantity}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <Button
                size="sm"
                loading={addToCart.isPending}
                onClick={() => addToCart.mutate()}
                className="flex items-center gap-1.5 bg-forest font-medium text-paper hover:bg-forest-deep"
              >
                <ShoppingBagIcon className="h-3.5 w-3.5" />
                <span>Add to Bag</span>
              </Button>

              <button
                type="button"
                disabled={buyNow.isPending}
                onClick={() => buyNow.mutate()}
                className="flex h-9 items-center gap-1.5 rounded-sm bg-terra px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#b9694c]"
              >
                {buyNow.isPending ? <Spinner className="h-3 w-3" /> : (
                  <>
                    <FlashIcon className="h-3.5 w-3.5" />
                    <span>Buy Now ({formatINR(calculatedTotal)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
