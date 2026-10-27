import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ProductSummary } from '@shared/types';
import type { PolicyDocument } from '@shared/content';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuth, useSiteContent } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { ProductGrid } from '@/components/ProductCard';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  DemoBadge,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LinkButton,
  LoadingBlock,
  PageHeader,
  Textarea,
} from '@/components/ui';

interface PublicSeller {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  story: string | null;
  region: string | null;
  productCount: number;
  imageUrl: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
}

export function MakersPage() {
  const sellers = useQuery({
    queryKey: ['sellers'],
    queryFn: () => api<{ sellers: PublicSeller[] }>('/sellers'),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Makers' }]} />
      <PageHeader
        eyebrow="People, not labels"
        title="The makers behind the shelves"
        lede="Every storefront is reviewed before it appears. In this development build, seller names carry a (demo) marker and photographs are illustrative rather than portraits of the seeded businesses."
      />
      <div className="mt-10">
        {sellers.isLoading ? <LoadingBlock rows={4} /> : null}
        {sellers.isError ? <ErrorState onRetry={() => void sellers.refetch()} /> : null}
        {sellers.data && sellers.data.sellers.length === 0 ? (
          <EmptyState
            title="No makers are published yet"
            body="Seller storefronts appear after an administrator approves a completed application."
            action={<LinkButton to="/sell" size="sm">Become a Maker</LinkButton>}
          />
        ) : null}
        <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {sellers.data?.sellers.map((seller) => (
            <article key={seller.id}>
              <Link to={`/makers/${seller.slug}`} className="group block">
                <div className="aspect-[4/3] overflow-hidden bg-sand/40">
                  {seller.coverUrl || seller.imageUrl ? (
                    <img
                      src={seller.coverUrl || seller.imageUrl || ''}
                      alt={`${seller.name} storefront`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">No photograph yet</div>
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-2xl text-forest group-hover:text-terra">{seller.name}</h2>
                      {seller.name.toLowerCase().includes('(demo)') ? <DemoBadge /> : null}
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.13em] text-muted">
                      {seller.region ?? 'Himachal Pradesh'} · {seller.productCount} listing
                      {seller.productCount === 1 ? '' : 's'}
                    </p>
                    {seller.tagline ? (
                      <p className="mt-3 text-sm leading-relaxed text-ink/70">{seller.tagline}</p>
                    ) : null}
                  </div>
                  <span className="mt-1 text-terra" aria-hidden>↗</span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
      <div className="mt-16 border border-forest/20 bg-forest px-6 py-10 text-paper sm:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/50">For makers and growers</p>
            <h2 className="mt-3 text-3xl text-paper">There should be a shelf for what you make.</h2>
            <p className="mt-2 max-w-xl text-sm text-paper/65">
              Applications are reviewed manually. No listing fee is charged by this demonstration build.
            </p>
          </div>
          <LinkButton to="/sell" variant="terra">Become a Maker</LinkButton>
        </div>
      </div>
    </div>
  );
}

export function MakerDetailPage() {
  const { slug = '' } = useParams();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedMaker, setSavedMaker] = useState(() => {
    try {
      return localStorage.getItem(`pr_saved_maker_${slug}`) === 'true';
    } catch {
      return false;
    }
  });

  const detail = useQuery({
    queryKey: ['maker', slug],
    queryFn: () =>
      api<{
        seller: PublicSeller & { village: string | null; approvedAt: string | null; sellerCategory?: string | null };
        products: { items: ProductSummary[] };
      }>(`/sellers/${encodeURIComponent(slug)}`),
    enabled: Boolean(slug),
  });

  if (detail.isLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"><LoadingBlock rows={3} /></div>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState
          title="This maker is not available"
          body="The storefront may not exist or may no longer be approved. Try the full list of makers."
          onRetry={() => void detail.refetch()}
        />
        <div className="mt-6 text-center"><LinkButton to="/makers" variant="secondary">All makers</LinkButton></div>
      </div>
    );
  }

  const { seller, products } = detail.data;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.push('Store link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.push('Link ready: ' + window.location.href);
    }
  };

  const toggleSave = () => {
    const next = !savedMaker;
    setSavedMaker(next);
    try {
      localStorage.setItem(`pr_saved_maker_${slug}`, String(next));
    } catch {
      // ignore
    }
    toast.push(next ? 'Maker saved to your preferences' : 'Removed from saved makers');
  };

  // Extract categories for store filtering
  const storeCategories = ['all', ...Array.from(new Set(products.items.map((p) => p.categoryName).filter(Boolean)))];

  const filteredProducts = products.items.filter((item) => {
    const matchesCat = activeCategory === 'all' || item.categoryName === activeCategory;
    const matchesQuery = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.shortDescription.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const coverImage = seller.coverUrl;
  const sellerCategoryLabel = seller.sellerCategory ? seller.sellerCategory.replaceAll('_', ' ') : null;

  return (
    <div className="bg-[#FAF7F2]">
      {/* Hero Cover Banner */}
      <div className="relative h-64 sm:h-80 md:h-96 w-full overflow-hidden bg-[#172321]">
        {coverImage ? (
          <img
            src={coverImage}
            alt={`${seller.name} storefront cover`}
            className="h-full w-full object-cover opacity-50 filter saturate-[0.85]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#172321] via-[#172321]/40 to-transparent" />
        <div className="absolute top-4 left-4 sm:top-6 sm:left-8">
          <Breadcrumbs
            items={[
              { label: 'Home', to: '/' },
              { label: 'Makers', to: '/makers' },
              { label: seller.name },
            ]}
          />
        </div>
      </div>

      {/* Artisan Studio Profile Card */}
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-24 sm:-mt-32">
        <div className="rounded-xl border border-[#E4DACE] bg-[#F7F1E7] p-6 sm:p-8 lg:p-10 shadow-lg backdrop-blur-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* Workshop Crest / Portrait */}
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 overflow-hidden rounded-xl border-2 border-white bg-[#172321] shadow-md">
                {seller.logoUrl ? (
                  <img src={seller.logoUrl} alt={`${seller.name} logo`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-serif text-2xl text-[#F7F1E7]">
                    {seller.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="absolute bottom-1 right-1 rounded-full bg-[#66745A] p-1 text-white shadow" title="Approved seller">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#66745A]/30 bg-[#66745A]/10 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-[#66745A]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#66745A]" />
                    Reviewed seller
                  </span>
                  {seller.approvedAt ? (
                    <span className="text-[11px] text-muted">
                      Since {new Date(seller.approvedAt).getFullYear()}
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-2 font-serif text-3xl sm:text-4xl lg:text-5xl text-[#172321]">{seller.name}</h1>

                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#66745A] font-medium">
                  {seller.village ? `${seller.village}, ` : ''}{seller.region ?? 'Himachal Pradesh'}
                  {sellerCategoryLabel ? ` · ${sellerCategoryLabel}` : ''}
                </p>

                {seller.tagline ? (
                  <p className="mt-3 max-w-2xl font-serif text-lg leading-relaxed text-[#172321]/80 italic">
                    "{seller.tagline}"
                  </p>
                ) : null}
              </div>
            </div>

            {/* Actions: Share & Save */}
            <div className="flex flex-wrap items-center gap-3 pt-2 sm:pt-0">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleShare}
                className="flex items-center gap-2 border-[#E4DACE]"
              >
                <svg className="h-4 w-4 text-[#D98263]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {copied ? 'Link Copied!' : 'Share Store'}
              </Button>
              <Button
                size="sm"
                variant={savedMaker ? 'primary' : 'secondary'}
                onClick={toggleSave}
                className="flex items-center gap-2"
              >
                <svg className={`h-4 w-4 ${savedMaker ? 'fill-current text-white' : 'text-[#D98263]'}`} viewBox="0 0 24 24" stroke="currentColor" fill="none">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {savedMaker ? 'Saved' : 'Save Maker'}
              </Button>
            </div>
          </div>

          {/* Real storefront facts */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[#E4DACE]/70 pt-5 text-[11.5px]">
            <span className="font-medium text-[#172321]">Storefront facts:</span>
            <span className="rounded-md border border-[#E4DACE]/60 bg-white/70 px-2.5 py-1 text-[#172321]">
              {seller.village ? `${seller.village}, ` : ''}{seller.region ?? 'Himachal Pradesh'}
            </span>
            {seller.sellerCategory ? (
              <span className="rounded-md border border-[#E4DACE]/60 bg-white/70 px-2.5 py-1 text-[#172321]">
                {seller.sellerCategory}
              </span>
            ) : null}
            <span className="rounded-md border border-[#66745A]/30 bg-[#66745A]/10 px-2.5 py-1 font-medium text-[#66745A]">
              {seller.productCount} approved listing{seller.productCount === 1 ? '' : 's'}
            </span>
            {seller.approvedAt ? (
              <span className="rounded-md border border-[#E4DACE]/60 bg-white/70 px-2.5 py-1 text-[#172321]">
                Seller since {new Date(seller.approvedAt).getFullYear()}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Editorial Maker Story & Production Process */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="rounded-xl border border-[#E4DACE] bg-white p-6 sm:p-8">
            <p className="eyebrow">The Maker's Story</p>
            <h2 className="mt-2 text-2xl sm:text-3xl text-[#172321]">In the maker's own words</h2>
            <div className="mt-4 space-y-4 text-[14.5px] leading-relaxed text-[#172321]/80">
              {seller.story ? (
                <p className="whitespace-pre-line">{seller.story}</p>
              ) : (
                <p className="text-muted">This maker has not published a store story yet.</p>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-[#E4DACE]/70 pt-5 text-center text-xs">
              <div className="rounded-lg bg-[#F7F1E7] p-3">
                <p className="font-serif text-lg font-bold text-[#172321]">{seller.productCount}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">Approved listings</p>
              </div>
              <div className="rounded-lg bg-[#F7F1E7] p-3">
                <p className="font-serif text-lg font-bold text-[#66745A]">{seller.region ?? 'Himachal'}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">Seller region</p>
              </div>
              <div className="rounded-lg bg-[#F7F1E7] p-3 col-span-2 sm:col-span-1">
                <p className="font-serif text-lg font-bold text-[#D98263]">Reviewed</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">Seller status</p>
              </div>
            </div>
          </div>

          {/* What the marketplace actually checks */}
          <div className="rounded-xl border border-[#66745A]/30 bg-[#172321] p-6 sm:p-8 text-white">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D98263]">
              How this storefront is reviewed
            </span>
            <h3 className="mt-2 font-serif text-2xl text-white">Seller and listing checks</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/80">
              A storefront becomes public only after the seller application is approved. Each product then passes its own
              moderation step before it can be listed, searched or added to a cart.
            </p>
            <ul className="mt-5 space-y-2.5 text-xs text-white/90">
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[#D98263]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Seller identity and business details reviewed by an administrator
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[#D98263]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Product details and claims moderated before publication
              </li>
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4 text-[#D98263]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Private documents and contact details are never shown publicly
              </li>
            </ul>
            <div className="mt-6 pt-5 border-t border-white/15 flex items-center justify-between text-xs">
              <span className="text-white/60">Workshop location:</span>
              <span className="font-medium text-[#F7F1E7]">{seller.village ? `${seller.village}, ` : ''}{seller.region ?? 'Himachal Pradesh'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Workshop Catalogue Section */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 border-t border-[#E4DACE]">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="eyebrow">From this workshop</p>
            <h2 className="mt-1 font-serif text-3xl text-[#172321]">Available Listings</h2>
            <p className="mt-1 text-xs text-muted">Approved listings from this seller.</p>
          </div>

          {/* Search within Store */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search this maker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-[#E4DACE] bg-white px-3.5 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[#66745A]"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        {storeCategories.length > 2 ? (
          <div className="mb-6 flex flex-wrap gap-2">
            {storeCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-3.5 py-1 text-xs transition-colors ${
                  activeCategory === cat
                    ? 'bg-[#172321] text-white'
                    : 'bg-white text-ink border border-[#E4DACE] hover:bg-[#F7F1E7]'
                }`}
              >
                {cat === 'all' ? 'All Products' : cat}
              </button>
            ))}
          </div>
        ) : null}

        {filteredProducts.length ? (
          <ProductGrid products={filteredProducts} />
        ) : (
          <EmptyState
            title="No matching products found"
            body={searchQuery ? 'Try clearing your search term to see all available items from this maker.' : 'This maker does not have an active listing in this category at the moment.'}
            action={searchQuery ? <Button size="sm" variant="secondary" onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}>Clear filters</Button> : undefined}
          />
        )}
      </div>
    </div>
  );
}


export function AboutPage() {
  const content = useSiteContent();
  const about = content.data?.content.about;
  return (
    <div>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'About' }]} />
          <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div>
              <p className="eyebrow">About PAHADI ROOTS</p>
              <h1 className="mt-3 max-w-3xl text-4xl leading-[1.05] sm:text-6xl">{about?.title ?? 'A marketplace with mud on its boots'}</h1>
              <p className="mt-6 max-w-2xl text-[15px] leading-[1.85] text-ink/75">{about?.intro}</p>
            </div>
            <figure>
              <div className="aspect-[4/3] overflow-hidden bg-sand/40">
                <img src="/images/editorial-terrace.jpg" alt="Terraced fields in Himachal Pradesh" className="h-full w-full object-cover" />
              </div>
              <figcaption className="mt-2 text-[10px] text-muted">Illustrative photograph via Wikimedia Commons — see image credits.</figcaption>
            </figure>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[0.35fr_0.65fr] lg:px-8">
        <aside className="border-t border-line pt-5">
          <p className="eyebrow">In this document</p>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {(about?.sections ?? []).map((section, index) => (
              <li key={section.heading}>{String(index + 1).padStart(2, '0')} · {section.heading}</li>
            ))}
          </ul>
          <div className="mt-8 border border-terra/25 bg-[#fff8f4] p-4 text-[11.5px] leading-relaxed text-[#7d3d28]">
            This is a development build. Legal entity details, registrations and policy documents are placeholders pending
            completion and professional review.
          </div>
        </aside>
        <article className="prose-editorial max-w-3xl">
          {(about?.sections ?? []).map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))}
          <h2>How to reach a person</h2>
          <p>
            Questions about a seller, a claim or an order go to the support queue. Use the{' '}
            <Link to="/contact">contact form</Link> and include your order number where relevant.
          </p>
        </article>
      </div>
    </div>
  );
}

export function SourcingPage() {
  const content = useSiteContent();
  const sourcing = content.data?.content.sourcing;
  return (
    <div>
      <div className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'How we source' }]} />
          <p className="eyebrow">The standard</p>
          <h1 className="mt-3 max-w-4xl text-4xl leading-[1.04] sm:text-6xl">{sourcing?.title ?? 'How we choose what we sell'}</h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-[1.85] text-ink/75">{sourcing?.intro}</p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-9">
            {(sourcing?.sections ?? []).map((section, index) => (
              <section key={section.heading} className="border-t border-line pt-6">
                <p className="text-[10px] tabular-nums tracking-[0.16em] text-terra">{String(index + 1).padStart(2, '0')}</p>
                <h2 className="mt-2 text-2xl">{section.heading}</h2>
                <p className="mt-3 max-w-2xl text-[14.5px] leading-[1.8] text-ink/70">{section.body}</p>
              </section>
            ))}
          </div>
          <aside className="space-y-6">
            <figure>
              <div className="aspect-[4/5] overflow-hidden bg-sand/40">
                <img src="/images/weaving.jpg" alt="Hands at a wooden handloom" className="h-full w-full object-cover" loading="lazy" />
              </div>
              <figcaption className="mt-2 text-[10px] text-muted">Illustrative photograph via Wikimedia Commons — see image credits.</figcaption>
            </figure>
            <div className="border border-line bg-surface p-5">
              <h2 className="text-lg">What the badges mean</h2>
              <dl className="mt-4 space-y-4 text-[12.5px] leading-relaxed text-muted">
                <div>
                  <dt className="font-medium text-ink">Origin verified</dt>
                  <dd>Shown only where our team has recorded supporting documentation for the stated place of origin.</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Verified purchase</dt>
                  <dd>A review attached to a delivered order item. We do not seed reviews or display testimonials from people who did not buy.</dd>
                </div>
                <div>
                  <dt className="font-medium text-ink">Demo data</dt>
                  <dd>Seeded development records. They are not real businesses, real stock, or evidence of real sales.</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function FaqPage() {
  const content = useSiteContent();
  const faq = content.data?.content.faq;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'FAQ' }]} />
      <PageHeader
        eyebrow="Help"
        title={faq?.title ?? 'Questions, answered plainly'}
        lede={faq?.intro ?? 'If something is missing, write to us and a person will read it.'}
      />
      <div className="mt-8 divide-y divide-line border-y border-line">
        {(faq?.items ?? []).map((item, index) => {
          const expanded = open === index;
          return (
            <div key={item.question}>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-5 py-5 text-left"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
              >
                <span className="font-serif text-lg text-forest">{item.question}</span>
                <span className="mt-1 text-muted" aria-hidden>{expanded ? '−' : '+'}</span>
              </button>
              {expanded ? <p className="max-w-3xl pb-5 pr-8 text-sm leading-[1.8] text-ink/70">{item.answer}</p> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-10 flex flex-col gap-4 border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl">Still unsure about something?</h2>
          <p className="mt-1 text-sm text-muted">Include an order number if your question is about a purchase.</p>
        </div>
        <LinkButton to="/contact" variant="secondary">Contact us</LinkButton>
      </div>
    </div>
  );
}

export function ContactPage() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', orderNumber: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<string | null>(null);
  const { config } = useAuth();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFields({});
    try {
      const result = await api<{ reference: string; message: string }>('/contact', { method: 'POST', body: form });
      setReference(result.reference);
      setForm({ name: '', email: '', subject: '', message: '', orderNumber: '', website: '' });
      toast.push('Your message has been recorded.');
    } catch (error) {
      setFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Contact' }]} />
      <PageHeader
        eyebrow="Contact"
        title="Write to a person"
        lede="Order questions, seller concerns, image credits or corrections. The support queue is reviewed by the marketplace team."
      />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_0.7fr]">
        {reference ? (
          <div>
            <Alert tone="success" title="Message recorded">
              <p>
                Your reference is <strong>{reference}</strong>. Email delivery may not be configured on this deployment,
                but the message is stored in the support queue.
              </p>
            </Alert>
            <Button className="mt-5" variant="secondary" onClick={() => setReference(null)}>Send another message</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" required error={fields.name}>
                <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" />
              </Field>
              <Field label="Email address" required error={fields.email}>
                <Input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Subject" required error={fields.subject}>
                <Input required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
              </Field>
              <Field label="Order number" hint="Optional">
                <Input value={form.orderNumber} onChange={(event) => setForm({ ...form, orderNumber: event.target.value })} placeholder="PR-XXXXXX" />
              </Field>
            </div>
            <Field label="Message" required hint="At least 20 characters" error={fields.message}>
              <Textarea required minLength={20} rows={7} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </Field>
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="hidden"
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
            />
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" loading={submitting}>Send message</Button>
              <span className="text-[11px] text-muted">We will not publish your message or email address.</span>
            </div>
          </form>
        )}
        <aside className="space-y-5">
          <div className="border border-line bg-surface p-5">
            <p className="eyebrow">Support email</p>
            <p className="mt-2 break-all text-sm text-forest">{config?.supportEmail ?? 'Loading…'}</p>
            {config?.supportEmailIsPlaceholder ? (
              <p className="mt-2 text-[11px] leading-relaxed text-terra">
                This is a placeholder address in the development configuration. Replace SUPPORT_EMAIL before launch.
              </p>
            ) : null}
          </div>
          <div className="border border-line bg-surface p-5">
            <p className="eyebrow">Before you write</p>
            <ul className="mt-3 space-y-3 text-[12.5px] leading-relaxed text-muted">
              <li>Order delays: include the order number and the seller shipment reference.</li>
              <li>Returns: start the request from the order page so the item and seller are recorded.</li>
              <li>Seller applications: use the seller dashboard for status and document requests.</li>
              <li>Privacy: request access or deletion from account settings; retention obligations may delay erasure.</li>
            </ul>
          </div>
          <div className="border border-line bg-[#efe7d9] p-5 text-[12px] leading-relaxed text-ink/70">
            <strong className="text-forest">No live chat claim.</strong> This build does not run a chat widget or promise
            instant replies. Messages are stored for manual review.
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CreditsPage() {
  const content = useSiteContent();
  const credits = content.data?.content.credits;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Image credits' }]} />
      <PageHeader eyebrow="Attribution" title="Image credits" lede={credits?.intro ?? 'Loading attribution…'} />
      <div className="mt-8 divide-y divide-line border-y border-line">
        {(credits?.items ?? []).map((item) => (
          <div key={`${item.title}-${item.sourceUrl}`} className="grid gap-2 py-4 sm:grid-cols-[1fr_1fr]">
            <div>
              <p className="font-serif text-lg text-forest">{item.title}</p>
              <p className="text-xs text-muted">{item.author}</p>
            </div>
            <div className="text-[12px] leading-relaxed text-muted">
              <p>{item.license} · used for {item.usedFor}</p>
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-forest underline underline-offset-2">
                Source page
              </a>
            </div>
          </div>
        ))}
        {credits && credits.items.length === 0 ? (
          <p className="py-6 text-sm text-muted">
            Attribution data is not loaded. Run the image fetch script and reseed the site content.
          </p>
        ) : null}
      </div>
      <div className="mt-8 border border-terra/25 bg-[#fff8f4] p-5 text-[12px] leading-relaxed text-[#7d3d28]">
        Photographs are development assets, not original product photography. Replace them with photographs of the actual
        products and makers before launch, and keep signed model or property releases where required.
      </div>
    </div>
  );
}

export function PolicyPage() {
  const { key = '' } = useParams();
  const policy = useQuery({
    queryKey: ['policy', key],
    queryFn: () => api<{ policy: PolicyDocument }>(`/policies/${encodeURIComponent(key)}`),
    enabled: Boolean(key),
  });

  if (policy.isLoading) return <div className="mx-auto max-w-4xl px-4 py-20"><LoadingBlock rows={4} /></div>;
  if (policy.isError || !policy.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState title="That policy is not available" body="The document may have been renamed or is not published." onRetry={() => void policy.refetch()} />
        <div className="mt-6 text-center"><LinkButton to="/" variant="secondary">Back home</LinkButton></div>
      </div>
    );
  }

  const document = policy.data.policy;
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: document.title }]} />
      <PageHeader
        eyebrow="Policy"
        title={document.title}
        lede={document.summary}
        actions={<Badge tone={document.status === 'published' ? 'forest' : 'terra'}>{document.status === 'published' ? 'Published' : 'Draft — not legally reviewed'}</Badge>}
      />
      <p className="mt-3 text-[11px] text-muted">Last updated: {document.lastUpdated}</p>
      {document.status === 'draft' ? (
        <div className="mt-6">
          <Alert tone="warning" title="Draft document">
            This policy is a draft prepared for a development build. It must be reviewed by a qualified Indian lawyer and
            completed with the legal entity's details before it is relied on.
          </Alert>
        </div>
      ) : null}
      <article className="prose-editorial mt-10">
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.split('\n').map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
      <div className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-xs">
        <Link to="/policies/shipping" className="link-underline text-muted">Shipping</Link>
        <Link to="/policies/returns" className="link-underline text-muted">Returns</Link>
        <Link to="/policies/privacy" className="link-underline text-muted">Privacy</Link>
        <Link to="/policies/terms" className="link-underline text-muted">Terms</Link>
        <Link to="/policies/seller-terms" className="link-underline text-muted">Seller terms</Link>
        <Link to="/contact" className="link-underline text-muted">Contact</Link>
      </div>
    </div>
  );
}

export { BecomeAMakerPage as SellPage } from './BecomeAMakerPage';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-5xl">This path does not exist</h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
        The page may have moved, or the link may be incomplete. Nothing has been charged or changed by visiting this
        address.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <LinkButton to="/">Back home</LinkButton>
        <LinkButton to="/shop" variant="secondary">Browse the shop</LinkButton>
      </div>
    </div>
  );
}
