import { useState, type FormEvent } from 'react';
import type { ApplicationDocument, WizardForm } from './OnboardingTypes';
import { Alert, Button } from '@/components/ui';

interface Props {
  form: WizardForm;
  documents: ApplicationDocument[];
  submitting: boolean;
  onSubmit: (e: FormEvent) => void;
  onAgreementsChange: (updates: Partial<WizardForm['agreements']>) => void;
  onJumpToStep: (step: number) => void;
  onBack: () => void;
}

export function StepReviewSubmit({
  form,
  documents,
  submitting,
  onSubmit,
  onAgreementsChange,
  onJumpToStep,
  onBack,
}: Props) {
  const [agreementChecked, setAgreementChecked] = useState(form.agreements.sellerAgreement);
  const [authenticityChecked, setAuthenticityChecked] = useState(form.agreements.authenticityPolicy);
  const [privacyChecked, setPrivacyChecked] = useState(form.agreements.privacyPolicy);
  const [error, setError] = useState<string | null>(null);

  const hasIdDoc = documents.some(
    (d) => (d.docType === 'id_proof' || d.doc_type === 'id_proof') && d.status !== 'rejected',
  );

  const categoryLabels: Record<string, string> = {
    'crafts-and-handicrafts': 'Shawls & Handlooms',
    'fruits-and-fresh-produce': 'Fresh Produce & Nuts',
    'traditional-goods-and-essentials': 'Honey, Tea & Preserves',
  };

  const sellerTypeLabels: Record<string, string> = {
    artisan: 'Maker / Artisan',
    farmer: 'Farmer / Producer',
    proprietorship: 'Local Brand / Shop',
    home_business: 'Home Business / Other',
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!hasIdDoc) {
      setError('Government photo identity is required. Please upload it in Step 4 before submitting.');
      return;
    }
    if (!agreementChecked || !authenticityChecked || !privacyChecked) {
      setError('Please review and agree to all declarations before submitting your application.');
      return;
    }

    onSubmit(e);
  };

  return (
    <form onSubmit={handleFormSubmit} className="mx-auto max-w-3xl space-y-7">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-terra">Review & Final Check</p>
        <h2 className="mt-1 font-serif text-3xl text-forest">Review Your Application</h2>
        <p className="mt-2 text-sm text-muted">
          Please confirm your details before sending them to the Dear Hills curation team.
          You can edit any section using the links below.
        </p>
      </div>

      {error ? <Alert tone="warning">{error}</Alert> : null}

      {/* Section 1: Account & Contact */}
      <div className="rounded-sm border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-paper">
              1
            </span>
            <h3 className="font-serif text-lg font-medium text-forest">Account & Contact Information</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToStep(1)}
            className="text-xs font-semibold text-terra underline underline-offset-2 hover:text-forest"
          >
            Edit
          </button>
        </div>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">Applicant Name</dt>
            <dd className="mt-0.5 font-semibold text-forest">{form.fullName || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Contact Mobile</dt>
            <dd className="mt-0.5 font-semibold text-forest">+91 {form.phone || '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Section 2: Business Profile */}
      <div className="rounded-sm border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-paper">
              2
            </span>
            <h3 className="font-serif text-lg font-medium text-forest">Business & Workshop Profile</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToStep(2)}
            className="text-xs font-semibold text-terra underline underline-offset-2 hover:text-forest"
          >
            Edit
          </button>
        </div>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">Store Display Name</dt>
            <dd className="mt-0.5 font-semibold text-forest">{form.businessName || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Business Type</dt>
            <dd className="mt-0.5 font-semibold text-forest">
              {sellerTypeLabels[form.sellerType] || form.sellerType}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Location</dt>
            <dd className="mt-0.5 text-forest">
              {form.village}, Distt. {form.region}, HP - {form.address.pincode}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Workshop Address</dt>
            <dd className="mt-0.5 text-forest">{form.address.line1 || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Craft Story</dt>
            <dd className="mt-0.5 rounded-sm bg-warm-paper/40 p-2.5 text-forest italic leading-relaxed">
              &ldquo;{form.story}&rdquo;
            </dd>
          </div>
        </dl>
      </div>

      {/* Section 3: Products & Logistics */}
      <div className="rounded-sm border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-paper">
              3
            </span>
            <h3 className="font-serif text-lg font-medium text-forest">Products, Origin & Dispatch</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToStep(3)}
            className="text-xs font-semibold text-terra underline underline-offset-2 hover:text-forest"
          >
            Edit
          </button>
        </div>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">Selected Shelves</dt>
            <dd className="mt-0.5 font-semibold text-forest">
              {form.categorySlugs.map((s) => categoryLabels[s] || s).join(', ')}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Dispatch Turnaround</dt>
            <dd className="mt-0.5 font-semibold text-forest">
              Within {form.shipping.dispatchDays} working days
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Origin & Sourcing Narrative</dt>
            <dd className="mt-0.5 text-forest">{form.originNarrative || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Dispatch Courier Location</dt>
            <dd className="mt-0.5 text-forest">
              {form.dispatchSameAsOperating
                ? 'Same as workshop address'
                : `${form.dispatchAddress.line1}, ${form.dispatchAddress.city} - ${form.dispatchAddress.pincode}`}
            </dd>
          </div>
        </dl>
      </div>

      {/* Section 4: Verification Documents */}
      <div className="rounded-sm border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-paper">
              4
            </span>
            <h3 className="font-serif text-lg font-medium text-forest">Verification Documents</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToStep(4)}
            className="text-xs font-semibold text-terra underline underline-offset-2 hover:text-forest"
          >
            Edit
          </button>
        </div>
        <div className="mt-3">
          {documents.length > 0 ? (
            <ul className="divide-y divide-line text-xs">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-forest">📄</span>
                    <span className="font-medium text-forest">{d.original_name ?? d.originalName ?? 'Uploaded File'}</span>
                  </div>
                  <span className="rounded-full bg-forest/10 px-2.5 py-0.5 text-[10px] font-semibold text-forest">
                    {d.status === 'submitted' ? 'Uploaded & Secured' : d.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-sm border border-terra/30 bg-terra/[0.05] p-3 text-xs text-terra">
              No verification documents uploaded. Please upload Government Photo Identity in Step 4.
            </div>
          )}
        </div>
      </div>

      {/* Transparent Commercial Conditions */}
      <div className="rounded-sm border border-line bg-butter/40 p-5 space-y-2.5 text-xs text-muted leading-relaxed">
        <p className="font-serif text-sm font-semibold text-forest uppercase tracking-wider">
          Marketplace Commercial Terms & Direct Payouts
        </p>
        <p>
          • <strong>Artisan Revenue:</strong> 88% of every product sale is settled directly to your bank account after delivery.
        </p>
        <p>
          • <strong>Platform Fee:</strong> Standard 12% platform fee covers Razorpay transaction processing, marketplace hosting, insured pickup logistics, and pan-India marketing. (Founding Himachal cohort receives 0% platform fee for 6 months).
        </p>
        <p>
          • <strong>Returns:</strong> 7-day handcrafted authenticity window for customers in case of damage in transit or material defect.
        </p>
      </div>

      {/* Mandatory Checkboxes */}
      <div className="rounded-sm border border-line bg-surface p-5 shadow-xs space-y-3 text-xs">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={agreementChecked}
            onChange={(e) => {
              const checked = e.target.checked;
              setAgreementChecked(checked);
              // The single seller-terms checkbox also covers the commission disclosure.
              onAgreementsChange({ sellerAgreement: checked, commissionDisclosure: checked });
            }}
            className="mt-0.5 h-4 w-4 rounded-xs border-line text-forest focus:ring-terra"
          />
          <span className="text-forest">
            I agree to the{' '}
            <a href="/policies/seller-terms" target="_blank" className="font-semibold underline">
              Dear Hills Maker & Seller Terms
            </a>{' '}
            and the 12% standard commission structure.
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={authenticityChecked}
            onChange={(e) => {
              setAuthenticityChecked(e.target.checked);
              onAgreementsChange({ authenticityPolicy: e.target.checked });
            }}
            className="mt-0.5 h-4 w-4 rounded-xs border-line text-forest focus:ring-terra"
          />
          <span className="text-forest">
            I declare that all items sold on Dear Hills are genuinely made, grown, or sourced in Himachal Pradesh and
            adhere to mountain authenticity standards.
          </span>
        </label>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={privacyChecked}
            onChange={(e) => {
              setPrivacyChecked(e.target.checked);
              onAgreementsChange({ privacyPolicy: e.target.checked });
            }}
            className="mt-0.5 h-4 w-4 rounded-xs border-line text-forest focus:ring-terra"
          />
          <span className="text-forest">
            I have read and agree to the{' '}
            <a href="/policies/privacy" target="_blank" className="font-semibold underline">
              Privacy Policy
            </a>{' '}
            regarding the confidential handling of my verification documents.
          </span>
        </label>
      </div>

      {/* Submission CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-line">
        <Button type="button" variant="secondary" onClick={onBack}>
          &larr; Back to Documents
        </Button>
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          disabled={!hasIdDoc || !agreementChecked || !authenticityChecked || !privacyChecked}
        >
          Submit Application for Review &rarr;
        </Button>
      </div>
    </form>
  );
}

