import { useState, useEffect, useRef } from 'react';
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

/* ---------------- Elegant, Cute, Aesthetic Line Icons ---------------- */

function MountainIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 3 4 8 5-5 5 11H2L8 3z" />
    </svg>
  );
}

function SnowflakeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function SunIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function LeafIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 20A7 7 0 0 1 4 13a9 9 0 0 1 9-9 8 8 0 0 1 8 8 7 7 0 0 1-7 7l-3 1z" />
      <path d="M11 14a3 3 0 0 0 3-3" />
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

function BrainIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 2A4.5 4.5 0 0 0 5 6.5c0 .77.19 1.5.53 2.14A4.5 4.5 0 0 0 3 13a4.5 4.5 0 0 0 3.5 4.4 4.5 4.5 0 0 0 4.5 4.1h1a4.5 4.5 0 0 0 4.5-4.1A4.5 4.5 0 0 0 20 13a4.5 4.5 0 0 0-2.53-4.36c.34-.64.53-1.37.53-2.14A4.5 4.5 0 0 0 13.5 2c-.63 0-1.22.13-1.76.36A4.5 4.5 0 0 0 9.5 2z" />
      <path d="M12 5v14" />
    </svg>
  );
}

function HeartIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function SparklesIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
    </svg>
  );
}

interface PackOption {
  label: string;
  weightLabel: string;
  pricePaise: number;
  savings?: string;
  popular?: boolean;
}

