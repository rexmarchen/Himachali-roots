import { useState, useTransition, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PublicMaker, MakersQueryResponse } from '@shared/types';
import { api } from '@/lib/api';
import { usePageMeta } from '@/lib/usePageMeta';
import { Breadcrumbs, Button, LinkButton } from '@/components/ui';

const CATEGORY_CHIPS = [
  { label: 'All Crafts', slug: 'all' },
  { label: 'Shawls & Handlooms', slug: 'shawls-and-handlooms' },
  { label: 'Tea & Botanicals', slug: 'tea-and-botanicals' },
  { label: 'Honey & Preserves', slug: 'honey-and-preserves' },
  { label: 'Pulses & Staples', slug: 'pulses-and-staples' },
  { label: 'Warm Knitwear', slug: 'knitwear' },
  { label: 'High Orchards', slug: 'orchard-and-nuts' },
];

const REGIONS = [
  'All Valleys',
  'Kullu',
  'Kangra',
  'Kinnaur',
  'Lahaul and Spiti',
  'Chamba',
  'Shimla',
];

const CRAFT_STORIES = [
  {
    title: 'The Pit Looms of Naggar',
    valley: 'Kullu Valley · 1,800m',
    image: '/images/weaving.jpg',
    excerpt:
      'Weaving indigenous desi sheep wool on sunken wooden pit looms during alpine winter freezes. Geometric border patterns encode centuries of valley folklore and generational memory.',
    tag: 'Living Heritage',
  },
  {
    title: 'Dawn Mist in the Dhauladhars',
    valley: 'Kangra Valley · 1,450m',
    image: '/images/region-kangra.jpg',
    excerpt:
      'Plucked at first light when glacial morning mist hangs over the foothills. Single-estate orthodox whole leaf tea pan-fired in hand-tended woks to preserve floral and muscatel notes.',
    tag: 'Single Estate',
  },
  {
    title: 'Cold Desert Wild Foraging',
    valley: 'Lahaul & Spiti · 3,100m',
    image: '/images/maker-food.jpg',
    excerpt:
      'Harvesting white clover wild honey and cold-pressing golden apricot kernels in trans-Himalayan valleys where crisp glacial runoff nurtures pure, unadulterated mountain flora.',
    tag: 'Wild Foraged',
  },
];

