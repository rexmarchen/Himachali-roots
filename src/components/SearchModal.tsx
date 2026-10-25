import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Paged, ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import { api } from '@/lib/api';

const POPULAR_TAGS = [
  { label: 'Kullu Wool Shawls', q: 'shawl' },
  { label: 'Kangra Orthodox Tea', q: 'tea' },
  { label: 'Wild Forest Honey', q: 'honey' },
  { label: 'Kinnaur Walnuts', q: 'walnut' },
  { label: 'Wild Apricot Oil', q: 'oil' },
  { label: 'Chamba Red Rajma', q: 'rajma' },
];

const CATEGORIES = [
  { name: 'Shawls & Handlooms', slug: 'shawls-and-weaves' },
  { name: 'Kangra Tea', slug: 'tea-and-infusions' },
  { name: 'Dry Fruit & Nuts', slug: 'dry-fruit-and-nuts' },
  { name: 'Honey & Preserves', slug: 'pantry-and-preserves' },
  { name: 'Cold-Pressed Oils', slug: 'cold-pressed-oils' },
  { name: 'Mountain Pulses', slug: 'pulses-and-staples' },
  { name: 'Warm Knitwear', slug: 'knitwear' },
  { name: 'Himachali Caps', slug: 'caps-and-headwear' },
];

export function SearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Load product catalog for instant autocomplete
  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api<Paged<ProductSummary>>('/products'),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setQuery('');
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Keyboard navigation & escape listener
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Filter products live
  const filteredProducts = useMemo<ProductSummary[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || !productsData?.items) return [];
    return productsData.items
      .filter((p: ProductSummary) => {
        return (
          p.name.toLowerCase().includes(q) ||
          p.shortDescription?.toLowerCase().includes(q) ||
          p.categoryName?.toLowerCase().includes(q) ||
          p.sellerName?.toLowerCase().includes(q) ||
          p.region?.toLowerCase().includes(q)
        );
      })
      .slice(0, 5);
  }, [query, productsData]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      navigate(`/shop?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/shop');
    }
    onClose();
  };

  const handleSelectProduct = (slug: string) => {
    navigate(`/products/${slug}`);
    onClose();
  };

  const handleSelectTag = (q: string) => {
    navigate(`/shop?q=${encodeURIComponent(q)}`);
    onClose();
  };

  const handleSelectCategory = (categorySlug: string) => {
    navigate(`/shop?category=${encodeURIComponent(categorySlug)}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-950/70 p-4 pt-16 sm:p-6 sm:pt-24 backdrop-blur-md transition-opacity duration-200 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search Catalog"
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-[#FCFAF7] border border-[#E7DFD3] shadow-2xl transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <form onSubmit={handleSubmit} className="relative flex items-center border-b border-[#E7DFD3] px-4 py-3.5 sm:px-6">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            className="h-5 w-5 text-terra shrink-0 mr-3"
            aria-hidden
          >
            <circle cx="8.5" cy="8.5" r="5.5" strokeWidth="2" />
            <path d="M12.5 12.5 17 17" strokeWidth="2" strokeLinecap="round" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shawls, Kangra tea, raw honey, walnuts, artisans…"
            className="w-full bg-transparent font-sans text-base sm:text-lg text-ink placeholder-[#998F80] outline-none"
            aria-label="Search term"
          />

          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mr-2 text-muted hover:text-ink text-sm p-1 rounded-full hover:bg-sand/60 transition-colors"
              aria-label="Clear query"
            >
              ✕
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="hidden sm:inline-flex items-center gap-1 rounded-md border border-line bg-white/80 px-2 py-1 text-[11px] font-medium text-muted hover:text-ink transition-colors"
          >
            ESC
          </button>
        </form>

        {/* Content Area */}
        <div className="max-h-[65vh] overflow-y-auto p-4 sm:p-6 space-y-6">
          {query.trim() ? (
            <div>
              <div className="flex items-center justify-between pb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                <span>Matching Products</span>
                <span>{filteredProducts.length} results</span>
              </div>

              {filteredProducts.length > 0 ? (
                <div className="divide-y divide-line/60">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProduct(p.slug)}
                      className="group flex w-full items-center gap-4 py-3 px-2 text-left rounded-lg hover:bg-[#F2ECE1]/70 transition-colors"
                    >
                      <img
                        src={p.imageUrl ?? undefined}
                        alt={p.name}
                        className="h-12 w-12 rounded-lg object-cover bg-sand/40 shrink-0 border border-line/60"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-serif text-[15px] font-medium text-ink group-hover:text-terra transition-colors truncate">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted truncate">
                          {p.sellerName} · {p.region}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold text-forest">
                          {formatINR(p.pricePaise)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-ink font-serif text-lg">No direct matches for "{query}"</p>
                  <p className="mt-1 text-xs text-muted">
                    Press <kbd className="font-mono bg-paper px-1 py-0.5 rounded border border-line">Enter</kbd> to search the full catalog or browse our curated categories below.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Popular Searches */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-2.5">
                  Trending Himalayan Searches
                </p>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_TAGS.map((tag) => (
                    <button
                      key={tag.q}
                      type="button"
                      onClick={() => handleSelectTag(tag.q)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#DFD6C8] bg-white px-3.5 py-1.5 text-xs font-medium text-ink/85 hover:border-terra hover:text-terra hover:bg-white shadow-2xs transition-all"
                    >
                      <span>{tag.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Browse by Category */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-2.5">
                  Browse by Valley Category
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => handleSelectCategory(cat.slug)}
                      className="group flex items-center gap-2.5 p-2.5 rounded-xl border border-[#E7DFD3] bg-white/70 hover:bg-white hover:border-forest/40 hover:shadow-xs transition-all text-left"
                    >
                      <span className="w-2 h-2 rounded-full bg-terra shrink-0" />
                      <span className="text-xs font-medium text-ink group-hover:text-forest transition-colors truncate">
                        {cat.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E7DFD3] bg-[#F7F3EB] px-4 py-3 sm:px-6 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-terra" />
            <span>Direct dispatches from certified Himachal makers</span>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            className="font-medium text-forest hover:text-terra hover:underline flex items-center gap-1 transition-colors"
          >
            <span>Explore all items in Shop</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
