import type { CoreBusinessType } from './OnboardingTypes';

interface Props {
  selectedType: CoreBusinessType;
  onSelectType: (type: CoreBusinessType) => void;
  onStart: () => void;
  onLogin: () => void;
}

export function SellerWelcomeHero({ selectedType, onSelectType, onStart, onLogin }: Props) {
  const businessTypes: {
    id: CoreBusinessType;
    title: string;
    subtitle: string;
    icon: string;
  }[] = [
    {
      id: 'maker_artisan',
      title: 'Maker / Artisan',
      subtitle: 'Weavers, woodcarvers, potters, metalcraft & handmade goods',
      icon: '🧶',
    },
    {
      id: 'farmer_producer',
      title: 'Farmer / Producer',
      subtitle: 'Apple orchards, wild honey, Kangra tea & terraced crops',
      icon: '🍎',
    },
    {
      id: 'local_brand',
      title: 'Local Brand / Shop',
      subtitle: 'Himachali brand, packaged food, natural wellness & local store',
      icon: '🏔️',
    },
    {
      id: 'other_business',
      title: 'Other Mountain Business',
      subtitle: 'Home enterprise, cooperative, Self-Help Group or collective',
      icon: '🏡',
    },
  ];

  return (
    <section className="relative overflow-hidden border-b border-line bg-warm-paper">
      {/* Background warm aesthetic gradient */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(217,130,99,0.12),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center lg:gap-14">
          {/* Left Column: Brand Storytelling & Himalayan Imagery */}
          <div className="lg:col-span-6 xl:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-forest/15 bg-forest/[0.04] px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-terra" />
              Dear Hills · Mountain Maker Onboarding
            </div>

            <h1 className="mt-5 font-serif text-[clamp(2.4rem,5.5vw,4.2rem)] font-normal leading-[1.04] tracking-tight text-forest">
              Your craft deserves a <span className="italic text-terra">bigger marketplace.</span>
            </h1>

            <p className="mt-5 max-w-2xl font-sans text-base leading-relaxed text-muted sm:text-lg">
              Join Dear Hills and bring the products, culture and craftsmanship of the hills to customers everywhere.
              We handle payment processing, insured doorstep courier pickup, and dedicated customer care so you can focus
              on what you make and grow.
            </p>

            {/* Himalayan Photography Showcase */}
            <div className="relative mt-8 overflow-hidden rounded-sm border border-line bg-butter/30 shadow-sm">
              <img
                src="/images/maker-sunset-studio.jpg"
                alt="Himachali artisan working in a mountain timber studio at golden hour"
                className="aspect-[16/10] w-full object-cover transition-transform duration-700 hover:scale-[1.02]"
                loading="eager"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest-deep/85 via-forest-deep/40 to-transparent p-5 text-paper">
                <p className="font-serif text-lg font-medium text-butter sm:text-xl">
                  “When honest work meets appreciative homes, mountain traditions thrive.”
                </p>
                <p className="mt-1 text-xs text-sand/90">Curated Himalayan Crafts & Heritage Sourcing · Himachal Pradesh</p>
              </div>
            </div>

            {/* Key Value Propositions */}
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="border border-line bg-surface p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-terra">Artisan Payout</p>
                <p className="mt-1 font-serif text-xl font-bold text-forest">88% Direct</p>
                <p className="mt-0.5 text-[11px] text-muted">Transparent payments</p>
              </div>
              <div className="border border-line bg-surface p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-terra">Logistics</p>
                <p className="mt-1 font-serif text-xl font-bold text-forest">Doorstep</p>
                <p className="mt-0.5 text-[11px] text-muted">Pickups in all 12 districts</p>
              </div>
              <div className="border border-line bg-surface p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-terra">Registration</p>
                <p className="mt-1 font-serif text-xl font-bold text-forest">₹0 Free</p>
                <p className="mt-0.5 text-[11px] text-muted">No listing fees</p>
              </div>
              <div className="border border-line bg-surface p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-terra">Review</p>
                <p className="mt-1 font-serif text-xl font-bold text-forest">24–48 Hrs</p>
                <p className="mt-0.5 text-[11px] text-muted">Manual human check</p>
              </div>
            </div>
          </div>

          {/* Right Column: Registration Introduction & Business Type Selection */}
          <div className="lg:col-span-6 xl:col-span-5">
            <div className="rounded-sm border border-line bg-surface p-6 shadow-md sm:p-8">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <p className="font-serif text-2xl font-medium text-forest">Begin Your Application</p>
                  <p className="mt-1 text-xs text-muted">Select how you identify to get started</p>
                </div>
                <span className="rounded-full bg-butter px-3 py-1 text-[11px] font-medium text-forest">
                  4 Guided Steps
                </span>
              </div>

              {/* Business Type Selection Cards */}
              <div className="mt-5 space-y-2.5">
                {businessTypes.map((type) => {
                  const selected = selectedType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => onSelectType(type.id)}
                      className={`flex w-full items-start gap-3.5 rounded-sm border p-3.5 text-left transition-all ${
                        selected
                          ? 'border-terra bg-terra/[0.06] shadow-xs'
                          : 'border-line bg-surface hover:border-forest/40 hover:bg-forest/[0.02]'
                      }`}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand/40 text-lg">
                        {type.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-semibold ${selected ? 'text-terra' : 'text-forest'}`}>
                            {type.title}
                          </p>
                          <span
                            className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                              selected ? 'border-terra bg-terra text-white' : 'border-line'
                            }`}
                          >
                            {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{type.subtitle}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={onStart}
                  className="w-full rounded-sm border border-forest bg-forest py-3.5 text-sm font-semibold uppercase tracking-wider text-paper transition-all hover:bg-forest-deep shadow-sm"
                >
                  Start Selling on Dear Hills &rarr;
                </button>

                <div className="flex items-center justify-center gap-1.5 text-xs text-muted">
                  <span>Already have an account?</span>
                  <button
                    type="button"
                    onClick={onLogin}
                    className="font-medium text-forest underline underline-offset-2 hover:text-terra"
                  >
                    Sign In to resume
                  </button>
                </div>
              </div>

              {/* Curated Platform Assurance */}
              <div className="mt-6 rounded-sm border border-line bg-warm-paper/60 p-3.5 text-xs text-muted leading-relaxed">
                <div className="flex items-center gap-2 font-medium text-forest">
                  <span className="text-forest text-sm">🔒</span>
                  <span>Curated & Trusted Marketplace</span>
                </div>
                <p className="mt-1 text-[11.5px]">
                  All applications are carefully reviewed by our team before store activation. Your identity documents
                  are stored in a private, encrypted vault and never made public.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

