import { Link } from 'react-router-dom';
import type { CampaignSummary } from '@shared/types';
import { posterSrcSet } from '@/lib/poster';

export function CampaignBanner({
  campaign,
  priority = true,
}: {
  campaign?: CampaignSummary | null;
  priority?: boolean;
}) {
  const sellerUrl = '/become-a-maker';
  const posterWebp = '/images/campaigns/dearhills-christmas-campaign-1672.webp';
  const posterJpg = '/images/campaigns/dearhills-christmas-campaign.jpg';
  const altText =
    campaign?.posterAlt ??
    'Dear Hills Christmas Campaign — This Christmas, Let Your Craft Shine. Join Dear Hills and showcase your handmade creations, local products and more to a wider audience. Become a Seller.';

  return (
    <section aria-labelledby="festive-campaign-heading" className="w-full pt-2 pb-2 sm:pt-4 sm:pb-3">
      <h2 id="festive-campaign-heading" className="sr-only">
        Dear Hills Christmas Campaign — This Christmas, Let Your Craft Shine
      </h2>
      <div className="mx-auto w-full max-w-3xl sm:max-w-4xl lg:max-w-[960px] xl:max-w-[1024px] px-4 sm:px-6">
        <div className="group relative block w-full overflow-hidden rounded-xl sm:rounded-2xl border border-[#2D241C]/25 bg-[#14120E] shadow-xl transition-all duration-300 hover:border-amber-500/30 hover:shadow-2xl">
          {/* Main banner graphic with optimized WebP srcset + fallback JPG */}
          <picture>
            <source
              type="image/webp"
              srcSet={
                posterSrcSet(posterWebp) ??
                '/images/campaigns/dearhills-christmas-campaign-480.webp 480w, /images/campaigns/dearhills-christmas-campaign-800.webp 800w, /images/campaigns/dearhills-christmas-campaign-1200.webp 1200w, /images/campaigns/dearhills-christmas-campaign-1672.webp 1672w'
              }
              sizes="(min-width: 1280px) 1024px, (min-width: 1024px) 960px, (min-width: 640px) 768px, 100vw"
            />
            <img
              src={posterJpg}
              alt={altText}
              width={1024}
              height={576}
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
              className="block h-auto w-full aspect-[16/9] object-contain transition-transform duration-500 ease-out group-hover:scale-[1.006]"
            />
          </picture>

          {/* Accessible whole-banner clickable layer */}
          <Link
            to={sellerUrl}
            aria-label="Dear Hills Christmas Campaign: This Christmas, Let Your Craft Shine. Become a Seller"
            className="absolute inset-0 z-10 block cursor-pointer focus:outline-none"
            tabIndex={-1}
          />

          {/* Responsive, accessible CTA overlay positioned precisely over the 'Become a Seller' button */}
          <Link
            to={sellerUrl}
            aria-label="Become a Seller"
            title="Become a Seller on Dear Hills"
            className="absolute z-20 block rounded-full cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-amber-300/80 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-400"
            style={{
              left: '8%',
              top: '67%',
              width: '21.7%',
              height: '8.35%',
            }}
          >
            <span className="sr-only">Become a Seller</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
