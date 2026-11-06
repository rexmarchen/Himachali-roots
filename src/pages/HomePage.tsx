import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, CampaignSummary, ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import type { SiteContent } from '@shared/content';
import { api } from '@/lib/api';
import { usePageMeta } from '@/lib/usePageMeta';
import { useScrollReveal } from '@/lib/useScrollReveal';
import { ProductCard } from '@/components/ProductCard';
import { CampaignBanner } from '@/components/CampaignBanner';
import {
  Badge,
  EmptyState,
  ErrorState,
  LinkButton,
  SectionHeading,
  Spinner,
} from '@/components/ui';

interface MakerSummary {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  region: string | null;
  productCount: number;
  imageUrl: string | null;
}

interface HomeResponse {
  content: SiteContent;
  categories: Category[];
  makers: MakerSummary[];
  campaign: CampaignSummary | null;
  bestsellers: {
    slug: string;
    name: string;
    pricePaise: number;
    imageUrl: string | null;
    imageAlt: string | null;
    sellerName: string;
    unitsSold: number;
  }[];
  featured: ProductSummary[];
  newArrivals: ProductSummary[];
  gifting: ProductSummary[];
  regions: { region: string; productCount: number }[];
  reviews: {
    id: string;
    rating: number;
    body: string;
    createdAt: string;
    authorName: string;
    productName: string;
    productSlug: string;
  }[];
  counts: { products: number; sellers: number; regions: number };
}

const PRINCIPLES = [
  {
    number: '01',
    title: 'A person is named',
    body: 'Every listing belongs to a reviewed seller. No anonymous aggregators and no corporate label hiding the workshop.',
  },
  {
    number: '02',
    title: 'Claims need evidence',
    body: 'Origin, materials and certification claims are checked before publication. Where documentation is missing, the claim is omitted.',
  },
  {
    number: '03',
    title: 'Food is labelled properly',
    body: 'Ingredients, allergens, shelf life and storage belong on the listing. Sellers must hold the registrations their scale requires.',
  },
  {
    number: '04',
    title: 'Discomfort is allowed',
    body: 'We will state when a process is manual, when a policy is a draft, and when a photograph is illustrative rather than the exact batch.',
  },
];

const HERO_SLIDES = [
  {
    id: 'kinner-kailash-sunrise',
    src: '/images/dear-hills/hero/snow-peaks.webp',
    srcSet:
      '/images/dear-hills/hero/snow-peaks-800.webp 800w, /images/dear-hills/hero/snow-peaks.webp 1920w',
    alt: 'Golden sunrise light illuminating snow-capped Himalayan peaks and pine forests in Kinnaur',
    place: 'Kinner Kailash Range, Kinnaur',
    caption: 'First light breaking over snow-covered Himalayan summits',
  },
  {
    id: 'kotgarh-apple-orchard',
    src: '/images/dear-hills/hero/apple-orchard.webp',
    srcSet:
      '/images/dear-hills/hero/apple-orchard-800.webp 800w, /images/dear-hills/hero/apple-orchard.webp 1920w',
    alt: 'Sunlit Himachali apple orchard in Kotgarh with ripe red apples overlooking snow-capped Himalayan peaks',
    place: 'Kotgarh Valley, Shimla',
    caption: 'Sunlit apple orchards overlooking the Great Himalayan peaks',
  },
  {
    id: 'kalpa-dawn',
    src: '/images/dear-hills/hero/mountain-village.webp',
    srcSet:
      '/images/dear-hills/hero/mountain-village-800.webp 800w, /images/dear-hills/hero/mountain-village.webp 1920w',
    alt: 'Snow-covered Kinner Kailash peaks at dawn above the village of Kalpa',
    place: 'Kalpa, Kinnaur',
    caption: 'Pristine dawn over the sacred mountain range',
  },
  {
    id: 'kotgarh-royal-orchard',
    src: '/images/dear-hills/hero/himachal-valley.webp',
    srcSet:
      '/images/dear-hills/hero/himachal-valley-800.webp 800w, /images/dear-hills/hero/himachal-valley.webp 1920w',
    alt: 'High-altitude Royal Delicious apple orchard overlooking the Himalayan ridge in Kotgarh',
    place: 'Kotgarh Ridge, Shimla',
    caption: 'Centuries of apple horticulture across high mountain terraces',
  },
  {
    id: 'kinnaur-ridge',
    src: '/images/dear-hills/hero/himalayan-landscape.webp',
    srcSet:
      '/images/dear-hills/hero/himalayan-landscape-800.webp 800w, /images/dear-hills/hero/himalayan-landscape.webp 1920w',
    alt: 'Ancient deodar forest and snow-covered peaks above Kalpa in Kinnaur district',
    place: 'Sangla Valley, Kinnaur',
    caption: 'Ancient deodar slopes below snow-draped ridges',
  },
];

const HERO_INTERVAL_MS = 7500;

function DiyaIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M12 3.2c1.6 1.5 2.4 2.7 2.4 3.9a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.4 2.4-3.9Z" />
      <path d="M3.6 12.4h16.8c-.9 2.9-4.2 4.6-8.4 4.6s-7.5-1.7-8.4-4.6Z" strokeLinejoin="round" />
      <path d="M9.6 20.4h4.8" strokeLinecap="round" />
    </svg>
  );
}

