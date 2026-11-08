import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, Paged, ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { usePageMeta } from '@/lib/usePageMeta';
import { ProductGrid } from '@/components/ProductCard';
import {
  Badge,
  Breadcrumbs,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
  Modal,
  Pagination,
  PageHeader,
  Select,
} from '@/components/ui';

interface ProductFilters {
  categories: Category[];
  sellers: { name: string; slug: string }[];
  regions: { region: string; productCount: number }[];
  priceRangePaise: { min: number | null; max: number | null };
}

interface ProductListResponse extends Paged<ProductSummary> {
  filters: ProductFilters;
}

const SORTS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'popular', label: 'Most purchased' },
];

export function ShopPage() {
  const { config } = useAuth();
  const freeShippingThreshold = config?.shipping.freeThresholdPaise ?? 0;
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const queryString = params.toString();
  const products = useQuery({
    queryKey: ['products', queryString],
    queryFn: () => api<ProductListResponse>(`/products?${queryString}`),
    staleTime: 30_000,
  });

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const activeCount = useMemo(() => {
    return ['q', 'category', 'seller', 'region', 'minPrice', 'maxPrice', 'inStock'].filter((key) => params.get(key)).length;
  }, [params]);

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });
  const filters = products.data?.filters;
  const category = params.get('category');
  const seller = params.get('seller');
  const region = params.get('region');
  const sort = params.get('sort') ?? 'relevance';
  const page = Number(params.get('page') ?? 1) || 1;
  const q = params.get('q') ?? '';

  const activeCategory = useMemo(() => {
    return filters?.categories.find((item) => item.slug === category);
  }, [filters, category]);

  const liveCategories = useMemo(
    () => (filters?.categories ?? []).filter((item) => (item.productCount ?? 0) > 0),
    [filters],
  );

  usePageMeta({
    title: q
      ? `Search results for “${q}” · Dear Hills`
      : activeCategory
        ? `${activeCategory.name} · Dear Hills`
        : 'Shop all products · Dear Hills',
    description:
      activeCategory?.description ??
      'Browse authentic Himachali shawls, tea, honey, dry fruit, oils and pantry staples from reviewed local makers.',
    canonicalPath: '/shop',
    image: activeCategory?.imageUrl ?? null,
  });

  return (
    <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8 xl:px-10 lg:py-12">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shop' }]} />
      <PageHeader
        eyebrow={q ? `Search results for “${q}”` : activeCategory ? 'Category Collection' : 'The Catalogue'}
        title={q ? 'Search the shelves' : activeCategory ? activeCategory.name : 'All Products'}
        lede={
          activeCategory?.description
            ? activeCategory.description
            : 'Small-batch goods from reviewed Himachali sellers. Prices include applicable taxes; shipping is calculated before checkout.'
        }
      />

      {/* Category quick filters: only shelves with live listings are shown. */}
      {liveCategories.length ? (
        <div className="no-scrollbar -mx-4 mt-6 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <div className="flex min-w-max items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => update('category', null)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-all ${
                !category
                  ? 'border-forest bg-forest font-semibold text-paper shadow-xs'
                  : 'border-line bg-surface text-ink/80 hover:border-forest/40 hover:bg-paper'
              }`}
            >
              <span>All shelves</span>
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10.5px] ${!category ? 'bg-white/20 text-white' : 'bg-forest/[0.06] text-muted'}`}>
                {liveCategories.reduce((total, item) => total + (item.productCount ?? 0), 0)}
              </span>
            </button>

            {liveCategories.map((item) => {
              const isSelected = category === item.slug;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update('category', isSelected ? null : item.slug)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-all ${
                    isSelected
                      ? 'border-forest bg-forest font-semibold text-paper shadow-xs'
                      : 'border-line bg-surface text-ink/80 hover:border-forest/40 hover:bg-paper'
                  }`}
                >
                  <span>{item.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10.5px] ${isSelected ? 'bg-white/20 text-white' : 'bg-forest/[0.06] text-muted'}`}>
                    {item.productCount ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[230px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-7">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Categories</p>
              <ul className="space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => update('category', null)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                      !category
                        ? 'font-semibold text-forest bg-forest/[0.08] border border-forest/20'
                        : 'text-ink/70 hover:bg-paper hover:text-forest'
                    }`}
                  >
                    <span>All shelves</span>
                    <span className="text-[10px] font-mono text-muted">
                      {liveCategories.reduce((total, item) => total + (item.productCount ?? 0), 0)}
                    </span>
                  </button>
                </li>
                {liveCategories.map((item) => {
                  const isSelected = category === item.slug;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => update('category', item.slug)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                          isSelected
                            ? 'font-semibold text-forest bg-forest/[0.08] border border-forest/20'
                            : 'text-ink/70 hover:bg-paper hover:text-forest'
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${isSelected ? 'bg-forest/15 text-forest font-semibold' : 'text-muted'}`}>
                          {item.productCount ?? 0}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {filters?.regions.length ? (
              <div className="border-t border-line pt-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Region</p>
                <div className="flex flex-wrap gap-1.5">
                  {filters.regions.map((item) => (
                    <button
                      key={item.region}
                      type="button"
                      onClick={() => update('region', region === item.region ? null : item.region)}
                      className={`border px-2 py-1 text-[11px] ${
                        region === item.region ? 'border-forest bg-forest text-paper' : 'border-line bg-surface text-ink hover:border-forest/40'
                      }`}
                    >
                      {item.region}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {filters?.sellers.length ? (
              <div className="border-t border-line pt-5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Maker</p>
                <Select value={seller ?? ''} onChange={(event) => update('seller', event.target.value || null)} aria-label="Filter by maker">
                  <option value="">All makers</option>
                  {filters.sellers.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div className="border-t border-line pt-5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Price (₹)</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder={filters?.priceRangePaise.min ? String(Math.floor(filters.priceRangePaise.min / 100)) : 'Min'}
                  defaultValue={params.get('minPrice') ? String(Number(params.get('minPrice')) / 100) : ''}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    update('minPrice', value ? String(Math.round(Number(value) * 100)) : null);
                  }}
                  aria-label="Minimum price in rupees"
                  className="h-9 px-2 text-xs"
                />
                <span className="text-muted">–</span>
                <Input
                  type="number"
                  min={0}
                  placeholder={filters?.priceRangePaise.max ? String(Math.ceil(filters.priceRangePaise.max / 100)) : 'Max'}
                  defaultValue={params.get('maxPrice') ? String(Number(params.get('maxPrice')) / 100) : ''}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    update('maxPrice', value ? String(Math.round(Number(value) * 100)) : null);
                  }}
                  aria-label="Maximum price in rupees"
                  className="h-9 px-2 text-xs"
                />
              </div>
              <label className="mt-4 flex items-center gap-2 text-[12.5px] text-ink/80">
                <input
                  type="checkbox"
                  checked={params.get('inStock') === 'true'}
                  onChange={(event) => update('inStock', event.target.checked ? 'true' : null)}
                  className="accent-forest"
                />
                In stock only
              </label>
              {activeCount > 0 ? (
                <Button variant="ghost" size="sm" className="mt-4 px-0 text-xs" onClick={clearAll}>
                  Clear filters ({activeCount})
                </Button>
              ) : null}
            </div>
          </div>
        </aside>

        <div>
          {/* Editorial Category Showcase Banner */}
          {activeCategory && !q ? (
            <div className="mb-6 overflow-hidden rounded-xl border border-line bg-gradient-to-br from-[#FAF6F0] via-surface to-[#F3EDE2] p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1 rounded bg-forest/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-forest">
                      <TagIcon className="h-3 w-3" />
                      Featured Department
                    </span>
                    <span className="text-[11px] text-muted">
                      {products.data?.total ?? activeCategory.productCount ?? 0} approved listings
                    </span>
                  </div>
                  <h2 className="font-serif text-2xl sm:text-3xl font-medium text-forest tracking-tight">
                    {activeCategory.name}
                  </h2>
                  {activeCategory.description ? (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink/75 font-sans">
                      {activeCategory.description}
                    </p>
                  ) : null}

                  <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[11px] text-ink/75">
                    <span className="inline-flex items-center gap-1 rounded-sm border border-line/70 bg-paper px-2 py-0.5 shadow-2xs">
                      <MountainIcon className="h-3 w-3 text-forest" />
                      Approved listings only
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-sm border border-line/70 bg-paper px-2 py-0.5 shadow-2xs">
                      <CheckCircleIcon className="h-3 w-3 text-terra" />
                      Seller reviewed
                    </span>
                    {freeShippingThreshold > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-line/70 bg-paper px-2 py-0.5 shadow-2xs">
                        <TruckIcon className="h-3 w-3 text-forest" />
                        Free shipping over {formatINR(freeShippingThreshold)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {activeCategory.imageUrl ? (
                  <div className="hidden sm:block shrink-0">
                    <img
                      src={activeCategory.imageUrl}
                      alt={activeCategory.name}
                      className="h-24 w-24 sm:h-28 sm:w-28 rounded-lg object-cover border border-line shadow-sm"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <p className="text-xs text-muted">
              {products.data ? `${products.data.total} listing${products.data.total === 1 ? '' : 's'}` : 'Loading…'}
              {region ? ` in ${region}` : ''}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="sort" className="text-[11px] text-muted">
                Sort
              </label>
              <Select id="sort" value={sort} onChange={(event) => update('sort', event.target.value)} className="h-9 w-auto py-1.5 text-xs">
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2 lg:hidden">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setFiltersOpen(true)}
              className="gap-2"
              aria-haspopup="dialog"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden>
                <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
              </svg>
              Filters
              {activeCount > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-terra px-1 text-[10px] font-bold text-white">
                  {activeCount}
                </span>
              ) : null}
            </Button>
            <Select
              value={category ?? ''}
              onChange={(event) => update('category', event.target.value || null)}
              aria-label="Category"
              className="h-11 w-auto max-w-[190px] text-xs"
            >
              <option value="">All categories</option>
              {liveCategories.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select
              value={region ?? ''}
              onChange={(event) => update('region', event.target.value || null)}
              aria-label="Region"
              className="h-11 w-auto max-w-[160px] text-xs"
            >
              <option value="">All regions</option>
              {filters?.regions.map((item) => (
                <option key={item.region} value={item.region}>
                  {item.region}
                </option>
              ))}
            </Select>
          </div>

          {activeCount > 0 ? (
            <div className="mb-5 flex flex-wrap gap-2">
              {q ? <FilterChip label={`“${q}”`} onClear={() => update('q', null)} /> : null}
              {category ? <FilterChip label={filters?.categories.find((item) => item.slug === category)?.name ?? category} onClear={() => update('category', null)} /> : null}
              {region ? <FilterChip label={region} onClear={() => update('region', null)} /> : null}
              {seller ? <FilterChip label={filters?.sellers.find((item) => item.slug === seller)?.name ?? seller} onClear={() => update('seller', null)} /> : null}
              {params.get('inStock') ? <FilterChip label="In stock" onClear={() => update('inStock', null)} /> : null}
            </div>
          ) : null}

          {products.isLoading ? (
            <LoadingBlock rows={4} />
          ) : products.isError ? (
            <ErrorState onRetry={() => void products.refetch()} />
          ) : products.data && products.data.items.length ? (
            <>
              <ProductGrid products={products.data.items} />
              <Pagination page={page} totalPages={products.data.totalPages} onChange={(next) => update('page', String(next))} />
            </>
          ) : (
            <EmptyState
              eyebrow="Nothing on this shelf"
              title="No listings match those filters"
              body="Try removing a filter, searching for a different material, or browsing all products. New listings appear after seller and admin review."
              action={
                <Button variant="secondary" onClick={clearAll}>
                  Clear filters
                </Button>
              }
            />
          )}

          <div className="mt-12 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
            <p>
              Listings marked <Badge tone="terra">Demo data</Badge> are seeded development records, not live commerce.
              Product photography is illustrative and credited on the <Link to="/credits" className="underline underline-offset-2">credits page</Link>.
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter & sort"
        footer={
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                clearAll();
                setFiltersOpen(false);
              }}
            >
              Reset
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Show results
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Category</p>
            <div className="grid gap-1">
              <button
                type="button"
                onClick={() => update('category', null)}
                className={`flex min-h-11 items-center justify-between rounded-md border px-3 text-left text-[13px] ${
                  !category ? 'border-forest bg-forest text-paper' : 'border-line bg-surface text-ink'
                }`}
              >
                <span>All shelves</span>
                <span className="text-[11px]">{liveCategories.reduce((total, item) => total + (item.productCount ?? 0), 0)}</span>
              </button>
              {liveCategories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update('category', category === item.slug ? null : item.slug)}
                  className={`flex min-h-11 items-center justify-between rounded-md border px-3 text-left text-[13px] ${
                    category === item.slug ? 'border-forest bg-forest text-paper' : 'border-line bg-surface text-ink'
                  }`}
                >
                  <span className="truncate">{item.name}</span>
                  <span className="ml-2 text-[11px]">{item.productCount ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {filters?.regions.length ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Region</p>
              <div className="flex flex-wrap gap-2">
                {filters.regions.map((item) => (
                  <button
                    key={item.region}
                    type="button"
                    onClick={() => update('region', region === item.region ? null : item.region)}
                    className={`min-h-10 border px-3 text-[12px] ${
                      region === item.region ? 'border-forest bg-forest text-paper' : 'border-line bg-surface text-ink'
                    }`}
                  >
                    {item.region}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {filters?.sellers.length ? (
            <div>
              <label htmlFor="mobile-maker" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Maker
              </label>
              <Select id="mobile-maker" value={seller ?? ''} onChange={(event) => update('seller', event.target.value || null)}>
                <option value="">All makers</option>
                {filters.sellers.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Price (₹)</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={filters?.priceRangePaise.min ? String(Math.floor(filters.priceRangePaise.min / 100)) : 'Min'}
                defaultValue={params.get('minPrice') ? String(Number(params.get('minPrice')) / 100) : ''}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  update('minPrice', value ? String(Math.round(Number(value) * 100)) : null);
                }}
                aria-label="Minimum price in rupees"
              />
              <span className="text-muted">–</span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder={filters?.priceRangePaise.max ? String(Math.ceil(filters.priceRangePaise.max / 100)) : 'Max'}
                defaultValue={params.get('maxPrice') ? String(Number(params.get('maxPrice')) / 100) : ''}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  update('maxPrice', value ? String(Math.round(Number(value) * 100)) : null);
                }}
                aria-label="Maximum price in rupees"
              />
            </div>
          </div>

          <label className="flex min-h-11 items-center gap-3 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={params.get('inStock') === 'true'}
              onChange={(event) => update('inStock', event.target.checked ? 'true' : null)}
              className="h-4 w-4 accent-forest"
            />
            In stock only
          </label>

          <div>
            <label htmlFor="mobile-sort" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Sort by
            </label>
            <Select id="mobile-sort" value={sort} onChange={(event) => update('sort', event.target.value)}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1.5 border border-forest/25 bg-forest/[0.04] px-2 py-1 text-[11px] text-forest hover:bg-forest/[0.08]"
    >
      {label}
      <span aria-hidden>✕</span>
      <span className="sr-only">Remove filter</span>
    </button>
  );
}

function TagIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function MountainIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  );
}

function CheckCircleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function TruckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14v10Z" />
      <circle cx="17" cy="18.5" r="2.5" />
      <circle cx="7" cy="18.5" r="2.5" />
    </svg>
  );
}
