import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Paged, ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import { api } from '@/lib/api';

const CATEGORIES = [
  { label: 'All Himachal', value: '' },
  { label: 'Shawls & Weaves', value: 'shawls-and-weaves' },
  { label: 'Kangra Tea', value: 'tea-and-infusions' },
  { label: 'Dry Fruit & Nuts', value: 'dry-fruit-and-nuts' },
  { label: 'Honey & Preserves', value: 'pantry-and-preserves' },
  { label: 'Cold-Pressed Oils', value: 'cold-pressed-oils' },
  { label: 'Mountain Pulses', value: 'pulses-and-staples' },
  { label: 'Knitwear', value: 'knitwear' },
  { label: 'Himachali Caps', value: 'caps-and-headwear' },
  { label: 'Gifting Boxes', value: 'gifting' },
];

const TRENDING_SEARCHES = [
  'Kangra Orthodox Tea',
  'Kullu Handwoven Shawl',
  'Lahaul Wildflower Honey',
  'Wild Apricot Kernel Oil',
  'Kinnaur Walnut Kernels',
  'Pure Himalayan Shilajit',
  'Chamba Red Rajma',
];

export function EcommerceSearchBar({
  light = false,
  className = '',
}: {
  light?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Load products catalog for live autocomplete
  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api<Paged<ProductSummary>>('/products'),
    staleTime: 5 * 60 * 1000,
  });

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Filter products live
  const matchingProducts = useMemo<ProductSummary[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || !productsData?.items) return [];

    return productsData.items
      .filter((p: ProductSummary) => {
        const matchesCategory = !selectedCategory || p.categorySlug === selectedCategory;
        const matchesText =
          p.name.toLowerCase().includes(q) ||
          p.shortDescription?.toLowerCase().includes(q) ||
          p.categoryName?.toLowerCase().includes(q) ||
          p.sellerName?.toLowerCase().includes(q) ||
          p.region?.toLowerCase().includes(q);
        return matchesCategory && matchesText;
      })
      .slice(0, 4);
  }, [query, selectedCategory, productsData]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    if (selectedCategory) params.set('category', selectedCategory);

    const queryString = params.toString();
    navigate(queryString ? `/shop?${queryString}` : '/shop');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleSelectProduct = (slug: string) => {
    navigate(`/products/${slug}`);
    setIsOpen(false);
  };

  const handleSelectTrending = (term: string) => {
    setQuery(term);
    navigate(`/shop?q=${encodeURIComponent(term)}`);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <form
        onSubmit={handleSubmit}
        className={`group flex items-center h-[38px] w-full rounded-full transition-all duration-200 ${
          isOpen
            ? light
              ? 'ring-2 ring-terra bg-[#101918]/95 border-terra/60 shadow-2xl'
              : 'ring-2 ring-terra bg-white border-terra shadow-lg'
            : light
              ? 'bg-[#172321]/80 hover:bg-[#172321]/90 text-[#F7F3EB] border border-white/25 backdrop-blur-md shadow-md'
              : 'bg-[#F2ECE1] hover:bg-[#ECE4D7] text-ink border border-[#D8CEBF] shadow-xs'
        }`}
      >
        {/* Category Dropdown */}
        <div
          className={`relative shrink-0 hidden sm:flex items-center h-full rounded-l-full pl-3 pr-2 text-xs transition-colors border-r ${
            light
              ? 'bg-white/10 hover:bg-white/15 text-white/90 border-white/20'
              : 'bg-[#EAE2D5] hover:bg-[#E2D8C9] text-forest border-[#D8CEBF]'
          }`}
        >
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={`bg-transparent text-[11px] font-medium outline-none cursor-pointer pr-4 max-w-[105px] truncate appearance-none ${
              light ? 'text-white' : 'text-forest'
            }`}
            aria-label="Filter search by category"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value} className="text-forest bg-[#F7F3EB]">
                {cat.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3 h-3 pointer-events-none absolute right-1.5 transition-colors ${
              light ? 'text-white/70' : 'text-muted'
            }`}
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Search Input Field */}
        <div className="relative flex-1 flex items-center h-full px-3">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            className={`h-3.5 w-3.5 shrink-0 mr-2 sm:hidden ${
              light ? 'text-white/60' : 'text-[#8C8275]'
            }`}
            aria-hidden
          >
            <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="1.8" />
            <path d="M12.5 12.5 17 17" strokeWidth="1.8" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            placeholder="Search shawls, tea, honey…"
            className={`w-full bg-transparent text-[12.5px] sm:text-[13px] outline-none transition-colors ${
              light
                ? 'text-[#F7F3EB] placeholder-white/55'
                : 'text-ink placeholder-[#7A7163]'
            }`}
            aria-label="Search products, makers and categories"
          />

          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className={`p-1 mr-1 text-[10px] rounded-full transition-colors ${
                light
                  ? 'text-white/60 hover:text-white hover:bg-white/15'
                  : 'text-muted hover:text-ink hover:bg-sand/60'
              }`}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* Search Submit Button */}
        <button
          type="submit"
          className="h-full px-3.5 sm:px-4 flex items-center justify-center bg-terra hover:bg-[#B36347] text-white rounded-r-full font-medium transition-colors shrink-0 shadow-xs border-l border-white/15"
          aria-label="Submit Search"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
            <path d="M12.5 12.5 17 17" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline ml-1.5 text-[11.5px] font-semibold tracking-wide">Search</span>
        </button>
      </form>

      {/* Autocomplete Dropdown (Flipkart / Amazon attached dropdown) */}
      {isOpen ? (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-white border border-[#E5DED2] shadow-2xl z-50 overflow-hidden divide-y divide-[#F0EAE1] animate-fade-in text-ink">
          {query.trim() ? (
            <div>
              {/* Direct query search row */}
              <button
                type="button"
                onClick={() => handleSubmit()}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F9F6F0] transition-colors"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-terra/10 text-terra shrink-0">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="h-3.5 w-3.5" aria-hidden>
                    <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
                    <path d="M12.5 12.5 17 17" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-[13px] font-medium text-ink">
                    Search for <span className="font-semibold text-terra font-serif text-sm">"{query}"</span>{' '}
                    {selectedCategory ? `in ${CATEGORIES.find((c) => c.value === selectedCategory)?.label}` : 'in All Products'}
                  </p>
                </div>
                <span className="text-xs text-muted shrink-0 font-medium">See all results →</span>
              </button>

              {/* Product Match Previews */}
              {matchingProducts.length > 0 ? (
                <div className="px-3 py-2 border-t border-[#F0EAE1]">
                  <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
                    Matching Himachal Products
                  </p>
                  <div className="space-y-1 mt-1">
                    {matchingProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProduct(p.slug)}
                        className="group flex w-full items-center gap-3.5 p-2 rounded-xl hover:bg-[#F7F3EB] transition-colors text-left"
                      >
                        <img
                          src={p.imageUrl ?? undefined}
                          alt={p.name}
                          className="h-11 w-11 rounded-lg object-cover bg-sand/30 shrink-0 border border-line"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-[14px] font-medium text-ink group-hover:text-terra transition-colors truncate">
                            {p.name}
                          </p>
                          <p className="text-[11px] text-muted truncate">
                            {p.categoryName} · {p.region} Valley ({p.sellerName})
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs sm:text-[13px] font-bold text-forest">
                            {formatINR(p.pricePaise)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Trending Searches */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-terra" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M12.315 2c2.43 0 4.405 1.975 4.405 4.405 0 1.215-.494 2.316-1.293 3.114l-.08.077 3.36 3.36a.75.75 0 11-1.06 1.06l-3.36-3.36-.078.08a4.39 4.39 0 01-3.114 1.294 4.405 4.405 0 01-4.405-4.405C6.69 4.195 8.665 2.22 11.095 2.22c.414 0 .816.057 1.22.17V2zm-.08 1.5a2.905 2.905 0 100 5.81 2.905 2.905 0 000-5.81z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>Trending Searches in Himachal</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TRENDING_SEARCHES.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => handleSelectTrending(term)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E2DAD0] bg-[#FAF8F5] px-3 py-1 text-xs font-medium text-ink hover:border-terra hover:text-terra hover:bg-white transition-all shadow-2xs"
                    >
                      <span>{term}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Valleys */}
              <div className="border-t border-[#F0EAE1] pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">
                  Explore by Region
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { label: 'Kullu Valley', to: '/shop?region=Kullu' },
                    { label: 'Kangra Valley', to: '/shop?region=Kangra' },
                    { label: 'Lahaul & Spiti', to: '/shop?region=Lahaul%20and%20Spiti' },
                    { label: 'Kinnaur & Chamba', to: '/shop?region=Kinnaur' },
                  ].map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => {
                        navigate(r.to);
                        setIsOpen(false);
                      }}
                      className="p-2 rounded-lg bg-[#FAF8F5] border border-[#EAE2D6] hover:bg-white hover:border-forest/40 text-left font-medium text-ink transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-3.5 h-3.5 text-terra shrink-0 stroke-2" aria-hidden>
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinejoin="round" />
                          <circle cx="12" cy="9" r="2.5" />
                        </svg>
                        <span>{r.label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bottom helper */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAF8F5] text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              100% verified authentic mountain produce & handlooms
            </span>
            <button
              type="button"
              onClick={() => {
                navigate('/shop');
                setIsOpen(false);
              }}
              className="text-forest hover:text-terra font-medium underline"
            >
              Browse all items
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
