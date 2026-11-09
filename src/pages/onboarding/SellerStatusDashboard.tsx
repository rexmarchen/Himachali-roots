import { Link } from 'react-router-dom';
import type { ApplicationResponse } from './OnboardingTypes';
import { formatDate, formatDateTime, humanise } from '@/lib/format';
import { Alert, Button, StatusBadge, buttonClass } from '@/components/ui';

interface Props {
  data: ApplicationResponse;
  onRevise: () => void;
  onStartNew?: () => void;
  isStartingNew?: boolean;
}

export function SellerStatusDashboard({ data, onRevise, onStartNew, isStartingNew }: Props) {
  const seller = data.seller;
  const app = data.application;
  const status = app?.status ?? seller?.status ?? 'draft';
  const events = data.events ?? [];
  const checklist = data.checklist ?? [];
  const rejectionReason = app?.rejectionReason;

  const statusDescriptions: Record<string, { title: string; body: string; tone: 'info' | 'warning' | 'success' }> = {
    draft: {
      title: 'Draft Application',
      body: 'Your application is saved in draft form. Submit it whenever you are ready so our team can review your files.',
      tone: 'info',
    },
    submitted: {
      title: 'Application Submitted',
      body: 'Your maker application has reached our curation team. We typically review documents and craft narratives within 24 to 48 hours.',
      tone: 'info',
    },
    under_review: {
      title: 'Under Active Review',
      body: 'Our mountain curation team is currently reviewing your identity documents and business details.',
      tone: 'info',
    },
    changes_requested: {
      title: 'Changes Requested by Review Team',
      body: 'The review team needs specific updates or clarification before your maker store can be approved. Please see the note below and update your application.',
      tone: 'warning',
    },
    approved: {
      title: 'Maker Account Approved!',
      body: 'Welcome to the Dear Hills community. Your maker storefront is ready. You can now access your seller dashboard, create your first product listings, and begin receiving orders.',
      tone: 'success',
    },
    rejected: {
      title: 'Application Not Approved',
      body: 'Your application was not approved at this time. Please see the reviewer note below for feedback from our curation team.',
      tone: 'warning',
    },
  };

  const currentDesc = statusDescriptions[status] ?? {
    title: humanise(status),
    body: 'Your maker application status is recorded below.',
    tone: 'info',
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-serif text-3xl font-medium text-forest">{seller?.businessName || 'Your Store'}</span>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-xs text-muted">
            Application ID: <span className="font-mono text-forest">{app?.id || '—'}</span>
            {app?.submittedAt ? ` · Submitted ${formatDate(app.submittedAt)}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {status === 'approved' ? (
            <Link to="/seller" className={buttonClass('primary', 'md')}>
              Enter Seller Dashboard &rarr;
            </Link>
          ) : status === 'changes_requested' || status === 'draft' ? (
            <Button type="button" onClick={onRevise}>
              Revise Application &rarr;
            </Button>
          ) : null}
        </div>
      </div>

      {/* Prominent Status Callout */}
      <div
        className={`rounded-sm border p-6 ${
          currentDesc.tone === 'success'
            ? 'border-forest/20 bg-forest/[0.05]'
            : currentDesc.tone === 'warning'
              ? 'border-amber-300 bg-amber-50/70'
              : 'border-line bg-surface'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <span className="text-2xl">
            {currentDesc.tone === 'success' ? '🎉' : currentDesc.tone === 'warning' ? '⚠️' : '⏱️'}
          </span>
          <div className="space-y-1">
            <p className="font-serif text-xl font-medium text-forest">{currentDesc.title}</p>
            <p className="text-xs leading-relaxed text-muted">{currentDesc.body}</p>
          </div>
        </div>

        {/* Reviewer Note if changes requested or rejected */}
        {rejectionReason ? (
          <div className="mt-4 border-t border-line/60 pt-4">
            <Alert tone="warning" title="Note from Dear Hills Reviewer">
              {rejectionReason}
            </Alert>
          </div>
        ) : null}
      </div>

      {/* Grid: Details & Checklist */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Onboarding Checklist */}
        <div className="rounded-sm border border-line bg-surface p-5 shadow-xs space-y-4">
          <p className="font-serif text-lg font-medium text-forest">Onboarding Checklist</p>
          {checklist.length > 0 ? (
            <ul className="divide-y divide-line text-xs">
              {checklist.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-semibold text-forest">{item.label}</p>
                    <p className="text-[11px] text-muted">{item.detail}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      item.status === 'complete'
                        ? 'bg-forest/10 text-forest'
                        : item.status === 'action'
                          ? 'bg-terra/15 text-terra'
                          : 'bg-sand/30 text-muted'
                    }`}
                  >
                    {item.status === 'complete' ? '✓ Complete' : item.status === 'action' ? 'Action' : 'Pending'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">All requirements are under review.</p>
          )}
        </div>

        {/* Review History Audit Log */}
        <div className="rounded-sm border border-line bg-surface p-5 shadow-xs space-y-4">
          <p className="font-serif text-lg font-medium text-forest">Application History</p>
          {events.length > 0 ? (
            <ol className="space-y-3.5 border-l-2 border-line pl-4 text-xs">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-forest" />
                  <p className="font-semibold text-forest">{humanise(ev.event)}</p>
                  <p className="text-[11px] text-muted">{formatDateTime(ev.createdAt)}</p>
                  {ev.reason ? <p className="mt-1 text-xs text-terra italic">&ldquo;{ev.reason}&rdquo;</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted">No review events recorded yet.</p>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <Link to="/shop" className="text-xs text-muted hover:text-forest underline underline-offset-2">
          &larr; Return to Marketplace
        </Link>

        <div className="flex items-center gap-3">
          {status === 'changes_requested' || status === 'draft' ? (
            <Button type="button" onClick={onRevise}>
              Revise & Resubmit Application &rarr;
            </Button>
          ) : status === 'approved' ? (
            <Link to="/seller" className={buttonClass('primary')}>
              Go to Seller Dashboard &rarr;
            </Link>
          ) : onStartNew && status === 'rejected' ? (
            <Button type="button" onClick={onStartNew} loading={isStartingNew}>
              Start a New Application
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

