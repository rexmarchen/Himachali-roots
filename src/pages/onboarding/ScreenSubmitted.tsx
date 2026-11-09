import { Link } from 'react-router-dom';
import { formatDate } from '@/lib/format';
import { buttonClass } from '@/components/ui';

interface Props {
  referenceId: string;
  businessName: string;
  submittedAt?: string;
  onTrackStatus: () => void;
}

export function ScreenSubmitted({ referenceId, businessName, submittedAt, onTrackStatus }: Props) {
  const displayDate = submittedAt ? formatDate(submittedAt) : formatDate(new Date().toISOString());

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16 text-center">
      {/* Mountain celebration icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest text-3xl text-butter shadow-md">
        🏔️
      </div>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-terra">
        Application Successfully Submitted
      </p>

      <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-forest sm:text-4xl">
        Your journey with Dear Hills begins here.
      </h1>

      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
        Thank you for applying to join our community of Himalayan makers and sellers.
        Your application has been submitted for review.
      </p>

      {/* Reference Card */}
      <div className="mt-8 rounded-sm border border-line bg-surface p-6 text-left shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Application Summary</p>
          <span className="rounded-full bg-harvest/15 px-2.5 py-0.5 text-[11px] font-semibold text-harvest">
            Submitted for Review
          </span>
        </div>

        <dl className="grid gap-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted">Business / Maker Name</dt>
            <dd className="mt-1 font-serif text-base font-semibold text-forest">{businessName}</dd>
          </div>
          <div>
            <dt className="text-muted">Application Ref</dt>
            <dd className="mt-1 font-mono text-xs text-forest">{referenceId}</dd>
          </div>
          <div>
            <dt className="text-muted">Submitted Date</dt>
            <dd className="mt-1 font-semibold text-forest">{displayDate}</dd>
          </div>
        </dl>
      </div>

      {/* Next Steps Roadmap */}
      <div className="mt-8 rounded-sm border border-line bg-warm-paper/50 p-6 text-left space-y-4">
        <p className="font-serif text-lg font-medium text-forest">What Happens Next?</p>
        <ol className="space-y-4 text-xs text-muted">
          <li className="flex items-start gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-paper">
              1
            </span>
            <div>
              <p className="font-semibold text-forest">Manual Human Curation</p>
              <p className="mt-0.5">
                Our team in Himachal personally reviews your craft biography and verifies your uploaded government identification (usually within 24–48 hours).
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-paper">
              2
            </span>
            <div>
              <p className="font-semibold text-forest">Status Notification</p>
              <p className="mt-0.5">
                You will receive an email as soon as an approval decision or revision request is recorded.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-paper">
              3
            </span>
            <div>
              <p className="font-semibold text-forest">Storefront Launch</p>
              <p className="mt-0.5">
                Once approved, you will gain immediate access to the Seller Dashboard where you can publish your first products and manage pan-India orders.
              </p>
            </div>
          </li>
        </ol>
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onTrackStatus}
          className={buttonClass('primary', 'lg')}
        >
          Track Application Status &rarr;
        </button>
        <Link to="/shop" className={buttonClass('secondary', 'lg')}>
          Browse Marketplace
        </Link>
      </div>
    </div>
  );
}

