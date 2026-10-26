import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CartLine } from '@shared/types';
import { Spinner } from '@/components/ui';
import type { CheckoutStage } from './checkoutUtils';

const ACTION_BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium tracking-[0.01em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#234638] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F0E6] disabled:cursor-not-allowed disabled:opacity-50';

const ACTION_VARIANTS = {
  primary: 'border border-[#234638] bg-[#234638] text-[#FDFBF7] hover:bg-[#1B382D]',
  secondary: 'border border-[#234638]/25 bg-white text-[#234638] hover:border-[#234638] hover:bg-[#234638]/[0.04]',
  quiet: 'border border-transparent text-[#234638] hover:bg-[#234638]/[0.06]',
  danger: 'border border-[#8E3B2B] bg-[#8E3B2B] text-white hover:bg-[#772F22]',
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
    <nav aria-label="Checkout progress" className="border-y border-[#E3D9C9] py-3">
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
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#234638] bg-[#234638] text-[11px] text-white transition-colors hover:bg-[#1B382D]"
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
                      ? 'border-[#234638] bg-white text-[#234638]'
                      : 'border-[#D8CDBC] bg-transparent text-[#8A8F87]'
                  }`}
                >
                  {item.stage}
                </span>
              )}
              <span
                className={`truncate text-[11.5px] tracking-[0.02em] ${
                  current ? 'font-semibold text-[#234638]' : complete ? 'text-[#234638]/80' : 'text-[#8A8F87]'
                }`}
                aria-current={current ? 'step' : undefined}
              >
                {item.label}
              </span>
              {index < STAGES.length - 1 ? <span className="h-px flex-1 bg-[#E0D6C6]" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function CheckoutPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border border-[#E3D9C9] bg-white ${className}`}>{children}</section>;
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D98060]">{step}</p>
        ) : null}
        <h2 className="mt-1 font-serif text-[26px] leading-tight text-[#234638]">{title}</h2>
        {description ? <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-[#6B7269]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ProductThumb({ line, size = 'md' }: { line: Pick<CartLine, 'name' | 'imageUrl' | 'imageAlt'>; size?: 'sm' | 'md' }) {
  const dimension = size === 'sm' ? 'h-11 w-11' : 'h-16 w-16';
  return (
    <span className={`${dimension} flex shrink-0 items-center justify-center overflow-hidden border border-[#E7DED0] bg-[#F6F0E6]`}>
      {line.imageUrl ? (
        <img src={line.imageUrl} alt={line.imageAlt ?? line.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="font-serif text-xl text-[#234638]/60" aria-hidden>
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
      className="inline-flex items-center gap-1.5 text-[12.5px] text-[#5E675F] transition-colors hover:text-[#234638]"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </button>
  );
}
