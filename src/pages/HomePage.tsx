import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, CampaignSummary, ProductSummary } from '@shared/types';
import { formatINR } from '@shared/types';
import type { SiteContent } from '@shared/content';
import { BRAND_ALTERNATE_NAMES, BRAND_NAME, MARKETPLACE_HOME_DESCRIPTION, MARKETPLACE_HOME_TITLE } from '@shared/seo';
import { api } from '@/lib/api';
import { usePageMeta } from '@/lib/usePageMeta';
import { useInView } from '@/lib/useInView';
import { ProductCard, ProductGrid } from '@/components/ProductCard';
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
  catalogPreview?: ProductSummary[];
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

/* Photographs verified free of embedded watermarks: mountains and apple garden landscapes */
const HERO_SLIDES = [
  {
    id: 'himachali-cottage-sunrise',
    src: '/images/home/himalayan-cottage-sunrise-closing.jpg',
    srcSet:
      '/images/home/himalayan-cottage-sunrise-closing-640.webp 640w, /images/home/himalayan-cottage-sunrise-closing-1024.webp 1024w, /images/home/himalayan-cottage-sunrise-closing-1600.webp 1600w, /images/home/himalayan-cottage-sunrise-closing.webp 2048w',
    alt: 'Traditional Himachali stone-and-timber cottage with slate roof overlooking terraced mountain valleys and snow-capped Himalayan peaks at golden dawn',
    place: 'Tirthan & Kullu Valleys',
    caption: 'Sunlit mountain homes preserving generations of Himalayan craft',
  },
  {
    id: 'himalayan-morning-ridges',
    src: '/images/home/himalayan-ridges-morning.jpg',
    srcSet:
      '/images/home/himalayan-ridges-morning-720.webp 720w, /images/home/himalayan-ridges-morning-1100.webp 1100w, /images/home/himalayan-ridges-morning.webp 1376w',
    alt: 'Golden sunrise light illuminating layered mountain ridges and deodar pine forests in the Western Himalayas',
    place: 'Western Himalayan Ranges',
    caption: 'Soft dawn mist rising through ancient deodar forests',
  },
  {
    id: 'kinner-kailash-sunrise',
    src: '/images/home/snow-peaks-1800.jpg',
    srcSet:
      '/images/home/snow-peaks-720.jpg 720w, /images/home/snow-peaks-1100.jpg 1100w, /images/home/snow-peaks-1800.jpg 1800w',
    alt: 'Golden sunrise light illuminating snow-capped Himalayan peaks and pine forests in Kinnaur',
    place: 'Kinner Kailash Range, Kinnaur',
    caption: 'First light breaking over snow-covered Himalayan summits',
  },
  {
    id: 'kotgarh-apple-orchard',
    src: '/images/home/apple-orchard-1800.jpg',
    srcSet:
      '/images/home/apple-orchard-720.jpg 720w, /images/home/apple-orchard-1100.jpg 1100w, /images/home/apple-orchard-1800.jpg 1800w',
    alt: 'Sunlit Himachali apple orchard in Kotgarh with ripe red apples overlooking snow-capped Himalayan peaks',
    place: 'Kotgarh Valley, Shimla',
    caption: 'Sunlit apple orchards overlooking the Great Himalayan peaks',
  },
  {
    id: 'kalpa-dawn',
    src: '/images/home/kalpa-dawn-1800.jpg',
    srcSet:
      '/images/home/kalpa-dawn-720.jpg 720w, /images/home/kalpa-dawn-1100.jpg 1100w, /images/home/kalpa-dawn-1800.jpg 1800w',
    alt: 'Snow-covered Kinner Kailash peaks at dawn above the village of Kalpa',
    place: 'Kalpa, Kinnaur',
    caption: 'Pristine dawn over the sacred mountain range',
  },
  {
    id: 'kotgarh-royal-orchard',
    src: '/images/home/maker-orchard-1800.jpg',
    srcSet:
      '/images/home/maker-orchard-720.jpg 720w, /images/home/maker-orchard-1100.jpg 1100w, /images/home/maker-orchard-1800.jpg 1800w',
    alt: 'High-altitude Royal Delicious apple orchard overlooking the Himalayan ridge in Kotgarh',
    place: 'Kotgarh Ridge, Shimla',
    caption: 'Centuries of apple horticulture across high mountain terraces',
  },
  {
    id: 'kinnaur-ridge',
    src: '/images/home/kinnaur-ridge-1800.jpg',
    srcSet:
      '/images/home/kinnaur-ridge-720.jpg 720w, /images/home/kinnaur-ridge-1100.jpg 1100w, /images/home/kinnaur-ridge-1800.jpg 1800w',
    alt: 'Ancient deodar forest and snow-covered peaks above Kalpa in Kinnaur district',
    place: 'Sangla Valley, Kinnaur',
    caption: 'Ancient deodar slopes below snow-draped ridges',
  },
];

