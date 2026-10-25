import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, Paged, ProductSummary } from '@shared/types';
import { api } from '@/lib/api';
import { ProductGrid } from '@/components/ProductCard';
import {
  Badge,
  Breadcrumbs,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingBlock,
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
  const [params, setParams] = useSearchParams();
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shop' }]} />
      <PageHeader
        eyebrow={q ? `Search results for “${q}”` : 'The catalogue'}
        title={q ? 'Search the shelves' : category ? filters?.categories.find((item) => item.slug === category)?.name ?? 'Shop' : 'All products'}
        lede="Small-batch goods from reviewed Himachali sellers. Prices include GST where applicable; shipping is calculated before payment."
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-7">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Categories</p>
              <ul className="space-y-0.5">
                <li>
                  <button
                    type="button"
                    onClick={() => update('category', null)}
                    className={`w-full py-1.5 text-left text-[13px] ${!category ? 'font-semibold text-forest' : 'text-ink/70 hover:text-forest'}`}
                  >
                    All shelves
                  </button>
                </li>
                {filters?.categories.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => update('category', item.slug)}
                      className={`flex w-full items-baseline justify-between gap-2 py-1.5 text-left text-[13px] ${
                        category === item.slug ? 'font-semibold text-forest' : 'text-ink/70 hover:text-forest'
                      }`}
                    >
                      <span>{item.name}</span>
                      <span className="text-[10px] tabular-nums text-muted">{item.productCount ?? 0}</span>
                    </button>
                  </li>
                ))}
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
            <Select value={category ?? ''} onChange={(event) => update('category', event.target.value || null)} aria-label="Category" className="h-9 w-auto text-xs">
              <option value="">All categories</option>
              {filters?.categories.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select value={region ?? ''} onChange={(event) => update('region', event.target.value || null)} aria-label="Region" className="h-9 w-auto text-xs">
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
