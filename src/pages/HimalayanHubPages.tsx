import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, CraftEntity, Paged, ProductSummary, RegionEntity } from '@shared/types';
import { formatINR } from '@shared/types';
import {
  BRAND_NAME,
  buildCraftHubTitle,
  buildRegionCraftTitle,
  buildRegionHubTitle,
  fitSeoDescription,
  fitSeoTitle,
} from '@shared/seo';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { usePageMeta } from '@/lib/usePageMeta';
import { ProductGrid } from '@/components/ProductCard';
import { Breadcrumbs, EmptyState, ErrorState, LinkButton, LoadingBlock } from '@/components/ui';

interface RegionDetailResponse {
  region: RegionEntity;
  products: Paged<ProductSummary>;
  crafts: CraftEntity[];
  combos: Array<{ name: string; slug: string; productCount: number }>;
}

interface CraftDetailResponse {
  craft: CraftEntity;
  products: Paged<ProductSummary>;
  regions: RegionEntity[];
  combos: Array<{ regionName: string; regionSlug: string; productCount: number }>;
}

interface ComboDetailResponse {
  region: RegionEntity;
  craft: CraftEntity | null;
  category: { id: string; name: string; slug: string; description: string | null } | null;
  introText: string;
  faqs: Array<{ question: string; answer: string }>;
  products: Paged<ProductSummary>;
}

const CURRENCY_RATES: Record<string, { symbol: string; rate: number; label: string }> = {
  INR: { symbol: '₹', rate: 1, label: 'India (INR)' },
  USD: { symbol: '$', rate: 0.012, label: 'USA (USD est.)' },
  GBP: { symbol: '£', rate: 0.0094, label: 'UK (GBP est.)' },
  AED: { symbol: 'AED ', rate: 0.044, label: 'UAE (AED est.)' },
};

