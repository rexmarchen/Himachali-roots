import { useState, type FormEvent } from 'react';
import type { WizardForm } from './OnboardingTypes';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';

interface Props {
  form: WizardForm;
  onChange: (updates: Partial<WizardForm>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step3ProductsOrigin({ form, onChange, onNext, onBack }: Props) {
  const [error, setError] = useState<string | null>(null);

  const availableCategories = [
    {
      slug: 'crafts-and-handicrafts',
      label: 'Shawls & Handlooms',
      desc: 'Pattus, Kullu shawls, Pashmina, mufflers, woolen caps & hand-knitted textiles',
      icon: '🧶',
    },
    {
      slug: 'fruits-and-fresh-produce',
      label: 'Fresh Produce & Nuts',
      desc: 'Kotgarh & Kinnaur apples, walnuts, dried apricots, almonds & mountain garlic',
      icon: '🍎',
    },
    {
      slug: 'traditional-goods-and-essentials',
      label: 'Honey, Tea & Preserves',
      desc: 'Wild forest honey, Kangra green & orthodox teas, apple preserves, pickles & cold-pressed oils',
      icon: '🍯',
    },
  ];

  const handleToggleCategory = (slug: string) => {
    const current = new Set(form.categorySlugs);
    if (current.has(slug)) {
      if (current.size > 1) current.delete(slug);
    } else {
      current.add(slug);
    }
    onChange({ categorySlugs: [...current] });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.categorySlugs.length === 0) {
      setError('Please select at least one product category.');
      return;
    }
    if (form.originNarrative.trim().length < 20) {
      setError('Please provide a brief origin narrative (at least 20 characters) explaining where your materials come from.');
      return;
    }
    if (!form.dispatchSameAsOperating) {
      if (form.dispatchAddress.line1.trim().length < 4) {
        setError('Please enter your dispatch street address.');
        return;
      }
      if (!/^\d{6}$/.test(form.dispatchAddress.pincode.trim())) {
        setError('Please enter a valid 6-digit PIN code for dispatch.');
        return;
      }
    }

    onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-7">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terra">Step 3 of 4 · Products</p>
        <h2 className="mt-1 font-serif text-3xl text-forest">What do you want to bring to Dear Hills?</h2>
        <p className="mt-2 text-sm text-muted">
          Select the product families you produce and describe their authentic Himachal origin.
        </p>
      </div>

      {error ? <Alert tone="warning">{error}</Alert> : null}

      {/* Category Selection Cards */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-forest">
          Select Your Product Shelves (Multi-Select) *
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {availableCategories.map((cat) => {
            const isSelected = form.categorySlugs.includes(cat.slug);
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => handleToggleCategory(cat.slug)}
                className={`flex flex-col justify-between rounded-sm border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-terra bg-terra/[0.06] shadow-xs'
                    : 'border-line bg-surface hover:border-forest/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{cat.icon}</span>
                    <span
                      className={`h-4 w-4 rounded-full border flex items-center justify-center text-[10px] ${
                        isSelected ? 'border-terra bg-terra text-white' : 'border-line'
                      }`}
                    >
                      {isSelected ? '✓' : ''}
                    </span>
                  </div>
                  <p className={`mt-2 font-serif text-base font-semibold ${isSelected ? 'text-terra' : 'text-forest'}`}>
                    {cat.label}
                  </p>
                  <p className="mt-1 text-xs text-muted leading-relaxed">{cat.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Origin & Provenance Narrative */}
      <div className="rounded-sm border border-line bg-surface p-6 shadow-xs space-y-4">
        <h3 className="font-serif text-lg font-medium text-forest border-b border-line pb-2">
          Origin & Authenticity Narrative
        </h3>

        <Field
          label="Where are your materials sourced and how are they crafted?"
          required
          hint="Describe the local sourcing, mountain raw materials, or family traditions behind your items."
        >
          <Textarea
            required
            rows={3}
            value={form.originNarrative}
            placeholder="e.g. All raw wool is sourced from local sheep in the higher reaches of Kullu. We use herbal vegetable dyes and weave every piece by hand on ancestral frame looms."
            onChange={(e) => onChange({ originNarrative: e.target.value })}
          />
        </Field>
      </div>

      {/* Packaging & Logistics */}
      <div className="rounded-sm border border-line bg-surface p-6 shadow-xs space-y-4">
        <h3 className="font-serif text-lg font-medium text-forest border-b border-line pb-2">
          Shipping & Packaging
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dispatch Turnaround Time" required hint="Days needed to prepare and pack an order">
            <Select
              value={form.shipping.dispatchDays}
              onChange={(e) =>
                onChange({
                  shipping: { ...form.shipping, dispatchDays: e.target.value },
                })
              }
            >
              <option value="1">1 working day (Ready stock)</option>
              <option value="2">2 working days (Standard)</option>
              <option value="3">3 working days (Recommended)</option>
              <option value="5">5 working days (Made to order)</option>
            </Select>
          </Field>

          <Field label="Packaging Materials" hint="e.g. Corrugated boxes, paper wrap">
            <Input
              value={form.shipping.packaging}
              placeholder="e.g. Recyclable cardboard boxes and butter paper"
              onChange={(e) =>
                onChange({
                  shipping: { ...form.shipping, packaging: e.target.value },
                })
              }
            />
          </Field>
        </div>

        {/* Dispatch Address Same / Separate */}
        <div className="pt-2 border-t border-line">
          <label className="flex items-center gap-2.5 text-xs text-forest font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.dispatchSameAsOperating}
              onChange={(e) => {
                const checked = e.target.checked;
                onChange({
                  dispatchSameAsOperating: checked,
                  dispatchAddress: checked ? form.address : form.dispatchAddress,
                });
              }}
              className="h-4 w-4 rounded-xs border-line text-forest focus:ring-terra"
            />
            <span>Dispatch orders from the same address entered in Step 2</span>
          </label>

          {!form.dispatchSameAsOperating ? (
            <div className="mt-4 space-y-3 rounded-sm bg-warm-paper/40 p-4 border border-line">
              <p className="text-xs font-semibold text-forest uppercase tracking-wider">
                Separate Courier Pickup Address
              </p>
              <Field label="Pickup Street Address" required>
                <Input
                  value={form.dispatchAddress.line1}
                  placeholder="Street / Warehouse location"
                  onChange={(e) =>
                    onChange({
                      dispatchAddress: { ...form.dispatchAddress, line1: e.target.value },
                    })
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Town or City" required>
                  <Input
                    value={form.dispatchAddress.city}
                    placeholder="Town / Tehsil"
                    onChange={(e) =>
                      onChange({
                        dispatchAddress: { ...form.dispatchAddress, city: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="PIN Code" required>
                  <Input
                    maxLength={6}
                    value={form.dispatchAddress.pincode}
                    placeholder="6-digit PIN code"
                    onChange={(e) =>
                      onChange({
                        dispatchAddress: {
                          ...form.dispatchAddress,
                          pincode: e.target.value.replace(/\D/g, ''),
                        },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-line">
        <Button type="button" variant="secondary" onClick={onBack}>
          &larr; Back to Business
        </Button>
        <Button type="submit" size="lg">
          Continue to Verification &rarr;
        </Button>
      </div>
    </form>
  );
}