const HERO_INTERVAL_MS = 7500;

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

  /* Preload next slide */
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
      className="relative isolate flex min-h-[54svh] sm:min-h-[60svh] w-full flex-col justify-end overflow-hidden bg-[#101918] text-white lg:min-h-[calc(100svh-8.5rem)] lg:max-h-[750px]"
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

        {/* Natural gradient scrims ensuring crisp text contrast across bright sunlit slides */}
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/85 via-black/35 to-black/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-black/80 via-black/35 to-transparent sm:w-3/4"
          aria-hidden
        />
      </div>

      <div className="relative z-30 mx-auto flex w-full max-w-[88rem] flex-1 flex-col justify-end px-4 pb-5 pt-8 sm:px-8 sm:pb-10 sm:pt-16 lg:px-12 lg:pb-14 lg:pt-14">
        <div className="max-w-2xl lg:max-w-3xl xl:max-w-4xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/25 bg-black/50 px-3.5 py-1.5 sm:px-4 sm:py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white shadow-sm backdrop-blur-md sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-terra" aria-hidden />
              <span>Rooted in Himachal Pradesh</span>
            </div>
          </div>

          <h1 className="mt-3 font-serif text-[2.2rem] font-normal leading-[1.05] tracking-[-0.02em] !text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.65)] sm:mt-4 sm:text-5xl md:text-6xl lg:text-[4.3rem] xl:text-[5rem]">
            From the Himalayas,
            <span className="mt-1 block font-normal italic text-butter">with heart.</span>
          </h1>

          <p className="mt-3.5 max-w-xl text-[15px] font-light leading-relaxed text-white/95 drop-shadow-[0_1px_10px_rgba(0,0,0,0.6)] sm:mt-4 sm:text-lg lg:text-xl lg:max-w-2xl">
            Mountain honey, handloom wool, Kangra tea, and woodcraft — listed by reviewed sellers and dispatched from their own workshops and orchards.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:mt-7 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
            <LinkButton
              to="/shop"
              size="lg"
              className="w-full sm:w-auto !border-terra !bg-terra !text-white shadow-lg transition-all hover:!bg-[#C97253] rounded-md text-sm sm:text-base font-semibold px-6 py-3.5 sm:px-8 sm:py-4"
            >
              Shop the collection
              <span aria-hidden className="ml-2">
                →
              </span>
            </LinkButton>

            <Link
              to="/makers"
              className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-md border border-white/45 bg-black/35 px-5 py-3 sm:px-7 sm:py-3.5 text-sm sm:text-base font-semibold text-white shadow-sm backdrop-blur-md transition-all hover:border-white hover:bg-black/50"
            >
              Meet the makers
            </Link>
          </div>

          <ul className="mt-5 hidden flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/25 pt-4 text-[11.5px] font-medium text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)] sm:mt-7 sm:flex sm:gap-x-6 sm:text-xs">
            <li className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 stroke-[2.2] text-terra" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Every listing names its seller</span>
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-white/30 sm:block" />
            <li className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 stroke-[2.2] text-terra" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Origin badges only after review</span>
            </li>
            <li aria-hidden className="hidden h-3 w-px bg-white/30 sm:block" />
            <li className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0 stroke-[2.2] text-terra" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Dispatched by the maker</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="relative z-30 border-t border-white/15 bg-black/55 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10 xl:px-12">
          <div className="min-w-0 flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 text-terra shrink-0 stroke-2" aria-hidden>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinejoin="round" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <div className="min-w-0">
              <p className="font-serif text-[14px] font-medium text-white truncate">{slide.place}</p>
              <p className="truncate text-[11.5px] text-white/80">{slide.caption}</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
            <div className="flex items-center gap-1" aria-label="Choose a photograph">
              {HERO_SLIDES.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={index === current ? 'true' : undefined}
                  aria-label={`${item.place}: ${item.caption}`}
                  onClick={() => goTo(index)}
                  className="group flex h-10 min-w-6 items-center justify-center px-0.5"
                >
                  <span
                    className={`relative block h-[3px] overflow-hidden rounded-full transition-all duration-300 ${
                      index === current ? 'w-10 sm:w-12 bg-white/30' : 'w-4 sm:w-5 bg-white/25 group-hover:bg-white/50'
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

            <div className="flex items-center gap-2.5 shrink-0">
              <p className="whitespace-nowrap tabular-nums text-[11px] font-medium tracking-wider text-white/85">
                {String(current + 1).padStart(2, '0')} / {String(HERO_SLIDES.length).padStart(2, '0')}
              </p>

              {!reducedMotion ? (
                <button
                  type="button"
                  onClick={() => setManualPause((value) => !value)}
                  aria-label={manualPause ? 'Resume the photograph sequence' : 'Pause the photograph sequence'}
                  aria-pressed={manualPause}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-white/30 text-white/85 transition-colors hover:border-white hover:text-white"
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
      </div>

      <p className="sr-only" aria-live="polite">
        {`${slide.place}. ${slide.caption}. Photograph ${current + 1} of ${HERO_SLIDES.length}.`}
      </p>
    </section>
  );
}

/* Section A: Discover the Mountains */
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
    <section className="border-b border-line bg-surface py-20 lg:py-28">
      <div className="mx-auto grid max-w-[88rem] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:px-10 xl:px-12">
        <div>
          <p className="flex items-center gap-3 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-terra">
            <span className="h-px w-8 bg-terra" aria-hidden />
            The mountain way
          </p>
          <h2 className="mt-5 font-serif text-[2.1rem] leading-[1.07] text-forest sm:text-[2.6rem] lg:text-[3rem]">
            More than products.
            <span className="mt-1 block font-normal text-ink/70">A working landscape.</span>
          </h2>

          <p className="mt-6 text-[15.5px] leading-[1.85] text-ink/75">
            In the high valleys of Himachal Pradesh, weaving, beekeeping and orchard work follow altitude and season rather
            than a factory clock. A Kullu weaver counts a border by hand; a Spiti household dries apricots on a roof; a
            Kangra garden picks tea in flushes.
          </p>
          <p className="mt-4 text-[15.5px] leading-[1.85] text-ink/75">
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
            <Link to="/sourcing" className="link-underline font-serif text-[15px] text-forest">
              Read how verification works →
            </Link>
          </div>
        </div>

        <figure className="relative mb-10 sm:mb-0">
          <div className="relative">
            <div className="overflow-hidden rounded-xl border border-line bg-sand/30 shadow-md group">
              <picture>
                <source
                  type="image/webp"
                  srcSet="/images/home/himalayan-kathkuni-village-720.webp 720w, /images/home/himalayan-kathkuni-village-1100.webp 1100w, /images/home/himalayan-kathkuni-village.webp 1376w"
                  sizes="(min-width: 1024px) 42vw, 100vw"
                />
                <img
                  src="/images/home/himalayan-kathkuni-village.jpg"
                  alt="Traditional Kath-Kuni wood-and-stone architecture, slate roofs, and terraced mountain slopes in Himachal Pradesh"
                  loading="lazy"
                  decoding="async"
                  width={1376}
                  height={768}
                  className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
              </picture>
            </div>

            <div className="absolute -bottom-6 -left-3 hidden w-36 overflow-hidden rounded-lg border-4 border-paper bg-paper shadow-xl sm:block lg:-left-8 lg:w-44 group">
              <img
                src="/images/home/batheri-1100.jpg"
                alt="Slate-roofed houses and terraces in Mandi district"
                loading="lazy"
                decoding="async"
                width={1100}
                height={1375}
                className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          </div>

          <figcaption className="mt-4 text-[11px] leading-relaxed text-muted sm:mt-8">
            Traditional Kath-Kuni cedar architecture & stone masonry in the high mountain valleys of Himachal Pradesh.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* Section B: Shop by Category */
const CATEGORY_VISUALS: Record<string, { image: string; tag: string }> = {
  'fruits-and-fresh-produce': { image: '/images/home/apple-orchard-1100.jpg', tag: 'Orchard Fresh' },
  'crafts-and-handicrafts': { image: '/images/home/himalayan-artisan-workshop.jpg', tag: 'Handcrafted' },
  'traditional-goods-and-essentials': { image: '/images/editorial-terrace.jpg', tag: 'Himalayan' },
  'shawls-and-weaves': { image: '/images/home/himalayan-textile-craftsmanship.webp', tag: 'Handloom' },
  knitwear: { image: '/images/product-socks.jpg', tag: 'Pure Wool' },
  'tea-and-infusions': { image: '/images/product-tea.jpg', tag: 'High Altitude' },
  'pantry-and-preserves': { image: '/images/product-honey.jpg', tag: 'Raw & Natural' },
  'dry-fruit-and-nuts': { image: '/images/home/himalayan-harvest-lifestyle.webp', tag: 'Mountain Harvest' },
  'pulses-and-staples': { image: '/images/product-rajma.jpg', tag: 'Natural Farming' },
  'caps-and-headwear': { image: '/images/product-cap.jpg', tag: 'Traditional' },
  'cold-pressed-oils': { image: '/images/product-oil.jpg', tag: 'Wood-Pressed' },
  gifting: { image: '/images/maker-food.jpg', tag: 'Curated' },
};

function CategoryCollectionSection({ categories }: { categories: Category[] }) {
  const { ref: sectionRef, isInView } = useInView<HTMLElement>({ threshold: 0.02, rootMargin: '100px 0px' });
  const liveCategories = categories.filter((category) => (category.productCount ?? 0) > 0);
  const listingCount = liveCategories.reduce((total, category) => total + (category.productCount ?? 0), 0);

  return (
    <section ref={sectionRef} className="border-b border-line bg-paper py-10 sm:py-14 lg:py-16 overflow-hidden">
      <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="mb-7 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-terra">
              <span className="h-px w-6 bg-terra" aria-hidden />
              Curated shelves
            </p>
            <h2 className="mt-3 font-serif text-2xl font-normal text-forest sm:text-4xl">Shop by category</h2>
            <p className="mt-2 text-sm text-muted">
              Organised by craft discipline — handloom woolens, teas, honey, and mountain pantry staples.
            </p>
          </div>
          <Link
            to="/shop"
            className="self-start text-xs font-semibold uppercase tracking-wider text-forest transition-colors hover:text-terra sm:self-auto"
          >
            Browse all ({listingCount} listings) →
          </Link>
        </div>

        {liveCategories.length ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {liveCategories.map((category, index) => {
              const visual = CATEGORY_VISUALS[category.slug] ?? {
                image: category.imageUrl || '/images/editorial-terrace.jpg',
                tag: 'Himachal',
              };
              return (
                <Link
                  key={category.id}
                  to={`/categories/${encodeURIComponent(category.slug)}`}
                  className={`group relative flex flex-col justify-end overflow-hidden rounded-xl border border-line bg-[#172321] aspect-[4/3] sm:aspect-[4/3.2] transition-all duration-500 ease-out transform hover:-translate-y-1 hover:border-terra/50 hover:shadow-md ${
                    isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                  }`}
                  style={{ transitionDelay: isInView ? `${(index % 4) * 60}ms` : '0ms' }}
                >
                  <img
                    src={visual.image}
                    alt={category.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15 transition-opacity duration-300 group-hover:from-black/95" />
                  <div className="absolute right-2.5 top-2.5 z-10">
                    <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                      {visual.tag}
                    </span>
                  </div>
                  <div className="relative z-10 p-3.5 sm:p-4 text-white">
                    <h3 className="font-serif text-lg sm:text-xl font-medium leading-snug !text-white drop-shadow-sm group-hover:!text-butter transition-colors">
                      {category.name}
                    </h3>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-white/85">
                      <span>
                        {category.productCount ?? 0} {category.productCount === 1 ? 'item' : 'items'}
                      </span>
                      <span className="font-medium text-white group-hover:translate-x-1 transition-transform">
                        Explore →
                      </span>
                    </div>
                  </div>
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

/* Section C: Meet the Makers */
function MakersCelebrationSection({ makers, totalCount }: { makers: MakerSummary[]; totalCount?: number }) {
  return (
    <section className="border-b border-line bg-surface py-10 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[88rem] px-4 sm:px-8 lg:px-10 xl:px-12">
        <SectionHeading
          eyebrow="People, Not Labels"
          title="Made by hand. Rooted in the hills."
          lede="Every storefront is reviewed before publication. We work directly with independent artisans, farmer cooperatives, and village self-help groups."
          action={
            <LinkButton to="/makers" variant="secondary" size="md">
              Meet All Makers ({totalCount ?? makers.length})
            </LinkButton>
          }
        />

        <div className="flex sm:grid gap-4 sm:gap-8 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid-cols-2 lg:grid-cols-3 pb-2">
          {makers.slice(0, 6).map((maker) => (
            <article
              key={maker.id}
              className="group w-[228px] shrink-0 sm:w-auto rounded-xl sm:rounded-none overflow-hidden border border-[#E4DACE]/80 bg-paper p-3 sm:p-5 shadow-xs sm:shadow-none transition-all duration-300 hover:border-forest/40 hover:shadow-sm"
            >
              <Link to={`/makers/${maker.slug}`} className="block">
                <div className="aspect-[16/10] sm:aspect-[4/3] rounded-lg sm:rounded-none overflow-hidden bg-sand/30 border border-line/60">
                  {maker.imageUrl ? (
                    <img
                      src={maker.imageUrl}
                      alt={`Artisan work by ${maker.name}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">
                      Workshop photograph in review
                    </div>
                  )}
                </div>

                <div className="mt-3 sm:mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] text-terra">
                      {maker.region ?? 'Himachal Pradesh'}
                    </span>
                    <h3 className="font-serif text-lg sm:text-2xl text-forest group-hover:text-terra transition-colors mt-0.5 truncate">
                      {maker.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {maker.productCount} active {maker.productCount === 1 ? 'listing' : 'listings'}
                    </p>
                    {maker.tagline ? (
                      <p className="mt-2 line-clamp-2 text-xs sm:text-sm leading-relaxed text-ink/75">{maker.tagline}</p>
                    ) : null}
                  </div>
                  <span className="text-forest group-hover:text-terra transition-colors font-serif text-base sm:text-lg shrink-0">↗</span>
                </div>
              </Link>
            </article>
          ))}
        </div>

        {/* Himalayan Maker Onboarding Invitation */}
        <div className="mt-12 rounded-xl border border-[#D4A373]/40 bg-[#FAF5EE] p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 shadow-xs">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E07A5F]/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#C06041]">
              🏔️ Himalayan Maker Initiative
            </span>
            <h3 className="mt-2 font-serif text-2xl text-forest">
              Are you crafting or harvesting in Himachal?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-ink/75 sm:text-sm">
              Launch your independent storefront on DEAR HILLS with <strong>0% Commission for 6 months</strong>, free craft storytelling, and insured doorstep dispatch from all 12 districts.
            </p>
          </div>
          <div className="shrink-0">
            <LinkButton to="/become-a-maker" variant="terra" size="md">
              Sell on DEAR HILLS &rarr;
            </LinkButton>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Section E: The Feeling of Himachal (Cinematic Interlude) */