function InternationalReadinessBanner() {
  const { config } = useAuth();
  const [currency, setCurrency] = useState<'INR' | 'USD' | 'GBP' | 'AED'>('INR');
  if (!config?.features?.international) return null;
  const info = CURRENCY_RATES[currency];
  return (
    <section className="mt-8 rounded-sm border border-sand bg-[#FAF7F2] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-terra">Worldwide Diaspora Dispatch</p>
          <h2 className="mt-1 font-serif text-xl text-forest">Ship to USA, UK &amp; UAE</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            International orders dispatch within 3–5 business days with export-grade craft packaging. Customs duties, where applicable in destination countries, are payable on arrival.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="intl-currency-select" className="text-xs font-medium text-forest">
            Estimate currency:
          </label>
          <select
            id="intl-currency-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD' | 'GBP' | 'AED')}
            className="h-9 rounded-sm border border-line bg-surface px-2.5 text-xs text-forest"
          >
            {Object.entries(CURRENCY_RATES).map(([code, meta]) => (
              <option key={code} value={code}>
                {meta.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">
            (Sample {formatINR(250000)} ≈ {info.symbol}
            {(2500 * info.rate).toFixed(currency === 'INR' ? 0 : 2)})
          </span>
        </div>
      </div>
    </section>
  );
}

function FaqSection({ title, faqs }: { title: string; faqs: Array<{ question: string; answer: string }> }) {
  if (!faqs.length) return null;
  return (
    <section className="mt-12 rounded-sm border border-line bg-surface p-6 sm:p-8">
      <h2 className="font-serif text-2xl text-forest">{title}</h2>
      <dl className="mt-5 divide-y divide-line">
        {faqs.map((faq) => (
          <div key={faq.question} className="py-4 first:pt-0 last:pb-0">
            <dt className="text-sm font-semibold text-forest">{faq.question}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RegionHubPage() {
  const { region: slug } = useParams<{ region: string }>();
  const query = useQuery({
    queryKey: ['region-hub', slug],
    queryFn: () => api<RegionDetailResponse>(`/regions/${encodeURIComponent(slug!)}`),
    enabled: Boolean(slug),
  });

  const region = query.data?.region;
  const brand = BRAND_NAME;
  usePageMeta({
    title: region ? buildRegionHubTitle(region.name, brand) : `Region not found · ${brand}`,
    description: region
      ? fitSeoDescription(`Shop authentic handmade crafts, handloom wool & mountain foods from ${region.name}. Verified origin & direct artisan dispatch on ${brand}.`, 155)
      : 'Explore handmade crafts and authentic foods across the Indian Himalayas.',
    canonicalPath: region ? `/regions/${region.slug}` : undefined,
    image: region?.heroImage,
    noindex: query.isError,
    enabled: query.isSuccess || query.isError,
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <LoadingBlock rows={4} />
      </div>
    );
  }
  if (query.isError || !query.data || !region) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Himalayan Regions', to: '/himalayan-handmade-products' },
          { label: region.name },
        ]}
      />

      <header className="mt-4 overflow-hidden rounded-sm border border-line bg-surface">
        {region.heroImage ? (
          <div className="relative h-56 w-full sm:h-72">
            <img
              src={region.heroImage}
              alt={`Handmade crafts and landscape heritage of ${region.name}`}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-butter">
                Indian Himalayan Region Hub
              </p>
              <h1 className="mt-1 font-serif text-3xl font-normal sm:text-5xl">
                Handmade Products from {region.name}
              </h1>
            </div>
          </div>
        ) : (
          <div className="p-6 sm:p-8">
            <h1 className="font-serif text-3xl sm:text-5xl text-forest">Handmade Products from {region.name}</h1>
          </div>
        )}

        <div className="p-6 sm:p-8">
          <h2 className="font-serif text-2xl text-forest">What makes crafts and harvests from {region.name} unique?</h2>
          <p className="mt-3 max-w-4xl text-[15px] leading-relaxed text-ink/85">{region.introText}</p>

          <div className="mt-6 grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
            {region.famousCrafts.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Signature Crafts</h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {region.famousCrafts.map((item) => (
                    <span key={item} className="rounded-full border border-sand bg-paper px-3 py-1 text-xs text-forest">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {region.famousFoods.length > 0 ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Mountain Harvests &amp; Foods</h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {region.famousFoods.map((item) => (
                    <span key={item} className="rounded-full border border-sand bg-paper px-3 py-1 text-xs text-forest">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {query.data.combos.length > 0 ? (
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Curated {region.shortName} Craft Collections
              </h3>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {query.data.combos.map((combo) => (
                  <Link
                    key={combo.slug}
                    to={`/regions/${region.slug}/${combo.slug}`}
                    className="rounded-sm border border-forest/20 bg-surface px-3 py-1.5 text-xs font-medium text-forest hover:border-terra hover:text-terra"
                  >
                    {combo.name} ({combo.productCount})
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <section className="mt-10">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-serif text-2xl text-forest">Verified Products from {region.name}</h2>
          <Link to={`/shop?region=${encodeURIComponent(region.name)}`} className="text-xs font-medium text-terra hover:underline">
            Browse in full catalogue →
          </Link>
        </div>
        {query.data.products.items.length === 0 ? (
          <EmptyState
            eyebrow="Regional onboarding in progress"
            title={`We are reviewing makers in ${region.name}`}
            body="Only verified makers with reviewed documentation appear here. Browse our active Himalayan catalogue in the meantime."
            action={<LinkButton to="/shop">Explore all products</LinkButton>}
          />
        ) : (
          <ProductGrid products={query.data.products.items} />
        )}
      </section>

      <InternationalReadinessBanner />
      <FaqSection title={`Frequently Asked Questions about ${region.name}`} faqs={region.faqs} />
    </div>
  );
}

export function CraftHubPage() {
  const { craft: slug } = useParams<{ craft: string }>();
  const query = useQuery({
    queryKey: ['craft-hub', slug],
    queryFn: () => api<CraftDetailResponse>(`/crafts/${encodeURIComponent(slug!)}`),
    enabled: Boolean(slug),
  });

  const craft = query.data?.craft;
  const brand = BRAND_NAME;
  usePageMeta({
    title: craft ? buildCraftHubTitle(craft.name, brand) : `Craft not found · ${brand}`,
    description: craft
      ? fitSeoDescription(`Buy authentic Himalayan ${craft.name} direct from verified artisans. Learn genuineness checks & workshop heritage on ${brand}.`, 155)
      : 'Authentic Himalayan crafts verified at origin.',
    canonicalPath: craft ? `/crafts/${craft.slug}` : undefined,
    image: craft?.heroImage,
    noindex: query.isError,
    enabled: query.isSuccess || query.isError,
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <LoadingBlock rows={4} />
      </div>
    );
  }
  if (query.isError || !query.data || !craft) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Himalayan Crafts', to: '/himalayan-handmade-products' },
          { label: craft.name },
        ]}
      />

      <header className="mt-4 rounded-sm border border-line bg-surface p-6 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-terra">Himalayan Craft Tradition</p>
        <h1 className="mt-1 font-serif text-3xl font-normal text-forest sm:text-5xl">
          {craft.name} from the Himalayas
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink/85">{craft.introText}</p>

        <div className="mt-7 grid gap-6 border-t border-line pt-6 md:grid-cols-2">
          {craft.history ? (
            <div>
              <h2 className="font-serif text-xl text-forest">What makes {craft.name} unique?</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{craft.history}</p>
            </div>
          ) : null}
          {craft.howToIdentify ? (
            <div>
              <h2 className="font-serif text-xl text-forest">How to identify genuine {craft.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{craft.howToIdentify}</p>
            </div>
          ) : null}
        </div>

        {query.data.combos.length > 0 ? (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Shop by Region</h3>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {query.data.combos.map((combo) => (
                <Link
                  key={combo.regionSlug}
                  to={`/regions/${combo.regionSlug}/${craft.slug}`}
                  className="rounded-sm border border-forest/20 bg-paper px-3 py-1.5 text-xs font-medium text-forest hover:border-terra hover:text-terra"
                >
                  {combo.regionName} ({combo.productCount})
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <section className="mt-10">
        <h2 className="mb-5 font-serif text-2xl text-forest">Authentic {craft.name} Listings</h2>
        {query.data.products.items.length === 0 ? (
          <EmptyState
            eyebrow="Listings in curation"
            title={`Artisan works in ${craft.name} are under review`}
            body="Every craft listing goes through origin and material checks before publication."
            action={<LinkButton to="/shop">Browse all crafts</LinkButton>}
          />
        ) : (
          <ProductGrid products={query.data.products.items} />
        )}
      </section>

      <InternationalReadinessBanner />
      <FaqSection title={`${craft.name} Buying Guide & FAQs`} faqs={craft.faqs} />
    </div>
  );
}

export function RegionCraftComboPage() {
  const { region: regionSlug, subject: subjectSlug } = useParams<{ region: string; subject: string }>();
  const query = useQuery({
    queryKey: ['region-combo', regionSlug, subjectSlug],
    queryFn: () => api<ComboDetailResponse>(`/regions/${encodeURIComponent(regionSlug!)}/${encodeURIComponent(subjectSlug!)}`),
    enabled: Boolean(regionSlug && subjectSlug),
    retry: false,
  });

  const data = query.data;
  const subjectName = data?.craft?.name || data?.category?.name || '';
  usePageMeta({
    title: data ? buildRegionCraftTitle(subjectName, data.region.name, BRAND_NAME) : `Collection not found · ${BRAND_NAME}`,
    description: data
      ? fitSeoDescription(`Buy authentic ${subjectName} from ${data.region.name}. Direct from verified Himalayan artisans with transparent origin and nationwide delivery.`, 155)
      : 'Collection not found.',
    canonicalPath: data ? `/regions/${data.region.slug}/${data.craft?.slug || data.category?.slug}` : undefined,
    noindex: query.isError,
    enabled: query.isSuccess || query.isError,
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <LoadingBlock rows={4} />
      </div>
    );
  }
  if (query.isError || !data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <EmptyState
          eyebrow="404 · Not available"
          title="This regional craft collection is not yet active"
          body="Only regional craft pages with verified depth and multiple reviewed products are published."
          action={<LinkButton to="/himalayan-handmade-products">Explore Himalayan Hubs</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: data.region.name, to: `/regions/${data.region.slug}` },
          { label: subjectName },
        ]}
      />

      <header className="mt-4 rounded-sm border border-line bg-surface p-6 sm:p-8">
        <h1 className="font-serif text-3xl font-normal text-forest sm:text-5xl">
          {subjectName} from {data.region.name}
        </h1>
        <h2 className="mt-5 font-serif text-xl text-forest">
          What makes {subjectName} from {data.region.name} unique?
        </h2>
        <p className="mt-2 max-w-4xl text-[15px] leading-relaxed text-ink/85">{data.introText}</p>
      </header>

      <section className="mt-10">
        <ProductGrid products={data.products.items} />
      </section>

      <FaqSection title={`Questions about ${subjectName} from ${data.region.name}`} faqs={data.faqs} />
    </div>
  );
}

export function GiTaggedHubPage() {
  const query = useQuery({
    queryKey: ['gi-tagged'],
    queryFn: () => api<{ products: Paged<ProductSummary>; regions: RegionEntity[]; crafts: CraftEntity[] }>('/gi-tagged'),
  });

  usePageMeta({
    title: fitSeoTitle(`GI-Tagged Himalayan Products | ${BRAND_NAME}`, 60, BRAND_NAME),
    description: fitSeoDescription(
      'Explore verified Geographical Indication (GI) tagged Himalayan shawls, teas, and artisan crafts backed by approved origin documentation.',
      155,
    ),
    canonicalPath: '/gi-tagged',
    noindex: query.isError,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Verified GI-Tagged Products' }]} />
      <header className="mt-4 rounded-sm border border-line bg-surface p-6 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Verified Geographical Indication</p>
        <h1 className="mt-1 font-serif text-3xl font-normal text-forest sm:text-5xl">
          GI-Tagged Products of the Indian Himalayas
        </h1>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink/85">
          Geographical Indication (GI) tags legally protect traditional mountain crafts and harvests tied to specific Himalayan territories. On {BRAND_NAME}, a GI badge is enabled solely after administrators review supporting registration proof.
        </p>
      </header>

      <section className="mt-10">
        {query.isLoading ? (
          <LoadingBlock rows={4} />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : query.data?.products.items.length === 0 ? (
          <EmptyState
            eyebrow="Strict GI verification active"
            title="Verified GI-tagged products will appear here once proof is reviewed"
            body="We never auto-claim GI certification. Sellers submit supporting proof before receiving the GI badge."
            action={<LinkButton to="/policies/authenticity">Read our Authenticity Policy</LinkButton>}
          />
        ) : (
          <ProductGrid products={query.data?.products.items ?? []} />
        )}
      </section>
    </div>
  );
}

export function HimalayanPillarPage() {
  const query = useQuery({
    queryKey: ['himalayan-pillar'],
    queryFn: () =>
      api<{
        regions: RegionEntity[];
        crafts: CraftEntity[];
        categories: Category[];
        featured: Paged<ProductSummary>;
        combos: Array<{ regionName: string; regionSlug: string; subjectName: string; subjectSlug: string; productCount: number }>;
      }>('/himalayan-handmade-products'),
  });

  usePageMeta({
    title: fitSeoTitle(`Himalayan Handmade Products & Crafts | ${BRAND_NAME}`, 60, BRAND_NAME),
    description: fitSeoDescription(
      'Shop authentic handmade crafts, handloom wool, Pashmina, regional teas & honey from 7 Indian Himalayan regions direct from verified makers.',
      155,
    ),
    canonicalPath: '/himalayan-handmade-products',
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Himalayan Handmade Products' }]} />

      <header className="mt-4 rounded-sm border border-line bg-surface p-6 sm:p-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-terra">Pan-Himalayan Marketplace</p>
        <h1 className="mt-2 font-serif text-3xl font-normal text-forest sm:text-5xl">
          Authentic Handmade Products from the Indian Himalayas
        </h1>
        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink/85">
          Explore living crafts, regional handlooms, and high-altitude organic harvests across Himachal Pradesh, Uttarakhand (Garhwal and Kumaon), Jammu &amp; Kashmir, Ladakh, Sikkim, Arunachal Pradesh, and the hills of Darjeeling and Kalimpong.
        </p>
      </header>

      {query.isLoading ? (
        <div className="mt-8"><LoadingBlock rows={4} /></div>
      ) : query.isError ? (
        <div className="mt-8"><ErrorState onRetry={() => void query.refetch()} /></div>
      ) : (
        <>
          <section className="mt-12">
            <h2 className="font-serif text-2xl text-forest sm:text-3xl">Explore by Indian Himalayan Region</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {query.data?.regions.map((region) => (
                <Link
                  key={region.id}
                  to={`/regions/${region.slug}`}
                  className="group overflow-hidden rounded-sm border border-line bg-surface transition-all hover:border-forest/40"
                >
                  {region.heroImage ? (
                    <img
                      src={region.heroImage}
                      alt={`Handmade crafts from ${region.name}`}
                      loading="lazy"
                      className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : null}
                  <div className="p-5">
                    <h3 className="font-serif text-xl text-forest group-hover:text-terra">{region.name}</h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{region.introText}</p>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-sage">
                      {region.famousCrafts.slice(0, 3).join(' · ')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-serif text-2xl text-forest sm:text-3xl">Shop by Traditional Himalayan Craft</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {query.data?.crafts.map((craft) => (
                <Link
                  key={craft.id}
                  to={`/crafts/${craft.slug}`}
                  className="rounded-sm border border-line bg-surface p-5 transition-colors hover:border-terra"
                >
                  <h3 className="font-serif text-xl text-forest">{craft.name}</h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{craft.introText}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <h2 className="mb-5 font-serif text-2xl text-forest sm:text-3xl">Popular Himalayan Listings</h2>
            <ProductGrid products={query.data?.featured.items ?? []} />
          </section>

          <InternationalReadinessBanner />
        </>
      )}
    </div>
  );
}
