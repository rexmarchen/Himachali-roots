import { useState, type FormEvent } from 'react';
import type { WizardForm } from './OnboardingTypes';
import { HIMACHAL_DISTRICTS } from './OnboardingTypes';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';

interface Props {
  form: WizardForm;
  onChange: (updates: Partial<WizardForm>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2BusinessProfile({ form, onChange, onNext, onBack }: Props) {
  const [error, setError] = useState<string | null>(null);

  const businessTypes = [
    {
      id: 'artisan',
      category: 'artisan_craftsperson' as const,
      label: 'Maker / Artisan',
      desc: 'Handloom weavers, woodcarvers, potters, metalcrafters & traditional artists',
      icon: '🧶',
    },
    {
      id: 'farmer',
      category: 'farmer_grower' as const,
      label: 'Farmer / Producer',
      desc: 'Apple orchards, wild honey harvesters, tea growers & terraced crop farmers',
      icon: '🍎',
    },
    {
      id: 'proprietorship',
      category: 'local_brand' as const,
      label: 'Local Brand / Shop',
      desc: 'Packaged regional goods, homegrown brands, wellness products & local shops',
      icon: '🏔️',
    },
    {
      id: 'home_business',
      category: 'home_business' as const,
      label: 'Home Business / Other',
      desc: 'Small home-run enterprises, cooperatives, Self-Help Groups (SHGs) & collectives',
      icon: '🏡',
    },
  ];

  const storyLength = form.story.trim().length;
  const storyValid = storyLength >= 80;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.businessName.trim().length < 2) {
      setError('Please enter your shop or maker display name (at least 2 characters).');
      return;
    }
    if (!form.region) {
      setError('Please select your Himachal district.');
      return;
    }
    if (form.village.trim().length < 2) {
      setError('Please enter your town, tehsil or village name.');
      return;
    }
    if (form.address.line1.trim().length < 4) {
      setError('Please enter your street address or landmark.');
      return;
    }
    const cleanPhone = form.phone.trim().replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian contact mobile number (starting with 6, 7, 8, or 9).');
      return;
    }
    if (form.sellerCategory === 'food_producer' && !form.fssaiNumber.trim()) {
      setError('Food producers must provide an FSSAI registration or license number.');
      return;
    }
    if (!/^\d{6}$/.test(form.address.pincode.trim())) {
      setError('Please enter a valid 6-digit Indian PIN code.');
      return;
    }
    if (!storyValid) {
      setError(`Please describe your craft or business in at least 80 characters (${storyLength}/80 entered).`);
      return;
    }

    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-7">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terra">Step 2 of 4 · Business</p>
        <h2 className="mt-1 font-serif text-3xl text-forest">Tell us about your business</h2>
        <p className="mt-2 text-sm text-muted">
          Buyers on Dear Hills cherish knowing the real artisans and valleys behind each piece.
        </p>
      </div>

      {error ? <Alert tone="warning">{error}</Alert> : null}

