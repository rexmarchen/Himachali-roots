import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CampaignSummary, Paged, ProductSummary } from '@shared/types';
import { api, ApiError, errorMessage } from '@/lib/api';
import { posterSrcSet } from '@/lib/poster';
import { usePageMeta } from '@/lib/usePageMeta';
import { ProductGrid } from '@/components/ProductCard';
import {
  Alert,
  Breadcrumbs,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingBlock,
  PageHeader,
  Pagination,
  Select,
  buttonClass,
} from '@/components/ui';

interface CampaignResponse extends Paged<ProductSummary> {
  campaign: CampaignSummary;
  purchasable: boolean;
  filters: {
    categories: { id: string; name: string; slug: string; productCount: number }[];
    sellers: { name: string; slug: string }[];
    priceRangePaise: { min: number | null; max: number | null };
  };
}

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'popular', label: 'Most purchased' },
];

const FALLBACK_DIWALI_DATA: CampaignResponse = {
  campaign: {
    id: 'cmp_diwali_2026',
    name: 'Pahadi Festive Glow',
    slug: 'pahadi-festive-glow',
    description:
      'A Diwali collection from Himachali makers: handwoven wool, Kangra tea, orchard walnuts, wildflower honey and Chamba embroidery. Dispatched directly from Himachal Pradesh with festive savings.',
    posterUrl: '/images/campaigns/pahadi-festive-glow-diwali-1672.webp',
    posterAlt:
      'Pahadi Festive Glow — Diwali in Himachal: festive poster with diya lights, mountain silhouettes and the Pahadi Roots wordmark.',
    status: 'active',
    startsAt: null,
    endsAt: null,
    maxDiscountBp: 3000,
    maxDiscountPercent: 30,
    productCount: 0,
  },
  purchasable: true,
  items: [],
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 1,
  filters: {
    categories: [],
    sellers: [],
    priceRangePaise: { min: null, max: null },
  },
};

