import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Category, CampaignSummary, ProductSummary } from '@shared/types';
import type { SiteContent } from '@shared/content';
import { api } from '@/lib/api';
import { usePageMeta } from '@/lib/usePageMeta';
import { useScrollReveal } from '@/lib/useScrollReveal';
import { ProductCard } from '@/components/ProductCard';
import { CampaignBanner } from '@/components/CampaignBanner';
import {
  ErrorState,
  LinkButton,
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

// ==========================================
// 1. HERO SLIDES DATA
// ==========================================
const HERO_SLIDES = [
  {
    id: 'kinner-kailash',
    src: '/images/dear-hills/hero/snow-peaks.webp',
    srcSet: '/images/dear-hills/hero/snow-peaks-800.webp 800w, /images/dear-hills/hero/snow-peaks.webp 1920w',
    alt: 'Golden sunrise over snow-capped Kinner Kailash peaks in Kinnaur',
    place: 'Kinner Kailash Range, Kinnaur',
    altitude: '19,850 ft',
    caption: 'Where glacial streams nourish high-altitude wild flora',
  },
  {
    id: 'kotgarh-apple-orchard',
    src: '/images/dear-hills/hero/apple-orchard.webp',
    srcSet: '/images/dear-hills/hero/apple-orchard-800.webp 800w, /images/dear-hills/hero/apple-orchard.webp 1920w',
    alt: 'Terraced apple orchards overlooking the Himalayan mountain range',
    place: 'Kotgarh Terraces, Shimla',
    altitude: '7,400 ft',
    caption: 'Centuries of heirloom orchard fruit and honey farming',
  },
  {
    id: 'kalpa-village',
    src: '/images/dear-hills/hero/mountain-village.webp',
    srcSet: '/images/dear-hills/hero/mountain-village-800.webp 800w, /images/dear-hills/hero/mountain-village.webp 1920w',
    alt: 'Traditional wooden architecture in an ancient Himalayan village',
    place: 'Kalpa Village, Kinnaur',
    altitude: '9,700 ft',
    caption: 'Centuries of indigenous pit-loom weaving and woodcraft',
  },
  {
    id: 'himachal-valley',
    src: '/images/dear-hills/hero/himachal-valley.webp',
    srcSet: '/images/dear-hills/hero/himachal-valley-800.webp 800w, /images/dear-hills/hero/himachal-valley.webp 1920w',
    alt: 'Panoramic view of lush Kangra green tea estates',
    place: 'Kangra Tea Valley, Dharamshala',
    altitude: '4,800 ft',
    caption: 'Home to India\'s historic GI-tagged orthodox green and black teas',
  },
  {
    id: 'spiti-ridge',
    src: '/images/dear-hills/hero/himalayan-landscape.webp',
    srcSet: '/images/dear-hills/hero/himalayan-landscape-800.webp 800w, /images/dear-hills/hero/himalayan-landscape.webp 1920w',
    alt: 'High-altitude cold desert ridges in Lahaul-Spiti',
    place: 'Lahaul & Spiti Valley',
    altitude: '11,200 ft',
    caption: 'Wild seabuckthorn berries harvested in extreme sub-zero cold',
  },
];

// Quick Category Discovery Pills (Himflavours Style)
const QUICK_DISCOVERY = [
  { label: 'Wild Raw Honey', icon: '🍯', slug: 'pantry-and-preserves', img: '/images/dear-hills/categories/honey.webp' },
  { label: 'Kullu Shawls', icon: '🧣', slug: 'shawls-and-weaves', img: '/images/dear-hills/categories/kullu-shawls.webp' },
  { label: 'A2 Cow Ghee', icon: '🧈', slug: 'pantry-and-preserves', img: '/images/dear-hills/storytelling/bilona-churn.webp' },
  { label: 'Wild Seabuckthorn', icon: '🫐', query: 'seabuckthorn', img: '/images/dear-hills/storytelling/seabuckthorn-harvest.webp' },
  { label: 'Kangra Tea', icon: '🍵', slug: 'tea-and-infusions', img: '/images/dear-hills/categories/kangra-tea.webp' },
  { label: 'Kinnaur Walnuts', icon: '🌰', slug: 'dry-fruit-and-nuts', img: '/images/dear-hills/categories/walnuts.webp' },
  { label: 'Pure Shilajit', icon: '⛰️', query: 'shilajit', img: '/images/dear-hills/categories/shilajit.webp' },
  { label: 'Festive Hampers', icon: '🎁', slug: 'gifting', img: '/images/dear-hills/categories/gifting.webp' },
];

// ==========================================
// 2. HERO COMPONENT (Himflavours Inspired)
// ==========================================
function HimflavoursHero() {
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const slide = HERO_SLIDES[current];

  useEffect(() => {
    if (isHovered) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [isHovered]);

  return (
    <section className="relative overflow-hidden bg-[#FAF8F5] pt-4 sm:pt-6 pb-12 sm:pb-16 border-b border-[#EAE6DF]">
      <div className="shell">
        {/* Top Breadcrumb / Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D98263]/30 bg-[#D98263]/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#C86D3B]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#C86D3B] animate-pulse" />
            100% Direct From Mountain Villages · Shimla, Kullu &amp; Spiti
          </div>
          <div className="hidden sm:flex items-center gap-4 text-xs font-medium text-[#6B7280]">
            <span>🏔️ Altitudes up to 14,000 ft</span>
            <span>•</span>
            <span>📦 Flat ₹29 Delivery All-India</span>
          </div>
        </div>

        {/* Main Hero Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Left Column: Bold Editorial Copy */}
          <div className="lg:col-span-6 flex flex-col justify-center">
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-[#172321] leading-[1.08]">
              From the Himalayan Villages,{' '}
              <span className="italic font-normal text-[#C86D3B] block sm:inline">To Your Home</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-[#4A5568] leading-relaxed max-w-xl font-light">
              Discover authentic wild raw honey, hand-churned A2 Vedic bilona cow ghee, cold-desert seabuckthorn, handwoven Kullu shawls, and orthodox Kangra green teas — harvested and crafted by verified mountain artisans.
            </p>

            {/* Trust Badges */}
            <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-5 text-[12.5px] font-semibold text-[#2D3748]">
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[#2F6B4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                100% Raw &amp; Unadulterated
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[#2F6B4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                88% Direct Artisan Payout
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[#2F6B4F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                GI &amp; Origin Certified
              </span>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#bestsellers"
                className="inline-flex h-13 items-center justify-center rounded-full bg-[#172321] px-8 text-[14px] font-semibold tracking-wide text-white shadow-lift transition-all duration-200 hover:bg-[#253936] hover:shadow-xl active:scale-[0.98]"
              >
                Shop Our Best Sellers →
              </a>
              <Link
                to="/shop"
                className="inline-flex h-13 items-center justify-center rounded-full border border-[#DCD2C2] bg-white px-7 text-[14px] font-semibold tracking-wide text-[#172321] transition-all duration-200 hover:border-[#172321] hover:bg-[#FAF8F5] active:scale-[0.98]"
              >
                Browse All Shelves
              </Link>
            </div>
          </div>

          {/* Right Column: High-Impact Visual Carousel Card */}
          <div
            className="lg:col-span-6 relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="relative aspect-[4/3] sm:aspect-[16/11] w-full overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E7E2D9] shadow-lift bg-[#101918]">
              {HERO_SLIDES.map((item, idx) => (
                <div
                  key={item.id}
                  className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                    idx === current ? 'opacity-100 z-10' : 'opacity-0 z-0'
                  }`}
                >
                  <img
                    src={item.src}
                    srcSet={item.srcSet}
                    alt={item.alt}
                    className="h-full w-full object-cover"
                    loading={idx === 0 ? 'eager' : 'lazy'}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                </div>
              ))}

              {/* Slide Meta Overlay */}
              <div className="absolute inset-x-0 bottom-0 z-20 p-5 sm:p-7 text-white flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md">
                    <span>📍 {slide.place}</span>
                    <span>•</span>
                    <span>{slide.altitude}</span>
                  </div>
                  <p className="mt-2 text-sm sm:text-base font-light text-white/95 max-w-sm">
                    {slide.caption}
                  </p>
                </div>

                {/* Carousel Controls */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  {HERO_SLIDES.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrent(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        i === current ? 'w-8 bg-[#D98263]' : 'w-2 bg-white/40 hover:bg-white/70'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Discovery Strip (Circles like Himflavours) */}
        <div className="mt-10 sm:mt-12 pt-6 border-t border-[#EAE6DF]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B] mb-4">
            ✦ Quick Mountain Categories
          </p>
          <div className="no-scrollbar -mx-4 flex gap-3 sm:gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {QUICK_DISCOVERY.map((item) => {
              const href = item.query ? `/shop?q=${encodeURIComponent(item.query)}` : `/shop?category=${item.slug}`;
              return (
                <Link
                  key={item.label}
                  to={href}
                  className="group flex flex-col items-center gap-2 shrink-0 w-20 sm:w-24 text-center transition-transform hover:-translate-y-1"
                >
                  <div className="relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-full border-2 border-[#E5DFD5] bg-white shadow-sm transition-all duration-300 group-hover:border-[#C86D3B] group-hover:shadow-md">
                    <img
                      src={item.img}
                      alt={item.label}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-[12px] sm:text-[13px] font-semibold text-[#172321] group-hover:text-[#C86D3B] transition-colors leading-tight line-clamp-2">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 3. OUR BEST SELLERS SECTION (Immediate Product Discovery)
// ==========================================
function OurBestSellersSection({ products }: { products: ProductSummary[] }) {
  const displayProducts = products.slice(0, 8);

  return (
    <section id="bestsellers" className="reveal-on-scroll py-14 sm:py-20 bg-white border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10 sm:mb-12">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
              <span>★</span>
              <span>Our Best Sellers</span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-2 tracking-tight">
              Cherished Himalayan Harvests
            </h2>
            <p className="mt-2 text-sm sm:text-base text-[#6B7280] max-w-2xl font-light">
              Celebrated high-altitude produce, pure wild honeys, and generational weaves trusted by conscious homes across India.
            </p>
          </div>

          <Link
            to="/shop"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.14em] text-[#C86D3B] hover:text-[#172321] transition-colors self-start sm:self-auto"
          >
            Browse All Bestsellers <span aria-hidden>→</span>
          </Link>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
          {displayProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 4. "NAMASTE JI!" WELCOME CARD (The Soul of the Brand)
// ==========================================
function NamasteJiWelcomeSection() {
  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-[#FAF8F5] border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E7E2D9] bg-white shadow-lift">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            {/* Left: Authentic Artisan Image */}
            <div className="lg:col-span-5 relative min-h-[300px] sm:min-h-[420px] bg-[#EAE6DF]">
              <img
                src="/images/dear-hills/artisans/namaste-artisan.webp"
                alt="Himachali mountain artisan smiling with traditional craft"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent lg:hidden" />
              <div className="absolute bottom-4 left-4 z-10 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#172321] backdrop-blur-md">
                🏔️ Kinnauri Master Weaver
              </div>
            </div>

            {/* Right: Personal Mountain Greeting */}
            <div className="lg:col-span-7 p-6 sm:p-10 lg:p-14 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D98263]/30 bg-[#D98263]/10 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B] w-fit">
                <span>हिमाचल से सादर प्रणाम · Namaste Ji</span>
              </div>

              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-4 tracking-tight">
                Welcome to Dear Hills
              </h2>

              <p className="mt-4 text-sm sm:text-base text-[#4A5568] leading-relaxed font-light">
                A regional marketplace born in Himachal Pradesh that unites traditional mountain farmers, master handloom weavers, and women-led self-help groups with those who seek what is pure, honest, and real.
              </p>

              <p className="mt-3 text-sm sm:text-base text-[#4A5568] leading-relaxed font-light">
                What we bring to your doorstep is not an industrial commodity, but a small part of the sacred land we call home — hand-churned, wild-harvested, and crafted with patient Himalayan devotion.
              </p>

              {/* 3 Pillar Checkmarks */}
              <div className="mt-6 space-y-2.5 text-xs sm:text-sm font-medium text-[#2D3748]">
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E7F1EA] text-[#2F6B4F] text-xs font-bold">✓</span>
                  <span>100% Native Mountain Origin — harvested above 4,000 ft</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E7F1EA] text-[#2F6B4F] text-xs font-bold">✓</span>
                  <span>88% Direct Payouts into artisan and self-help group accounts</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E7F1EA] text-[#2F6B4F] text-xs font-bold">✓</span>
                  <span>Strict zero-pesticide guarantee and certified FSSAI purity testing</span>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/about"
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[#172321] px-7 text-xs sm:text-sm font-semibold tracking-wide text-white transition-all hover:bg-[#253936] active:scale-[0.98]"
                >
                  Our Mountain Sourcing Story →
                </Link>
                <Link
                  to="/makers"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[#DCD2C2] bg-white px-6 text-xs sm:text-sm font-semibold tracking-wide text-[#172321] transition-all hover:bg-[#FAF8F5] active:scale-[0.98]"
                >
                  Meet the Artisans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 5. HIMALAYAN SELECTIONS (Category Grid)
// ==========================================
const HIMALAYAN_SELECTIONS = [
  {
    title: 'Apparels & Handlooms',
    desc: 'Kullu shawls, Kinnauri stoles, and hand-knitted merino woollens.',
    slug: 'shawls-and-weaves',
    img: '/images/dear-hills/categories/kullu-shawls.webp',
    tag: 'Pit-Loom Weaves',
  },
  {
    title: 'Wild Honey & Preserves',
    desc: '100% raw high-altitude Maaun bee honey and organic apple preserves.',
    slug: 'pantry-and-preserves',
    img: '/images/dear-hills/categories/honey.webp',
    tag: 'Unheated & Raw',
  },
  {
    title: 'Pahadi Desi Ghee & Oils',
    desc: 'Vedic bilona churned A2 cow ghee and cold-pressed wild apricot oils.',
    slug: 'cold-pressed-oils',
    img: '/images/dear-hills/storytelling/bilona-churn.webp',
    tag: 'Wood-Pressed',
  },
  {
    title: 'Cold Desert Superfoods',
    desc: 'Wild Spiti seabuckthorn pulp, gold-grade Shilajit, and mountain walnuts.',
    slug: 'dry-fruit-and-nuts',
    img: '/images/dear-hills/storytelling/seabuckthorn-harvest.webp',
    tag: 'High Altitude',
  },
  {
    title: 'Kangra Orthodox Teas',
    desc: 'GI-tagged single-estate orthodox green and black teas from the valley.',
    slug: 'tea-and-infusions',
    img: '/images/dear-hills/categories/kangra-tea.webp',
    tag: 'First Flush',
  },
  {
    title: 'Festive Gift Hampers',
    desc: 'Handcrafted wooden boxes filled with pure Himalayan harvests and crafts.',
    slug: 'gifting',
    img: '/images/dear-hills/categories/gifting.webp',
    tag: 'Artisan Curated',
  },
];

function HimalayanSelectionsSection() {
  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-white border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
            ✦ Rooted in Nature · Crafted in Tradition
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-2 tracking-tight">
            Himalayan Selections
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#6B7280] font-light">
            Every category reflects centuries of regional wisdom, sustainable harvesting, and generational mountain craft.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {HIMALAYAN_SELECTIONS.map((sel) => (
            <Link
              key={sel.title}
              to={`/shop?category=${sel.slug}`}
              className="group overflow-hidden rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] transition-all duration-300 hover:shadow-xl hover:border-[#C86D3B]"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-[#EAE6DF]">
                <img
                  src={sel.img}
                  alt={sel.title}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#172321] backdrop-blur-md">
                  {sel.tag}
                </div>
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#172321] group-hover:text-[#C86D3B] transition-colors">
                  {sel.title}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[#6B7280] leading-relaxed font-light">
                  {sel.desc}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#C86D3B]">
                  Explore Shelf →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 6. WOMEN BEHIND THE CRAFT (Himflavours Crown Jewel)
// ==========================================
const ARTISAN_STORIES = [
  {
    name: 'Mani Devi',
    role: 'Master Weaver of Kullu Handloom',
    village: 'Naggar, Kullu Valley',
    img: '/images/dear-hills/artisans/mani-devi.webp',
    quote: 'I have spent 38 years on the wooden pit-loom. Every geometric border tells the sacred story of snow peaks and deodar forests.',
  },
  {
    name: 'Kamla Thakur',
    role: 'A2 Vedic Bilona Ghee Producer',
    village: 'Rohru, Shimla Hills',
    img: '/images/dear-hills/artisans/kamla-thakur.webp',
    quote: 'Our indigenous Pahadi cows graze freely on medicinal alpine pastures. We churn before sunrise using earthen pots and wooden bilona.',
  },
  {
    name: 'Palden Lamo',
    role: 'High-Altitude Flora Beekeeper',
    village: 'Tirthan Valley, Kullu',
    img: '/images/dear-hills/artisans/palden-lamo.webp',
    quote: 'The bees forage on wild mustard, clover, and rhododendron flowers at 8,000 feet. We never heat or adulterate the golden honey.',
  },
  {
    name: 'Sudha Guleria',
    role: 'Cold-Pressed Chulli Oil Artisan',
    village: 'Kangra Valley, Dharamshala',
    img: '/images/dear-hills/artisans/sudha-guleria.webp',
    quote: 'Wild apricots crushed slowly in traditional wooden kohlus retain pure natural vitamin E and an unforgettable mountain aroma.',
  },
];

function WomenBehindCraftSection() {
  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-[#FAF8F5] border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
            ✦ Women Behind the Craft
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-2 tracking-tight">
            Stories of Tradition &amp; Skill
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#6B7280] font-light">
            Every order directly supports the rural self-help groups, craftswomen, and beekeepers who safeguard our heritage.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ARTISAN_STORIES.map((artisan) => (
            <div
              key={artisan.name}
              className="overflow-hidden rounded-2xl border border-[#E7E2D9] bg-white shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-[#EAE6DF]">
                <img
                  src={artisan.img}
                  alt={artisan.name}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#172321] backdrop-blur-md">
                  📍 {artisan.village}
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-serif text-xl font-normal text-[#172321]">
                  {artisan.name}
                </h3>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#C86D3B] mt-0.5">
                  {artisan.role}
                </p>
                <p className="mt-3 text-xs sm:text-[13px] text-[#4A5568] leading-relaxed italic font-light border-l-2 border-[#D98263] pl-3">
                  "{artisan.quote}"
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/makers"
            className="inline-flex h-12 items-center justify-center rounded-full border border-[#DCD2C2] bg-white px-8 text-xs sm:text-sm font-semibold tracking-wide text-[#172321] transition-all hover:bg-[#FAF8F5] active:scale-[0.98]"
          >
            Meet All 24 Verified Himachali Makers →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 7. WHERE TRADITION MEETS MOUNTAIN STRENGTH (Cultural Focus)
// ==========================================
const CULTURAL_STORIES = [
  {
    title: 'The Crafting of Kullu Border',
    sub: '800 Years of Sacred Geometry',
    desc: 'Each diamond and zig-zag motif woven on Kullu looms represents sacred mountain peaks, river confluences, and ancient temple spires.',
    img: '/images/dear-hills/storytelling/traditional-weaving.webp',
    tag: 'Handloom Heritage',
  },
  {
    title: 'Wild Seabuckthorn Berry',
    sub: 'Wonder Berry of the Cold Desert',
    desc: 'Wild-harvested at 11,000 ft in sub-zero Spiti winters. Packed with natural Omega 7 and Vitamin C, revered in Tibetan Amchi medicine.',
    img: '/images/dear-hills/storytelling/seabuckthorn-harvest.webp',
    tag: 'Lahaul & Spiti',
  },
  {
    title: 'The Iconic Pahadi Topi',
    sub: 'The Mountain Seal of Dignity',
    desc: 'Handcrafted woollen headwear trimmed with a vibrant velvet band. Worn across Himachal as a statement of pride, dignity, and warmth.',
    img: '/images/dear-hills/categories/handicrafts.webp',
    tag: 'Himachal Pride',
  },
];

function TraditionMeetsStrengthSection() {
  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-white border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
            ✦ Heritage &amp; Craftsmanship
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-2 tracking-tight">
            Where Tradition Meets Mountain Strength
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#6B7280] font-light">
            Every product is steeped in mountain lore, local climate resilience, and traditional handmade artistry.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {CULTURAL_STORIES.map((story) => (
            <div
              key={story.title}
              className="group overflow-hidden rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] transition-all duration-300 hover:shadow-xl"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-[#EAE6DF]">
                <img
                  src={story.img}
                  alt={story.title}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-108"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#172321] backdrop-blur-md">
                  {story.tag}
                </div>
              </div>
              <div className="p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-[#C86D3B]">
                  {story.sub}
                </p>
                <h3 className="font-serif text-2xl font-normal text-[#172321] mt-1 group-hover:text-[#C86D3B] transition-colors">
                  {story.title}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-[#4A5568] leading-relaxed font-light">
                  {story.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 8. EXPLORE HIMACHAL PRADESH (12 Districts Selector)
// ==========================================
const DISTRICTS_12 = [
  { name: 'Kullu', alt: '7,200 ft', spec: 'Kullu Shawls & Maaun Honey', img: '/images/dear-hills/regions/kullu.webp' },
  { name: 'Kangra', alt: '4,800 ft', spec: 'GI Orthodox Tea & Chulli Oil', img: '/images/dear-hills/regions/kangra.webp' },
  { name: 'Kinnaur', alt: '9,800 ft', spec: 'Wild Flora Honey & Walnuts', img: '/images/dear-hills/regions/kinnaur.webp' },
  { name: 'Lahaul & Spiti', alt: '11,500 ft', spec: 'Seabuckthorn & Woollen Socks', img: '/images/dear-hills/regions/lahaul-spiti.webp' },
  { name: 'Shimla', alt: '7,100 ft', spec: 'A2 Cow Ghee & Heirloom Apples', img: '/images/dear-hills/regions/shimla.webp' },
  { name: 'Chamba', alt: '3,300 ft', spec: 'Chamba Rajma & Rumal Weaves', img: '/images/dear-hills/regions/chamba.webp' },
  { name: 'Mandi', alt: '3,400 ft', spec: 'Medicinal Herbs & Sepu Vadi', img: '/images/dear-hills/regions/mandi.webp' },
  { name: 'Solan', alt: '5,200 ft', spec: 'Wild Mushrooms & Fruit Jams', img: '/images/dear-hills/regions/solan.webp' },
  { name: 'Sirmaur', alt: '3,800 ft', spec: 'Ginger Preserves & Wild Honey', img: '/images/dear-hills/regions/sirmaur.webp' },
  { name: 'Bilaspur', alt: '2,200 ft', spec: 'Traditional Wooden Crafts', img: '/images/dear-hills/regions/bilaspur.webp' },
  { name: 'Hamirpur', alt: '2,500 ft', spec: 'Traditional Mountain Pulses', img: '/images/dear-hills/regions/hamirpur.webp' },
  { name: 'Una', alt: '1,200 ft', spec: 'Native Mustard & Grain Flour', img: '/images/dear-hills/regions/una.webp' },
];

function ExploreDistrictsSection() {
  const [selected, setSelected] = useState(0);
  const district = DISTRICTS_12[selected];

  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-[#FAF8F5] border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
            ✦ Regional Terroir &amp; Origin
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-2 tracking-tight">
            Explore Himachal Pradesh
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#6B7280] font-light">
            Every valley holds its own climate, soil chemistry, altitude, and centuries of handcrafted tradition.
          </p>
        </div>

        {/* District Tabs */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center">
          {DISTRICTS_12.map((d, idx) => (
            <button
              key={d.name}
              type="button"
              onClick={() => setSelected(idx)}
              className={`px-4 py-2 rounded-full text-xs sm:text-[13px] font-semibold transition-all whitespace-nowrap ${
                selected === idx
                  ? 'bg-[#172321] text-white shadow-md'
                  : 'bg-white text-[#4A5568] border border-[#E2DDD3] hover:border-[#172321]'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>

        {/* District Featured Card */}
        <div className="mt-8 overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E7E2D9] bg-white shadow-lift">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
            <div className="lg:col-span-7 relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-auto lg:h-[380px] overflow-hidden bg-[#EAE6DF]">
              <img
                src={district.img}
                alt={district.name}
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                loading="lazy"
              />
              <div className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#172321] backdrop-blur-md">
                📍 {district.name} District · {district.alt}
              </div>
            </div>

            <div className="lg:col-span-5 p-6 sm:p-8 lg:p-10">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
                Himalayan Terroir
              </span>
              <h3 className="font-serif text-3xl sm:text-4xl font-normal text-[#172321] mt-2">
                {district.name} Valley
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-[#4A5568] leading-relaxed font-light">
                Renowned for <strong className="font-semibold text-[#172321]">{district.spec}</strong>. Sourced directly from local farmers cooperatives and family workshops across {district.name}.
              </p>

              <div className="mt-6 pt-4 border-t border-[#EAE6DF] flex items-center justify-between">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#6B7280]">Elevation</span>
                  <span className="font-serif text-lg text-[#172321] font-medium">{district.alt}</span>
                </div>
                <Link
                  to={`/shop?region=${encodeURIComponent(district.name)}`}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#172321] px-6 text-xs font-semibold text-white transition-all hover:bg-[#253936]"
                >
                  Shop {district.name} Goods →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 9. MOUNTAIN PURITY SEAL (Pure · Honest · Local)
// ==========================================
function MountainPuritySealSection() {
  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-white border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
            ✦ The Dear Hills Purity Standard
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-2 tracking-tight">
            Where Mountains Meet Divinity
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#6B7280] font-light">
            We hold ourselves to an uncompromising regional charter so you always receive genuine Himalayan goodness.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] p-6 text-center">
            <span className="text-3xl">🌿</span>
            <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#172321] mt-3">Pure</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#6B7280] leading-relaxed font-light">
              Pesticide-free, high-altitude alpine harvesting. Unfiltered honeys, raw stone-ground flours, and natural wood-pressed oils.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] p-6 text-center">
            <span className="text-3xl">🤝</span>
            <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#172321] mt-3">Honest</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#6B7280] leading-relaxed font-light">
              Transparent 12% marketplace fee: 88% of every sale goes directly into maker bank accounts without delayed deductions.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] p-6 text-center">
            <span className="text-3xl">🏔️</span>
            <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#172321] mt-3">Local</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#6B7280] leading-relaxed font-light">
              Every single listing is 100% grown, harvested, or handcrafted within the borders of Himachal Pradesh. Zero counterfeit re-labelling.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] p-6 text-center">
            <span className="text-3xl">📦</span>
            <h3 className="font-serif text-xl sm:text-2xl font-normal text-[#172321] mt-3">Protected</h3>
            <p className="mt-2 text-xs sm:text-sm text-[#6B7280] leading-relaxed font-light">
              Insulated, plastic-free mountain packaging designed to protect raw honeys and delicate glass jars all the way to your door.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 10. WHAT OUR CUSTOMERS SAY (Social Proof)
// ==========================================
const TESTIMONIALS = [
  {
    name: 'Ananya Sharma',
    city: 'New Delhi',
    stars: 5,
    product: '100% Raw Maaun Bee Honey',
    text: 'You can immediately tell this honey is authentic. The floral aroma of mountain flora is intense and real, completely unlike the heated sugar syrups sold by commercial supermarkets.',
  },
  {
    name: 'Rohit Kulkarni',
    city: 'Mumbai',
    stars: 5,
    product: 'Hand-Churned A2 Pahadi Desi Ghee',
    text: 'The bilona ghee took me right back to my grandparents village. Grainy, golden, and heavenly fragrance when melting on hot rotis. Worth every rupee.',
  },
  {
    name: 'Priya Mehra',
    city: 'Chandigarh',
    stars: 5,
    product: 'Authentic Handwoven Kullu Shawl',
    text: 'The geometric border weaving is breathtaking. Warm, lightweight, and you can feel the patience of the pit-loom. Such an honor to support women weavers directly.',
  },
  {
    name: 'Dr. Siddharth Rao',
    city: 'Bengaluru',
    stars: 5,
    product: 'Wild Seabuckthorn Pulp (Spiti)',
    text: 'Raw and undiluted. We mix 20ml in morning water with honey. My skin and digestion have noticeably improved. Extremely thankful for genuine Spiti sourcing.',
  },
];

function WhatOurCustomersSaySection() {
  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-[#FAF8F5] border-b border-[#EAE6DF]">
      <div className="shell">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
            ✦ Customer Love &amp; Reviews
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#172321] mt-2 tracking-tight">
            What Our Patrons Say
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[#6B7280] font-light">
            Real feedback from thousands of homes across India discovering pure Himalayan produce.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-[#E7E2D9] bg-white p-6 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-1 text-[#D98263] text-sm mb-3">
                  {'★'.repeat(t.stars)}
                </div>
                <p className="text-xs sm:text-[13.5px] text-[#4A5568] leading-relaxed font-light italic">
                  "{t.text}"
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-[#EAE6DF]">
                <p className="font-semibold text-xs sm:text-sm text-[#172321]">{t.name}</p>
                <p className="text-[11px] text-[#6B7280]">{t.city} · <span className="text-[#2F6B4F]">Verified Buyer</span></p>
                <p className="text-[11px] font-medium text-[#C86D3B] mt-1 line-clamp-1">{t.product}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 11. FAQ ACCORDION SECTION
// ==========================================
const FAQS = [
  {
    q: 'How do you verify that products are genuinely from Himachal Pradesh?',
    a: 'Every artisan, farmer, or cooperative is verified on the ground before listing. We verify workshop locations, harvest origins, and documentation. No anonymous brokers or industrial intermediaries are permitted.',
  },
  {
    q: 'What are your delivery timelines and courier charges?',
    a: 'We offer a transparent flat delivery fee of ₹29 across India, and complimentary free shipping on all orders over ₹699. Orders are packed carefully and delivered within 4 to 8 business days.',
  },
  {
    q: 'Is the honey heated or pasteurized?',
    a: 'No. Our high-altitude Maaun bee honeys are 100% raw, unheated, and unpasteurized. They retain natural bee pollen, enzymes, and micro-nutrients just as harvested from mountain hives.',
  },
  {
    q: 'How does Dear Hills support local mountain women and weavers?',
    a: 'We operate on a transparent 12% marketplace fee. The remaining 88% goes directly into the artisan or self-help group bank account, ensuring fair compensation and dignified rural livelihoods.',
  },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-white border-b border-[#EAE6DF]">
      <div className="shell max-w-4xl">
        <div className="text-center mb-10 sm:mb-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C86D3B]">
            ✦ Questions &amp; Answers
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-normal text-[#172321] mt-2 tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = open === idx;
            return (
              <div
                key={faq.q}
                className="rounded-2xl border border-[#E7E2D9] bg-[#FAF8F5] overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : idx)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-serif text-lg sm:text-xl font-normal text-[#172321] hover:text-[#C86D3B] transition-colors"
                >
                  <span>{faq.q}</span>
                  <span className={`text-xl transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}>+</span>
                </button>
                {isOpen ? (
                  <div className="px-5 pb-6 sm:px-6 sm:pb-6 text-xs sm:text-sm text-[#4A5568] leading-relaxed font-light border-t border-[#EAE6DF] pt-4">
                    {faq.a}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 12. SELLER ONBOARDING SECTION
// ==========================================
function SellerOnboardingSection() {
  return (
    <section className="reveal-on-scroll py-14 sm:py-20 bg-[#172321] text-white">
      <div className="shell">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D98263]">
              ✦ For Himachali Artisans &amp; Farmers
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-white mt-3 tracking-tight">
              If You Make It in Himachal, There Is a Shelf for You
            </h2>
            <p className="mt-4 text-sm sm:text-base text-white/80 max-w-2xl font-light leading-relaxed">
              Sell directly to conscious buyers across India without middlemen taking your margins. Zero registration fees, verified storefronts, and guaranteed 88% direct payouts.
            </p>
          </div>

          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-4">
            <LinkButton to="/sell" variant="terra" size="lg" className="w-full justify-center">
              Apply to Become a Maker →
            </LinkButton>
            <Link
              to="/policies/seller-terms"
              className="text-center text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-white transition-colors py-2"
            >
              Read Maker KYC &amp; Terms
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 13. MASTER HOMEPAGE RENDERER
// ==========================================
export function HomePage() {
  usePageMeta({
    title: 'DEAR HILLS — Authentic Himalayan Products from Himachal Pradesh',
    description:
      'Curated regional marketplace connecting customers directly with authentic artisans, wild raw honeys, A2 bilona ghee, and Kullu handlooms from Himachal Pradesh.',
  });

  useScrollReveal();

  const home = useQuery<HomeResponse>({
    queryKey: ['home'],
    queryFn: () => api<HomeResponse>('/home'),
    staleTime: 60_000,
  });

  if (home.isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-[#FAF8F5] px-4">
        <div className="flex flex-col items-center gap-3 text-sm text-[#6B7280]">
          <Spinner className="h-7 w-7 text-[#172321]" />
          <span className="font-serif text-base text-[#172321]">Gathering Himalayan shelves…</span>
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

  return (
    <div className="w-full bg-[#FAF8F5]">
      {/* 1. Himflavours Inspired Hero Section */}
      <HimflavoursHero />

      {/* 2. Our Best Sellers Section (Immediate Shopping Engine) */}
      <OurBestSellersSection products={data.featured} />

      {/* 3. "Namaste Ji!" Welcome & Sourcing Story */}
      <NamasteJiWelcomeSection />

      {/* 4. Seasonal Campaign Offer Banner (if active) */}
      {data.campaign ? (
        <div className="border-b border-[#EAE6DF]">
          <CampaignBanner campaign={data.campaign} />
        </div>
      ) : null}

      {/* 5. Himalayan Selections (Visual Category Grid) */}
      <HimalayanSelectionsSection />

      {/* 6. Women Behind the Craft (Artisan Stories) */}
      <WomenBehindCraftSection />

      {/* 7. Where Tradition Meets Mountain Strength */}
      <TraditionMeetsStrengthSection />

      {/* 8. Explore Himachal Pradesh (12 Districts) */}
      <ExploreDistrictsSection />

      {/* 9. Mountain Purity Seal (Pure · Honest · Local) */}
      <MountainPuritySealSection />

      {/* 10. What Our Customers Say (Social Proof) */}
      <WhatOurCustomersSaySection />

      {/* 11. Frequently Asked Questions */}
      <FaqSection />

      {/* 12. Seller Onboarding Section */}
      <SellerOnboardingSection />
    </div>
  );
}
