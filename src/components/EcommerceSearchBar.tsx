import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, Paged, ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import { api } from '@/lib/api';

const RECENT_KEY = 'dear-hills-recent-searches';

const TRENDING_SEARCHES = [
  'Kangra Orthodox Tea',
  'Kullu Handwoven Shawl',
  'Lahaul Wildflower Honey',
  'Wild Apricot Kernel Oil',
  'Kinnaur Walnut Kernels',
  'Chamba Red Rajma',
];

function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberSearch(term: string): string[] {
  const next = [term, ...readRecentSearches().filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 6);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Storage can be unavailable in private modes; search still works. */
  }
  return next;
}

export function EcommerceSearchBar({
  light = false,
  className = '',
  inputId = 'site-search',
}: {
  light?: boolean;
  className?: string;
  inputId?: string;
}) {
  const listboxId = `${inputId}-listbox`;
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const productsQuery = useQuery({
    queryKey: ['search-products'],
    queryFn: () => api<Paged<ProductSummary>>('/products?pageSize=48'),
    staleTime: 5 * 60 * 1000,
  });

  const categoriesQuery = useQuery({
    queryKey: ['search-categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories'),
    staleTime: 5 * 60 * 1000,
  });

  const categoryOptions = useMemo(() => {
    const live = (categoriesQuery.data?.categories ?? [])
      .filter((category) => (category.productCount ?? 0) > 0)
      .map((category) => ({ label: category.name, value: category.slug }));
    return [{ label: 'All Himachal', value: '' }, ...live];
  }, [categoriesQuery.data]);

  const trimmedQuery = query.trim();

  const matchingProducts = useMemo<ProductSummary[]>(() => {
    if (!trimmedQuery || !productsQuery.data?.items) return [];
    const q = trimmedQuery.toLowerCase();
    return productsQuery.data.items
      .filter((product) => {
        const matchesCategory = !selectedCategory || product.categorySlug === selectedCategory;
        const matchesText =
          product.name.toLowerCase().includes(q) ||
          product.shortDescription?.toLowerCase().includes(q) ||
          product.categoryName?.toLowerCase().includes(q) ||
          product.sellerName?.toLowerCase().includes(q) ||
          product.region?.toLowerCase().includes(q);
        return matchesCategory && matchesText;
      })
      .slice(0, 5);
  }, [trimmedQuery, selectedCategory, productsQuery.data]);

  const options = useMemo(() => {
    if (!trimmedQuery) return [] as ({ kind: 'submit' } | { kind: 'product'; product: ProductSummary })[];
    return [
      { kind: 'submit' as const },
      ...matchingProducts.map((product) => ({ kind: 'product' as const, product })),
    ];
  }, [trimmedQuery, matchingProducts]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const params = new URLSearchParams();
    if (trimmedQuery) {
      params.set('q', trimmedQuery);
      setRecent(rememberSearch(trimmedQuery));
    }
    if (selectedCategory) params.set('category', selectedCategory);
    const queryString = params.toString();
    navigate(queryString ? `/shop?${queryString}` : '/shop');
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleSelectProduct = (slug: string) => {
    navigate(`/shop/${slug}`);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleSelectTerm = (term: string) => {
    setQuery(term);
    setRecent(rememberSearch(term));
    const params = new URLSearchParams({ q: term });
    if (selectedCategory) params.set('category', selectedCategory);
    navigate(`/shop?${params.toString()}`);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      if (!options.length) return;
      setActiveIndex((index) => (index + 1 >= options.length ? 0 : index + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!options.length) return;
      setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option.kind === 'product') handleSelectProduct(option.product.slug);
      else handleSubmit();
    }
  };

  const showQueryPanel = Boolean(trimmedQuery);
  const categoryLabel = categoryOptions.find((category) => category.value === selectedCategory)?.label ?? 'All Himachal';

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setIsOpen(false);
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="search"
        className={`group flex h-11 lg:h-12 w-full items-center rounded-full border transition-all duration-200 ${
          isOpen
            ? 'border-terra bg-white shadow-lg ring-2 ring-terra/25 text-ink'
            : light
              ? 'border-white/25 bg-white/15 text-white shadow-xs backdrop-blur-md hover:bg-white/25 hover:border-white/40'
              : 'border-line bg-[#F2ECE1] text-ink shadow-xs hover:bg-[#ECE4D7]'
        }`}
      >
        <div
          className={`relative hidden h-full shrink-0 items-center rounded-l-full border-r ${
            light ? 'border-white/20 bg-white/10' : 'border-line bg-[#EAE2D5]'
          } pl-3.5 pr-2.5 sm:flex`}
        >
          <select
            value={selectedCategory}
            onChange={(event) => {
              setSelectedCategory(event.target.value);
              setActiveIndex(-1);
            }}
            className={`max-w-[115px] sm:max-w-[130px] lg:max-w-[145px] cursor-pointer appearance-none truncate bg-transparent pr-4 text-[11px] sm:text-xs lg:text-[13px] font-medium ${
              light ? 'text-white' : 'text-forest'
            } outline-none`}
            aria-label="Filter search by category"
          >
            {categoryOptions.map((category) => (
              <option key={category.value} value={category.value} className="bg-paper text-forest">
                {category.label}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 20 20" fill="currentColor" className={`pointer-events-none absolute right-1.5 h-3 w-3 ${light ? 'text-white/70' : 'text-muted'}`} aria-hidden>
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>

        <div className="relative flex h-full flex-1 items-center px-3 sm:px-3.5">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className={`mr-2 h-4 w-4 shrink-0 ${light ? 'text-white/70' : 'text-[#8C8275]'} sm:hidden`} aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="1.8" />
            <path d="M12.5 12.5 17 17" strokeWidth="1.8" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search shawls, tea, honey…"
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
            aria-label="Search products, makers and categories"
            className={`w-full bg-transparent text-base ${
              isOpen
                ? 'text-ink placeholder:text-muted'
                : light
                  ? 'text-white placeholder:text-white/75'
                  : 'text-ink placeholder:text-[#7A7163]'
            } outline-none sm:text-[13.5px] lg:text-[14.5px] [&::-webkit-search-cancel-button]:hidden`}
          />

          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveIndex(-1);
                inputRef.current?.focus();
              }}
              className={`ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                light ? 'text-white/80 hover:bg-white/20 hover:text-white' : 'text-muted hover:bg-sand/60 hover:text-ink'
              } transition-colors`}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden>
                <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>

        <button
          type="submit"
          className="flex h-full shrink-0 items-center justify-center rounded-r-full border-l border-white/15 bg-terra px-3.5 font-medium text-white transition-colors hover:bg-[#b9694c] sm:px-4 lg:px-5"
          aria-label="Submit search"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-4 w-4 lg:h-[18px] lg:w-[18px]" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
            <path d="M12.5 12.5 17 17" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="ml-1.5 hidden text-[11.5px] sm:text-xs lg:text-[13px] font-semibold tracking-wide sm:inline">Search</span>
        </button>
      </form>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(70vh,34rem)] overflow-y-auto rounded-xl border border-line bg-surface text-ink shadow-2xl fade-in">
          {showQueryPanel ? (
            <div>
              <div id={listboxId} role="listbox" aria-label="Search suggestions">
                <button
                  id={`${inputId}-option-0`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === 0}
                  onClick={() => handleSubmit()}
                  onMouseEnter={() => setActiveIndex(0)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    activeIndex === 0 ? 'bg-paper' : 'hover:bg-paper'
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-terra/10 text-terra">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5" aria-hidden>
                      <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
                      <path d="M12.5 12.5 17 17" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">
                      Search for <span className="font-semibold text-terra">“{trimmedQuery}”</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">in {categoryLabel}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-muted">See all →</span>
                </button>

                {matchingProducts.map((product, index) => {
                  const optionIndex = index + 1;
                  return (
                    <button
                      key={product.id}
                      id={`${inputId}-option-${optionIndex}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === optionIndex}
                      onClick={() => handleSelectProduct(product.slug)}
                      onMouseEnter={() => setActiveIndex(optionIndex)}
                      className={`flex w-full items-center gap-3 border-t border-line/60 px-4 py-2.5 text-left transition-colors ${
                        activeIndex === optionIndex ? 'bg-paper' : 'hover:bg-paper'
                      }`}
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-11 w-11 shrink-0 rounded-md border border-line bg-sand/30 object-cover"
                        />
                      ) : (
                        <span className="h-11 w-11 shrink-0 rounded-md border border-line bg-sand/30" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-[15px] font-medium text-ink">{product.name}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {[product.categoryName, product.region, product.sellerName].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-forest">{formatINR(product.pricePaise)}</span>
                    </button>
                  );
                })}
              </div>

              {productsQuery.isLoading ? (
                <p className="border-t border-line/60 px-4 py-3 text-[11.5px] text-muted">Searching the shelves…</p>
              ) : null}

              {!productsQuery.isLoading && matchingProducts.length === 0 ? (
                <div className="border-t border-line/60 px-4 py-5">
                  <p className="text-[13px] font-medium text-ink">No products match “{trimmedQuery}”.</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                    Try a shorter word, a craft name, or browse every approved listing.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/shop');
                      setIsOpen(false);
                    }}
                    className="mt-3 inline-flex min-h-11 items-center border border-forest px-4 text-[11px] font-semibold uppercase tracking-wider text-forest hover:bg-forest hover:text-paper"
                  >
                    Browse all products
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {recent.length ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">Recent searches</p>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          window.localStorage.removeItem(RECENT_KEY);
                        } catch {
                          /* ignore */
                        }
                        setRecent([]);
                      }}
                      className="text-[11px] text-muted underline underline-offset-2 hover:text-forest"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => handleSelectTerm(term)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-[11.5px] font-medium text-ink transition-colors hover:border-terra hover:text-terra"
                      >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3 w-3 text-muted" aria-hidden>
                          <circle cx="10" cy="10" r="7" />
                          <path d="M10 6v4l2.5 1.5" strokeLinecap="round" />
                        </svg>
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">Popular searches</p>
                <div className="flex flex-wrap gap-2">
                  {TRENDING_SEARCHES.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => handleSelectTerm(term)}
                      className="inline-flex min-h-9 items-center rounded-full border border-line bg-[#FAF8F5] px-3 text-[11.5px] font-medium text-ink transition-colors hover:border-terra hover:text-terra"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-line pt-3">
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">Explore by region</p>
                <div className="grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
                  {[
                    { label: 'Kullu Valley', to: '/shop?region=Kullu' },
                    { label: 'Kangra Valley', to: '/shop?region=Kangra' },
                    { label: 'Lahaul & Spiti', to: '/shop?region=Lahaul%20and%20Spiti' },
                    { label: 'Kinnaur', to: '/shop?region=Kinnaur' },
                  ].map((region) => (
                    <button
                      key={region.label}
                      type="button"
                      onClick={() => {
                        navigate(region.to);
                        setIsOpen(false);
                      }}
                      className="flex min-h-10 items-center gap-1.5 rounded-md border border-line bg-[#FAF8F5] px-2.5 text-left font-medium text-ink transition-colors hover:border-forest/40 hover:bg-white"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 text-terra" strokeWidth="2" aria-hidden>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinejoin="round" />
                        <circle cx="12" cy="9" r="2.5" />
                      </svg>
                      {region.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-line bg-[#FAF8F5] px-4 py-2.5 text-[10.5px] text-muted">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />
              <span className="truncate">Every listing is reviewed before publication</span>
            </span>
            <button
              type="button"
              onClick={() => {
                navigate('/shop');
                setIsOpen(false);
              }}
              className="shrink-0 font-medium text-forest underline underline-offset-2 hover:text-terra"
            >
              Browse all
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
