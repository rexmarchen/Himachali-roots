import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductDetail } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { formatDate } from '@/lib/format';
import { ProductGrid } from '@/components/ProductCard';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  DemoBadge,
  ErrorState,
  LinkButton,
  Spinner,
  StatusBadge,
} from '@/components/ui';

export function ProductPage() {
  const { slug = '' } = useParams();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [openSection, setOpenSection] = useState<string | null>('description');
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

  const addToCart = useMutation({
    mutationFn: () =>
      api('/cart/items', {
        method: 'POST',
        body: { productId: productQuery.data?.product.id, quantity },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.push(`${quantity} × ${productQuery.data?.product.name ?? 'item'} added to your bag.`);
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

  const sections = [
    { key: 'description', label: 'The object', body: product.description },
    ...(product.materials || product.careInstructions
      ? [
          {
            key: 'materials',
            label: 'Materials & care',
            body: [product.materials ? `Materials: ${product.materials}` : '', product.careInstructions ?? ''].filter(Boolean).join('\n\n'),
          },
        ]
      : []),
    ...(product.foodInfo ? [{ key: 'food', label: 'Food information', body: product.foodInfo }] : []),
    ...(product.dimensions || product.weightG
      ? [
          {
            key: 'dimensions',
            label: 'Size & weight',
            body: [product.dimensions ? `Dimensions: ${product.dimensions}` : '', product.weightG ? `Packed weight: ${product.weightG} g` : '', `Unit: ${product.unit}`].filter(Boolean).join('\n'),
          },
        ]
      : []),
  ];

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
        <div>
          <div className="relative aspect-[4/5] overflow-hidden bg-sand/40">
            {image ? (
              <img src={image.url} alt={image.alt} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">No photograph</div>
            )}
            <div className="absolute left-4 top-4 flex flex-col gap-2">
              {product.originVerified ? <Badge tone="forest">Origin reviewed</Badge> : null}
            </div>
          </div>
          {product.images.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {product.images.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  className={`h-20 w-16 shrink-0 overflow-hidden border ${index === selectedImage ? 'border-forest' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  aria-label={`View image ${index + 1}`}
                >
                  <img src={item.url} alt={item.alt} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
          {image?.credit ? (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {image.credit} · <Link to="/credits" className="underline underline-offset-2">Credits</Link>
            </p>
          ) : null}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/makers/${product.sellerSlug}`} className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted hover:text-terra">
              {product.sellerName}
            </Link>
            <span className="h-3 w-px bg-sand" aria-hidden />
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted">{product.region ?? 'Himachal Pradesh'}</span>
          </div>
          <h1 className="mt-3 text-3xl leading-[1.08] sm:text-[2.65rem]">{product.name}</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink/70">{product.shortDescription}</p>

          <div className="mt-6 flex items-end gap-3">
            <p className="font-serif text-2xl text-forest">{formatINR(product.pricePaise)}</p>
            {product.compareAtPricePaise && product.compareAtPricePaise > product.pricePaise ? (
              <p className="pb-0.5 text-sm text-muted line-through">{formatINR(product.compareAtPricePaise)}</p>
            ) : null}
            <span className="pb-1 text-[11px] text-muted">incl. GST where applicable</span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <StatusBadge status={soldOut ? 'cancelled' : 'approved'} label={soldOut ? 'Sold out' : product.stock <= 3 ? `Only ${product.stock} left` : 'In stock'} />
            <span>SKU {product.sku}</span>
            <span>·</span>
            <span>{product.unit}</span>
          </div>

          {soldOut ? (
            <div className="mt-6">
              <Alert tone="warning" title="Currently sold out">
                This listing has no available stock. The seller may restock it; nothing can be ordered while it is unavailable.
              </Alert>
            </div>
          ) : (
            <div className="mt-7 space-y-3">
              <div className="flex flex-wrap items-stretch gap-3">
                <div className="flex h-11 items-center border border-sand bg-surface">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    className="h-full px-3.5 text-lg text-muted hover:text-ink disabled:opacity-40"
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-9 text-center text-sm tabular-nums">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
                    className="h-full px-3.5 text-lg text-muted hover:text-ink disabled:opacity-40"
                    disabled={quantity >= maxQuantity}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <Button size="md" loading={addToCart.isPending} onClick={() => addToCart.mutate()} className="min-w-44 flex-1">
                  Add to bag
                </Button>
              </div>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      navigate(`/login?next=${encodeURIComponent(`/shop/${product.slug}`)}`);
                      return;
                    }
                    toggleWishlist.mutate(isSaved);
                  }}
                  className="text-xs text-muted underline underline-offset-4 hover:text-forest"
                >
                  {isSaved ? 'Remove from saved items' : 'Save for later'}
                </button>
                <Link to="/policies/shipping" className="text-xs text-muted underline underline-offset-4 hover:text-forest">
                  Shipping & delivery
                </Link>
                <Link to="/policies/returns" className="text-xs text-muted underline underline-offset-4 hover:text-forest">
                  Returns
                </Link>
              </div>
            </div>
          )}

          <div className="mt-7 grid gap-2 border-y border-line py-4 text-[12px] text-muted sm:grid-cols-2">
            <p>Dispatch within 2 working days</p>
            <p>Delivery usually 3–7 working days</p>
            <p>7-day return window on eligible items</p>
            <p>Secure checkout · seller named on receipt</p>
          </div>

          <div className="mt-2">
            {sections.map((section) => (
              <div key={section.key} className="border-b border-line">
                <button
                  type="button"
                  onClick={() => setOpenSection(openSection === section.key ? null : section.key)}
                  className="flex w-full items-center justify-between py-4 text-left"
                  aria-expanded={openSection === section.key}
                >
                  <span className="text-[13px] font-medium text-forest">{section.label}</span>
                  <span className="text-muted" aria-hidden>{openSection === section.key ? '−' : '+'}</span>
                </button>
                {openSection === section.key ? (
                  <div className="prose-editorial whitespace-pre-line pb-5 text-[13.5px] leading-relaxed">{section.body}</div>
                ) : null}
              </div>
            ))}
            <div className="border-b border-line">
              <button
                type="button"
                onClick={() => setOpenSection(openSection === 'shipping' ? null : 'shipping')}
                className="flex w-full items-center justify-between py-4 text-left"
                aria-expanded={openSection === 'shipping'}
              >
                <span className="text-[13px] font-medium text-forest">Shipping & returns</span>
                <span className="text-muted" aria-hidden>{openSection === 'shipping' ? '−' : '+'}</span>
              </button>
              {openSection === 'shipping' ? (
                <div className="space-y-3 pb-5 text-[13.5px] leading-relaxed text-ink/70">
                  <p>{product.shippingEstimate}</p>
                  <p>{product.returnPolicy}</p>
                  <p>
                    Read the full <Link to="/policies/shipping" className="underline underline-offset-2">shipping policy</Link> and{' '}
                    <Link to="/policies/returns" className="underline underline-offset-2">returns policy</Link>. Both are drafts pending legal review.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {product.attributes && Object.keys(product.attributes).length ? (
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              {Object.entries(product.attributes).map(([key, value]) => (
                <div key={key} className="border-t border-line pt-2">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-muted">{key}</dt>
                  <dd className="mt-0.5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-7 border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Sold by</p>
                <Link to={`/makers/${product.sellerSlug}`} className="mt-1 block font-serif text-lg text-forest hover:text-terra">
                  {product.seller.name}
                </Link>
                <p className="mt-1 text-xs text-muted">{product.seller.region ?? 'Himachal Pradesh'}</p>
              </div>
              <Link to={`/makers/${product.sellerSlug}`} className="text-xs text-terra" aria-label="View maker">
                ↗
              </Link>
            </div>
            {product.seller.tagline ? <p className="mt-3 text-[12.5px] leading-relaxed text-ink/65">{product.seller.tagline}</p> : null}
            <p className="mt-3 border-t border-line pt-3 text-[10.5px] leading-relaxed text-muted">
              The seller named here dispatches this item. PAHADI ROOTS handles payment and customer support.
            </p>
          </div>
        </div>
      </div>

      <section className="mt-16 border-t border-line pt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Reviews</p>
            <h2 className="mt-2 text-2xl">
              {product.reviewSummary.count
                ? `${product.reviewSummary.average?.toFixed(1)} out of 5 · ${product.reviewSummary.count} verified review${product.reviewSummary.count === 1 ? '' : 's'}`
                : 'No reviews yet'}
            </h2>
          </div>
        </div>
        {product.reviews.length ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {product.reviews.map((review) => (
              <article key={review.id} className="border-t border-line pt-4">
                <p className="text-[11px] tracking-[0.14em] text-terra" aria-label={`${review.rating} out of 5`}>
                  {'★'.repeat(review.rating)}
                  <span className="text-sand">{'★'.repeat(5 - review.rating)}</span>
                </p>
                {review.title ? <h3 className="mt-2 text-lg">{review.title}</h3> : null}
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink/75">{review.body}</p>
                <p className="mt-3 text-[11px] text-muted">
                  {review.authorName} · {formatDate(review.createdAt)} · Verified purchase
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Reviews open only after a delivered order. We do not import reviews, invent testimonials, or seed ratings —
            so a new listing honestly shows nothing here.
          </p>
        )}
      </section>

      {product.related.length ? (
        <section className="mt-16 border-t border-line pt-10">
          <h2 className="mb-6 text-2xl">From the same shelf</h2>
          <ProductGrid products={product.related} />
        </section>
      ) : null}
    </div>
  );
}
