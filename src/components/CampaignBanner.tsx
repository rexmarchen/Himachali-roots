import { Link } from 'react-router-dom';
import type { CampaignSummary } from '@shared/types';
import { posterSrcSet } from '@/lib/poster';

export function CampaignBanner({
  campaign,
  priority = true,
}: {
  campaign: CampaignSummary | null | undefined;
  priority?: boolean;
}) {
  // The banner only exists when an administrator has published a live campaign
  // with a real poster. There is no placeholder or invented fallback.
  if (!campaign?.posterUrl) return null;

  const href = `/offers/${campaign.slug}`;

  return (
    <section aria-labelledby="festive-campaign-heading" className="w-full pt-3 pb-2 sm:pt-4 sm:pb-3">
      <h2 id="festive-campaign-heading" className="sr-only">
        {campaign.name} — Diwali in Himachal Offers
      </h2>
      <div className="mx-auto w-full max-w-3xl sm:max-w-4xl lg:max-w-[860px] xl:max-w-[900px] px-4 sm:px-6">
        <Link
          to={href}
          aria-label={`${campaign.name}: View Pahadi Festive Glow Diwali offers and authentic Himachali collection`}
          className="group relative block w-full overflow-hidden rounded-xl sm:rounded-2xl border border-[#2D241C]/25 bg-[#14120E] shadow-xl transition-all duration-300 hover:border-terra/40 hover:shadow-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra"
        >
          <img
            src={campaign.posterUrl}
            srcSet={posterSrcSet(campaign.posterUrl)}
            sizes="(min-width: 1280px) 900px, (min-width: 1024px) 860px, (min-width: 640px) 720px, 100vw"
            alt={campaign.posterAlt ?? `${campaign.name} — authentic Himachali goods from local makers`}
            width={1672}
            height={941}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className="block h-auto w-full aspect-[1672/941] object-contain transition-transform duration-500 ease-out group-hover:scale-[1.008]"
          />
        </Link>
      </div>
    </section>
  );
}
