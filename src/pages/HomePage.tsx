import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, ProductSummary } from '@shared/types';
import type { SiteContent } from '@shared/content';
import { api } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import {
  Badge,
  DemoBadge,
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

/* Photographs verified free of embedded watermarks: mountains and apple garden landscapes */
const HERO_SLIDES = [
  {
    id: 'kotgarh-apple-orchard',
    src: '/images/hero-apple-orchard.jpg',
    alt: 'Sunlit Himachali apple orchard in Kotgarh with ripe red apples overlooking snow-capped Himalayan peaks',
    place: 'Kotgarh Valley, Shimla',
    caption: 'Sunlit apple orchards overlooking the Great Himalayan peaks',
  },
  {
    id: 'kinner-kailash-sunrise',
    src: '/images/hero-snow-peaks.jpg',
    alt: 'Golden sunrise light illuminating snow-capped Himalayan peaks and pine forests in Kinnaur',
    place: 'Kinner Kailash Range, Kinnaur',
    caption: 'First light breaking over snow-covered Himalayan summits',
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
    src: '/images/maker-orchard.jpg',
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
      className="relative isolate flex min-h-[90svh] w-full flex-col justify-end overflow-hidden bg-[#101918] text-white lg:min-h-[94vh]"
      aria-roledescription="carousel"
      aria-label="Photographs from Himachal Pradesh"
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="absolute inset-0 z-0">
        {HERO_SLIDES.map((item, index) => {
          const active = index === current;
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

        {/* Crystal-clear natural gradient scrims: preserve all natural mountain & apple garden daylight, no muddy tint */}
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-black/75 via-black/15 to-transparent sm:w-2/3"
          aria-hidden
        />
      </div>

      <div className="relative z-30 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-end px-5 pb-12 pt-40 sm:px-8 sm:pb-16 sm:pt-48 lg:px-12 lg:pt-52">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/95 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-terra animate-pulse" aria-hidden />
            <span>Rooted in Himachal Pradesh</span>
          </div>

          <h1 className="mt-5 font-serif text-4xl sm:text-5xl lg:text-[4.2rem] font-normal leading-[1.03] tracking-[-0.02em] text-white drop-shadow-md">
            From the Himalayas,
            <span className="mt-1 block font-normal italic text-butter">with heart.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-white/90 drop-shadow-xs font-light">
            Pure mountain honey, handloom Kullu wool, high-altitude orthodox Kangra tea, and cedar woodcraft — directly from reviewed artisans and orchardists across the mountain valleys.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3.5 sm:gap-4">
            <LinkButton
              to="/shop"
              size="lg"
              className="!border-terra !bg-terra !text-white shadow-lg hover:!bg-[#C97253] transition-all hover:scale-105 font-semibold px-7 py-3.5 rounded-md text-sm"
            >
              Shop the Collection
              <span aria-hidden className="ml-2">
                →
              </span>
            </LinkButton>

            <Link
              to="/makers"
              className="inline-flex items-center gap-2 rounded-md border border-white/40 bg-white/15 backdrop-blur-md px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:border-white hover:bg-white/25 transition-all"
            >
              Meet the Makers
            </Link>
          </div>

          <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/20 pt-5 text-xs text-white/80 font-medium">
            <li className="flex items-center gap-1.5">✓ 100% Named Artisans</li>
            <li aria-hidden className="hidden h-3 w-px bg-white/25 sm:block" />
            <li className="flex items-center gap-1.5">✓ Verified Mountain Origin</li>
            <li aria-hidden className="hidden h-3 w-px bg-white/25 sm:block" />
            <li className="flex items-center gap-1.5">✓ Direct Dispatches from HP</li>
          </ul>
        </div>
      </div>

      <div className="relative z-30 border-t border-white/15 bg-black/45 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="text-terra text-sm shrink-0">📍</span>
            <div className="min-w-0">
              <p className="font-serif text-[14px] font-medium text-white/95">{slide.place}</p>
              <p className="truncate text-[11.5px] text-white/75">{slide.caption}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5" aria-label="Choose a photograph">
              {HERO_SLIDES.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={index === current ? 'true' : undefined}
                  aria-label={`${item.place}: ${item.caption}`}
                  onClick={() => goTo(index)}
                  className={`relative h-[3px] overflow-hidden rounded-full transition-all duration-300 ${
                    index === current ? 'w-12 bg-white/30' : 'w-5 bg-white/20 hover:bg-white/50'
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
                className="flex h-7 w-7 items-center justify-center rounded border border-white/30 text-white/80 transition-colors hover:border-white hover:text-white"
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
      <div className="mx-auto grid max-w-[86rem] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:px-12">
        <div>
          <p className="flex items-center gap-3 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-terra">
            <span className="h-px w-8 bg-terra" aria-hidden />
            The mountain way
          </p>
          <h2 className="mt-5 font-serif text-[2.1rem] leading-[1.08] text-forest sm:text-[2.6rem] lg:text-[2.9rem]">
            More than products.
            <span className="mt-1 block font-normal text-ink/70">A working landscape.</span>
          </h2>

          <p className="mt-6 text-[15.5px] leading-[1.85] text-ink/75">
            In the high valleys of Himachal Pradesh, weaving, beekeeping and orchard work follow altitude and season rather
            than a factory clock. A Kullu weaver counts a border by hand; a Spiti household dries apricots on a roof; a
            Kangra garden picks tea in flushes.
          </p>
          <p className="mt-4 text-[15.5px] leading-[1.85] text-ink/75">
            PAHADI ROOTS is a marketplace, not a factory shop. Each seller applies, is reviewed, and keeps their own
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
            <div className="overflow-hidden border border-line bg-sand/30">
              <img
                src="/images/home/batheri-1100.jpg"
                srcSet="/images/home/batheri-720.jpg 720w, /images/home/batheri-1100.jpg 1100w, /images/home/batheri-1800.jpg 1800w"
                sizes="(min-width: 1024px) 42vw, 100vw"
                alt="Slate-roofed houses, kitchen gardens and terraced fields in Batheri village, Mandi district"
                loading="lazy"
                decoding="async"
                width={1100}
                height={1375}
                className="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out hover:scale-[1.02]"
              />
            </div>

            <div className="absolute -bottom-8 -left-4 hidden w-36 overflow-hidden border-4 border-paper bg-paper shadow-lg sm:block lg:-left-10 lg:w-44">
              <img
                src="/images/home/chamba-carving-720.jpg"
                alt="Carved stone niche on the Laxminarayan temple, Chamba"
                loading="lazy"
                decoding="async"
                width={720}
                height={720}
                className="aspect-square w-full object-cover"
              />
            </div>
          </div>

          <figcaption className="mt-4 text-[11px] leading-relaxed text-muted sm:mt-12">
            Batheri, Mandi district. Photograph via Wikimedia Commons — full attribution on the{' '}
            <Link to="/credits" className="link-underline">
              image credits
            </Link>{' '}
            page.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* Section B: Shop by Category */
const CATEGORY_VISUALS: Record<string, { image: string; tag: string }> = {
  'shawls-and-weaves': { image: '/images/product-shawl.jpg', tag: 'Handloom' },
  knitwear: { image: '/images/product-socks.jpg', tag: 'Pure Wool' },
  'tea-and-infusions': { image: '/images/product-tea.jpg', tag: 'High Altitude' },
  'pantry-and-preserves': { image: '/images/product-honey.jpg', tag: 'Raw & Natural' },
  'dry-fruit-and-nuts': { image: '/images/product-walnut.jpg', tag: 'Mountain Harvest' },
  'pulses-and-staples': { image: '/images/product-rajma.jpg', tag: 'Natural Farming' },
  'caps-and-headwear': { image: '/images/product-cap.jpg', tag: 'Traditional' },
  gifting: { image: '/images/maker-food.jpg', tag: 'Curated' },
};

function CategoryCollectionSection({ categories }: { categories: Category[] }) {
  return (
    <section className="border-b border-line bg-paper py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.24em] text-terra">
              <span className="h-px w-6 bg-terra" aria-hidden />
              Curated Shelves
            </p>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl text-forest font-normal">
              Shop by category
            </h2>
            <p className="mt-2 text-sm text-muted">
              Organised by craft discipline — explore handloom woolens, teas, honey, and mountain pantry staples.
            </p>
          </div>
          <Link
            to="/shop"
            className="text-xs font-semibold uppercase tracking-wider text-forest hover:text-terra transition-colors self-start sm:self-auto"
          >
            Browse All ({categories.reduce((acc, c) => acc + (c.productCount ?? 0), 0)} listings) →
          </Link>
        </div>

        {categories.length ? (
          <div className="grid grid-cols-2 gap-3.5 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => {
              const visual = CATEGORY_VISUALS[category.slug] ?? {
                image: '/images/editorial-terrace.jpg',
                tag: 'Himachal',
              };
              return (
                <Link
                  key={category.id}
                  to={`/shop?category=${encodeURIComponent(category.slug)}`}
                  className="group relative flex flex-col justify-end overflow-hidden rounded-xl border border-line bg-surface aspect-[4/3] sm:aspect-[4/3.2] transition-all duration-300 hover:-translate-y-1 hover:border-terra/50 hover:shadow-md"
                >
                  <img
                    src={visual.image}
                    alt={category.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-opacity duration-300 group-hover:from-black/90" />
                  <div className="absolute right-2.5 top-2.5">
                    <span className="rounded-full bg-black/45 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-xs">
                      {visual.tag}
                    </span>
                  </div>
                  <div className="relative z-10 p-3.5 sm:p-4 text-white">
                    <h3 className="font-serif text-lg sm:text-xl font-medium leading-snug drop-shadow-xs group-hover:text-butter transition-colors">
                      {category.name}
                    </h3>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-white/80">
                      <span>
                        {category.productCount ?? 0} {category.productCount === 1 ? 'item' : 'items'}
                      </span>
                      <span className="font-medium text-white/95 group-hover:translate-x-1 transition-transform">
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
function MakersCelebrationSection({ makers }: { makers: MakerSummary[] }) {
  return (
    <section className="border-b border-line bg-surface py-20 lg:py-28">
      <div className="mx-auto max-w-[86rem] px-5 sm:px-8 lg:px-12">
        <SectionHeading
          eyebrow="People, Not Labels"
          title="Made by hand. Rooted in the hills."
          lede="Every storefront is reviewed before publication. We work directly with independent artisans, farmer cooperatives, and village self-help groups."
          action={
            <LinkButton to="/makers" variant="secondary" size="md">
              Meet All Makers ({makers.length})
            </LinkButton>
          }
        />

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {makers.slice(0, 6).map((maker) => (
            <article key={maker.id} className="group border border-line/70 bg-paper p-5 transition-all duration-300 hover:border-forest/40 hover:shadow-sm">
              <Link to={`/makers/${maker.slug}`} className="block">
                <div className="aspect-[4/3] overflow-hidden bg-sand/30 border border-line/60">
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

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.16em] text-terra">
                      {maker.region ?? 'Himachal Pradesh'}
                    </span>
                    <h3 className="font-serif text-2xl text-forest group-hover:text-terra transition-colors mt-0.5">
                      {maker.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      {maker.productCount} active {maker.productCount === 1 ? 'listing' : 'listings'}
                    </p>
                    {maker.tagline ? (
                      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink/75">{maker.tagline}</p>
                    ) : null}
                  </div>
                  <span className="text-forest group-hover:text-terra transition-colors font-serif text-lg">↗</span>
                </div>
              </Link>
            </article>
          ))}
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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(65,30,39,0.6)_0%,_rgba(65,30,39,0.28)_48%,_transparent_75%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-5 text-center sm:px-8">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.26em] text-butter/85">Himalayan pause</p>
        <h2 className="mt-5 font-serif text-[2.1rem] leading-[1.12] text-paper sm:text-[3rem] lg:text-[3.4rem]">
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
    <section className="border-b border-line bg-[#efe7d9] py-20 lg:py-24">
      <div className="mx-auto max-w-[86rem] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <span className="h-px w-6 bg-terra" aria-hidden />
              Curated Gift Sets
            </p>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl text-forest">{content.gifting.title}</h2>
            <p className="mt-4 text-[15px] leading-[1.8] text-ink/75">{content.gifting.body}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <LinkButton
                to={`/shop?category=${encodeURIComponent(content.gifting.categorySlug)}`}
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

          <div className={gifting.length === 1 ? 'mx-auto w-full max-w-[320px]' : 'grid gap-6 sm:grid-cols-3'}>
            {gifting.slice(0, 3).map((item) => (
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
      <div className="mx-auto max-w-[86rem] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
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
              PAHADI ROOTS today.
            </p>
            <div className="mt-8">
              <LinkButton to="/sourcing" variant="secondary" size="md">
                Read the Complete Standard
              </LinkButton>
            </div>
          </div>

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
        </div>
      </div>
    </section>
  );
}

/* Section H: Closing Brand Moment */
function ClosingMomentSection() {
  return (
    <section className="relative overflow-hidden bg-forest-deep px-5 py-24 text-paper sm:px-8">
      <div className="absolute inset-0 opacity-25">
        <img
          src="/images/home/kalpa-dawn-1800.jpg"
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-forest-deep via-forest-deep/60 to-forest-deep/40" aria-hidden />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.26em] text-butter/85">Himalayan living</p>
        <h2 className="mt-4 font-serif text-[2.3rem] leading-[1.1] text-paper sm:text-[3rem]">
          Bring a little of the mountains home.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-[1.8] text-paper/80">
          Every order is routed to the workshop that fulfils it, and the seller’s share is recorded against that order.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <LinkButton to="/shop" size="lg" className="!border-butter !bg-butter !text-forest-deep hover:!border-paper hover:!bg-paper">
            Shop the shelves
          </LinkButton>
          <Link
            to="/become-a-maker"
            className="inline-flex items-center gap-2 border border-paper/35 px-5 py-3 text-[13px] font-medium text-paper transition-colors hover:border-paper hover:bg-paper/10"
          >
            Become a maker
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  const home = useQuery({
    queryKey: ['home'],
    queryFn: () => api<HomeResponse>('/home'),
    staleTime: 60_000,
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
      {/* Cinematic Hero with 6 Himalayan Landscape Slides */}
      <CinematicHero />

      {/* Section A: Discover the Mountains */}
      <MountainStorySection />

      {/* Section B: Shop by Collection */}
      <CategoryCollectionSection categories={data.categories} />

      {/* Section D: Featured Products (The Current Edit) */}
      <section className="mx-auto max-w-[86rem] px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
        <SectionHeading
          eyebrow="The Current Edit"
          title="Things worth keeping"
          lede="A seasonal selection from reviewed workshops. Prices include GST; shipping calculated before final checkout."
          action={
            <LinkButton to="/shop" variant="secondary" size="md">
              Shop All ({data.counts.products})
            </LinkButton>
          }
        />
        {data.featured.length ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-7 sm:gap-y-12 lg:grid-cols-4">
            {data.featured.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No featured listings yet"
            body="Products will appear here once approved by administrators."
          />
        )}
      </section>

      {/* Section E: The Feeling of Himachal (Atmospheric Interlude) */}
      <MountainInterludeSection />

      {/* Section C: Meet the Makers */}
      <MakersCelebrationSection makers={data.makers} />

      {/* Section F: Gifting & Seasonal Collections */}
      <GiftingSection gifting={data.gifting} content={content} />

      {/* Section G: Our Promise & Verification Principles */}
      <SourcingStandardSection />

      {/* Verified Customer Reviews */}
      {data.reviews.length ? (
        <section className="border-b border-line bg-surface py-20">
          <div className="mx-auto max-w-[86rem] px-5 sm:px-8 lg:px-12">
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

      {/* Seller Application Callout Banner */}
      <section className="mx-auto max-w-[86rem] px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid gap-10 border border-forest/20 bg-forest px-8 py-12 text-paper sm:px-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sand/80">For Makers & Growers</p>
            <h2 className="mt-3 max-w-xl font-serif text-3xl sm:text-4xl text-paper leading-tight">
              If you make it in Himachal, there should be a shelf for it.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/75">
              Apply with your business details, workshop location and craft categories. Every applicant is verified before
              a storefront is published.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <LinkButton to="/sell" variant="terra" size="md">
                Apply to Sell
              </LinkButton>
              <Link to="/policies/seller-terms" className="text-xs text-sand underline underline-offset-4 hover:text-paper">
                Read seller KYC & commission terms →
              </Link>
            </div>
          </div>

          <div className="border-t border-white/20 pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sand/80">Active In This Build</p>
            <dl className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.1em] text-paper/60">Listings</dt>
                <dd className="mt-1 font-serif text-3xl text-paper">{data.counts.products}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.1em] text-paper/60">Makers</dt>
                <dd className="mt-1 font-serif text-3xl text-paper">{data.counts.sellers}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.1em] text-paper/60">Districts</dt>
                <dd className="mt-1 font-serif text-3xl text-paper">{data.counts.regions}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <DemoBadge>Demonstration figures</DemoBadge>
            </div>
          </div>
        </div>
      </section>

      {/* Regional filter pills */}
      <section className="mx-auto max-w-[86rem] px-5 pb-8 sm:px-8 lg:px-12">
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