export function MakersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  usePageMeta({
    title: 'Meet the makers · Dear Hills',
    description:
      'The growers, weavers and workshop owners of Himachal Pradesh who sell directly on Dear Hills.',
    canonicalPath: '/makers',
  });

  // Read state from URL search params
  const searchQuery = searchParams.get('q') || '';
  const selectedCategory = searchParams.get('category') || 'all';
  const selectedRegion = searchParams.get('region') || 'All Valleys';
  const verifiedOnly = searchParams.get('verified') === 'true';
  const sortBy = searchParams.get('sort') || 'products';

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);

  // Sync query parameters helper
  const updateParams = (updates: Record<string, string | null>) => {
    startTransition(() => {
      const next = new URLSearchParams(searchParams);
      for (const [key, val] of Object.entries(updates)) {
        if (!val || val === 'all' || val === 'All Valleys' || val === 'false') {
          next.delete(key);
        } else {
          next.set(key, val);
        }
      }
      setSearchParams(next, { replace: true });
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: searchInput.trim() || null });
  };

  const handleClearFilters = () => {
    setSearchInput('');
    startTransition(() => {
      setSearchParams(new URLSearchParams(), { replace: true });
    });
  };

  const isFiltered = Boolean(searchQuery || (selectedCategory !== 'all') || (selectedRegion !== 'All Valleys') || verifiedOnly || (sortBy !== 'products'));

  // Build API query string
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedCategory && selectedCategory !== 'all') params.set('category', selectedCategory);
    if (selectedRegion && selectedRegion !== 'All Valleys') params.set('region', selectedRegion);
    if (verifiedOnly) params.set('verified', 'true');
    if (sortBy) params.set('sort', sortBy);
    params.set('limit', '48');
    return params.toString();
  }, [searchQuery, selectedCategory, selectedRegion, verifiedOnly, sortBy]);

  const query = useQuery({
    queryKey: ['makers', queryString],
    queryFn: () => api<MakersQueryResponse>(`/makers?${queryString}`),
    staleTime: 60_000,
  });

  const makers = query.data?.makers ?? [];
  const total = query.data?.pagination?.total ?? makers.length;

  return (
    <div className="min-h-screen bg-paper text-ink selection:bg-forest selection:text-paper">
      {/* Editorial Navigation Breadcrumbs */}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Makers & Artisans' }]} />
      </div>

      {/* Diwali Maker Cohort Invitation Banner */}
      <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-md border border-[#D4A373]/50 bg-gradient-to-r from-[#2B1B17] via-[#382017] to-[#2B1B17] px-4 py-3 text-paper shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🪔</span>
            <p className="text-xs text-[#F7EBE1]">
              <strong className="text-[#F4D06F]">Diwali Maker Initiative:</strong> Are you crafting or growing in Himachal? Sell this Diwali with <strong>0% Commission</strong> &amp; free storytelling.
            </p>
          </div>
          <Link
            to="/become-a-maker?offer=diwali"
            className="shrink-0 text-xs font-semibold text-[#F4D06F] hover:text-white underline underline-offset-2 transition-colors"
          >
            Join as a Maker &rarr;
          </Link>
        </div>
      </div>

      {/* =========================================================================
          SECTION A: EDITORIAL HERO
         ========================================================================= */}
      <section className="relative overflow-hidden border-b border-sand bg-[#fbf7f0] pt-6 pb-12 sm:pb-16 lg:pt-10 lg:pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
            {/* Hero Left: Editorial Story & Search */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-forest/15 bg-surface/80 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-terra">
                <span className="h-1.5 w-1.5 rounded-full bg-terra animate-pulse" />
                PEOPLE, NOT LABELS
              </div>

              <h1 className="mt-4 font-serif text-3xl leading-[1.08] text-forest sm:text-5xl lg:text-6xl">
                Meet the hands behind the Himalayas.
              </h1>

              <p className="mt-5 max-w-2xl font-sans text-base leading-relaxed text-ink/75 sm:text-lg">
                Every piece has a place, a person, and a story. Discover independent craftspeople, traditional
                handloom weavers, small tea estates, and high-altitude farmers preserving Himalayan traditions and
                bringing their craft to your home.
              </p>

              {/* Integrated Search Box */}
              <form onSubmit={handleSearchSubmit} className="mt-8 max-w-xl">
                <div className="relative flex items-center shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-forest/50">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Find a maker, craft, village or speciality..."
                    className="w-full rounded-sm border border-sand bg-surface py-3.5 pl-11 pr-28 text-sm text-ink placeholder:text-muted/70 transition-all focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/10"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput('');
                          updateParams({ q: null });
                        }}
                        className="rounded px-2 py-1 text-xs text-muted hover:text-forest"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="submit"
                      className="rounded-sm bg-forest px-4 py-2 text-xs font-semibold tracking-wide text-paper hover:bg-forest-deep transition-colors"
                    >
                      Search
                    </button>
                  </div>
                </div>
              </form>

              {/* Supporting Valley Tags */}
              <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-forest/70">Heritage Regions:</span>
                {['Kullu Valley', 'Kangra Foothills', 'Kinnaur Highlands', 'Lahaul & Spiti', 'Ravi Valley Chamba'].map((valley) => (
                  <span
                    key={valley}
                    className="inline-flex items-center rounded-sm border border-sand/80 bg-surface/60 px-2 py-0.5 text-[11px] text-ink/75"
                  >
                    {valley}
                  </span>
                ))}
              </div>
            </div>

            {/* Hero Right: High-Quality Himalayan Artisan Photograph */}
            <div className="relative lg:col-span-5">
              <div className="relative mx-auto aspect-[4/3] max-w-lg overflow-hidden rounded-sm border border-forest/10 bg-sand/30 shadow-md sm:aspect-[5/4] lg:max-w-none">
                <img
                  src="/images/makers-hands.jpg"
                  alt="Himalayan artisan hands guiding authentic wool loom"
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-forest/85 via-forest/20 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-5 text-paper">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sand/80">Centuries of Craft</p>
                  <p className="font-serif text-lg leading-snug sm:text-xl">
                    "Every warp and weft is drawn from mountain sheep wool, spun by hand when winter snows settle."
                  </p>
                  <p className="mt-1 text-[11px] text-paper/70">— Artisan Loom Collective, Naggar</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION B: MAKER DISCOVERY CONTROLS & FILTERING
         ========================================================================= */}
      <section className="sticky top-0 z-20 border-b border-sand bg-paper/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Horizontal Category Chips */}
            <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              {CATEGORY_CHIPS.map((cat) => {
                const isActive = (selectedCategory === cat.slug) || (cat.slug === 'all' && !searchParams.get('category'));
                return (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => updateParams({ category: cat.slug === 'all' ? null : cat.slug })}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                      isActive
                        ? 'bg-forest text-paper shadow-sm'
                        : 'border border-sand bg-surface/70 text-ink/80 hover:border-forest/40 hover:bg-surface'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Region, Verified Toggle, Sort, Reset */}
            <div className="hidden sm:flex flex-wrap items-center justify-between gap-2.5 sm:justify-end">
              {/* Region Selector */}
              <div className="relative inline-block">
                <select
                  value={selectedRegion}
                  onChange={(e) => updateParams({ region: e.target.value === 'All Valleys' ? null : e.target.value })}
                  aria-label="Filter by region"
                  className="rounded-sm border border-sand bg-surface py-1.5 pl-3 pr-8 text-xs font-medium text-ink transition-colors hover:border-forest/40 focus:border-forest focus:outline-none"
                >
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Verified Filter Button */}
              <button
                type="button"
                onClick={() => updateParams({ verified: verifiedOnly ? null : 'true' })}
                className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                  verifiedOnly
                    ? 'border border-sage bg-sage/15 text-forest font-semibold'
                    : 'border border-sand bg-surface text-muted hover:border-forest/40 hover:text-ink'
                }`}
                title="Show only verified authentic makers"
              >
                <svg className={`h-3.5 w-3.5 ${verifiedOnly ? 'text-forest' : 'text-muted'}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified Only
              </button>

              {/* Sort Dropdown */}
              <div className="relative inline-block">
                <select
                  value={sortBy}
                  onChange={(e) => updateParams({ sort: e.target.value === 'products' ? null : e.target.value })}
                  aria-label="Sort makers"
                  className="rounded-sm border border-sand bg-surface py-1.5 pl-3 pr-8 text-xs font-medium text-ink transition-colors hover:border-forest/40 focus:border-forest focus:outline-none"
                >
                  <option value="products">Most creations</option>
                  <option value="newest">Newest approved</option>
                  <option value="name_asc">Name (A–Z)</option>
                  <option value="name_desc">Name (Z–A)</option>
                </select>
              </div>

              {/* Clear Filters Button */}
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs font-semibold text-terra hover:underline"
                >
                  Reset all
                </button>
              )}
            </div>

            {/* Mobile Filter Button */}
            <div className="flex items-center justify-between sm:hidden">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-sand bg-surface px-3 py-1.5 text-xs font-medium text-forest shadow-xs"
              >
                <svg className="h-4 w-4 text-terra" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filter & Sort {isFiltered ? '(Active)' : ''}
              </button>
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs font-semibold text-terra"
                >
                  Reset all
                </button>
              )}
            </div>
          </div>

          {/* Mobile Filter Drawer / Modal */}
          {mobileFiltersOpen && (
            <div className="fixed inset-0 z-50 flex sm:hidden" role="dialog" aria-modal="true">
              <div className="fixed inset-0 bg-forest/40 backdrop-blur-xs" onClick={() => setMobileFiltersOpen(false)} />
              <div className="relative ml-auto flex h-full w-full max-w-xs flex-col overflow-y-auto bg-paper p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-sand pb-4">
                  <h3 className="font-serif text-lg text-forest">Filter Makers</h3>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="p-1 text-muted hover:text-forest"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-6 space-y-6">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-forest/70">Heritage Region</label>
                    <select
                      value={selectedRegion}
                      onChange={(e) => updateParams({ region: e.target.value === 'All Valleys' ? null : e.target.value })}
                      className="mt-2 w-full rounded-sm border border-sand bg-surface p-2 text-xs text-ink"
                    >
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-forest/70">Sort By</label>
                    <select
                      value={sortBy}
                      onChange={(e) => updateParams({ sort: e.target.value === 'products' ? null : e.target.value })}
                      className="mt-2 w-full rounded-sm border border-sand bg-surface p-2 text-xs text-ink"
                    >
                      <option value="products">Most creations</option>
                      <option value="newest">Newest approved</option>
                      <option value="name_asc">Name (A–Z)</option>
                      <option value="name_desc">Name (Z–A)</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-forest">
                      <input
                        type="checkbox"
                        checked={verifiedOnly}
                        onChange={(e) => updateParams({ verified: e.target.checked ? 'true' : null })}
                        className="rounded border-sand text-forest"
                      />
                      Verified Artisans Only
                    </label>
                  </div>
                </div>
                <div className="mt-auto border-t border-sand pt-4 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => setMobileFiltersOpen(false)}
                  >
                    Done
                  </Button>
                  {isFiltered && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        handleClearFilters();
                        setMobileFiltersOpen(false);
                      }}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Active Filter Chips / Status summary */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between border-t border-sand/60 pt-2 text-[11px] text-muted">
            <div>
              {query.isLoading ? (
                <span>Finding approved Himalayan makers…</span>
              ) : (
                <span>
                  Showing <strong className="text-forest">{total}</strong> authentic maker{total === 1 ? '' : 's'}
                  {selectedRegion !== 'All Valleys' && ` in ${selectedRegion}`}
                  {searchQuery && ` matching "${searchQuery}"`}
                </span>
              )}
            </div>
            <div className="hidden sm:block text-[11px] tracking-wide text-forest/70">
              Direct from artisan looms, mountain apiaries & orchard groves
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION C: MAKER CARDS & ROBUST STATE MANAGEMENT
         ========================================================================= */}
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* State: Inline Error with working retry */}
        {query.isError && (
          <div className="mb-8 rounded-sm border border-terra/30 bg-[#fff9f6] p-6 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-terra/15 text-terra">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="font-serif text-xl text-forest">We couldn't load the makers right now</h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
              The marketplace connection encountered an interruption. Please try again or check back shortly.
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void query.refetch()}
                disabled={query.isFetching}
              >
                {query.isFetching ? 'Connecting…' : 'Try again'}
              </Button>
            </div>
          </div>
        )}

        {/* State: Loading Skeletons */}
        {query.isLoading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-sm border border-sand bg-surface p-4 shadow-sm" aria-busy="true">
                <div className="aspect-[16/10] w-full rounded-sm bg-sand/30 animate-pulse" />
                <div className="mt-4 space-y-2.5">
                  <div className="h-4 w-1/3 rounded bg-sand/40 animate-pulse" />
                  <div className="h-6 w-3/4 rounded bg-sand/40 animate-pulse" />
                  <div className="h-3 w-full rounded bg-sand/30 animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-sand/30 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* State: Empty Result */}
        {!query.isLoading && !query.isError && makers.length === 0 && (
          <div className="mx-auto max-w-xl rounded-sm border border-dashed border-sand bg-surface/70 px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand/40 text-forest/60">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="font-serif text-2xl text-forest">We're preparing our first collection of maker stories</h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
              {isFiltered
                ? 'No makers match the chosen filters or search query. Try clearing your filters to see all published artisans.'
                : 'Approved maker storefronts appear as artisan profiles are reviewed and published by our curation team.'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {isFiltered ? (
                <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                  Clear all filters
                </Button>
              ) : (
                <LinkButton to="/become-a-maker?offer=diwali" variant="terra" size="sm">
                  Join as a Maker (0% Commission Diwali Offer) &rarr;
                </LinkButton>
              )}
            </div>
          </div>
        )}

        {/* Successful Maker Grid */}
        {!query.isLoading && !query.isError && makers.length > 0 && (
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {makers.map((maker: PublicMaker) => {
              const displayImage = maker.coverUrl || maker.imageUrl || maker.logoUrl || '/images/weaving.jpg';
              return (
                <article
                  key={maker.id}
                  className="group flex flex-col justify-between overflow-hidden rounded-sm border border-sand bg-surface transition-all duration-300 hover:border-forest/30 hover:shadow-md"
                >
                  <Link to={`/makers/${maker.slug}`} className="block">
                    {/* Maker Image with Badges */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-sand/30">
                      <img
                        src={displayImage}
                        alt={`${maker.name} storefront`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-forest/75 via-transparent to-transparent opacity-80" />

                      {/* Top Badges */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                        {maker.region ? (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-forest/85 px-2.5 py-1 text-[11px] font-medium text-paper backdrop-blur-xs">
                            <svg className="h-3 w-3 text-terra" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            {maker.village ? `${maker.village}, ${maker.region}` : maker.region}
                          </span>
                        ) : <span />}

                        {maker.isVerified && (
                          <span className="inline-flex items-center gap-1 rounded-sm bg-surface/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-forest shadow-xs">
                            <svg className="h-3 w-3 text-sage" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            Verified
                          </span>
                        )}
                      </div>

                      {/* Bottom Image Overlay: Product Count */}
                      <div className="absolute bottom-3 left-3 text-paper">
                        <span className="text-[11px] tracking-wide text-sand/90">
                          {maker.productCount} authentic creation{maker.productCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-serif text-2xl font-normal leading-snug text-forest group-hover:text-terra transition-colors">
                          {maker.name}
                        </h2>
                        {maker.yearsOperating && (
                          <span className="shrink-0 rounded-sm bg-sand/35 px-2 py-0.5 text-[10px] font-semibold text-muted">
                            {maker.yearsOperating}+ yrs craft
                          </span>
                        )}
                      </div>

                      {/* Tagline / Excerpt */}
                      {maker.tagline && (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-ink/75">
                          {maker.tagline}
                        </p>
                      )}

                      {/* Speciality Badges */}
                      {maker.specialities && maker.specialities.length > 0 && (
                        <div className="mt-3.5 flex flex-wrap gap-1.5">
                          {maker.specialities.slice(0, 3).map((spec) => (
                            <span
                              key={spec}
                              className="rounded-sm border border-sand bg-paper/60 px-2 py-0.5 text-[10px] font-medium text-muted"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Card Footer: Storefront Link */}
                  <div className="border-t border-sand/70 bg-paper/30 px-5 py-3">
                    <Link
                      to={`/makers/${maker.slug}`}
                      className="inline-flex w-full items-center justify-between text-xs font-semibold text-forest group-hover:text-terra transition-colors"
                    >
                      <span>Meet the maker</span>
                      <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
                        →
                      </span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* =========================================================================
          SECTION D: AUTHENTIC HIMALAYAN MAKER STORIES (EDITORIAL)
         ========================================================================= */}
      <section className="border-t border-sand bg-[#f8f3ea] py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-terra">Living Traditions</p>
            <h2 className="mt-2 font-serif text-3xl text-forest sm:text-4xl">
              From mountain valleys to your home.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
              Himalayan craftsmanship is shaped by seasonal rhythms, cold mountain weather, and centuries of
              communal knowledge. Here is how authentic goods are created across the valleys.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {CRAFT_STORIES.map((story) => (
              <div
                key={story.title}
                className="overflow-hidden rounded-sm border border-sand bg-surface shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="aspect-[16/10] overflow-hidden bg-sand/30">
                  <img
                    src={story.image}
                    alt={story.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{story.valley}</span>
                    <span className="font-semibold text-terra">{story.tag}</span>
                  </div>
                  <h3 className="mt-2 font-serif text-xl text-forest">{story.title}</h3>
                  <p className="mt-2.5 text-xs leading-relaxed text-ink/75">{story.excerpt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION E: MAKER RECRUITMENT CTA
         ========================================================================= */}
      <section className="border-t border-forest/10 bg-forest text-paper py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sand/70">
                FOR ARTISANS, GROWERS & COOPERATIVES
              </p>
              <h2 className="mt-3 font-serif text-3xl leading-tight text-paper sm:text-4xl lg:text-5xl">
                Your craft deserves a wider world.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-paper/80 sm:text-base">
                Bring your products, traditions, and story to Dear Hills. We build your online storefront, handle
                insured cold and warm shipping across India, and connect you with customers who value authentic
                craftsmanship.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <LinkButton to="/sell#apply" variant="terra" size="lg">
                  Become a Maker
                </LinkButton>
                <Link
                  to="/sell#how-it-works"
                  className="text-xs font-semibold tracking-wide text-sand hover:text-white underline underline-offset-4"
                >
                  How selling works →
                </Link>
              </div>
            </div>

            {/* Benefit pillars */}
            <div className="space-y-4 rounded-sm border border-paper/15 bg-paper/5 p-6 backdrop-blur-xs lg:col-span-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terra/20 text-terra text-xs font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-paper">Direct Payouts</h4>
                  <p className="mt-0.5 text-[11px] text-paper/70">Fair producer prices paid promptly into your account.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terra/20 text-terra text-xs font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-paper">No Upfront Fees</h4>
                  <p className="mt-0.5 text-[11px] text-paper/70">Zero listing fees to open and maintain your storefront.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terra/20 text-terra text-xs font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-paper">Authentic Storytelling</h4>
                  <p className="mt-0.5 text-[11px] text-paper/70">Dedicated photography and narrative for your workshop.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