function CinematicHero() {
  const [current, setCurrent] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [manualPause, setManualPause] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const slide = HERO_SLIDES[current];
  const playing = !hovering && !manualPause && !reducedMotion;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const next = HERO_SLIDES[(current + 1) % HERO_SLIDES.length];
    const preload = new Image();
    preload.src = next.src;
  }, [current]);

  const goTo = (index: number) => setCurrent((index + HERO_SLIDES.length) % HERO_SLIDES.length);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(current + 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(current - 1);
    }
  };

  return (
    <section
      className="relative isolate flex min-h-[62svh] w-full flex-col justify-end overflow-hidden bg-[#101918] text-white lg:min-h-[82vh] xl:min-h-[86vh]"
      aria-roledescription="carousel"
      aria-label="Photographs from Himachal Pradesh"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="absolute inset-0 z-0">
        {HERO_SLIDES.map((item, index) => {
          const active = index === current;
          const isAdjacent =
            index === (current + 1) % HERO_SLIDES.length ||
            index === (current - 1 + HERO_SLIDES.length) % HERO_SLIDES.length;
          if (!active && !isAdjacent) return null;
          return (
            <div
              key={item.id}
              aria-hidden={!active}
              className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${
                active ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none'
              }`}
            >
              <img
                src={item.src}
                srcSet={item.srcSet}
                sizes="100vw"
                alt={item.alt}
                width={1920}
                height={1080}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : 'low'}
                decoding={index === 0 ? 'sync' : 'async'}
                className={`h-full w-full object-cover object-center ${
                  active && !reducedMotion ? 'kenburns-active' : ''
                }`}
              />
            </div>
          );
        })}

        <div
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-black/75 via-black/15 to-transparent sm:w-2/3"
          aria-hidden
        />
      </div>

      <div className="relative z-30 mx-auto flex w-full max-w-[88rem] flex-1 flex-col justify-end px-5 pb-8 pt-12 sm:px-8 sm:pb-14 sm:pt-24 lg:px-12 lg:pb-16 lg:pt-36">
        <div className="max-w-2xl lg:max-w-3xl xl:max-w-4xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-black/40 px-3.5 py-1.5 sm:px-4 sm:py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/95 shadow-sm backdrop-blur-md sm:text-xs lg:text-[12.5px]">
              <span className="h-2 w-2 rounded-full bg-terra" aria-hidden />
              <span>Rooted in Himachal Pradesh</span>
            </div>

            <Link
              to="/offers/pahadi-festive-glow"
              className="inline-flex items-center gap-1.5 rounded-full border border-butter/50 bg-black/50 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-butter shadow-sm backdrop-blur-md transition-all hover:border-butter hover:bg-black/75 sm:text-[11.5px]"
            >
              <DiyaIcon className="h-3.5 w-3.5" />
              <span>Diwali Festive Offers</span>
              <span className="rounded-full bg-terra px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
                30% Off
              </span>
            </Link>
          </div>

          <h1 className="t-display mt-5 text-white drop-shadow-md">
            <span className="reveal-line-1 block">Discover the Heart of the Hills</span>
            <span className="reveal-line-2 mt-2 block font-normal italic text-butter">Pure. Handcrafted. Authentic.</span>
          </h1>

          <p className="reveal-subhead mt-5 max-w-xl text-[16px] font-light leading-[1.75] text-white/95 drop-shadow-sm sm:mt-6 sm:text-[18px] lg:max-w-2xl lg:text-[20px]">
            Mountain honey, handloom wool, Kangra tea and woodcraft — listed by reviewed sellers and dispatched from their
            own workshops and orchards.
          </p>

          <div className="reveal-cta mt-7 flex flex-wrap items-center gap-3 sm:mt-9 sm:gap-4">
            <LinkButton
              to="/shop"
              size="lg"
              className="!border-terra !bg-terra !text-white shadow-lift hover:!bg-[#c97253]"
            >
              Shop the collection
              <span aria-hidden className="ml-1">
                →
              </span>
            </LinkButton>

            <Link
              to="/offers/pahadi-festive-glow"
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-butter/60 bg-black/45 px-6 py-3 text-[14px] font-semibold text-butter shadow-sm backdrop-blur-md transition-all hover:border-butter hover:bg-black/70"
            >
              <DiyaIcon className="h-4 w-4" />
              <span>Diwali Special Edition</span>
            </Link>

            <Link
              to="/makers"
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-[14px] font-semibold text-white shadow-sm backdrop-blur-md transition-all hover:border-white hover:bg-white/20"
            >
              Meet the makers
            </Link>
          </div>

          <ul className="mt-6 hidden flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/20 pt-4 text-[13px] font-medium text-white/95 sm:mt-9 sm:flex sm:gap-x-6 sm:pt-5 sm:text-[13.5px]">
            <li className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 stroke-[2.2] text-terra" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Every listing names its seller</span>
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-white/25 sm:block" />
            <li className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 stroke-[2.2] text-terra" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Origin badges only after review</span>
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-white/25 sm:block" />
            <li className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 stroke-[2.2] text-terra" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Dispatched by the maker</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative z-30 border-t border-white/15 bg-black/45 pb-[calc(2rem+env(safe-area-inset-bottom))] backdrop-blur-md md:pb-0">
        <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10 xl:px-12">
          <div className="min-w-0 flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-terra shrink-0 stroke-2" aria-hidden>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinejoin="round" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <div className="min-w-0">
              <p className="font-serif text-[14px] font-medium text-white/95">{slide.place}</p>
              <p className="truncate text-[11.5px] text-white/75">{slide.caption}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1" aria-label="Choose a photograph">
              {HERO_SLIDES.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={index === current ? 'true' : undefined}
                  aria-label={`${item.place}: ${item.caption}`}
                  onClick={() => goTo(index)}
                  className="group flex h-11 min-w-6 items-center justify-center px-0.5"
                >
                  <span
                    className={`relative block h-[3px] overflow-hidden rounded-full transition-all duration-300 ${
                      index === current ? 'w-12 bg-white/30' : 'w-5 bg-white/20 group-hover:bg-white/50'
                    }`}
                  >
                    {index === current ? (
                      <span
                        key={current}
                        className="hero-progress absolute inset-y-0 left-0 bg-white"
                        style={{
                          animationDuration: `${HERO_INTERVAL_MS}ms`,
                          animationPlayState: playing ? 'running' : 'paused',
                        }}
                        onAnimationEnd={() => goTo(current + 1)}
                      />
                    ) : null}
                  </span>
                </button>
              ))}
            </div>

            <p className="tabular-nums text-[11px] font-medium tracking-wider text-white/75">
              {String(current + 1).padStart(2, '0')} / {String(HERO_SLIDES.length).padStart(2, '0')}
            </p>

            {!reducedMotion ? (
              <button
                type="button"
                onClick={() => setManualPause((value) => !value)}
                aria-label={manualPause ? 'Resume the photograph sequence' : 'Pause the photograph sequence'}
                aria-pressed={manualPause}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 text-white/80 transition-colors hover:border-white hover:text-white"
              >
                {manualPause ? (
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden>
                    <path d="M4 3l9 5-9 5V3z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden>
                    <path d="M4 3h2.5v10H4V3zm5.5 0H12v10H9.5V3z" />
                  </svg>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {`${slide.place}. ${slide.caption}. Photograph ${current + 1} of ${HERO_SLIDES.length}.`}
      </p>
    </section>
  );
}

function HeroShelf({ products }: { products: ProductSummary[] }) {
  if (!products.length) return null;

  return (
    <section aria-label="This week's shelf" className="border-b border-line bg-surface">
      <div className="shell flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:gap-8 sm:py-5">
        <div className="flex shrink-0 items-center gap-3">
          <span className="h-px w-7 bg-terra" aria-hidden />
          <p className="t-eyebrow text-terra">This week&rsquo;s shelf</p>
        </div>

        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:flex-1">
          {products.slice(0, 4).map((product) => (
            <Link
              key={product.id}
              to={`/shop/${product.slug}`}
              className="group flex min-w-[215px] items-center gap-3 border border-line/70 bg-paper/50 p-1.5 pr-4 transition-colors hover:border-terra/40 hover:bg-paper sm:min-w-0 sm:flex-1"
            >
              <span className="frame aspect-square w-11 shrink-0 overflow-hidden rounded-full">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" className="img-brand h-full w-full object-cover" loading="lazy" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-serif text-[13.5px] text-forest transition-colors group-hover:text-terra">
                  {product.name}
                </span>
                <span className="block text-[10px] uppercase tracking-[0.13em] text-muted">
                  {formatINR(product.pricePaise)}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <Link to="/shop" className="link-arrow hidden shrink-0 sm:inline-flex">
          View all
        </Link>
      </div>
    </section>
  );
}

function HimalayanTrustTicker() {
  const items = [
    '100% Himalayan Harvest',
    'Traditional Bilona & Woodloom Crafts',
    'Direct from Artisan Cooperatives',
    'Zero Chemical Adulteration',
    'Origin Valley & Altitude Documented',
    'Fair 88% Maker Earning',
    'Lab-Tested Purity & FSSAI Compliant',
    'Doorstep Insured All-India Dispatch',
  ];

  return (
    <div className="border-y border-line/80 bg-paper-2/90 py-3 overflow-hidden select-none" aria-hidden>
      <div className="animate-marquee flex items-center gap-12 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.22em] text-forest/80">
        {[...items, ...items].map((item, idx) => (
          <span key={idx} className="inline-flex items-center gap-4">
            <span>{item}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-terra" />
          </span>
        ))}
      </div>
    </div>
  );
}


const CATEGORY_BUBBLES = [
  {
    name: 'Wild Honey',
    subtitle: 'Raw & Unfiltered',
    slug: 'pantry-and-preserves',
    image: '/images/dear-hills/categories/honey.webp',
  },
  {
    name: 'Kangra Tea',
    subtitle: 'GI-Tagged Orthodox',
    slug: 'tea-and-infusions',
    image: '/images/dear-hills/categories/kangra-tea.webp',
  },
  {
    name: 'Kullu Shawls',
    subtitle: 'Pit-Loom Wool',
    slug: 'shawls-and-weaves',
    image: '/images/dear-hills/categories/kullu-shawls.webp',
  },
  {
    name: 'Walnuts & Nuts',
    subtitle: 'Kinnaur Harvest',
    slug: 'dry-fruit-and-nuts',
    image: '/images/dear-hills/categories/walnuts.webp',
  },
  {
    name: 'Chulli Oils',
    subtitle: 'Wood Cold-Pressed',
    slug: 'cold-pressed-oils',
    image: '/images/dear-hills/categories/cold-pressed-oils.webp',
  },
  {
    name: 'Chamba Rajma',
    subtitle: 'Highland Pulses',
    slug: 'pulses-and-staples',
    image: '/images/dear-hills/categories/pulses.webp',
  },
  {
    name: 'Pure Shilajit',
    subtitle: 'Gold Grade Resin',
    query: 'shilajit',
    image: '/images/dear-hills/categories/shilajit.webp',
  },
  {
    name: 'Warm Knitwear',
    subtitle: 'Hand-Knitted Wool',
    slug: 'knitwear',
    image: '/images/dear-hills/categories/knitwear.webp',
  },
  {
    name: 'Himachali Caps',
    subtitle: 'Heritage Velvet',
    slug: 'caps-and-headwear',
    image: '/images/dear-hills/categories/handicrafts.webp',
  },
  {
    name: 'Festive Gifting',
    subtitle: 'Curated Hampers',
    slug: 'gifting',
    image: '/images/dear-hills/categories/gifting.webp',
  },
];

function HimalayanCategoryBubbles() {
  return (
    <section aria-label="Explore by category" className="reveal-on-scroll border-b border-line bg-paper-2 py-6 sm:py-8">
      <div className="shell">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-terra" aria-hidden />
            <h2 className="font-serif text-lg sm:text-2xl font-medium tracking-tight text-forest">
              Explore Himalayan Specialties
            </h2>
          </div>
          <Link to="/shop" className="text-xs sm:text-[13px] font-semibold uppercase tracking-[0.12em] text-terra hover:underline">
            All Categories →
          </Link>
        </div>

        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-6 sm:px-0 sm:pb-0 justify-start xl:justify-center">
          {CATEGORY_BUBBLES.map((cat, idx) => {
            const href = cat.query
              ? `/shop?q=${encodeURIComponent(cat.query)}`
              : `/shop?category=${encodeURIComponent(cat.slug!)}`;
            return (
              <Link
                key={cat.name}
                to={href}
                style={{ animationDelay: `${idx * 45}ms` }}
                className="animate-bubble group flex flex-col items-center gap-2 shrink-0 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full border-2 border-sand bg-paper shadow-sm transition-all duration-300 ease-out group-hover:scale-105 group-hover:border-terra group-hover:shadow-md">
                  <img
                    src={cat.image}
                    alt={cat.name}
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[13px] sm:text-[14px] font-semibold text-forest group-hover:text-terra transition-colors line-clamp-1">
                    {cat.name}
                  </span>
                  <span className="text-[11px] text-muted line-clamp-1 hidden sm:block">
                    {cat.subtitle}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function NamasteStoryBanner() {
  return (
    <section className="reveal-on-scroll relative overflow-hidden border-b border-line bg-gradient-to-br from-[#1b2b27] via-[#13201e] to-[#0c1413] py-14 sm:py-20 text-white">
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-96 w-96 rounded-full bg-terra/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-20 -bottom-20 h-96 w-96 rounded-full bg-forest/40 blur-3xl"
        aria-hidden
      />

      <div className="shell relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-butter/40 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-butter shadow-sm backdrop-blur-md sm:text-[13px]">
            <span>🏔️</span>
            <span>Namaste Ji! · नमस्ते जी</span>
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-white mt-5">
            Discover the Heart of the Hills
          </h2>

          <p className="mt-4 text-base sm:text-lg leading-relaxed text-white/90 max-w-2xl mx-auto font-light">
            Welcome to <strong className="font-medium text-butter">Dear Hills</strong> — your direct bridge to authentic Himalayan artisans, high-altitude beekeepers, tea planters, and woodloom weavers across Himachal Pradesh.
          </p>

          <p className="mt-3 text-sm sm:text-base leading-relaxed text-white/75 max-w-3xl mx-auto font-light">
            Every jar of raw honey, every Kangra tea leaf, and every Kullu shawl in our collection is dispatched directly by vetted village makers. No middlemen. No factory dilutions. Just pure mountain honesty from our hills to your home.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6 text-left">
            <div className="rounded-lg border border-white/15 bg-white/5 p-4 sm:p-5 backdrop-blur-sm">
              <span className="text-2xl" aria-hidden>🌿</span>
              <h3 className="mt-2 text-sm sm:text-base font-semibold text-white">100% Pure Harvest</h3>
              <p className="mt-1 text-xs sm:text-sm text-white/70">Unblended, raw, and lab-tested with verifiable valley origin.</p>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/5 p-4 sm:p-5 backdrop-blur-sm">
              <span className="text-2xl" aria-hidden>🏔️</span>
              <h3 className="mt-2 text-sm sm:text-base font-semibold text-white">High Altitude Terroir</h3>
              <p className="mt-1 text-xs sm:text-sm text-white/70">Harvested at 1,800m to 3,400m across 12 Himachali valleys.</p>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/5 p-4 sm:p-5 backdrop-blur-sm">
              <span className="text-2xl" aria-hidden>🤝</span>
              <h3 className="mt-2 text-sm sm:text-base font-semibold text-white">88% Fair Maker Pay</h3>
              <p className="mt-1 text-xs sm:text-sm text-white/70">Transparent platform commission: the artisan receives 88%.</p>
            </div>

            <div className="rounded-lg border border-white/15 bg-white/5 p-4 sm:p-5 backdrop-blur-sm">
              <span className="text-2xl" aria-hidden>📦</span>
              <h3 className="mt-2 text-sm sm:text-base font-semibold text-white">Insured Pan-India</h3>
              <p className="mt-1 text-xs sm:text-sm text-white/70">Fast, insulated packaging delivered safely to your doorstep.</p>
            </div>
          </div>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/shop"
              className="inline-flex h-12 items-center justify-center rounded-full bg-terra px-8 text-sm sm:text-[15px] font-semibold text-white shadow-lift transition-all hover:bg-[#c97253] active:scale-[0.98]"
            >
              Explore All Authentic Products →
            </Link>
            <Link
              to="/makers"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm sm:text-[15px] font-semibold text-white backdrop-blur-sm transition-all hover:border-white hover:bg-white/20 active:scale-[0.98]"
            >
              Meet Our Himachali Artisans
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const CATEGORY_VISUALS: Record<string, { image: string; tag: string }> = {
  'shawls-and-weaves': { image: '/images/dear-hills/categories/kullu-shawls.webp', tag: 'Handloom' },
  knitwear: { image: '/images/dear-hills/categories/knitwear.webp', tag: 'Pure Wool' },
  'tea-and-infusions': { image: '/images/dear-hills/categories/kangra-tea.webp', tag: 'High Altitude' },
  'pantry-and-preserves': { image: '/images/dear-hills/categories/honey.webp', tag: 'Raw & Natural' },
  'dry-fruit-and-nuts': { image: '/images/dear-hills/categories/walnuts.webp', tag: 'Mountain Harvest' },
  'pulses-and-staples': { image: '/images/dear-hills/categories/pulses.webp', tag: 'Natural Farming' },
  'caps-and-headwear': { image: '/images/dear-hills/categories/handicrafts.webp', tag: 'Traditional' },
  'cold-pressed-oils': { image: '/images/dear-hills/categories/cold-pressed-oils.webp', tag: 'Wood-Pressed' },
  gifting: { image: '/images/dear-hills/categories/gifting.webp', tag: 'Curated' },
};

function CategoryCollectionSection({ categories }: { categories: Category[] }) {
  const liveCategories = categories.filter((category) => (category.productCount ?? 0) > 0);
  const listingCount = liveCategories.reduce((total, category) => total + (category.productCount ?? 0), 0);

  return (
    <section className="reveal-on-scroll section border-b border-line bg-paper">
      <div className="shell">
        <div className="mb-9 flex flex-col gap-5 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="rule-eyebrow">Curated shelves</p>
            <h2 className="t-h2 mt-3">Shop by category</h2>
            <p className="t-lead mt-3">
              Organised by craft discipline — handloom woolens, teas, honey, and mountain pantry staples.
            </p>
          </div>
          <Link to="/shop" className="link-arrow self-start sm:self-auto">
            Browse all {listingCount} listings <span aria-hidden>→</span>
          </Link>
        </div>

        {liveCategories.length ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
            {liveCategories.map((category, index) => {
              const visual = CATEGORY_VISUALS[category.slug] ?? {
                image: '/images/dear-hills/regions/bilaspur.webp',
                tag: 'Himachal',
              };
              const featured = index === 0;
              return (
                <Link
                  key={category.id}
                  to={`/shop?category=${encodeURIComponent(category.slug)}`}
                  className={`tile group relative flex flex-col justify-end overflow-hidden bg-surface ${
                    featured ? 'col-span-2 aspect-[16/10] lg:row-span-2 lg:aspect-auto lg:min-h-[420px]' : 'aspect-[3/4] sm:aspect-[4/3]'
                  }`}
                >
                  <img
                    src={visual.image}
                    alt={category.name}
                    className="img-brand absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="relative z-10 p-4 sm:p-5">
                    <span className="t-eyebrow block text-white/60">{visual.tag}</span>
                    <h3
                      className={`tile-title mt-2 line-clamp-2 font-serif leading-[1.15] ${
                        featured ? 'text-[1.6rem] sm:text-[2.15rem]' : 'text-[1.05rem] sm:text-[1.2rem]'
                      }`}
                    >
                      {category.name}
                    </h3>
                    <span className="mt-2 block text-[9.5px] uppercase tracking-[0.16em] text-white/55">
                      {category.productCount ?? 0} {category.productCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <span
                    className="pointer-events-none absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/20 text-[13px] text-white/80 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 sm:right-5 sm:top-5"
                    aria-hidden
                  >
                    ↗
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No collections published yet"
            body="Shelves appear here once categories and approved listings exist."
          />
        )}
      </div>
    </section>
  );
}

const CRAFT_REELS = [
  {
    id: 'bilona-ghee',
    title: 'The 36-Hour Bilona Churn',
    valley: 'Tirthan Valley, Kullu',
    artisan: 'Sunil Thakur · 3rd Gen Pastoralist',
    image: '/images/dear-hills/storytelling/bilona-churn.webp',
    tag: 'Traditional Process',
    duration: '0:45',
    description: 'Culturing raw A2 milk in earthen pots, hand-churned with bidirectional wooden bilona ropes.',
    categorySlug: 'pantry-and-preserves',
  },
  {
    id: 'kullu-border',
    title: 'Threading the Geometric Border',
    valley: 'Naggar Village, Kullu',
    artisan: 'Mani Devi · Master Weaver',
    image: '/images/dear-hills/storytelling/traditional-weaving.webp',
    tag: 'GI-Craft Heritage',
    duration: '0:58',
    description: 'Counting warp threads by memory on a traditional frame pit-loom to weave ancient motifs.',
    categorySlug: 'shawls-and-weaves',
  },
  {
    id: 'seabuckthorn-harvest',
    title: 'Spiti’s High-Altitude Golden Berry',
    valley: 'Pin Valley, Spiti',
    artisan: 'Chhewang Norbu · Organic Harvester',
    image: '/images/dear-hills/storytelling/seabuckthorn-harvest.webp',
    tag: 'Wild Foraging',
    duration: '0:38',
    description: 'Hand-tapping wild seabuckthorn bushes at 3,500m before the sub-zero winter freezes the sap.',
    categorySlug: 'pantry-and-preserves',
  },
  {
    id: 'chulli-oil',
    title: 'Stone-Pressing Wild Apricot Seeds',
    valley: 'Sangla Valley, Kinnaur',
    artisan: 'Rinchen Angmo · Cold Presser',
    image: '/images/dear-hills/storytelling/chulli-oil-press.webp',
    tag: 'Zero-Heat Extraction',
    duration: '0:42',
    description: 'Cracking sun-dried wild chulli kernels with river stones, gently cold-pressing pure golden oil.',
    categorySlug: 'cold-pressed-oils',
  },
  {
    id: 'kangra-tea-flush',
    title: 'First Mist Plucking at Dawn',
    valley: 'Palampur, Kangra',
    artisan: 'Vandana Katoch · Tea Planter',
    image: '/images/dear-hills/storytelling/tea-plucking.webp',
    tag: 'Single Estate',
    duration: '0:50',
    description: 'Plucking the tender two leaves and a bud while the Dhauladhar mist still clings to the bushes.',
    categorySlug: 'tea-and-infusions',
  },
];

function HimalayanCraftReelsSection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -320 : 320;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <section className="reveal-on-scroll section-tight border-b border-line bg-paper-2/60">
      <div className="shell">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="rule-eyebrow">Visual stories from the hills</p>
            <h2 className="t-h2 mt-3">Watch the craft in motion</h2>
            <p className="t-lead mt-3">
              Short glimpses into high-altitude beehives, wood-churned bilona vats, and handloom pit-looms across Himachal.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink/80 transition-colors hover:bg-forest hover:text-paper"
              aria-label="Scroll stories left"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink/80 transition-colors hover:bg-forest hover:text-paper"
              aria-label="Scroll stories right"
            >
              →
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="no-scrollbar flex gap-4 overflow-x-auto pb-4 pt-1 sm:gap-6"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {CRAFT_REELS.map((reel) => (
            <Link
              key={reel.id}
              to={`/shop?category=${reel.categorySlug}`}
              className="group relative flex w-[260px] shrink-0 flex-col overflow-hidden rounded-[2px] border border-line bg-forest-deep text-paper shadow-soft sm:w-[290px] aspect-[9/14]"
            >
              <img
                src={reel.image}
                alt={reel.title}
                className="img-brand absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/95 via-forest-deep/40 to-black/30" />

              <div className="relative z-10 flex h-full flex-col justify-between p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-white/25 bg-black/40 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md">
                    {reel.tag}
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-terra" />
                    {reel.duration}
                  </span>
                </div>

                <div className="my-auto flex justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white backdrop-blur-md transition-all duration-300 group-hover:scale-110 group-hover:bg-terra group-hover:border-terra">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 ml-0.5" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-butter">
                    {reel.valley}
                  </p>
                  <h3 className="mt-1 font-serif text-[18px] leading-snug text-white group-hover:text-butter transition-colors">
                    {reel.title}
                  </h3>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-white/75 line-clamp-2">
                    {reel.description}
                  </p>
                  <p className="mt-2 text-[10.5px] text-white/60 font-medium">
                    {reel.artisan}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const DISTRICTS_DATA = [
  {
    name: 'Kullu',
    tagline: 'Valley of the Gods & Looms',
    altitude: '1,279m ASL',
    image: '/images/dear-hills/regions/kullu.webp',
    specialties: ['Handloom Kullu Shawls', 'Pattu Weaves', 'Wild Mountain Honey'],
    description: 'Renowned for hand-operated wooden pit looms and high-altitude wild flora apiaries along the Beas river basin.',
  },
  {
    name: 'Kangra',
    tagline: 'Tea Terraces & Dhauladhar Slopes',
    altitude: '733m ASL',
    image: '/images/dear-hills/regions/kangra.webp',
    specialties: ['GI-Tagged Orthodox Tea', 'Pahari Miniature Art', 'Basmati Rice'],
    description: 'Historic tea gardens planted in 1849, producing slow-grown single-estate green and black orthodox leaf.',
  },
  {
    name: 'Kinnaur',
    tagline: 'Snow Peaks & Sacred Ridge',
    altitude: '2,320m ASL',
    image: '/images/dear-hills/regions/kinnaur.webp',
    specialties: ['Royal Golden Apples', 'Wild Chilgoza (Pine Nuts)', 'Chulli Apricot Oil'],
    description: 'Terraced stone orchards fed by glacier melt, yielding high-altitude sweet walnuts and prized pine nuts.',
  },
  {
    name: 'Lahaul & Spiti',
    tagline: 'Cold Mountain High Desert',
    altitude: '3,340m ASL',
    image: '/images/dear-hills/regions/lahaul-spiti.webp',
    specialties: ['Wild Seabuckthorn Berries', 'Ancient Roasted Barley', 'Red Kidney Beans'],
    description: 'Trans-Himalayan desert farming with zero synthetic fertilizers, sustaining native wild medicinal berry thickets.',
  },
  {
    name: 'Shimla',
    tagline: 'Colonial Ridges & Orchard Belts',
    altitude: '2,206m ASL',
    image: '/images/dear-hills/regions/shimla.webp',
    specialties: ['Apple Cider Vinegar', 'Stone-Pressed Kernel Oils', 'Wild Berry Preserves'],
    description: 'Generations of Himalayan orchardists tending heritage Red Delicious trees on mist-covered slopes.',
  },
  {
    name: 'Chamba',
    tagline: 'Ancient Craft & Ravi River Glades',
    altitude: '1,006m ASL',
    image: '/images/dear-hills/regions/chamba.webp',
    specialties: ['Heritage Chamba Chappal', 'Do-Rukha Silk Rumal', 'Bell Metal Craft'],
    description: 'Centuries-old needlecraft embroidered on untreated silk and hand-stitched embroidered leather footwear.',
  },
  {
    name: 'Mandi',
    tagline: 'Varanasi of the Hills',
    altitude: '760m ASL',
    image: '/images/dear-hills/regions/mandi.webp',
    specialties: ['Sepu Vadi', 'Stone-Carved Mortars', 'Wild Forest Banafsha'],
    description: 'Sun-cured spiced urad dal patties and traditional stone artisans along the sacred Beas bend.',
  },
  {
    name: 'Solan',
    tagline: 'The Mushroom & Stone Fruit Haven',
    altitude: '1,600m ASL',
    image: '/images/dear-hills/regions/solan.webp',
    specialties: ['Wild Guchhi (Morel Mushroom)', 'Plum & Apricot Jam', 'Valley Herbs'],
    description: 'Dense temperate pine forests where prized wild morels are foraged after mountain thunderstorms.',
  },
  {
    name: 'Sirmaur',
    tagline: 'Giri River Valleys',
    altitude: '980m ASL',
    image: '/images/dear-hills/regions/sirmaur.webp',
    specialties: ['Mountain Ginger Candy', 'Cold-Smoked Garlic', 'Multi-Flora Honey'],
    description: 'Sub-tropical mountain slopes famed for aromatic ginger roots and forest-edge beekeeping.',
  },
  {
    name: 'Bilaspur',
    tagline: 'Gobind Sagar Basin',
    altitude: '673m ASL',
    image: '/images/editorial-terrace.jpg',
    specialties: ['Traditional Bamboo Baskets', 'Sun-Dried Mountain Spices', 'Pahari Spices'],
    description: 'Folk bamboo weavers and spice artisans creating preservative-free regional kitchen staples.',
  },
  {
    name: 'Hamirpur',
    tagline: 'Pine Slopes & Shivalik Hills',
    altitude: '785m ASL',
    image: '/images/dear-hills/regions/hamirpur.webp',
    specialties: ['Bhabar Natural Grass Craft', 'High-Protein Pulses', 'Traditional Woodwork'],
    description: 'Village self-help groups harvesting riverbed bhabar grass for hand-braided home accessories.',
  },
  {
    name: 'Una',
    tagline: 'Gateway to the Shivaliks',
    altitude: '369m ASL',
    image: '/images/dear-hills/regions/una.webp',
    specialties: ['Cold Wood-Pressed Mustard Oil', 'Organic Sugarcane Jaggery', 'Pahadi Pickles'],
    description: 'Traditional bullock & wooden kolhu expelling virgin yellow mustard oil with intense natural pungency.',
  },
];

function HimalayanDistrictsShowcase({
  regionsData,
}: {
  regionsData?: { region: string; productCount: number }[];
}) {
  const [selectedDistrict, setSelectedDistrict] = useState(0);
  const active = DISTRICTS_DATA[selectedDistrict];

  const getProductCount = (name: string) => {
    const match = regionsData?.find((r) => r.region.toLowerCase() === name.toLowerCase());
    return match ? match.productCount : null;
  };

  return (
    <section className="section border-b border-line bg-paper">
      <div className="shell">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="rule-eyebrow">Regional terroir &amp; heritage</p>
            <h2 className="t-h2 mt-3">The 12 Valleys of Himachal</h2>
            <p className="t-lead mt-3">
              Every Himalayan district has its unique elevation, climate, and ancestral craft heritage. Choose a valley to explore its indigenous harvest.
            </p>
          </div>
          <Link to="/shop" className="link-arrow self-start sm:self-auto">
            View all regional shelves <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="no-scrollbar -mx-1 mb-8 flex gap-2 overflow-x-auto px-1 pb-2">
          {DISTRICTS_DATA.map((district, idx) => {
            const isCurrent = idx === selectedDistrict;
            const count = getProductCount(district.name);
            return (
              <button
                key={district.name}
                type="button"
                onClick={() => setSelectedDistrict(idx)}
                className={`group flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium transition-all ${
                  isCurrent
                    ? 'border-forest bg-forest text-paper shadow-sm'
                    : 'border-line bg-surface text-ink/75 hover:border-forest/40 hover:text-ink'
                }`}
              >
                <span>{district.name}</span>
                {count !== null && count > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                      isCurrent ? 'bg-terra text-white' : 'bg-sand/60 text-muted'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="grid overflow-hidden border border-line bg-surface lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-12">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-terra/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-terra">
                  District of Himachal
                </span>
                <span className="text-[11px] font-medium tracking-wide text-muted">
                  Elevation: <strong className="text-forest font-semibold">{active.altitude}</strong>
                </span>
              </div>

              <h3 className="t-h2 mt-4 text-forest">
                {active.name} <span className="font-normal italic text-ink/60">Valley</span>
              </h3>
              <p className="mt-1 font-serif text-[17px] text-terra font-normal">
                {active.tagline}
              </p>

              <p className="mt-5 text-[14px] leading-[1.8] text-ink/80 max-w-lg">
                {active.description}
              </p>

              <div className="mt-6">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted mb-3">
                  Signature Mountain Specialties
                </p>
                <ul className="flex flex-wrap gap-2">
                  {active.specialties.map((spec) => (
                    <li
                      key={spec}
                      className="rounded-full border border-line bg-paper px-3 py-1.5 text-[12px] font-medium text-forest"
                    >
                      {spec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-line/70 flex flex-wrap items-center gap-4">
              <LinkButton
                to={`/shop?region=${encodeURIComponent(active.name)}`}
                variant="terra"
                size="md"
              >
                Shop {active.name} products <span aria-hidden>→</span>
              </LinkButton>
              <Link to="/about" className="link-arrow">
                Valley craft history <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          <div className="relative min-h-[300px] lg:min-h-full overflow-hidden bg-sand/30">
            <img
              src={active.image}
              alt={`${active.name} landscape and craftsmanship`}
              className="img-brand absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/60 via-transparent to-transparent lg:hidden" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedProductsSection({ products }: { products: ProductSummary[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -320 : 320;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <section className="reveal-on-scroll section-tight border-b border-line bg-paper">
      <div className="shell">
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="rule-eyebrow">Featured products</p>
            <h2 className="t-h2 mt-3">Handpicked from the Himalayas</h2>
            <p className="t-lead mt-3">
              Discover authentic Himachali products crafted by local artisans, from cosy handlooms to pure mountain honey.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4">
            <div className="hidden items-center gap-3 xl:gap-4 sm:flex">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-sand/50 text-forest">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="m8 3 4 8 5-5 5 15H2L8 3z" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-[11px] font-medium leading-tight text-ink/80">
                  <span className="block font-semibold text-forest">Authentic</span>
                  <span>Himachal</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-sand/50 text-forest">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2Z" strokeWidth="1.6" />
                    <path d="M12 6c-3.314 0-6 2.686-6 6 0 2.21 1.79 4 4 4 1.5 0 2.5-1 3-2" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="text-[11px] font-medium leading-tight text-ink/80">
                  <span className="block font-semibold text-forest">Supports</span>
                  <span>Local artisans</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-sand/50 text-forest">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeWidth="1.6" />
                  </svg>
                </div>
                <div className="text-[11px] font-medium leading-tight text-ink/80">
                  <span className="block font-semibold text-forest">Pure &amp;</span>
                  <span>Natural</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-sand/50 text-forest">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" strokeWidth="1.6" />
                  </svg>
                </div>
                <div className="text-[11px] font-medium leading-tight text-ink/80">
                  <span className="block font-semibold text-forest">Sustainable</span>
                  <span>Choices</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scroll('left')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink/80 transition-colors hover:bg-forest hover:text-paper"
                aria-label="Scroll featured products left"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => scroll('right')}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink/80 transition-colors hover:bg-forest hover:text-paper"
                aria-label="Scroll featured products right"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {products.length ? (
          <div
            ref={scrollRef}
            className="no-scrollbar flex scroll-smooth gap-4 overflow-x-auto pb-4 pt-1 sm:gap-6"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {products.map((product, index) => (
              <div key={product.id} className="w-[240px] shrink-0 sm:w-[280px] lg:w-[300px]">
                <ProductCard product={product} priority={index < 4} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No featured listings yet"
            body="Products will appear here once approved by administrators."
          />
        )}
      </div>
    </section>
  );
}

function BestsellersSection({ bestsellers }: { bestsellers: HomeResponse['bestsellers'] }) {
  if (!bestsellers.length) return null;

  return (
    <section className="section-tight border-b border-line bg-paper-2">
      <div className="shell">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div>
            <p className="rule-eyebrow">Actually purchased</p>
            <h2 className="t-h2 mt-3">Bestsellers right now</h2>
            <p className="t-lead mt-3">
              Ranked by paid units sold in the last 90 days. Authentically dispatched from workshop apiaries and mountain lofts.
            </p>
            <div className="mt-7">
              <Link to="/shop" className="link-arrow">
                Shop all <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          <ol className="border-t border-line">
            {bestsellers.map((item, index) => (
              <li key={item.slug}>
                <Link
                  to={`/shop/${item.slug}`}
                  className="group flex items-center gap-4 border-b border-line py-4 sm:gap-6"
                >
                  <span className="w-6 shrink-0 font-serif text-[15px] tabular-nums text-terra">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className="frame aspect-square w-14 shrink-0 sm:w-16">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.imageAlt ?? item.name}
                        loading="lazy"
                        decoding="async"
                        className="img-brand h-full w-full object-cover"
                      />
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[9.5px] uppercase tracking-[0.14em] text-muted">
                      {item.sellerName}
                    </span>
                    <span className="mt-1 block truncate font-serif text-[16px] leading-snug text-forest transition-colors group-hover:text-terra">
                      {item.name}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-[13.5px] font-semibold text-ink">{formatINR(item.pricePaise)}</span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-[0.1em] text-muted">
                      {item.unitsSold} sold
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function MakersCelebrationSection({ makers }: { makers: MakerSummary[] }) {
  return (
    <section className="section border-b border-line bg-surface">
      <div className="shell">
        <SectionHeading
          eyebrow="People, not labels"
          title="Made by hand. Rooted in the hills."
          lede="Every storefront is reviewed before publication. We work directly with independent artisans, farmer cooperatives, and village self-help groups."
          action={
            <LinkButton to="/makers" variant="secondary" size="md">
              Meet all makers ({makers.length})
            </LinkButton>
          }
        />

        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10">
          {makers.slice(0, 6).map((maker) => (
            <article key={maker.id} className="group">
              <Link to={`/makers/${maker.slug}`} className="block">
                <div className="frame aspect-[4/5] w-full">
                  {maker.imageUrl ? (
                    <img
                      src={maker.imageUrl}
                      alt={`Artisan work by ${maker.name}`}
                      loading="lazy"
                      className="img-brand h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[radial-gradient(120%_90%_at_50%_0%,#efe7d8_0%,#e2d5c0_100%)]">
                      <span className="font-serif text-4xl text-forest/25" aria-hidden>
                        {maker.name.trim().charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="t-eyebrow text-terra">{maker.region ?? 'Himachal Pradesh'}</span>
                    <h3 className="t-h3 mt-1.5 truncate transition-colors group-hover:text-terra">{maker.name}</h3>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.13em] text-muted">
                      {maker.productCount} active {maker.productCount === 1 ? 'listing' : 'listings'}
                    </p>
                    {maker.tagline ? (
                      <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink/70">{maker.tagline}</p>
                    ) : null}
                  </div>
                  <span className="mt-1 shrink-0 font-serif text-base text-forest/60 transition-colors group-hover:text-terra" aria-hidden>
                    ↗
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-12 border border-line bg-paper p-6 sm:mt-14 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <p className="rule-eyebrow">
                <DiyaIcon className="h-3.5 w-3.5" />
                Diwali maker initiative
              </p>
              <h3 className="t-h3 mt-3">
                Crafting or harvesting in Himachal?
              </h3>
              <p className="mt-2.5 text-[13px] leading-[1.75] text-ink/70">
                Launch your festive storefront this Diwali with <strong className="font-semibold text-forest">0% commission for 6 months</strong>, free craft storytelling, and insured doorstep dispatch across all 12 districts.
              </p>
            </div>
            <div className="shrink-0">
              <LinkButton to="/become-a-maker?offer=diwali" variant="terra" size="md">
                Sell on DEAR HILLS <span aria-hidden>→</span>
              </LinkButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MountainStorySection() {
  const facts = [
    {
      title: 'Maker named',
      body: 'Every published listing shows the seller’s business name and district. No anonymous aggregator labels.',
    },
    {
      title: 'Claims checked',
      body: 'Origin, materials and food labelling are reviewed before a listing goes live. Unsupported claims are refused.',
    },
    {
      title: 'Payouts recorded',
      body: 'For every paid order, commission and the amount owed to the seller are written to the ledger.',
    },
  ];

  return (
    <section className="section border-b border-line bg-surface">
      <div className="shell grid items-center gap-14 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
        <div>
          <p className="rule-eyebrow">The mountain way</p>
          <h2 className="t-h2 mt-4">
            More than products.
            <span className="mt-1 block font-normal text-ink/65">A working landscape.</span>
          </h2>

          <p className="t-lead mt-6">
            In the high valleys of Himachal Pradesh, weaving, beekeeping and orchard work follow altitude and season rather
            than a factory clock. A Kullu weaver counts a border by hand; a Spiti household dries apricots on a roof; a
            Kangra garden picks tea in flushes.
          </p>
          <p className="t-lead mt-4">
            DEAR HILLS is a marketplace, not a factory shop. Each seller applies, is reviewed, and keeps their own
            storefront. What you buy is packed and dispatched by the workshop that made it.
          </p>

          <dl className="mt-9 grid gap-px border border-line bg-line sm:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.title} className="bg-paper p-5">
                <dt className="font-serif text-[17px] text-forest">{fact.title}</dt>
                <dd className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{fact.body}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <Link to="/sourcing" className="link-arrow">
              How verification works <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <figure className="relative mb-10 sm:mb-0">
          <div className="relative">
            <div className="frame aspect-[4/5] w-full">
              <img
                src="/images/dear-hills/regions/mandi.webp"
                alt="Slate-roofed houses, kitchen gardens and terraced fields in Batheri village, Mandi district"
                loading="lazy"
                decoding="async"
                width={800}
                height={1000}
                className="img-brand"
              />
            </div>

            <div className="absolute -bottom-8 -left-4 hidden w-36 overflow-hidden border-4 border-paper bg-paper shadow-lift sm:block lg:-left-10 lg:w-44">
              <img
                src="/images/dear-hills/regions/chamba.webp"
                alt="Carved stone niche on the Laxminarayan temple, Chamba"
                loading="lazy"
                decoding="async"
                width={720}
                height={720}
                className="img-brand aspect-square w-full object-cover"
              />
            </div>
          </div>

          <figcaption className="mt-4 text-[11px] leading-relaxed text-muted sm:mt-12">
            Batheri, Mandi district. Photograph via Wikimedia Commons — full attribution on the{' '}
            <Link to="/credits" className="underline underline-offset-2 hover:text-forest">
              image credits
            </Link>{' '}
            page.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function MountainInterludeSection() {
  return (
    <section className="relative h-[62vh] min-h-[440px] w-full overflow-hidden bg-forest-deep text-paper">
      <img
        src="/images/dear-hills/hero/himalayan-landscape.webp"
        alt="Deodar forest below snow-covered peaks above Kalpa, Kinnaur"
        loading="lazy"
        decoding="async"
        width={1800}
        height={1000}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/90 via-forest-deep/45 to-forest-deep/20" />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(65,30,39,0.6)_0%,_rgba(65,30,39,0.28)_48%,_transparent_75%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-5 text-center sm:px-8">
        <p className="t-eyebrow text-butter/85">Himalayan pause</p>
        <h2 className="t-h2 mt-5 text-paper">
          Slow mornings. Mountain air.
          <span className="mt-1 block font-normal italic text-butter">A working landscape.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[14px] leading-[1.8] text-paper/90 [text-shadow:0_1px_16px_rgba(65,30,39,0.85)] sm:text-[15px]">
          Deodar, orchard, barley and wool — the things this marketplace sells begin as landscape before they become
          stock.
        </p>
        <div className="mt-8">
          <LinkButton
            to="/shop"
            size="md"
            className="!border-butter !bg-butter !text-forest-deep hover:!border-paper hover:!bg-paper"
          >
            Browse the shelves
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

function GiftingSection({ gifting, content }: { gifting: ProductSummary[]; content: SiteContent['homepage'] }) {
  if (!gifting.length) return null;
  return (
    <section className="section border-b border-line bg-paper-2">
      <div className="shell">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
          <div>
            <p className="rule-eyebrow">Curated gift sets</p>
            <h2 className="t-h2 mt-3">{content.gifting.title}</h2>
            <p className="t-lead mt-4">{content.gifting.body}</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <LinkButton
                to={`/shop?category=${encodeURIComponent(content.gifting.categorySlug)}`}
                variant="secondary"
                size="md"
              >
                See all gift boxes
              </LinkButton>
              <Link to="/contact" className="link-arrow">
                Custom corporate gifts <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          <div className={gifting.length === 1 ? 'mx-auto w-full max-w-[320px]' : 'grid gap-4 sm:grid-cols-3 sm:gap-5'}>
            {gifting.slice(0, 3).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const PURITY_PILLARS = [
  {
    title: 'Direct from the Valley',
    subtitle: 'No Middlemen Aggregation',
    description: 'Every product is dispatched straight from the artisan’s village loom, apiary, or valley orchard.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6 text-terra stroke-[1.6]">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    title: '100% Origin Traceable',
    subtitle: 'Documented Village & Altitude',
    description: 'We publish the specific Himachal district, harvesting window, and artisan collective for each batch.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6 text-terra stroke-[1.6]">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    title: 'Pure Lab-Tested Harvest',
    subtitle: 'FSSAI Verified & Unaltered',
    description: 'Our honey is raw and unpasteurized; oils are cold-pressed; wool is certified pure Himalayan fleece.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6 text-terra stroke-[1.6]">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: '88% Goes to Mountain Makers',
    subtitle: 'Transparent Platform Economy',
    description: 'Dear Hills operates on a transparent 12% fee. 88% is remitted directly into the maker’s account.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6 text-terra stroke-[1.6]">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
];

function PurityStandardGrid() {
  return (
    <section className="section border-b border-line bg-paper">
      <div className="shell">
        <div className="max-w-xl mx-auto text-center mb-12">
          <p className="rule-eyebrow justify-center">The Himalayan Integrity Standard</p>
          <h2 className="t-h2 mt-3">Why Dear Hills is Different</h2>
          <p className="t-lead mt-3">
            We are not a white-label factory aggregator. We are a direct bridge to genuine Himachali craftspersons, beekeepers, and orchard growers.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PURITY_PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="border border-line bg-surface p-6 sm:p-7 flex flex-col justify-between hover:border-terra/40 transition-colors"
            >
              <div>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-sand/40">
                  {pillar.icon}
                </div>
                <h3 className="font-serif text-[19px] text-forest font-normal">{pillar.title}</h3>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-terra mt-1">
                  {pillar.subtitle}
                </p>
                <p className="mt-3 text-[12.5px] leading-[1.75] text-ink/75">
                  {pillar.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const CURATED_TESTIMONIALS = [
  {
    id: 't-1',
    author: 'Ananya Sharma',
    city: 'South Delhi',
    rating: 5,
    product: 'Dhauladhar First Flush Orthodox Tea',
    productSlug: 'tea-and-infusions',
    quote: 'The Kangra First Flush tea has an ethereal muscatel aroma that commercial supermarket brands simply cannot replicate. You can genuinely taste the fresh mountain rain.',
  },
  {
    id: 't-2',
    author: 'Vikram Menon',
    city: 'Indiranagar, Bengaluru',
    rating: 5,
    product: 'Handwoven Pure Merino Wool Shawl',
    productSlug: 'shawls-and-weaves',
    quote: 'The shawl arrived with a handwritten artisan note from Naggar village. The warmth, the natural lanolin aroma, and the delicate border weave feel like genuine heirloom art.',
  },
  {
    id: 't-3',
    author: 'Dr. Priya Kulkarni',
    city: 'Bandra West, Mumbai',
    rating: 5,
    product: 'Wild Pangi Forest Honey & Seabuckthorn',
    productSlug: 'pantry-and-preserves',
    quote: 'Raw, thick, crystalline, and distinctly floral. We’ve replaced all refined sugar in our morning tea with this mountain honey. Exceptional purity.',
  },
];

function CuratedTestimonialsSection({
  reviews,
}: {
  reviews?: HomeResponse['reviews'];
}) {
  const testimonials = (reviews && reviews.length >= 3)
    ? reviews.slice(0, 3).map((r) => ({
        id: r.id,
        author: r.authorName,
        city: 'Verified Patron',
        rating: r.rating,
        product: r.productName,
        productSlug: r.productSlug,
        quote: r.body,
      }))
    : CURATED_TESTIMONIALS;

  return (
    <section className="section border-b border-line bg-surface">
      <div className="shell">
        <div className="mb-10 max-w-xl">
          <p className="rule-eyebrow">Patron stories</p>
          <h2 className="t-h2 mt-3">From Mountain Hearts to Living Rooms</h2>
          <p className="t-lead mt-3">
            Read what customers across India say about receiving authentic Himachali harvest and handloom packages.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {testimonials.map((item) => (
            <blockquote
              key={item.id}
              className="border border-line bg-paper p-6 sm:p-7 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-[13px] tracking-[0.16em] text-terra" aria-label={`${item.rating} of 5 stars`}>
                    {'★'.repeat(item.rating)}
                    <span className="text-sand/70">{'★'.repeat(5 - item.rating)}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-medium text-emerald-800">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1 1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                    </svg>
                    Verified Order
                  </span>
                </div>

                <p className="mt-4 font-serif text-[16px] leading-[1.65] text-ink/90">
                  “{item.quote}”
                </p>
              </div>

              <footer className="mt-6 pt-4 border-t border-line/60">
                <p className="font-semibold text-[13px] text-forest">{item.author}</p>
                <p className="text-[11px] text-muted">{item.city}</p>
                <Link
                  to={`/shop/${item.productSlug}`}
                  className="mt-2 block truncate text-[11px] text-terra underline decoration-terra/40 underline-offset-2 hover:text-forest"
                >
                  Purchased: {item.product}
                </Link>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

function SourcingStandardSection() {
  return (
    <section className="section border-b border-line bg-paper">
      <div className="shell">
        <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div>
            <p className="rule-eyebrow">Our promise</p>
            <h2 className="t-h2 mt-3">
              What we check, and what we refuse to pretend.
            </h2>
            <p className="t-lead mt-4">
              A marketplace is only as trustworthy as its verification process. These four rules govern every shelf on
              DEAR HILLS today.
            </p>
            <div className="mt-8">
              <LinkButton to="/sourcing" variant="secondary" size="md">
                Read the complete standard
              </LinkButton>
            </div>
          </div>

          <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <div key={principle.number} className="border-t border-line pt-5">
                <span className="font-serif text-sm font-semibold tabular-nums tracking-[0.14em] text-terra">
                  {principle.number}
                </span>
                <h3 className="t-h3 mt-2">{principle.title}</h3>
                <p className="mt-2 text-[13px] leading-[1.75] text-ink/70">{principle.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ClosingMomentSection() {
  return (
    <section className="relative overflow-hidden bg-forest-deep px-5 py-24 text-paper sm:px-8 lg:py-32">
      <div className="absolute inset-0 opacity-25">
        <img
          src="/images/dear-hills/hero/mountain-village.webp"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="img-brand h-full w-full object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-forest-deep via-forest-deep/60 to-forest-deep/40" aria-hidden />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="t-eyebrow text-butter/85">Himalayan living</p>
        <h2 className="t-h2 mt-5 text-paper">
          Bring a little of the mountains home.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-[1.8] text-paper/75">
          Every order is routed to the workshop that fulfils it, and the seller’s share is recorded against that order.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <LinkButton to="/shop" size="lg" className="!border-butter !bg-butter !text-forest-deep hover:!border-paper hover:!bg-paper">
            Shop the shelves
          </LinkButton>
          <Link
            to="/become-a-maker"
            className="inline-flex min-h-12 items-center gap-2 rounded-full border border-paper/35 px-6 py-3 text-[12.5px] font-semibold text-paper transition-colors hover:border-paper hover:bg-paper/10"
          >
            Become a maker
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  useScrollReveal();

  const home = useQuery({
    queryKey: ['home'],
    queryFn: () => api<HomeResponse>('/home'),
    staleTime: 60_000,
  });

  usePageMeta({
    title: 'Dear Hills · From the Himalayas, with heart',
    description:
      'Shop shawls, Kangra tea, mountain honey, dry fruit and pantry staples made and grown in Himachal Pradesh, sold by the people who make them.',
    canonicalPath: '/',
  });

  if (home.isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-paper px-4">
        <div className="flex flex-col items-center gap-3 text-sm text-muted">
          <Spinner className="h-7 w-7 text-forest" />
          <span className="font-serif text-base text-forest">Gathering Himalayan shelves…</span>
        </div>
      </div>
    );
  }

  if (home.isError || !home.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-24">
        <ErrorState
          title="The storefront could not load"
          body="Please ensure the API server is active and reachable."
          onRetry={() => void home.refetch()}
        />
      </div>
    );
  }

  const data = home.data;
  const content = data.content.homepage;

  return (
    <div className="w-full">
      {/* 1. Cinematic Hero section */}
      <CinematicHero />

      {/* 2. Quick-Shop Category Bubbles */}
      <HimalayanCategoryBubbles />

      {/* 3. Floating editorial shelf */}
      <HeroShelf products={data.featured} />

      {/* 4. Himalayan Trust Marquee Ticker */}
      <HimalayanTrustTicker />

      {/* 5. Namaste Ji Himalayan Welcome Story */}
      <NamasteStoryBanner />

      {/* 6. Seasonal Campaign Offer Banner */}
      <div className="border-b border-line/60 bg-paper-2">
        <CampaignBanner
          campaign={
            data.campaign?.posterUrl
              ? data.campaign
              : {
                  id: 'cmp_diwali_2026',
                  name: 'Pahadi Festive Glow',
                  slug: 'pahadi-festive-glow',
                  description:
                    'A festive Diwali edit from Himachali makers: handwoven wool, Kangra tea, orchard walnuts and wildflower honey.',
                  posterUrl: '/images/campaigns/pahadi-festive-glow-diwali-1672.webp',
                  posterAlt:
                    'Pahadi Festive Glow — Diwali in Himachal: festive poster with diya lights and mountain silhouettes.',
                  status: 'active',
                  startsAt: null,
                  endsAt: null,
                  maxDiscountBp: 3000,
                  maxDiscountPercent: 30,
                  productCount: 5,
                }
          }
        />
      </div>

      {/* 5. Shop by collection (Bento Curated Shelves) */}
      <CategoryCollectionSection categories={data.categories} />

      {/* 6. Glimpses from the Hills (Craft Story Reels) */}
      <HimalayanCraftReelsSection />

      {/* 7. Featured products: handpicked from the Himalayas */}
      <FeaturedProductsSection products={data.featured} />

      {/* 8. Regional Terroir: The 12 Valleys of Himachal Explorer */}
      <HimalayanDistrictsShowcase regionsData={data.regions} />

      {/* 9. Real bestsellers from paid orders */}
      <BestsellersSection bestsellers={data.bestsellers} />

      {/* 10. Meet the makers */}
      <MakersCelebrationSection makers={data.makers} />

      {/* 11. Discover the mountains (The Mountain Way) */}
      <MountainStorySection />

      {/* 12. Atmospheric interlude */}
      <MountainInterludeSection />

      {/* 13. Gifting & seasonal collections */}
      <GiftingSection gifting={data.gifting} content={content} />

      {/* 14. Himalayan Integrity & Sourcing Standard */}
      <PurityStandardGrid />

      {/* Sourcing Standard Principles */}
      <SourcingStandardSection />

      {/* 15. Verified Customer Reviews & Patron Notes */}
      <CuratedTestimonialsSection reviews={data.reviews} />

      {/* 16. Seller onboarding invitation */}
      <section className="reveal-on-scroll section-tight">
        <div className="shell">
          <div className="grid gap-10 bg-forest px-7 py-12 text-paper sm:px-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:px-14 lg:py-16">
            <div>
              <p className="t-eyebrow text-sand/80">For makers &amp; growers</p>
              <h2 className="t-h2 mt-4 max-w-xl text-paper">
                If you make it in Himachal, there should be a shelf for it.
              </h2>
              <p className="mt-4 max-w-xl text-[13.5px] leading-[1.75] text-paper/70">
                Apply with your business details, workshop location and craft categories. Every applicant is verified before
                a storefront is published.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <LinkButton to="/sell" variant="terra" size="md">
                  Apply to sell
                </LinkButton>
                <Link to="/policies/seller-terms" className="link-arrow text-balance !text-sand hover:!text-paper">
                  Seller KYC &amp; platform fee terms <span aria-hidden>→</span>
                </Link>
              </div>
            </div>

            <div className="border-t border-white/20 pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              <p className="t-eyebrow text-sand/80">Active artisan registry</p>
              <dl className="mt-4 grid grid-cols-3 gap-4">
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-paper/55">Listings</dt>
                  <dd className="mt-1 font-serif text-3xl text-paper">{data.counts.products}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-paper/55">Makers</dt>
                  <dd className="mt-1 font-serif text-3xl text-paper">{data.counts.sellers}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-paper/55">Districts</dt>
                  <dd className="mt-1 font-serif text-3xl text-paper">{data.counts.regions}</dd>
                </div>
              </dl>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-sand/30 bg-sand/10 px-3.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-sand/90">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Himachal Artisan Registry · Verified &amp; Active
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Regional filter pills */}
      <section className="pb-6">
        <div className="shell">
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Quick Valleys:</span>
              {data.regions.map((region) => (
                <Link key={region.region} to={`/shop?region=${encodeURIComponent(region.region)}`}>
                  <Badge tone="sand">
                    {region.region} ({region.productCount})
                  </Badge>
                </Link>
              ))}
            </div>
            <Link to="/shop" className="link-arrow">
              Explore all shelves <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Closing Brand Moment */}
      <ClosingMomentSection />
    </div>
  );
}
