import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CartLine } from '@shared/types';
import { Spinner } from '@/components/ui';
import type { CheckoutStage } from './checkoutUtils';

const ACTION_BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium tracking-[0.01em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50';

const ACTION_VARIANTS = {
  primary: 'border border-forest bg-forest text-paper hover:bg-forest-deep',
  secondary: 'border border-forest/25 bg-white text-forest hover:border-forest hover:bg-forest/[0.04]',
  quiet: 'border border-transparent text-forest hover:bg-forest/[0.06]',
  danger: 'border border-danger bg-danger text-white hover:bg-danger',
} as const;

export function CheckoutAction({
  variant = 'primary',
  loading,
  fullWidth,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof ACTION_VARIANTS;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      className={`${ACTION_BASE} ${ACTION_VARIANTS[variant]} h-11 px-5 ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

const STAGES: { stage: CheckoutStage; label: string }[] = [
  { stage: 1, label: 'Delivery' },
  { stage: 2, label: 'Payment' },
  { stage: 3, label: 'Review' },
];

export function CheckoutProgress({
  stage,
  onNavigate,
}: {
  stage: CheckoutStage;
  onNavigate: (stage: CheckoutStage) => void;
}) {
  return (
    <nav aria-label="Checkout progress" className="border-y border-line py-3">
      <ol className="flex items-center gap-2 sm:gap-3">
        {STAGES.map((item, index) => {
          const complete = item.stage < stage;
          const current = item.stage === stage;
          return (
            <li key={item.stage} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {complete ? (
                <button
                  type="button"
                  onClick={() => onNavigate(item.stage)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-forest bg-forest text-[11px] text-white transition-colors hover:bg-forest-deep"
                  aria-label={`Go back to ${item.label}`}
                >
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
                    <path d="M3 8.5 6.2 11.5 13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    current
                      ? 'border-forest bg-white text-forest'
                      : 'border-line bg-transparent text-muted'
                  }`}
                >
                  {item.stage}
                </span>
              )}
              <span
                className={`truncate text-[11.5px] tracking-[0.02em] ${
                  current ? 'font-semibold text-forest' : complete ? 'text-forest/80' : 'text-muted'
                }`}
                aria-current={current ? 'step' : undefined}
              >
                {item.label}
              </span>
              {index < STAGES.length - 1 ? <span className="h-px flex-1 bg-line" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function CheckoutPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border border-line bg-white ${className}`}>{children}</section>;
}

export function SectionHeading({
  step,
  title,
  description,
  action,
}: {
  step?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {step ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-terra">{step}</p>
        ) : null}
        <h2 className="mt-1 font-serif text-[26px] leading-tight text-forest">{title}</h2>
        {description ? <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ProductThumb({ line, size = 'md' }: { line: Pick<CartLine, 'name' | 'imageUrl' | 'imageAlt'>; size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'h-11 w-11' : 'h-16 w-16';
  return (
    <span className={`${dimension} flex shrink-0 items-center justify-center overflow-hidden border border-line bg-paper`}>
      {line.imageUrl ? (
        <img src={line.imageUrl} alt={line.imageAlt ?? line.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="font-serif text-xl text-forest/60" aria-hidden>
          {line.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function BackLink({ onClick, children = 'Back' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-forest"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </button>
  );
}