function MountainInterludeSection() {
  return (
    <section className="relative h-[62vh] min-h-[440px] w-full overflow-hidden bg-forest-deep text-paper">
      <img
        src="/images/home/kinnaur-ridge-1800.jpg"
        alt="Deodar forest below snow-covered peaks above Kalpa, Kinnaur"
        loading="lazy"
        decoding="async"
        width={1800}
        height={1000}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/90 via-forest-deep/45 to-forest-deep/20" />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,25,24,0.58)_0%,_rgba(16,25,24,0.28)_50%,_transparent_78%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-5 text-center sm:px-8">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.26em] text-butter/90">Himalayan pause</p>
        <h2 className="mt-5 font-serif text-[2.1rem] leading-[1.12] !text-paper sm:text-[3rem] lg:text-[3.4rem]">
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

/* Section F: Gifting & Curated Edits */
function GiftingSection({ gifting, content }: { gifting: ProductSummary[]; content: SiteContent['homepage'] }) {
  if (!gifting.length) return null;
  return (
    <section className="border-b border-line bg-[#efe7d9] py-10 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-[88rem] px-4 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <span className="h-px w-6 bg-terra" aria-hidden />
              Curated Gift Sets
            </p>
            <h2 className="mt-3 font-serif text-2xl sm:text-4xl text-forest">{content.gifting.title}</h2>
            <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed text-ink/75">{content.gifting.body}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <LinkButton
                to={`/categories/${encodeURIComponent(content.gifting.categorySlug)}`}
                variant="secondary"
                size="md"
              >
                See All Gift Boxes
              </LinkButton>
              <Link to="/contact" className="text-xs uppercase tracking-wider text-forest font-semibold hover:text-terra">
                Custom corporate gifts →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-6 sm:grid-cols-3">
            {gifting.slice(0, 4).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* Section G: The Sourcing Standard */
function SourcingStandardSection() {
  return (
    <section className="border-b border-line bg-paper py-20 lg:py-28">
      <div className="mx-auto max-w-[88rem] px-5 sm:px-8 lg:px-10 xl:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <span className="h-px w-6 bg-terra" aria-hidden />
              Our Promise
            </p>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl text-forest">
              What we check, and what we refuse to pretend.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              A marketplace is only as trustworthy as its verification process. These four rules govern every shelf on
              DEAR HILLS today.
            </p>

            {/* Visual artisan workshop card - Photo 3 */}
            <div className="mt-7 overflow-hidden rounded-xl border border-line bg-surface shadow-xs group">
              <div className="relative aspect-[16/10] overflow-hidden">
                <picture>
                  <source
                    type="image/webp"
                    srcSet="/images/home/himalayan-artisan-workshop-720.webp 720w, /images/home/himalayan-artisan-workshop-1100.webp 1100w, /images/home/himalayan-artisan-workshop.webp 1264w"
                  />
                  <img
                    src="/images/home/himalayan-artisan-workshop.jpg"
                    alt="Elderly Himalayan craftsperson hand-carving fragrant deodar cedar wood in a natural timber workshop"
                    loading="lazy"
                    decoding="async"
                    width={1264}
                    height={848}
                    className="h-full w-full object-cover editorial-card-zoom"
                  />
                </picture>
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute bottom-3 left-3.5 right-3.5 text-white">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-butter">Direct from Workshop</span>
                  <p className="font-serif text-[14.5px] text-paper/95 leading-tight mt-0.5">
                    Crafted in small batches with traditional hand tools
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <LinkButton to="/sourcing" variant="secondary" size="md">
                Read the Complete Standard
              </LinkButton>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {PRINCIPLES.map((principle) => (
                <div key={principle.number} className="border-t border-line/80 pt-5">
                  <span className="font-serif text-sm tabular-nums tracking-[0.14em] text-terra font-semibold">
                    {principle.number}
                  </span>
                  <h3 className="mt-2 font-serif text-xl text-forest">{principle.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/70">{principle.body}</p>
                </div>
              ))}
            </div>

            {/* Photo 4: Himalayan Craftsmanship Close-up banner */}
            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-line/80 bg-surface/90 p-4 shadow-2xs group">
              <div className="relative h-20 w-28 sm:h-24 sm:w-36 shrink-0 overflow-hidden rounded-lg border border-line">
                <picture>
                  <source
                    type="image/webp"
                    srcSet="/images/home/himalayan-textile-craftsmanship-720.webp 720w, /images/home/himalayan-textile-craftsmanship.webp 1264w"
                  />
                  <img
                    src="/images/home/himalayan-textile-craftsmanship.jpg"
                    alt="Close-up macro of traditional handwoven Himalayan wool textile patterns and natural yarns"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover editorial-card-zoom"
                  />
                </picture>
              </div>
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-terra">Material Authenticity</p>
                <p className="text-xs text-ink/80 mt-1 leading-relaxed">
                  Pure Himalayan sheep wool, natural botanical dyes, and handloom weaves — certified with documented workshop origins.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Section H: Closing Brand Moment (Full-width Cinematic Himalayan Hillside Cottage Landscape) */
function ClosingMomentSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.04, rootMargin: '80px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative isolate w-full overflow-hidden bg-forest-deep text-paper py-24 sm:py-36 lg:py-44 flex items-center justify-center min-h-[540px] sm:min-h-[660px] lg:min-h-[720px]"
    >
      {/* Background Image: High-res Himachali hillside cottage with golden sunrise & snow peaks */}
      <picture className="absolute inset-0 z-0 overflow-hidden">
        <source
          type="image/webp"
          srcSet="/images/home/himalayan-cottage-sunrise-closing-640.webp 640w, /images/home/himalayan-cottage-sunrise-closing-1024.webp 1024w, /images/home/himalayan-cottage-sunrise-closing-1600.webp 1600w, /images/home/himalayan-cottage-sunrise-closing.webp 2048w"
          sizes="100vw"
        />
        <img
          src="/images/home/himalayan-cottage-sunrise-closing.jpg"
          alt="Traditional Himachali stone cottage, terraced village gardens, and snow-capped Himalayan peaks at golden dawn"
          loading="lazy"
          decoding="async"
          width={2048}
          height={1152}
          className="h-full w-full object-cover object-[center_42%] kenburns-slow scale-[1.03]"
        />
      </picture>

      {/* Editorial Scrims: Pine forest gradient and atmospheric golden sunrise warmth */}
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-forest-deep/95 via-forest-deep/55 to-forest-deep/30"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,_rgba(244,232,206,0.18)_0%,_rgba(16,25,24,0.42)_55%,_rgba(16,25,24,0.9)_100%)]"
        aria-hidden
      />

      {/* Content Container with Opening Reveal Animation */}
      <div className="relative z-20 mx-auto max-w-4xl px-5 sm:px-8 text-center">
        {/* Aperture Horizon Line Draw & Expanding Eyebrow */}
        <div className="mx-auto mb-6 flex items-center justify-center gap-3">
          <span
            className={`h-px w-10 sm:w-16 bg-gradient-to-r from-transparent to-butter/75 aperture-line ${
              isRevealed ? 'is-revealed' : ''
            }`}
            aria-hidden
          />
          <p
            className={`inline-flex items-center gap-2 rounded-full border border-butter/40 bg-forest-deep/75 px-4 py-1.5 text-[10.5px] sm:text-[11px] font-semibold uppercase text-butter shadow-sm backdrop-blur-md transition-all duration-1000 ${
              isRevealed ? 'tracking-[0.28em] opacity-100' : 'tracking-[0.1em] opacity-0'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-terra animate-pulse" aria-hidden />
            <span>Beyond The Cloud Line</span>
          </p>
          <span
            className={`h-px w-10 sm:w-16 bg-gradient-to-l from-transparent to-butter/75 aperture-line ${
              isRevealed ? 'is-revealed' : ''
            }`}
            aria-hidden
          />
        </div>

        {/* Cinematic Headline with Blur-to-Focus Opening Animation */}
        <div className="overflow-hidden py-1">
          <h2
            className={`font-serif text-[2.5rem] sm:text-[3.6rem] lg:text-[4.5rem] font-normal leading-[1.06] tracking-[-0.02em] !text-paper drop-shadow-[0_2px_24px_rgba(16,25,24,0.95)] reveal-opening ${
              isRevealed ? 'is-revealed' : ''
            }`}
          >
            Where the mist settles,
            <span className="block font-normal italic text-butter mt-1.5 sm:mt-2.5">
              stories begin.
            </span>
          </h2>
        </div>

        {/* Aesthetic Subline with Staggered Glide Reveal */}
        <div className="overflow-hidden py-1">
          <p
            className={`mx-auto mt-5 max-w-2xl text-[15.5px] sm:text-[17.5px] lg:text-[19px] font-light leading-relaxed text-paper/90 drop-shadow-[0_1px_10px_rgba(16,25,24,0.85)] reveal-opening ${
              isRevealed ? 'is-revealed' : ''
            }`}
            style={{ transitionDelay: isRevealed ? '220ms' : '0ms' }}
          >
            Hand-carded sheep wool, wild forest honey, sun-dried apricots, and carved deodar timber — crafted with quiet patience in Himalayan hamlets, delivered straight to your home.
          </p>
        </div>

        {/* Action Buttons with Interactive Elevation */}
        <div
          className={`mt-9 sm:mt-12 grid grid-cols-1 sm:flex sm:flex-wrap items-center justify-center gap-3 sm:gap-5 reveal-opening ${
            isRevealed ? 'is-revealed' : ''
          }`}
          style={{ transitionDelay: isRevealed ? '420ms' : '0ms' }}
        >
          <LinkButton
            to="/shop"
            size="lg"
            className="w-full sm:w-auto btn-editorial-primary !border-terra !bg-terra !text-white shadow-xl hover:!bg-[#C97253] rounded-md text-sm sm:text-base font-semibold px-8 py-4"
          >
            Explore The Shelves
            <span aria-hidden className="ml-2 font-serif text-lg">
              →
            </span>
          </LinkButton>

          <Link
            to="/become-a-maker"
            className="w-full sm:w-auto btn-editorial-secondary inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-paper/45 bg-forest-deep/70 px-7 py-3.5 text-sm sm:text-base font-semibold text-paper shadow-md backdrop-blur-md hover:border-paper hover:bg-forest-deep/90 hover:text-white"
          >
            Become a Maker
          </Link>
        </div>

        {/* Editorial Subtext */}
        <p
          className={`mt-8 text-[11px] sm:text-[11.5px] uppercase tracking-[0.2em] text-paper/65 drop-shadow-xs reveal-opening ${
            isRevealed ? 'is-revealed' : ''
          }`}
          style={{ transitionDelay: isRevealed ? '600ms' : '0ms' }}
        >
          Dispatched directly from artisan workshops and high-altitude orchards across all 12 districts
        </p>
      </div>
    </section>
  );
}

function SellerBannerSection({ counts }: { counts: { products: number; sellers: number; regions: number } }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.04, rootMargin: '80px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="mx-auto max-w-[88rem] px-4 py-14 sm:px-8 sm:py-16 lg:px-10 xl:px-12">
      <div className="relative isolate overflow-hidden rounded-3xl border border-forest/30 bg-forest-deep text-paper shadow-2xl min-h-[440px] flex items-center">
        {/* Authentic Himachali Stone Cottage & Snow Peaks at Sunrise */}
        <picture className="absolute inset-0 -z-20 overflow-hidden">
          <source
            type="image/webp"
            srcSet="/images/home/himalayan-cottage-sunrise-closing-640.webp 640w, /images/home/himalayan-cottage-sunrise-closing-1024.webp 1024w, /images/home/himalayan-cottage-sunrise-closing-1600.webp 1600w, /images/home/himalayan-cottage-sunrise-closing.webp 2048w"
            sizes="(max-width: 1400px) 100vw, 1400px"
          />
          <img
            src="/images/home/himalayan-cottage-sunrise-closing.jpg"
            alt="Traditional Himachali stone-and-timber cottage with slate roof overlooking terraced mountain valleys and snow-capped Himalayan peaks at golden dawn"
            loading="lazy"
            decoding="async"
            width={2048}
            height={1152}
            className="h-full w-full object-cover object-[center_36%] scale-[1.03] transition-transform duration-1000 ease-out hover:scale-105"
          />
        </picture>

        {/* Cinematic Scrims: Dark forest gradient on the left for crisp text contrast, sunlit valley on the right */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-forest-deep/95 via-forest-deep/85 to-forest-deep/50 sm:via-forest-deep/80 sm:to-forest-deep/30"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-forest-deep/95 via-forest-deep/50 to-transparent sm:hidden"
          aria-hidden
        />

        <div className="relative z-10 w-full grid gap-8 px-6 py-10 sm:px-12 sm:py-16 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          <div
            className={`transition-all duration-1000 ease-out ${
              isRevealed ? 'opacity-100 translate-y-0 filter-none' : 'opacity-0 translate-y-7 blur-[2px]'
            }`}
          >
            {/* Opening Eyebrow with Amber Glow Pill */}
            <div className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-sand/30 bg-forest/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-sand/90 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-butter/95 animate-pulse" />
              <span>Where Himalayan Craft Meets the World</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl !text-paper leading-[1.15] tracking-tight">
              Born in the high valleys.
              <br />
              <span className="italic text-butter/95 font-serif">Cherished across the world.</span>
            </h2>

            <p className="mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-paper/85 font-light">
              Every handwoven Kinnauri shawl, cold-pressed apricot kernel oil, and wild mountain tea carries a lineage of quiet mastery. Dear Hills gives independent Himalayan creators a direct, dignified shelf to reach conscious homes across India.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <LinkButton to="/become-a-maker" variant="terra" size="lg" className="shadow-lg hover:shadow-xl transition-all">
                Become a Maker
              </LinkButton>
              <Link
                to="/policies/seller-terms"
                className="inline-flex items-center gap-1.5 text-xs text-sand/90 hover:text-paper font-medium underline underline-offset-4 transition-colors"
              >
                <span>Read seller KYC &amp; platform terms</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          <div
            className={`border-t border-white/20 pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0 backdrop-blur-[2px] transition-all duration-1000 delay-200 ease-out ${
              isRevealed ? 'opacity-100 translate-y-0 filter-none' : 'opacity-0 translate-y-7 blur-[2px]'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sand/80">
              Community Impact
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
              <div className="rounded-xl bg-forest-deep/65 p-3 sm:p-3.5 border border-white/10 shadow-inner">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-paper/70 font-medium">Listings</dt>
                <dd className="mt-1 font-serif text-2xl sm:text-3xl text-paper font-semibold">{counts.products}</dd>
              </div>
              <div className="rounded-xl bg-forest-deep/65 p-3 sm:p-3.5 border border-white/10 shadow-inner">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-paper/70 font-medium">Makers</dt>
                <dd className="mt-1 font-serif text-2xl sm:text-3xl text-paper font-semibold">{counts.sellers}</dd>
              </div>
              <div className="rounded-xl bg-forest-deep/65 p-3 sm:p-3.5 border border-white/10 shadow-inner">
                <dt className="text-[10px] uppercase tracking-[0.12em] text-paper/70 font-medium">Districts</dt>
                <dd className="mt-1 font-serif text-2xl sm:text-3xl text-paper font-semibold">{counts.regions}</dd>
              </div>
            </dl>
            <div className="mt-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-butter/35 bg-forest-deep/75 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-butter">
                <span className="h-1.5 w-1.5 rounded-full bg-terra" aria-hidden />
                Direct artisan revenue model
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURED_PROVENANCE_ITEMS = [
  '100% Pure Himalayan Honey',
  'Cold-Pressed Chulli Apricot Oil',
  'Handwoven Kullu Valley Shawls',
  'Pure Shilajit Sourced at 14,000 ft',
  'GI-Tagged Kangra Orthodox Tea',
  'Sun-Dried Kinnaur Walnuts',
  'Artisanal Chamba Rumal Weaves',
  'Direct from Registered Himachali Makers',
];

function FeaturedProductsSection({ products }: { products: ProductSummary[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { ref: sectionRef, isInView } = useInView<HTMLElement>({ threshold: 0.02, rootMargin: '80px 0px' });

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const offset = direction === 'left' ? -320 : 320;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <section ref={sectionRef} className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 xl:px-10 py-10 sm:py-14 border-b border-line/40 overflow-hidden">
      <div className={`flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-8 transition-all duration-700 ease-out transform ${
        isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}>
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
              Featured Products
            </span>
            <span className={`h-px bg-gradient-to-r from-terra/70 to-line transition-all duration-700 delay-300 ${
              isInView ? 'w-10' : 'w-0'
            }`} aria-hidden />
          </div>
          <h2 className="mt-2 font-serif text-[1.65rem] sm:text-[2rem] lg:text-[2.25rem] font-medium text-forest">
            Handpicked from the Himalayas
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-ink/75 leading-relaxed">
            Discover authentic Himachali products crafted by local artisans, from cozy handlooms to pure mountain honey.
          </p>
        </div>

        {/* 4 Value Badges & Carousel Controls matching reference screenshot */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-3 xl:gap-4">
            <div
              className={`group/badge flex items-center gap-2 cursor-default transition-all duration-500 ease-out transform hover:-translate-y-1 ${
                isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
              style={{ transitionDelay: isInView ? '100ms' : '0ms' }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sand/60 border border-[#D5CCC0] text-forest transition-all duration-300 group-hover/badge:scale-110 group-hover/badge:bg-terra/10 group-hover/badge:border-terra/50 group-hover/badge:text-terra group-hover/badge:shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 transition-transform duration-300 group-hover/badge:scale-105" aria-hidden>
                  <path d="m8 3 4 8 5-5 5 15H2L8 3z" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-[11px] font-medium leading-tight text-ink/80">
                <span className="block font-semibold text-forest">Authentic</span>
                <span>Himachal</span>
              </div>
            </div>

            <div
              className={`group/badge flex items-center gap-2 cursor-default transition-all duration-500 ease-out transform hover:-translate-y-1 ${
                isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
              style={{ transitionDelay: isInView ? '180ms' : '0ms' }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sand/60 border border-[#D5CCC0] text-forest transition-all duration-300 group-hover/badge:scale-110 group-hover/badge:bg-terra/10 group-hover/badge:border-terra/50 group-hover/badge:text-terra group-hover/badge:shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 transition-transform duration-300 group-hover/badge:scale-105" aria-hidden>
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2Z" strokeWidth="1.6" />
                  <path d="M12 6c-3.314 0-6 2.686-6 6 0 2.21 1.79 4 4 4 1.5 0 2.5-1 3-2" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-[11px] font-medium leading-tight text-ink/80">
                <span className="block font-semibold text-forest">Supports</span>
                <span>Local Artisans</span>
              </div>
            </div>

            <div
              className={`group/badge flex items-center gap-2 cursor-default transition-all duration-500 ease-out transform hover:-translate-y-1 ${
                isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
              style={{ transitionDelay: isInView ? '260ms' : '0ms' }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sand/60 border border-[#D5CCC0] text-forest transition-all duration-300 group-hover/badge:scale-110 group-hover/badge:bg-terra/10 group-hover/badge:border-terra/50 group-hover/badge:text-terra group-hover/badge:shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 transition-transform duration-300 group-hover/badge:scale-105" aria-hidden>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeWidth="1.6" />
                </svg>
              </div>
              <div className="text-[11px] font-medium leading-tight text-ink/80">
                <span className="block font-semibold text-forest">Pure &</span>
                <span>Natural</span>
              </div>
            </div>

            <div
              className={`group/badge flex items-center gap-2 cursor-default transition-all duration-500 ease-out transform hover:-translate-y-1 ${
                isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
              style={{ transitionDelay: isInView ? '340ms' : '0ms' }}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sand/60 border border-[#D5CCC0] text-forest transition-all duration-300 group-hover/badge:scale-110 group-hover/badge:bg-terra/10 group-hover/badge:border-terra/50 group-hover/badge:text-terra group-hover/badge:shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 transition-transform duration-300 group-hover/badge:scale-105" aria-hidden>
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" strokeWidth="1.6" />
                </svg>
              </div>
              <div className="text-[11px] font-medium leading-tight text-ink/80">
                <span className="block font-semibold text-forest">Sustainable</span>
                <span>Choices</span>
              </div>
            </div>
          </div>

          {/* Carousel Arrows */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="group flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink/80 hover:bg-paper hover:text-forest hover:-translate-y-0.5 hover:shadow-sm active:scale-95 transition-all duration-200 shadow-2xs"
              aria-label="Scroll featured products left"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden>
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="group flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink/80 hover:bg-paper hover:text-forest hover:-translate-y-0.5 hover:shadow-sm active:scale-95 transition-all duration-200 shadow-2xs"
              aria-label="Scroll featured products right"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Himalayan Provenance Marquee Ribbon (R1 Scrolling Text Animation) */}
      <div className={`relative mb-6 overflow-hidden rounded-lg border border-line/60 bg-gradient-to-r from-sand/40 via-paper to-sand/40 py-2.5 shadow-2xs transition-all duration-700 ease-out transform ${
        isInView ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'
      }`} style={{ transitionDelay: isInView ? '250ms' : '0ms' }}>
        <div className="animate-marquee select-none flex items-center">
          <div className="flex items-center gap-8 sm:gap-12 shrink-0 pr-8 sm:pr-12 text-[10.5px] sm:text-xs font-semibold tracking-[0.16em] uppercase text-forest">
            {FEATURED_PROVENANCE_ITEMS.map((item, idx) => (
              <span key={`s4-ribbon-a-${idx}`} className="flex items-center gap-2.5 whitespace-nowrap">
                <span className="text-terra">✦</span>
                <span>{item}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-8 sm:gap-12 shrink-0 pr-8 sm:pr-12 text-[10.5px] sm:text-xs font-semibold tracking-[0.16em] uppercase text-forest" aria-hidden="true">
            {FEATURED_PROVENANCE_ITEMS.map((item, idx) => (
              <span key={`s4-ribbon-b-${idx}`} className="flex items-center gap-2.5 whitespace-nowrap">
                <span className="text-terra">✦</span>
                <span>{item}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {products.length ? (
        <div
          ref={scrollRef}
          className="grid grid-cols-2 gap-2 sm:flex sm:gap-6 sm:overflow-x-auto sm:no-scrollbar sm:scroll-smooth pb-4 pt-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {products.map((product, index) => (
            <div
              key={product.id}
              className={`w-full min-w-0 sm:w-[280px] lg:w-[300px] sm:shrink-0 flex transition-all duration-500 ease-out transform ${
                isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: isInView ? `${300 + (index % 6) * 80}ms` : '0ms' }}
            >
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
    </section>
  );
}

function BestsellersSection({ bestsellers }: { bestsellers: HomeResponse['bestsellers'] }) {
  const { ref: sectionRef, isInView } = useInView<HTMLElement>({ threshold: 0.02, rootMargin: '80px 0px' });
  if (!bestsellers.length) return null;

  return (
    <section ref={sectionRef} className="border-b border-line bg-surface py-10 sm:py-14 overflow-hidden">
      <div className={`mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 xl:px-10 transition-all duration-700 ease-out transform ${
        isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-terra">Actually purchased</p>
            <h2 className="mt-2 font-serif text-[1.65rem] sm:text-[2rem] text-forest">Bestsellers right now</h2>
            <p className="mt-1 text-xs text-muted">Ranked by paid units sold in the last 90 days.</p>
          </div>
          <Link to="/shop" className="shrink-0 text-xs font-semibold text-forest underline underline-offset-4 hover:text-terra">
            Shop all →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-6 md:grid-cols-4">
          {bestsellers.map((item, index) => (
            <Link
              key={item.slug}
              to={`/shop/${item.slug}`}
              className={`group w-full min-w-0 flex flex-col justify-between bg-white rounded-xl sm:rounded-none border border-[#E4DACE]/75 shadow-[0_1px_4px_rgba(23,35,33,0.03)] p-2 sm:p-0 sm:border-0 sm:bg-transparent sm:shadow-none transition-all duration-500 ease-out transform hover:-translate-y-1 ${
                isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              }`}
              style={{ transitionDelay: isInView ? `${(index % 4) * 60}ms` : '0ms' }}
            >
              <div>
                <div className="relative aspect-square overflow-hidden rounded-lg sm:rounded-none border border-[#E4DACE]/40 sm:border-line/60 bg-gradient-to-b from-[#FAF7F2] to-[#F1E9DE]">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.imageAlt ?? item.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted">No photo</div>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded sm:rounded-none bg-[#172321]/90 text-white px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider shadow-xs">
                    #{index + 1} Best
                  </span>
                </div>
                <p className="mt-2 truncate text-[9.5px] sm:text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#B96243]">{item.sellerName}</p>
                <h3 className="mt-0.5 line-clamp-2 text-[12.5px] sm:text-[16px] font-semibold sm:font-normal leading-snug text-forest transition-colors group-hover:text-terra min-h-[34px] sm:min-h-[42px]">
                  {item.name}
                </h3>
              </div>
              <div className="mt-2 flex items-center justify-between gap-x-1 border-t border-line/40 pt-1.5 sm:border-0 sm:pt-1">
                <span className="text-[13.5px] font-bold text-[#172321] sm:font-medium sm:text-[14px] tabular-nums">{formatINR(item.pricePaise)}</span>
                <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-xs tabular-nums">{item.unitsSold} sold</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function NewArrivalsSection({ products }: { products: ProductSummary[] }) {
  if (!products.length) return null;

  return (
    <section className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 xl:px-10 py-10 sm:py-14 border-b border-line/40">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-terra">
              Fresh Harvest &amp; Craft
            </span>
            <span className="h-px w-8 bg-line" aria-hidden />
          </div>
          <h2 className="mt-2 font-serif text-[1.65rem] sm:text-[2rem] lg:text-[2.25rem] font-medium text-forest">
            New Arrivals from the Valleys
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-ink/75 leading-relaxed">
            Recently reviewed batches dispatched directly from small workshops and family orchards across Himachal.
          </p>
        </div>
        <Link
          to="/shop?sort=newest"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-forest underline underline-offset-4 hover:text-terra shrink-0"
        >
          <span>View all new arrivals</span>
          <span aria-hidden>&rarr;</span>
        </Link>
      </div>

      <ProductGrid products={products.slice(0, 8)} showAddToCart />
    </section>
  );
}

function CatalogShowcaseSection({
  products,
  categories,
  totalCount,
}: {
  products: ProductSummary[];
  categories: Category[];
  totalCount?: number;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter((p) => p.categorySlug === selectedCategory);
  }, [products, selectedCategory]);

  if (!products.length) return null;

  return (
    <section className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8 xl:px-10 py-12 sm:py-16 border-b border-line/40 bg-[#FAF7F2]/60">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest">
              Direct from Himachal
            </span>
            <span className="h-px w-8 bg-line" aria-hidden />
          </div>
          <h2 className="mt-2 font-serif text-[1.75rem] sm:text-[2.2rem] lg:text-[2.5rem] font-medium text-forest">
            Explore Our Listed Collection
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-ink/75 leading-relaxed">
            Authentic mountain produce, handlooms, and traditional crafts &mdash; verified origin, fair pricing, and direct artisan dispatch.
          </p>
        </div>

        <LinkButton to="/shop" variant="secondary" size="md" className="shrink-0">
          {totalCount ? `View all ${totalCount} products` : 'View all products'} &rarr;
        </LinkButton>
      </div>

      {/* Category Filter Tabs */}
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-2 mb-8 sm:mx-0 sm:px-0">
        <div className="flex min-w-max items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-all ${
              selectedCategory === 'all'
                ? 'border-forest bg-forest text-paper shadow-xs'
                : 'border-line bg-surface text-ink/80 hover:border-forest/40 hover:bg-paper'
            }`}
          >
            <span>All Listed Goods</span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-forest/[0.06] text-muted'
              }`}
            >
              {products.length}
            </span>
          </button>

          {categories.map((cat) => {
            const count = products.filter((p) => p.categorySlug === cat.slug).length;
            if (count === 0) return null;
            const isSelected = selectedCategory === cat.slug;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.slug)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-all ${
                  isSelected
                    ? 'border-forest bg-forest font-semibold text-paper shadow-xs'
                    : 'border-line bg-surface text-ink/80 hover:border-forest/40 hover:bg-paper'
                }`}
              >
                <span>{cat.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-forest/[0.06] text-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length ? (
        <ProductGrid products={filteredProducts} showAddToCart />
      ) : (
        <div className="py-12 text-center text-muted text-sm">
          No items found in this category preview.{' '}
          <Link to={`/categories/${encodeURIComponent(selectedCategory)}`} className="text-forest underline font-semibold">
            View full shelf in shop &rarr;
          </Link>
        </div>
      )}

      {/* Banner / Prompt leading to /shop */}
      <div className="mt-12 rounded-xl border border-line bg-surface p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 text-center sm:text-left shadow-2xs">
        <div>
          <h3 className="font-serif text-xl sm:text-2xl text-forest font-medium">Looking for something specific?</h3>
          <p className="mt-1 text-xs sm:text-sm text-ink/75 max-w-xl">
            Browse our complete catalogue of handloom woolens, orthodox teas, cold-pressed oils, wild honey, and mountain woodcraft.
          </p>
        </div>
        <LinkButton to="/shop" variant="terra" size="lg" className="shrink-0 shadow-sm">
          Browse All Products &rarr;
        </LinkButton>
      </div>
    </section>
  );
}

export function HomePage() {
  const home = useQuery({
    queryKey: ['home'],
    queryFn: () => api<HomeResponse>('/home'),
    staleTime: 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  usePageMeta({
    title: MARKETPLACE_HOME_TITLE,
    description: MARKETPLACE_HOME_DESCRIPTION,
    canonicalPath: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': 'https://www.dearhills.in/#organization',
          name: BRAND_NAME,
          alternateName: [...BRAND_ALTERNATE_NAMES],
          url: 'https://www.dearhills.in',
          logo: {
            '@type': 'ImageObject',
            url: 'https://www.dearhills.in/favicon-192x192.png',
            width: 192,
            height: 192,
          },
          description: MARKETPLACE_HOME_DESCRIPTION,
          address: {
            '@type': 'PostalAddress',
            addressRegion: 'Himachal Pradesh',
            addressCountry: 'IN',
          },
        },
        {
          '@type': 'WebSite',
          '@id': 'https://www.dearhills.in/#website',
          url: 'https://www.dearhills.in',
          name: BRAND_NAME,
          alternateName: [...BRAND_ALTERNATE_NAMES],
          publisher: {
            '@id': 'https://www.dearhills.in/#organization',
          },
          potentialAction: {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: 'https://www.dearhills.in/shop?q={search_term_string}',
            },
            'query-input': 'required name=search_term_string',
          },
        },
      ],
    },
  });

  const homeData = home.data;
  const allHomeProducts = useMemo(() => {
    if (!homeData) return [];
    const map = new Map<string, ProductSummary>();
    for (const p of homeData.catalogPreview ?? []) map.set(p.id, p);
    for (const p of homeData.featured) map.set(p.id, p);
    for (const p of homeData.newArrivals) map.set(p.id, p);
    for (const p of homeData.gifting) map.set(p.id, p);
    return Array.from(map.values());
  }, [homeData]);

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
          isRetrying={home.isFetching}
          showReload
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

      {/* 2. Seasonal Campaign Offer Banner */}
      <div className="py-4 sm:py-6 bg-[#FAF5EE] border-b border-line/60">
        <CampaignBanner
          campaign={
            data.campaign?.posterUrl
              ? data.campaign
              : {
                  id: 'cmp_christmas_2026',
                  name: 'Dear Hills Christmas Campaign',
                  slug: 'christmas-craft-shine',
                  description:
                    'This Christmas, Let Your Craft Shine. Join Dear Hills and showcase your handmade creations, local products and more to a wider audience.',
                  posterUrl: '/images/campaigns/dearhills-christmas-campaign-1672.webp',
                  posterAlt:
                    'Dear Hills Christmas Campaign — This Christmas, Let Your Craft Shine. Join Dear Hills and showcase your handmade creations, local products and more to a wider audience. Become a Seller.',
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

      {/* 3. Shop by collection */}
      <CategoryCollectionSection categories={data.categories} />

      {/* 4. Featured products: handpicked from the Himalayas */}
      <FeaturedProductsSection products={data.featured} />

      {/* 5. Direct from Himachal: Explore Our Listed Collection */}
      <CatalogShowcaseSection products={allHomeProducts} categories={data.categories} totalCount={data.counts.products} />

      {/* 6. Fresh from the workshops: New Arrivals */}
      <NewArrivalsSection products={data.newArrivals} />

      {/* 7. Real bestsellers from paid orders */}
      <BestsellersSection bestsellers={data.bestsellers} />

      {/* 6. Meet the makers */}
      <MakersCelebrationSection makers={data.makers} totalCount={data.counts.sellers} />

      {/* 7. Discover the mountains */}
      <MountainStorySection />

      {/* 8. Atmospheric interlude */}
      <MountainInterludeSection />

      {/* 9. Gifting & seasonal collections */}
      <GiftingSection gifting={data.gifting} content={content} />

      {/* 10. Our promise & verification principles */}
      <SourcingStandardSection />

      {/* Verified Customer Reviews */}
      {data.reviews.length ? (
        <section className="border-b border-line bg-surface py-20">
          <div className="mx-auto max-w-[88rem] px-5 sm:px-8 lg:px-10 xl:px-12">
            <SectionHeading eyebrow="Verified Purchases Only" title="Notes from Customers" />
            <div className="grid gap-8 sm:grid-cols-3">
              {data.reviews.map((review) => (
                <blockquote key={review.id} className="border-t border-line/80 pt-5">
                  <p className="text-[12px] tracking-[0.16em] text-terra" aria-label={`${review.rating} of 5 stars`}>
                    {'★'.repeat(review.rating)}
                    <span className="text-sand/70">{'★'.repeat(5 - review.rating)}</span>
                  </p>
                  <p className="mt-3 font-serif text-[15px] leading-relaxed text-ink/85">“{review.body}”</p>
                  <footer className="mt-4 text-xs text-muted flex items-center justify-between">
                    <span className="font-medium text-forest">{review.authorName}</span>
                    <Link to={`/shop/${review.productSlug}`} className="hover:text-terra underline truncate max-w-[150px]">
                      {review.productName}
                    </Link>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Seller Application Callout Banner (Born in the High Valleys) */}
      <SellerBannerSection counts={data.counts} />

      {/* Regional filter pills */}
      <section className="mx-auto max-w-[88rem] px-5 pb-8 sm:px-8 lg:px-10 xl:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold mr-2">Regions:</span>
            {data.regions.map((region) => (
              <Link key={region.region} to={`/shop?region=${encodeURIComponent(region.region)}`}>
                <Badge tone="sand">
                  {region.region} ({region.productCount})
                </Badge>
              </Link>
            ))}
          </div>
          <Link to="/shop" className="link-underline text-xs font-semibold uppercase tracking-wider text-forest">
            Explore All Shelves →
          </Link>
        </div>
      </section>

      {/* Section H: Closing Brand Moment */}
      <ClosingMomentSection />
    </div>
  );
}