const STATUS_LABEL: Record<CampaignSummary['status'], string> = {
  draft: 'Draft',
  scheduled: 'Opens soon',
  active: 'Live now',
  expired: 'Ended',
  archived: 'Archived',
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function OfferPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const queryString = params.toString();

  const offer = useQuery({
    queryKey: ['campaign', slug, queryString],
    queryFn: () => api<CampaignResponse>(`/campaigns/${encodeURIComponent(slug)}?${queryString}`),
    staleTime: 30_000,
    retry: false,
  });

  const data: CampaignResponse | undefined =
    offer.data ??
    (slug === 'pahadi-festive-glow' && (offer.isError || (!offer.isLoading && !offer.data))
      ? FALLBACK_DIWALI_DATA
      : undefined);
  const campaign = data?.campaign;

  const title = campaign ? `${campaign.name} — Diwali Offer | DEAR HILLS` : 'Festive Offer — DEAR HILLS';
  const description = campaign
    ? campaign.status === 'active' && campaign.maxDiscountPercent > 0
      ? `${campaign.name}: up to ${campaign.maxDiscountPercent}% off selected authentic Himachali products from reviewed local makers. Only eligible products are discounted.`
      : campaign.status === 'expired'
        ? `${campaign.name} has ended. Browse the full catalogue of authentic Himachali products from reviewed local makers.`
        : `${campaign.name}: a seasonal selection of authentic Himachali products from reviewed local makers.`
    : 'A seasonal collection of authentic Himachali products from reviewed local makers.';

  usePageMeta({
    title,
    description,
    canonicalPath: `/offers/${slug}`,
    image: campaign?.posterUrl ?? null,
  });

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const category = params.get('category');
  const seller = params.get('seller');
  const sort = params.get('sort') ?? 'newest';
  const page = Number(params.get('page') ?? 1) || 1;
  const filters = data?.filters;
  const activeCount = useMemo(() => ['category', 'seller'].filter((key) => params.get(key)).length, [params]);

  if (offer.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Festive offer' }]} />
        <div className="mt-8">
          <LoadingBlock label="Loading the festive offer…" rows={6} />
        </div>
      </div>
    );
  }

  if ((offer.isError && !data) || !data || !campaign) {
    const status = offer.error instanceof ApiError ? offer.error.status : 0;
    const notFound = status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Festive offer' }]} />
        <div className="mt-8">
          <ErrorState
            title={notFound ? 'This offer is not available' : 'The offer could not load'}
            body={
              notFound
                ? 'The campaign may have been unpublished or the link may be incorrect. The full catalogue is still open.'
                : errorMessage(offer.error)
            }
            onRetry={notFound ? undefined : () => void offer.refetch()}
          />
          <div className="mt-6">
            <LinkButton to="/shop" variant="secondary">
              Browse the catalogue
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  const startsOn = formatDate(campaign.startsAt);
  const endsOn = formatDate(campaign.endsAt);
  const purchasable = data.purchasable && campaign.status === 'active';
  const headline =
    campaign.status === 'scheduled'
      ? 'Opens soon'
      : campaign.status === 'expired'
        ? 'This offer has ended'
        : campaign.maxDiscountPercent > 0
          ? `Up to ${campaign.maxDiscountPercent}% off`
          : 'Selected festive prices';
  const headlineDetail =
    campaign.status === 'scheduled'
      ? startsOn
        ? `Previewing ${campaign.productCount || 'the'} selected product${campaign.productCount === 1 ? '' : 's'} until it opens on ${startsOn}.`
        : 'These selected products will carry a promotional price once the offer opens.'
      : campaign.status === 'expired'
        ? 'The promotional prices have been withdrawn and these products are back at their regular prices.'
        : `${campaign.maxDiscountPercent > 0 ? 'on selected products' : 'on the products listed below'}${
            campaign.productCount > 0
              ? ` · ${campaign.productCount} eligible product${campaign.productCount === 1 ? '' : 's'}`
              : ''
          }`;
  const emptyMessage =
    campaign.status === 'scheduled'
      ? `This offer opens${startsOn ? ` on ${startsOn}` : ' soon'}. Browse the full catalogue in the meantime.`
      : campaign.status === 'expired'
        ? `This offer ended${endsOn ? ` on ${endsOn}` : ''}. These products are back at their regular prices.`
        : 'No products are eligible for this offer yet. The campaign is configured in the admin workspace and will fill as eligible products are added.';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Festive offer' }, { label: campaign.name }]} />

      <PageHeader
        eyebrow={`Diwali in Himachal · ${STATUS_LABEL[campaign.status]}`}
        title={campaign.name}
        lede={
          campaign.description.trim() ||
          'A seasonal selection of authentic Himachali goods from reviewed local makers, gathered for the festival of lights.'
        }
        actions={
          <LinkButton to="/shop" variant="secondary" size="md">
            All products
          </LinkButton>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.55fr_1fr] lg:items-stretch">
        {campaign.posterUrl ? (
          <div className="overflow-hidden border border-line bg-forest">
            <div className="relative aspect-[1672/941] w-full">
              <img
                src={campaign.posterUrl}
                srcSet={posterSrcSet(campaign.posterUrl)}
                sizes="(min-width: 1024px) 780px, 100vw"
                alt={campaign.posterAlt ?? `${campaign.name} poster`}
                width={1672}
                height={941}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          </div>
        ) : null}

        <aside className="flex flex-col justify-between border border-line bg-surface p-6 sm:p-7">
          <div>
            <p className="eyebrow text-terra">The offer</p>
            <p className="mt-2 font-serif text-[2.1rem] leading-[1.05] text-forest sm:text-[2.5rem]">{headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink/75">{headlineDetail}</p>

            <div className="mt-5 space-y-2 border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
              <p>Only the products shown on this page carry a promotional price. Everything else stays at its regular price.</p>
              {startsOn && campaign.status !== 'expired' ? <p>Offer opened {startsOn}.</p> : null}
              {endsOn ? (
                <p>
                  {campaign.status === 'expired' ? 'Offer ended' : 'Offer ends'} {endsOn}.
                </p>
              ) : null}
              {!endsOn && campaign.status === 'active' ? <p>No end date has been set for this offer.</p> : null}
              <p>Every price is checked again on the server when you reach checkout.</p>
            </div>
          </div>

          <div className="mt-6">
            {purchasable ? (
              <a href="#offer-products" className={buttonClass('terra', 'md', 'w-full')}>
                Shop eligible products →
              </a>
            ) : (
              <LinkButton to="/shop" variant="terra" size="md" className="w-full">
                Browse the catalogue →
              </LinkButton>
            )}
          </div>
        </aside>
      </div>

      {!purchasable ? (
        <div className="mt-10">
          <Alert
            tone={campaign.status === 'expired' ? 'warning' : 'info'}
            title={campaign.status === 'expired' ? 'This offer has ended' : 'This offer is not open yet'}
          >
            {emptyMessage}
          </Alert>
        </div>
      ) : null}

      {/* Diwali Seller Launch Invitation Card */}
      <section aria-labelledby="diwali-maker-invite-heading" className="mt-10 overflow-hidden rounded-xl border border-[#D4A373]/50 bg-gradient-to-br from-[#2B1B17] via-[#382017] to-[#1E1410] p-6 sm:p-8 text-paper shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#E07A5F]/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#F4D06F]">
              <span>🪔</span> Diwali Maker &amp; Artisan Initiative
            </div>
            <h2 id="diwali-maker-invite-heading" className="mt-3 font-serif text-2xl sm:text-3xl font-medium text-white">
              Craft or harvest in Himachal? Sell this Diwali with 0% Commission.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#F7EBE1]/85">
              We connect authentic weavers, woodcarvers, tea planters and orchardists directly with buyers across India. Join our inaugural maker cohort with zero upfront fees, free storytelling, and doorstep village pickup.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-[#F4D06F]">
              <span className="flex items-center gap-1.5">✓ 0% Platform Commission</span>
              <span className="flex items-center gap-1.5">✓ Free Artisan Photography &amp; Biography</span>
              <span className="flex items-center gap-1.5">✓ Prime Homepage Festive Showcase</span>
            </div>
          </div>
          <div className="shrink-0 flex flex-col sm:flex-row lg:flex-col gap-3">
            <LinkButton to="/become-a-maker?offer=diwali" variant="terra" size="lg" className="whitespace-nowrap shadow-md">
              Apply as a Maker &rarr;
            </LinkButton>
            <p className="text-[11px] text-center text-paper/60">No listing fees · Apply in 5 mins</p>
          </div>
        </div>
      </section>

      <section id="offer-products" className="mt-10 scroll-mt-24" aria-labelledby="offer-products-heading">
        <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Eligible products</p>
            <h2 id="offer-products-heading" className="mt-1 font-serif text-2xl text-forest sm:text-3xl">
              {purchasable ? 'The festive shelf' : 'Offer shelf'}
            </h2>
          </div>
          {purchasable && data.total > 0 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="offer-sort" className="text-[11px] text-muted">
                Sort
              </label>
              <Select
                id="offer-sort"
                value={sort}
                onChange={(event) => update('sort', event.target.value)}
                className="h-9 w-auto py-1.5 text-xs"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        {purchasable && data.total > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={!category}
                onClick={() => update('category', null)}
                className={`border px-3 py-1.5 text-[11.5px] transition-colors ${
                  !category
                    ? 'border-forest bg-forest text-paper'
                    : 'border-line bg-surface text-ink hover:border-forest/40'
                }`}
              >
                All categories
              </button>
              {filters?.categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={category === item.slug}
                  onClick={() => update('category', category === item.slug ? null : item.slug)}
                  className={`border px-3 py-1.5 text-[11.5px] transition-colors ${
                    category === item.slug
                      ? 'border-forest bg-forest text-paper'
                      : 'border-line bg-surface text-ink hover:border-forest/40'
                  }`}
                >
                  {item.name} <span className="text-[10px] opacity-70">({item.productCount})</span>
                </button>
              ))}
              {filters?.sellers.length ? (
                <Select
                  value={seller ?? ''}
                  onChange={(event) => update('seller', event.target.value || null)}
                  aria-label="Filter by maker"
                  className="ml-auto h-9 w-auto py-1.5 text-xs"
                >
                  <option value="">All makers</option>
                  {filters.sellers.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              {activeCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete('category');
                    next.delete('seller');
                    next.delete('page');
                    setParams(next, { replace: true });
                  }}
                  className="text-[11px] text-muted underline underline-offset-4 hover:text-forest"
                >
                  Clear filters
                </button>
              ) : null}
            </div>

            <p className="mt-4 text-xs text-muted">
              {data.total} eligible product{data.total === 1 ? '' : 's'} · promotional prices shown with the original price
            </p>

            <div className="mt-5">
              <ProductGrid products={data.items} showAddToCart />
            </div>

            <Pagination page={page} totalPages={data.totalPages} onChange={(next) => update('page', String(next))} />
          </>
        ) : purchasable ? (
          <div className="mt-6">
            <EmptyState
              eyebrow="Diwali Curation In Progress"
              title="The festive shelf is welcoming its first mountain makers"
              body="We are currently onboarding authentic Himachali artisans, weavers and growers for the festival of lights. If you make or grow authentic goods in Himachal, apply now to feature your creations here!"
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <LinkButton to="/become-a-maker?offer=diwali" variant="terra">
                    Join as a Diwali Maker (0% Commission) &rarr;
                  </LinkButton>
                  <LinkButton to="/shop" variant="secondary">
                    Browse the catalogue
                  </LinkButton>
                </div>
              }
            />
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              eyebrow={campaign.status === 'scheduled' ? 'Opens soon' : 'Offer ended'}
              title={campaign.status === 'scheduled' ? 'Not open yet' : 'This offer is closed'}
              body={emptyMessage}
              action={<LinkButton to="/shop">Browse the catalogue</LinkButton>}
            />
          </div>
        )}
      </section>

      <p className="mt-10 text-[11px] leading-relaxed text-muted">
        DEAR HILLS lists products from reviewed Himachali sellers. Promotional prices are stored with the campaign and
        revalidated against the live catalogue before an order is created. If an offer closes while an item is in your bag,
        the current regular price is used and shown at checkout.{' '}
        <Link to="/policies/terms" className="underline underline-offset-4 hover:text-forest">
          Read the store terms
        </Link>
        .
      </p>
    </div>
  );
}
