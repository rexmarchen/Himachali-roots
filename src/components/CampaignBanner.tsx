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
  const discount = campaign.maxDiscountPercent ? `${campaign.maxDiscountPercent}% off` : 'Limited offer';

  return (
    <section aria-labelledby="festive-campaign-heading" className="shell section-tight">
      <div className="grid overflow-hidden border border-line bg-forest-deep text-paper lg:grid-cols-[0.85fr_1.15fr]">
        <div className="order-2 flex flex-col justify-center px-6 py-11 sm:px-10 sm:py-14 lg:order-1 lg:px-12 lg:py-16">
          <p className="t-eyebrow text-butter/80">Diwali collection · {discount}</p>

          <h2 id="festive-campaign-heading" className="t-h2 mt-4 text-paper">
            {campaign.name}
          </h2>

          <p className="mt-4 max-w-md text-[13.5px] leading-[1.75] text-paper/70">
            {campaign.description ??
              'A festive collection from Himachali makers: handwoven wool, Kangra tea, orchard walnuts and wildflower honey.'}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link
              to={href}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-butter bg-butter px-6 text-[12px] font-semibold uppercase tracking-[0.12em] text-forest-deep transition-colors hover:bg-paper"
            >
              Shop the offer
              <span aria-hidden>→</span>
            </Link>
            <Link
              to="/shop"
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper/60 underline decoration-paper/25 underline-offset-4 transition-colors hover:text-paper"
            >
              {campaign.productCount ?? 0} pieces in the edit
            </Link>
          </div>
        </div>

        <div className="relative order-1 min-h-[220px] overflow-hidden sm:min-h-[300px] lg:order-2 lg:block lg:min-h-[420px]">
          <img
            src={campaign.posterUrl}
            srcSet={posterSrcSet(campaign.posterUrl)}
            sizes="(min-width: 1024px) 58vw, 100vw"
            alt={campaign.posterAlt ?? `${campaign.name} — authentic Himachali goods from local makers`}
            width={1672}
            height={941}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className="img-brand absolute inset-0 h-full w-full object-cover object-[78%_center] transition-transform duration-[1200ms] ease-out hover:scale-[1.02]"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#101918_0%,rgba(16,25,24,0.97)_30%,rgba(16,25,24,0.9)_44%,rgba(16,25,24,0.6)_56%,rgba(16,25,24,0.16)_69%,rgba(16,25,24,0)_80%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-forest-deep/70 to-transparent lg:hidden"
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}