      {/* Business Structure Selection */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-forest">
          Select What Describes You Best *
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {businessTypes.map((t) => {
            const isSelected = form.sellerCategory === t.category;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ sellerType: t.id, sellerCategory: t.category })}
                className={`flex items-start gap-3 rounded-sm border p-3.5 text-left transition-all ${
                  isSelected
                    ? 'border-terra bg-terra/[0.06] shadow-xs'
                    : 'border-line bg-surface hover:border-forest/40'
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${isSelected ? 'text-terra' : 'text-forest'}`}>
                    {t.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted leading-relaxed">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Basic Shop Information */}
      <div className="rounded-sm border border-line bg-surface p-6 shadow-xs space-y-4">
        <h3 className="font-serif text-lg font-medium text-forest border-b border-line pb-2">
          Store & Maker Identity
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store or Maker Display Name" required hint="e.g. Kinnaur Heritage Looms">
            <Input
              required
              value={form.businessName}
              placeholder="Display name on Dear Hills"
              onChange={(e) => onChange({ businessName: e.target.value })}
            />
          </Field>

          <Field label="One-line Tagline" hint="e.g. Handwoven pure desi woolens from Sangla">
            <Input
              value={form.tagline}
              maxLength={140}
              placeholder="Brief summary of your craft or harvest"
              onChange={(e) => onChange({ tagline: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact Mobile Number" required hint="10-digit Indian mobile number for order dispatch & SMS">
            <Input
              required
              maxLength={10}
              value={form.phone}
              placeholder="e.g. 9816012345"
              onChange={(e) => onChange({ phone: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Business Registration / Udyam / Society No." hint="Optional if registered as a firm, MSME, or cooperative">
            <Input
              value={form.businessRegistrationNumber}
              placeholder="e.g. UDYAM-HP-01-0012345 or Society Reg (optional)"
              onChange={(e) => onChange({ businessRegistrationNumber: e.target.value })}
            />
          </Field>
        </div>

        {/* Location Fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Himachal District" required hint="Select your home district">
            <Select
              required
              value={form.region}
              onChange={(e) => onChange({ region: e.target.value })}
            >
              {HIMACHAL_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Town, Tehsil or Village" required hint="e.g. Naggar, Jaisinghpur, Kalpa">
            <Input
              required
              value={form.village}
              placeholder="Your local village or town"
              onChange={(e) => {
                const val = e.target.value;
                onChange({
                  village: val,
                  address: { ...form.address, city: val },
                });
              }}
            />
          </Field>
        </div>

        <Field label="Workshop / Farm Address" required hint="Where your products are made or stored">
          <Input
            required
            value={form.address.line1}
            placeholder="Street address, house/premises number, landmark"
            onChange={(e) => onChange({ address: { ...form.address, line1: e.target.value } })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PIN Code" required hint="6-digit postal code">
            <Input
              required
              maxLength={6}
              value={form.address.pincode}
              placeholder="176001"
              onChange={(e) =>
                onChange({ address: { ...form.address, pincode: e.target.value.replace(/\D/g, '') } })
              }
            />
          </Field>
          <Field label="State">
            <Input disabled value="Himachal Pradesh" className="bg-warm-paper/40 cursor-not-allowed" />
          </Field>
        </div>
      </div>

      {/* Story & Biography */}
      <div className="rounded-sm border border-line bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h3 className="font-serif text-lg font-medium text-forest">Your Story & Heritage</h3>
          <span
            className={`text-xs font-semibold ${
              storyValid ? 'text-forest' : 'text-terra'
            }`}
          >
            {storyLength} / 80 min characters {storyValid ? '✓' : ''}
          </span>
        </div>

        <Field
          label="Tell buyers about your work and journey"
          required
          hint="Explain how you started, the craft or farming traditions you preserve, and what makes your work authentic."
        >
          <Textarea
            required
            rows={4}
            value={form.story}
            placeholder="We are based in Kullu and hand-spin pure desi wool for traditional pattus. Our family has practiced weaving on wooden handlooms for three generations..."
            onChange={(e) => onChange({ story: e.target.value })}
          />
        </Field>

        {/* Conditional Type Questions */}
        {form.sellerCategory === 'artisan_craftsperson' ? (
          <div className="rounded-sm bg-warm-paper/50 p-4 border border-line space-y-3">
            <p className="text-xs font-semibold text-forest uppercase tracking-wider">
              Artisan & Handloom Details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Materials Used" hint="e.g. Desi wool, walnut wood, brass">
                <Input
                  value={form.categoryAnswers?.materials ?? ''}
                  placeholder="Primary raw materials"
                  onChange={(e) =>
                    onChange({
                      categoryAnswers: { ...form.categoryAnswers, materials: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Craft Structure" hint="Individual, family, or self-help group">
                <Select
                  value={form.categoryAnswers?.structure ?? 'individual'}
                  onChange={(e) =>
                    onChange({
                      categoryAnswers: { ...form.categoryAnswers, structure: e.target.value },
                    })
                  }
                >
                  <option value="individual">Individual artisan / family workshop</option>
                  <option value="collective">Artisan collective / Self-Help Group</option>
                  <option value="cooperative">Registered weaver cooperative</option>
                </Select>
              </Field>
            </div>
          </div>
        ) : null}

        {form.sellerCategory === 'farmer_grower' ? (
          <div className="rounded-sm bg-warm-paper/50 p-4 border border-line space-y-3">
            <p className="text-xs font-semibold text-forest uppercase tracking-wider">
              Harvest & Farming Details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Primary Produce" hint="e.g. Royal Delicious apples, wild forest honey">
                <Input
                  value={form.categoryAnswers?.produce ?? ''}
                  placeholder="What you harvest"
                  onChange={(e) =>
                    onChange({
                      categoryAnswers: { ...form.categoryAnswers, produce: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Altitude / Valley" hint="e.g. 7,200 ft, Kotgarh Valley">
                <Input
                  value={form.categoryAnswers?.altitude ?? ''}
                  placeholder="Growing altitude or valley"
                  onChange={(e) =>
                    onChange({
                      categoryAnswers: { ...form.categoryAnswers, altitude: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ) : null}

        {form.sellerCategory === 'local_brand' ? (
          <div className="rounded-sm bg-warm-paper/50 p-4 border border-line space-y-3">
            <p className="text-xs font-semibold text-forest uppercase tracking-wider">
              Brand & Manufacturing Role
            </p>
            <Field label="Manufacturing Model">
              <Select
                value={form.categoryAnswers?.role ?? 'manufacturer'}
                onChange={(e) =>
                  onChange({
                    categoryAnswers: { ...form.categoryAnswers, role: e.target.value },
                  })
                }
              >
                <option value="manufacturer">Direct Manufacturer / Processor in Himachal</option>
                <option value="brand_owner">Brand Owner with contracted local mountain processing</option>
                <option value="authorised_reseller">Authorized Reseller of certified Himachali makers</option>
              </Select>
            </Field>
          </div>
        ) : null}

        {form.sellerCategory === 'food_producer' ? (
          <div className="rounded-sm bg-warm-paper/50 p-4 border border-line space-y-3">
            <p className="text-xs font-semibold text-forest uppercase tracking-wider">
              Food Safety & Preparation Details
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="FSSAI Registration / License Number" required hint="14-digit FSSAI number">
                <Input
                  required
                  value={form.fssaiNumber}
                  placeholder="e.g. 20923001000123"
                  maxLength={14}
                  onChange={(e) =>
                    onChange({
                      fssaiNumber: e.target.value.replace(/\D/g, ''),
                    })
                  }
                />
              </Field>
              <Field label="Preparation Location & Unit" required hint="Where the food is made or bottled">
                <Input
                  required
                  value={form.categoryAnswers?.kitchenLocation ?? ''}
                  placeholder="e.g. Naggar workshop / kitchen unit"
                  onChange={(e) =>
                    onChange({
                      categoryAnswers: { ...form.categoryAnswers, kitchenLocation: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Ingredients & Preservation Method" hint="e.g. Traditional sun-drying, organic mustard oil, unpasteurized honey">
              <Input
                value={form.categoryAnswers?.preservation ?? ''}
                placeholder="Preservation methods used"
                onChange={(e) =>
                  onChange({
                    categoryAnswers: { ...form.categoryAnswers, preservation: e.target.value },
                  })
                }
              />
            </Field>
          </div>
        ) : null}

        {form.sellerCategory === 'retailer' ? (
          <div className="rounded-sm bg-warm-paper/50 p-4 border border-line space-y-3">
            <p className="text-xs font-semibold text-forest uppercase tracking-wider">
              Retailer & Resale Authorization
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Makers or Brands Stocked" required hint="Which Himachali artisans or producers you represent">
                <Input
                  required
                  value={form.categoryAnswers?.authorizedBrands ?? ''}
                  placeholder="e.g. Chamba Rumal artisans, Kullu weavers"
                  onChange={(e) =>
                    onChange({
                      categoryAnswers: { ...form.categoryAnswers, authorizedBrands: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Storage & Dispatch Facility" hint="How products are kept safe from moisture/damage">
                <Input
                  value={form.categoryAnswers?.storageFacility ?? ''}
                  placeholder="e.g. Temperature-controlled dry warehouse in Mandi"
                  onChange={(e) =>
                    onChange({
                      categoryAnswers: { ...form.categoryAnswers, storageFacility: e.target.value },
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ) : null}
      </div>

      {/* Navigation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3 pt-4 border-t border-line">
        <Button type="button" variant="secondary" onClick={onBack}>
          &larr; Back to Account
        </Button>
        <Button type="submit" size="lg">
          Continue to Products & Origin &rarr;
        </Button>
      </div>
    </form>
  );
}

