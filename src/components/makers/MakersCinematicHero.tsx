import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SnowfallOverlay } from './SnowfallOverlay';

interface MakersCinematicHeroProps {
  onExploreClick: () => void;
}

export function MakersCinematicHero({ onExploreClick }: MakersCinematicHeroProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Check if motion is reduced
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      video.pause();
      return;
    }

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setVideoLoaded(true);
        })
        .catch(() => {
          // Autoplay policy or low-power mode prevention: fallback gracefully
          setVideoError(true);
        });
    }
  }, []);

  return (
    <section
      aria-label="Cinematic Himalayan Makers Introduction"
      className="relative min-h-[580px] sm:min-h-[640px] lg:min-h-[720px] w-full overflow-hidden bg-[#101918] text-white flex flex-col justify-between"
    >
      {/* =========================================================================
          1. CINEMATIC VIDEO BACKGROUND & POSTER FALLBACK
         ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Poster Image (shown immediately while video prepares or as fallback) */}
        <picture>
          <source srcSet="/images/makers/makers-hero-poster.webp" type="image/webp" />
          <img
            src="/images/makers/makers-hero-poster.jpg"
            alt=""
            className={`h-full w-full object-cover object-center transition-opacity duration-1000 ${
              videoLoaded && !videoError ? 'opacity-0' : 'opacity-100'
            }`}
            loading="eager"
            fetchPriority="high"
          />
        </picture>

        {/* Cinematic Looping Drone Video */}
        {!videoError && (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/images/makers/makers-hero-poster.webp"
            onCanPlayThrough={() => setVideoLoaded(true)}
            onError={() => setVideoError(true)}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ${
              videoLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <source src="/videos/himalayan-makers-hero.mp4" type="video/mp4" />
            <source src="/videos/himalayan-makers-hero-720.mp4" type="video/mp4" media="(max-width: 768px)" />
            <source src="/videos/himalayan-makers-hero.webm" type="video/webm" />
          </video>
        )}

        {/* Atmospheric Mist & Cloud Drift Layer */}
        <div
          className="absolute inset-0 bg-radial from-white/10 via-transparent to-transparent mix-blend-screen pointer-events-none animate-mist-drift"
        />

        {/* Master Atmospheric Gradient Overlays for Guaranteed Text Legibility */}
        {/* Top Shadow for navigation contrast */}
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[#101918]/85 via-[#101918]/45 to-transparent pointer-events-none" />

        {/* Center Vignette for focal contrast */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,25,24,0.35)_0%,_rgba(16,25,24,0.78)_100%)] pointer-events-none" />

        {/* Bottom Transition Shadow connecting seamlessly into ivory section */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#101918] via-[#101918]/65 to-transparent pointer-events-none" />

        {/* Subtle Warm Sunrise Ambient Glow */}
        <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-[#E5B869]/10 blur-3xl pointer-events-none" />
      </div>

      {/* =========================================================================
          2. GENTLE HIMALAYAN SNOWFALL LAYER
         ========================================================================= */}
      <SnowfallOverlay />

      {/* =========================================================================
          3. EDITORIAL HERO TYPOGRAPHY & ACTIONS
         ========================================================================= */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 pt-10 pb-8 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 text-center flex-1 flex flex-col justify-center">
        {/* Eyebrow Pill */}
        <div className="animate-hero-fade-up [animation-delay:150ms]">
          <div className="inline-flex max-w-full items-center gap-1.5 sm:gap-2 rounded-full border border-[#D4A373]/40 bg-[#101918]/70 px-3 sm:px-4 py-1 sm:py-1.5 shadow-sm backdrop-blur-md">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#E5B869] animate-pulse" />
            <span className="text-[8.5px] sm:text-[11px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.22em] text-[#F4E8CE]">
              MADE IN THE HIMALAYAS · SHARED WITH THE WORLD
            </span>
          </div>
        </div>

        {/* Documentary Main Headline */}
        <h1 className="mt-4 sm:mt-5 font-serif text-[26px] leading-[1.16] sm:text-5xl md:text-6xl lg:text-[70px] font-normal sm:leading-[1.08] tracking-[-0.015em] text-[#FAF7F2] drop-shadow-[0_4px_20px_rgba(0,0,0,0.85)] animate-hero-fade-up [animation-delay:300ms]">
          Bring the spirit of the <br className="sm:hidden" />
          mountains <br className="hidden sm:inline" />
          to the world.
        </h1>

        {/* Supporting Narrative */}
        <p className="mt-3.5 sm:mt-5 max-w-2xl mx-auto font-sans text-xs sm:text-base md:text-lg leading-relaxed text-[#EDE3D6]/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] px-1 animate-hero-fade-up [animation-delay:450ms]">
          From handwoven textiles and traditional crafts to mountain-grown foods and handmade treasures,
          Dear Hills helps independent Himalayan creators bring their work to more people.
        </p>

        {/* Primary & Secondary Action CTAs */}
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-hero-fade-up [animation-delay:600ms]">
          <Link
            to="/become-a-maker?offer=diwali"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-sm bg-[#D4A373] px-6 sm:px-7 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold tracking-wide text-[#1B2824] shadow-lg transition-all duration-300 hover:bg-[#E5BC91] hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>Become a Maker</span>
            <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
              &rarr;
            </span>
          </Link>

          <button
            type="button"
            onClick={onExploreClick}
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-sm border border-[#F4E8CE]/40 bg-[#172321]/65 px-6 sm:px-7 py-3 sm:py-3.5 text-xs sm:text-sm font-medium tracking-wide text-[#FAF7F2] backdrop-blur-md transition-all duration-300 hover:border-[#F4E8CE]/80 hover:bg-[#172321]/85 hover:-translate-y-0.5"
          >
            <span>Explore Our Makers</span>
            <svg
              className="h-4 w-4 text-[#F4D06F] transition-transform duration-300 group-hover:translate-y-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>

        {/* Trust Badges Bar */}
        <div className="mt-7 sm:mt-10 pt-4 sm:pt-6 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 max-w-3xl mx-auto text-left animate-hero-fade-up [animation-delay:750ms]">
          <div className="flex items-center gap-2.5 sm:gap-3 rounded-sm bg-black/25 px-3 py-2 backdrop-blur-xs border border-white/5">
            <span className="text-lg sm:text-xl shrink-0" aria-hidden>🏔️</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#FAF7F2]">6 Heritage Valleys</p>
              <p className="text-[10.5px] sm:text-[11px] text-[#E4DACE]/75 truncate">Kinnaur, Kullu, Kangra, Chamba &amp; Spiti</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 rounded-sm bg-black/25 px-3 py-2 backdrop-blur-xs border border-white/5">
            <span className="text-lg sm:text-xl shrink-0" aria-hidden>🤝</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#FAF7F2]">100% Direct to Artisan</p>
              <p className="text-[10.5px] sm:text-[11px] text-[#E4DACE]/75 truncate">Zero middleman, authentic workshops</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 rounded-sm bg-black/25 px-3 py-2 backdrop-blur-xs border border-white/5">
            <span className="text-lg sm:text-xl shrink-0" aria-hidden>🌿</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#FAF7F2]">Living Craft Traditions</p>
              <p className="text-[10.5px] sm:text-[11px] text-[#E4DACE]/75 truncate">Pit looms, wood carving &amp; wild orchards</p>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. BOTTOM SUBTLE SCROLL PROMPT
         ========================================================================= */}
      <div className="relative z-10 pb-4 text-center">
        <button
          type="button"
          onClick={onExploreClick}
          aria-label="Scroll to Maker Directory"
          className="inline-flex flex-col items-center gap-1 text-[11px] font-medium tracking-wider uppercase text-[#E4DACE]/70 hover:text-[#FAF7F2] transition-colors"
        >
          <span>Discover Artisans Below</span>
          <svg
            className="h-4 w-4 animate-bounce text-[#D4A373]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </section>
  );
}