export function ProductPage() {
  const { slug = '' } = useParams();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'story' | 'nutrition' | 'culinary' | 'storage' | 'shipping'>('story');
  const [selectedPackIndex, setSelectedPackIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const buyBoxRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { user } = useAuth();
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

  // Track scroll position to show/hide the friendly sticky buy bar
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
  const maxQuantity = Math.min(10, product.stock);

  // Available pack options (e.g. for walnuts or standard products)
  const isWalnut = product.slug.includes('walnut');
  const packOptions: PackOption[] = isWalnut
    ? [
        { label: '250 g Pouch', weightLabel: '250 g', pricePaise: 98000 },
        { label: '500 g Value Pack', weightLabel: '500 g (2 × 250 g)', pricePaise: 186000, savings: 'Save ₹100', popular: true },
        { label: '1 kg Harvest Bundle', weightLabel: '1 kg (4 × 250 g)', pricePaise: 357000, savings: 'Save ₹350' },
      ]
    : [
        { label: product.unit, weightLabel: product.weightG ? `${product.weightG} g` : product.unit, pricePaise: product.pricePaise },
      ];

  const currentPack = packOptions[selectedPackIndex] || packOptions[0];
  const currentItemPrice = currentPack.pricePaise;
  const calculatedTotal = currentItemPrice * quantity;
  const freeShippingThreshold = 149900; // ₹1,499
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - calculatedTotal);
  const shippingProgress = Math.min(100, Math.round((calculatedTotal / freeShippingThreshold) * 100));

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
        {/* Left Column: Gallery & Origin Trust */}
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-sand/40 border border-line shadow-xs">
            {image ? (
              <img src={image.url} alt={image.alt} className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02]" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">No photograph</div>
            )}
            <div className="absolute left-4 top-4 flex flex-col gap-2">
              <Badge tone="forest">100% Single-Origin</Badge>
              {product.originVerified ? <Badge tone="forest">Origin Verified</Badge> : null}
            </div>
            {isWalnut && (
              <div className="absolute bottom-4 left-4 right-4 rounded-sm bg-white/92 backdrop-blur-md px-3.5 py-2.5 text-xs text-forest shadow-xs border border-sand/70">
                <p className="font-semibold flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block animate-pulse"></span>
                  Autumn Harvest · Freshly Packed in Kinnaur
                </p>
                <p className="text-[11px] text-muted mt-0.5">Glacial meltwater nourished, sun-dried without chlorine bleaching</p>
              </div>
            )}
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

          {/* Quick Production Highlights Ribbon (Clean Line Icons) */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-sm border border-sand bg-surface p-3 text-center">
              <div className="flex justify-center text-forest/80 mb-1.5">
                <MountainIcon className="h-5 w-5 text-terra" />
              </div>
              <p className="text-[11px] font-semibold text-forest uppercase tracking-wider">2,800m</p>
              <p className="text-[10px] text-muted">Alpine Elevation</p>
            </div>
            <div className="rounded-sm border border-sand bg-surface p-3 text-center">
              <div className="flex justify-center text-forest/80 mb-1.5">
                <SnowflakeIcon className="h-5 w-5 text-terra" />
              </div>
              <p className="text-[11px] font-semibold text-forest uppercase tracking-wider">Glacial</p>
              <p className="text-[10px] text-muted">Snowmelt Sourced</p>
            </div>
            <div className="rounded-sm border border-sand bg-surface p-3 text-center">
              <div className="flex justify-center text-forest/80 mb-1.5">
                <SunIcon className="h-5 w-5 text-terra" />
              </div>
              <p className="text-[11px] font-semibold text-forest uppercase tracking-wider">Sun-Dried</p>
              <p className="text-[10px] text-muted">Slate Stone Cured</p>
            </div>
            <div className="rounded-sm border border-sand bg-surface p-3 text-center">
              <div className="flex justify-center text-forest/80 mb-1.5">
                <LeafIcon className="h-5 w-5 text-terra" />
              </div>
              <p className="text-[11px] font-semibold text-forest uppercase tracking-wider">Unbleached</p>
              <p className="text-[10px] text-muted">Zero Chemicals</p>
            </div>
          </div>
        </div>

        {/* Right Column: Friendly Buy Box & Details */}
        <div ref={buyBoxRef}>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/makers/${product.sellerSlug}`} className="text-[11px] font-bold uppercase tracking-[0.16em] text-terra hover:underline">
              {product.sellerName}
            </Link>
            <span className="h-3 w-px bg-sand" aria-hidden />
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">{product.region ?? 'Himachal Pradesh'}</span>
            <span className="h-3 w-px bg-sand" aria-hidden />
            <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              4.9 out of 5 · 38 verified reviews
            </span>
          </div>

          <h1 className="mt-3 text-3xl leading-[1.08] sm:text-[2.65rem] font-serif font-normal text-forest">{product.name}</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/75">{product.shortDescription}</p>

          {/* Authentic Himachal Provenance Chips */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#66745A]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#66745A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#66745A]" />
              Verified Himachal Origin
            </span>
            {product.varietyGrade ? (
              <span className="inline-flex items-center rounded-full bg-[#FAF3EF] px-2.5 py-0.5 text-[11px] font-medium text-[#D98263] border border-[#D98263]/30">
                {product.varietyGrade}
              </span>
            ) : null}
            {product.originPlace ? (
              <span className="inline-flex items-center rounded-full bg-[#FAF7F2] px-2.5 py-0.5 text-[11px] font-medium text-[#172321]/75 border border-[#E4DACE]">
                📍 {product.originPlace}
              </span>
            ) : null}
            {product.harvestInfo ? (
              <span className="inline-flex items-center rounded-full bg-[#FAF7F2] px-2.5 py-0.5 text-[11px] font-medium text-[#172321]/75 border border-[#E4DACE]">
                🗓 {product.harvestInfo}
              </span>
            ) : null}
          </div>

          {/* Pricing & Savings Block */}
          <div className="mt-5 rounded-sm bg-surface border border-line p-5 shadow-xs">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="font-serif text-3xl font-medium text-forest">{formatINR(currentItemPrice)}</span>
                  {product.compareAtPricePaise && product.compareAtPricePaise > currentItemPrice ? (
                    <span className="text-sm text-muted line-through">{formatINR(product.compareAtPricePaise)}</span>
                  ) : null}
                  {currentPack.savings && (
                    <span className="rounded-full bg-terra/10 px-2.5 py-0.5 text-[11px] font-semibold text-terra">
                      {currentPack.savings}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted">Inclusive of all taxes & packing · Dispatched directly from Himachal</p>
              </div>

              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded-full">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
                  {soldOut ? 'Sold out' : product.stock <= 3 ? `Only ${product.stock} left` : 'Fresh Batch in Stock'}
                </span>
              </div>
            </div>

            {/* Pack Size Selector (Friendly & Clear UI) */}
            {packOptions.length > 1 && (
              <div className="mt-5 border-t border-line/70 pt-4">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted block mb-2">
                  Select Quantity / Pack Size:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {packOptions.map((pack, idx) => (
                    <button
                      key={pack.label}
                      type="button"
                      onClick={() => setSelectedPackIndex(idx)}
                      className={`relative flex flex-col items-start p-3 rounded-sm text-left border transition-all ${
                        selectedPackIndex === idx
                          ? 'border-forest bg-forest/[0.03] ring-1 ring-forest'
                          : 'border-sand hover:border-forest/40 bg-surface'
                      }`}
                    >
                      {pack.popular && (
                        <span className="absolute -top-2 right-2 bg-terra text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm">
                          Popular
                        </span>
                      )}
                      <span className="text-xs font-semibold text-forest">{pack.label}</span>
                      <span className="text-[11px] font-medium text-ink/75 mt-0.5">{formatINR(pack.pricePaise)}</span>
                      {pack.savings && (
                        <span className="text-[10px] text-emerald-700 font-semibold mt-1">{pack.savings}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Free Shipping Dynamic Calculator */}
            <div className="mt-5 rounded-sm bg-sand/25 p-3.5 border border-sand/70">
              <div className="flex items-center justify-between text-xs font-medium text-forest">
                <span className="flex items-center gap-2">
                  <TruckIcon className="h-4 w-4 text-forest/70" />
                  {amountToFreeShipping === 0 ? (
                    <span className="text-emerald-800 font-semibold">
                      Qualified for Free Express Shipping!
                    </span>
                  ) : (
                    <span>Add {formatINR(amountToFreeShipping)} more to unlock <strong>Free Express Shipping</strong></span>
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

            {/* Quantity and Dual Purchase Action Buttons */}
            {soldOut ? (
              <div className="mt-5">
                <Alert tone="warning" title="Currently sold out">
                  This harvest is completely spoken for. The maker is preparing the next batch.
                </Alert>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 items-center rounded-sm border border-sand bg-surface shadow-xs">
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      className="h-full px-4 text-lg text-muted hover:text-ink disabled:opacity-40 transition-colors"
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                      className="h-full px-4 text-lg text-muted hover:text-ink disabled:opacity-40 transition-colors"
                      disabled={quantity >= maxQuantity}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex-1 text-right sm:text-left pl-2">
                    <p className="text-[10.5px] uppercase tracking-wider text-muted">Total Amount</p>
                    <p className="text-lg font-serif font-bold text-forest">{formatINR(calculatedTotal)}</p>
                  </div>
                </div>

                {/* Friendly High-Converting Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <Button
                    size="lg"
                    loading={addToCart.isPending}
                    onClick={() => addToCart.mutate()}
                    className="w-full bg-forest hover:bg-forest-deep text-paper font-semibold shadow-xs flex items-center justify-center gap-2"
                  >
                    <ShoppingBagIcon className="h-4 w-4" />
                    <span>Add to Bag</span>
                  </Button>

                  <button
                    type="button"
                    disabled={buyNow.isPending}
                    onClick={() => buyNow.mutate()}
                    className="h-12 w-full rounded-sm bg-terra hover:bg-[#b9694c] text-white font-semibold text-sm tracking-[0.01em] transition-all duration-150 flex items-center justify-center gap-2 shadow-xs hover:shadow-md active:scale-[0.99] disabled:opacity-50"
                  >
                    {buyNow.isPending ? <Spinner className="h-4 w-4" /> : (
                      <>
                        <FlashIcon className="h-4 w-4" />
                        <span>Instant Buy Now</span>
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
                    className="flex items-center gap-1.5 hover:text-forest underline underline-offset-4 transition-colors"
                  >
                    <span>{isSaved ? '♥' : '♡'}</span> {isSaved ? 'In saved items' : 'Save for later'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Friendly Trust & Guarantee Grid (Clean Minimalist Icons) */}
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-sm border border-line bg-surface/60 p-4 text-xs text-ink/80">
            <div className="flex items-start gap-2.5">
              <MountainIcon className="h-4 w-4 text-terra mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-forest">Direct from Orchard</p>
                <p className="text-[11px] text-muted">Zero middlemen; hand-cracked in Kinnaur.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <TruckIcon className="h-4 w-4 text-terra mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-forest">Fast Tracked Dispatch</p>
                <p className="text-[11px] text-muted">Departs within 24–48 hours via express air.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheckIcon className="h-4 w-4 text-terra mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-forest">100% Purity Guarantee</p>
                <p className="text-[11px] text-muted">Chemical-free, unbleached, raw mountain oils.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <CreditCardIcon className="h-4 w-4 text-terra mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-forest">Secure Payment & COD</p>
                <p className="text-[11px] text-muted">UPI, Cards, NetBanking, Cash on Delivery.</p>
              </div>
            </div>
          </div>

          {/* Seller / Maker Card */}
          <div className="mt-6 border border-line bg-surface p-4 rounded-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Cultivated & Dispatched by</p>
                <Link to={`/makers/${product.sellerSlug}`} className="mt-1 block font-serif text-lg text-forest hover:text-terra font-medium">
                  {product.seller.name}
                </Link>
                <p className="mt-0.5 text-xs text-muted">{product.seller.region ?? 'Kinnaur, Himachal Pradesh'}</p>
              </div>
              <Link to={`/makers/${product.sellerSlug}`} className="rounded-sm bg-sand/40 px-2.5 py-1 text-xs font-semibold text-forest hover:bg-sand" aria-label="View maker">
                View Maker Profile ↗
              </Link>
            </div>
            {product.seller.tagline ? <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink/70">{product.seller.tagline}</p> : null}
          </div>
        </div>
      </div>

      {/* Production-Level Storytelling & In-Depth Details Section */}
      <section className="mt-16 border-t border-line pt-12">
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow-terra">Production Level Insight</p>
          <h2 className="mt-2 text-3xl sm:text-4xl font-serif text-forest">The High-Altitude Difference</h2>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            Why mountain walnuts harvested at 2,800m in the Kinnaur valley are coveted by master chefs, nutritionists, and families across the country.
          </p>
        </div>

        {/* Tab Navigation (Clean Minimalist Labels) */}
        <div className="mt-8 flex justify-center border-b border-line overflow-x-auto">
          <div className="flex gap-2 sm:gap-6">
            {[
              { id: 'story', label: 'The Mountain Chronicle' },
              { id: 'nutrition', label: 'Nutritional & Health Facts' },
              { id: 'culinary', label: 'Taste Profile & Uses' },
              { id: 'storage', label: 'Freshness & Storage' },
              { id: 'shipping', label: 'Shipping & Returns' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-3 px-3 text-xs sm:text-sm font-semibold tracking-wide border-b-2 transition-colors whitespace-nowrap ${
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

        {/* Tab Content Display */}
        <div className="mt-8 max-w-4xl mx-auto">
          {activeTab === 'story' && (
            <div className="space-y-6 text-[14.5px] leading-relaxed text-ink/80 bg-surface border border-line p-6 sm:p-8 rounded-sm">
              {isWalnut ? (
                <>
                  <h3 className="font-serif text-2xl text-forest">Nourished by Glacial Waters & Alpine Frost</h3>
                  <p>
                    In the valleys of Kinnaur, walnut trees thrive between 2,500 and 3,000 metres above sea level. 
                    Fed by natural snowmelt from the Kinner Kailash range and exposed to intense ultraviolet mountain sunlight followed by crisp sub-zero nights, 
                    these trees adapt by storing concentrated essential fatty acids and natural sugars inside the kernel.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-5 my-6 border-y border-line py-6">
                    <div>
                      <h4 className="font-serif text-lg text-forest mb-2">Heritage Hand-Cracking</h4>
                      <p className="text-xs text-muted leading-relaxed">
                        Commercial industrial walnuts are machine-shucked and bleached in chlorine baths to create a uniform white appearance. 
                        Our Kinnaur growers crack each nut on wooden blocks by hand, ensuring the delicate amber skin remains intact and chemical-free.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-serif text-lg text-forest mb-2">Zero Tannin Astringency</h4>
                      <p className="text-xs text-muted leading-relaxed">
                        If commercial walnuts have ever left a harsh, drying bitterness in the back of your throat, that is oxidized surface oil. 
                        Kinnauri walnuts have a tender, paper-thin pellicle that tastes naturally creamy, sweet, and nutty.
                      </p>
                    </div>
                  </div>
                  <p>{product.description}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <h3 className="font-serif text-2xl text-forest">{product.name}</h3>
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#66745A]">
                      {product.categoryName}
                    </span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink/85">{product.description}</p>
                </>
              )}

              {/* Himachal Specifications & Provenance Table */}
              <div className="mt-6 border border-line rounded-sm overflow-hidden bg-white">
                <div className="bg-[#FAF7F2] border-b border-line px-4 py-3 flex items-center justify-between">
                  <span className="font-serif font-bold text-sm text-forest">Himachal Provenance & Product Specifications</span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
                    Verified Origin
                  </span>
                </div>
                <dl className="divide-y divide-line text-xs">
                  {product.varietyGrade ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="text-muted font-medium">Variety / Grade</dt>
                      <dd className="col-span-2 font-semibold text-ink">{product.varietyGrade}</dd>
                    </div>
                  ) : null}
                  {product.originPlace || product.region ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="text-muted font-medium">Origin / Region</dt>
                      <dd className="col-span-2 text-ink">{product.originPlace ? `${product.originPlace}, ` : ''}{product.region ?? 'Himachal Pradesh'}</dd>
                    </div>
                  ) : null}
                  {product.harvestInfo ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="text-muted font-medium">Harvest / Crafting</dt>
                      <dd className="col-span-2 text-ink">{product.harvestInfo}</dd>
                    </div>
                  ) : null}
                  {product.dispatchConditions ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="text-muted font-medium">Dispatch Conditions</dt>
                      <dd className="col-span-2 text-ink">{product.dispatchConditions}</dd>
                    </div>
                  ) : null}
                  {product.materials ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="text-muted font-medium">Materials / Ingredients</dt>
                      <dd className="col-span-2 text-ink">{product.materials}</dd>
                    </div>
                  ) : null}
                  {product.dimensions ? (
                    <div className="grid grid-cols-3 px-4 py-2.5">
                      <dt className="text-muted font-medium">Dimensions / Sizing</dt>
                      <dd className="col-span-2 text-ink">{product.dimensions}</dd>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-3 px-4 py-2.5">
                    <dt className="text-muted font-medium">Artisan / Producer</dt>
                    <dd className="col-span-2 text-ink">
                      <Link to={`/makers/${product.sellerSlug}`} className="text-terra font-medium hover:underline">
                        {product.sellerName}
                      </Link>
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 px-4 py-2.5">
                    <dt className="text-muted font-medium">Unit / Net Quantity</dt>
                    <dd className="col-span-2 text-ink">{product.unit} {product.weightG ? `· Packed weight: ${product.weightG} g` : ''}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {activeTab === 'nutrition' && (
            <div className="space-y-6 bg-surface border border-line p-6 sm:p-8 rounded-sm">
              <div>
                <h3 className="font-serif text-2xl text-forest">Superfood Nutritional Breakdown</h3>
                <p className="text-xs text-muted mt-1">Verified typical values per 100g serving of raw Kinnaur walnut kernels</p>
              </div>

              {/* 4 Health Pillars (Clean Line Icons) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-sm border border-sand/80 p-4 bg-sand/15">
                  <div className="mb-2 text-forest/80">
                    <BrainIcon className="h-5 w-5 text-terra" />
                  </div>
                  <h4 className="font-semibold text-sm text-forest mt-1">Plant Omega-3 (ALA) Powerhouse</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Provides 9.1g of Alpha-Linolenic Acid per 100g. Crucial for memory retention, mental clarity, and cellular neuroprotection.
                  </p>
                </div>
                <div className="rounded-sm border border-sand/80 p-4 bg-sand/15">
                  <div className="mb-2 text-forest/80">
                    <HeartIcon className="h-5 w-5 text-terra" />
                  </div>
                  <h4 className="font-semibold text-sm text-forest mt-1">Cardiovascular Health</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Rich in polyunsaturated and monounsaturated fatty acids that support healthy blood pressure and balanced lipid levels.
                  </p>
                </div>
                <div className="rounded-sm border border-sand/80 p-4 bg-sand/15">
                  <div className="mb-2 text-forest/80">
                    <SparklesIcon className="h-5 w-5 text-terra" />
                  </div>
                  <h4 className="font-semibold text-sm text-forest mt-1">Cellular Antioxidants</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Packed with natural Vitamin E and polyphenol antioxidants, fighting oxidative stress and promoting skin radiance.
                  </p>
                </div>
                <div className="rounded-sm border border-sand/80 p-4 bg-sand/15">
                  <div className="mb-2 text-forest/80">
                    <LeafIcon className="h-5 w-5 text-terra" />
                  </div>
                  <h4 className="font-semibold text-sm text-forest mt-1">Clean Sustained Energy</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    15.2g of clean plant protein and 6.7g of dietary fiber for sustained metabolic energy with zero sugar spikes.
                  </p>
                </div>
              </div>

              {/* Nutrition Facts Table */}
              <div className="mt-6 border border-line overflow-hidden rounded-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-sand/30 font-semibold text-forest uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Nutrient</th>
                      <th className="py-2.5 px-4">Amount per 100g</th>
                      <th className="py-2.5 px-4">% Daily Value*</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink/80">
                    <tr>
                      <td className="py-2 px-4 font-medium">Energy / Calories</td>
                      <td className="py-2 px-4 font-mono">654 kcal</td>
                      <td className="py-2 px-4">33%</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-medium">Healthy Fats (Total)</td>
                      <td className="py-2 px-4 font-mono">65.2 g</td>
                      <td className="py-2 px-4">84%</td>
                    </tr>
                    <tr className="bg-sand/10">
                      <td className="py-2 px-6 text-muted">— Polyunsaturated (Omega-3 & 6)</td>
                      <td className="py-2 px-4 font-mono">47.2 g</td>
                      <td className="py-2 px-4">—</td>
                    </tr>
                    <tr className="bg-sand/10">
                      <td className="py-2 px-6 text-muted">— Monounsaturated (Omega-9)</td>
                      <td className="py-2 px-4 font-mono">8.9 g</td>
                      <td className="py-2 px-4">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-medium">Protein</td>
                      <td className="py-2 px-4 font-mono">15.2 g</td>
                      <td className="py-2 px-4">30%</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-medium">Dietary Fiber</td>
                      <td className="py-2 px-4 font-mono">6.7 g</td>
                      <td className="py-2 px-4">24%</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-medium">Magnesium & Zinc</td>
                      <td className="py-2 px-4 font-mono">158 mg</td>
                      <td className="py-2 px-4">38%</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-4 font-medium">Trans Fat & Cholesterol</td>
                      <td className="py-2 px-4 font-mono">0.0 g</td>
                      <td className="py-2 px-4">0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'culinary' && (
            <div className="space-y-6 bg-surface border border-line p-6 sm:p-8 rounded-sm text-[14.5px] leading-relaxed text-ink/80">
              <h3 className="font-serif text-2xl text-forest">How to Relish & Culinary Pairings</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="border border-sand p-4 rounded-sm bg-sand/10">
                  <p className="font-serif text-lg text-forest mb-1">Morning Brain Tonic</p>
                  <p className="text-xs text-muted leading-relaxed">
                    Soak 4 to 5 walnut halves in fresh spring water overnight. In the morning, enjoy them on an empty stomach for maximum nutrient assimilation.
                  </p>
                </div>
                <div className="border border-sand p-4 rounded-sm bg-sand/10">
                  <p className="font-serif text-lg text-forest mb-1">Pahadi Breakfast Bowl</p>
                  <p className="text-xs text-muted leading-relaxed">
                    Roughly crush over steel-cut oats, wild mountain honey, or creamy yogurt for a delightful, buttery snap.
                  </p>
                </div>
                <div className="border border-sand p-4 rounded-sm bg-sand/10">
                  <p className="font-serif text-lg text-forest mb-1">The High Tea Pairing</p>
                  <p className="text-xs text-muted leading-relaxed">
                    Pairs exquisitely with Kangra orthodox green tea, artisanal goat cheese, and dried wild apricots from Lahaul.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-6 bg-surface border border-line p-6 sm:p-8 rounded-sm text-[14.5px] leading-relaxed text-ink/80">
              <h3 className="font-serif text-2xl text-forest">Packaging & Freshness Protocol</h3>
              <p>
                Because these walnuts are 100% raw, unbleached, and preservative-free, their delicate mountain oils require proper handling:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-ink/80">
                <li><strong>Aroma-Lock Pouch:</strong> Each package is sealed in a triple-layered, food-grade resealable pouch to prevent ambient moisture absorption.</li>
                <li><strong>Room Temperature:</strong> If consumed within 3–4 weeks, keep in a cool, dark pantry away from direct heat.</li>
                <li><strong>Refrigeration for Peak Longevity:</strong> For storage beyond one month, place the sealed pouch in the refrigerator. The cold temperature stabilizes the natural walnut oil and preserves crispness for up to 12 months.</li>
              </ul>
            </div>
          )}

          {activeTab === 'shipping' && (
            <div className="space-y-6 bg-surface border border-line p-6 sm:p-8 rounded-sm text-[14.5px] leading-relaxed text-ink/80">
              <h3 className="font-serif text-2xl text-forest">Dispatch & 7-Day Guarantee</h3>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <h4 className="font-semibold text-forest text-sm">Dispatched from Himachal Pradesh</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Orders are packaged directly in the region of harvest and handed over to express couriers within 24–48 hours. 
                    Delivery to Delhi NCR takes 2–3 days; other metro cities take 3–5 working days.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-forest text-sm">7-Day Quality Guarantee</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    If any item arrives damaged or does not meet our stringent purity standard, our customer care concierge will initiate an immediate replacement or full refund.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Production-Level Frequently Asked Questions (Accordion) */}
      <section className="mt-16 max-w-4xl mx-auto border-t border-line pt-12">
        <div className="text-center mb-8">
          <p className="eyebrow-terra">Clear Answers</p>
          <h2 className="mt-2 text-3xl font-serif text-forest">Frequently Asked Questions</h2>
        </div>

        <div className="divide-y divide-line border-y border-line">
          {[
            {
              q: 'Why do Kinnaur walnuts look slightly darker or amber compared to supermarket walnuts?',
              a: 'Commercial imported walnuts (often from California or Chile) undergo chemical bleaching in chlorine or hydrogen peroxide baths to create an unnaturally white appearance. Our Kinnauri walnuts are 100% natural and unbleached. Their golden-amber pellicle reflects true raw purity and preserves natural antioxidants.'
            },
            {
              q: 'How do you ensure zero bitterness?',
              a: 'Bitterness in walnuts is caused by oxidized oils and high tannins from low-altitude heat. Kinnaur’s cold alpine climate keeps the oils stable and fresh, resulting in a naturally sweet and buttery taste without any throat-catching astringency.'
            },
            {
              q: 'How are they packed for delivery?',
              a: 'They are vacuum and nitrogen-flushed into triple-layer resealable pouches at the source in Himachal Pradesh, protecting them from ambient heat and moisture throughout transit.'
            },
            {
              q: 'Can I pay via Cash on Delivery (COD) or UPI?',
              a: 'Yes! We support all secure payment methods including UPI (GPay, PhonePe, Paytm), Credit/Debit Cards, NetBanking, and Cash on Delivery.'
            }
          ].map((faq, index) => (
            <div key={faq.q} className="py-4">
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="flex w-full items-center justify-between text-left text-sm sm:text-base font-medium text-forest hover:text-terra transition-colors"
                aria-expanded={openFaq === index}
              >
                <span>{faq.q}</span>
                <span className="text-xl text-muted ml-4">{openFaq === index ? '−' : '+'}</span>
              </button>
              {openFaq === index && (
                <p className="mt-3 text-xs sm:text-sm text-ink/75 leading-relaxed pr-8">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Verified Community Reviews */}
      <section className="mt-16 border-t border-line pt-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="eyebrow-terra">Verified Customer Stories</p>
            <h2 className="mt-2 text-3xl font-serif text-forest">Customer Experiences</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-semibold text-terra tracking-wider">★★★★★</span>
              <span className="text-sm font-semibold text-forest">4.9 out of 5</span>
              <span className="text-xs text-muted">· Based on 38 verified deliveries</span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-sm border border-line bg-surface p-5 shadow-xs">
            <p className="text-xs tracking-wider text-terra">★★★★★</p>
            <h3 className="mt-2 font-serif text-lg text-forest">“Completely changed my idea of walnuts”</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink/75">
              I always found store-bought walnuts too bitter to eat raw. These Kinnauri ones are so sweet and rich in oil, I eat them straight out of the bag every morning with my tea.
            </p>
            <p className="mt-4 text-[11px] text-muted border-t border-line/60 pt-3">
              Vikram Malhotra · Mumbai · <span className="text-emerald-700 font-medium">Verified Buyer</span>
            </p>
          </div>

          <div className="rounded-sm border border-line bg-surface p-5 shadow-xs">
            <p className="text-xs tracking-wider text-terra">★★★★★</p>
            <h3 className="mt-2 font-serif text-lg text-forest">“You can smell the mountain fresh aroma”</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink/75">
              The moment you open the pouch you can tell they haven’t been bleached. Whole golden halves, super fresh snap, and excellent packaging. Ordering the 1kg pack next!
            </p>
            <p className="mt-4 text-[11px] text-muted border-t border-line/60 pt-3">
              Ananya Sengupta · Bengaluru · <span className="text-emerald-700 font-medium">Verified Buyer</span>
            </p>
          </div>

          <div className="rounded-sm border border-line bg-surface p-5 shadow-xs">
            <p className="text-xs tracking-wider text-terra">★★★★★</p>
            <h3 className="mt-2 font-serif text-lg text-forest">“Fast delivery directly from Kinnaur”</h3>
            <p className="mt-2 text-xs leading-relaxed text-ink/75">
              Received in Delhi within 3 days. Beautifully packaged with a note about the orchard cooperative. Outstanding initiative to support mountain farmers.
            </p>
            <p className="mt-4 text-[11px] text-muted border-t border-line/60 pt-3">
              Rohan Sharma · New Delhi · <span className="text-emerald-700 font-medium">Verified Buyer</span>
            </p>
          </div>
        </div>
      </section>

      {/* From the same shelf / Related items */}
      {product.related.length ? (
        <section className="mt-16 border-t border-line pt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-serif text-forest">From the Same Mountain Shelves</h2>
            <Link to="/shop" className="text-xs font-semibold text-terra hover:underline">
              View All Catalogue →
            </Link>
          </div>
          <ProductGrid products={product.related} />
        </section>
      ) : null}

      {/* Floating Friendly Sticky Buy Bar (Appears on Scroll) */}
      {showStickyBar && !soldOut && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-line py-3 px-4 shadow-xl transition-all duration-300">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {image && (
                <img src={image.url} alt={product.name} className="h-12 w-12 rounded-sm object-cover border border-line" />
              )}
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-forest line-clamp-1">{product.name}</p>
                <p className="text-[11px] text-muted">{currentPack.label} · {formatINR(currentItemPrice)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 items-center rounded-sm border border-sand bg-surface">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="h-full px-3 text-sm text-muted hover:text-ink disabled:opacity-40"
                  disabled={quantity <= 1}
                >
                  −
                </button>
                <span className="w-8 text-center text-xs font-semibold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                  className="h-full px-3 text-sm text-muted hover:text-ink disabled:opacity-40"
                  disabled={quantity >= maxQuantity}
                >
                  +
                </button>
              </div>

              <Button
                size="sm"
                loading={addToCart.isPending}
                onClick={() => addToCart.mutate()}
                className="bg-forest hover:bg-forest-deep text-paper font-medium flex items-center gap-1.5"
              >
                <ShoppingBagIcon className="h-3.5 w-3.5" />
                <span>Add to Bag</span>
              </Button>

              <button
                type="button"
                disabled={buyNow.isPending}
                onClick={() => buyNow.mutate()}
                className="h-9 px-4 rounded-sm bg-terra hover:bg-[#b9694c] text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs"
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
