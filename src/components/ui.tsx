import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { statusTone } from '@/lib/format';

/* ------------------------------- Buttons -------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'terra' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const buttonVariants: Record<Variant, string> = {
  primary: 'bg-forest text-paper hover:bg-forest-deep border border-forest',
  secondary: 'bg-transparent text-forest border border-forest/30 hover:border-forest hover:bg-forest/[0.04]',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-ink/[0.05]',
  terra: 'bg-terra text-white border border-terra hover:bg-[#b9694c]',
  danger: 'bg-[#8e3b2b] text-white border border-[#8e3b2b] hover:bg-[#772f22]',
};

const buttonSizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-sm',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = ''): string {
  return `inline-flex items-center justify-center gap-2 rounded-sm font-medium tracking-[0.01em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${buttonSizes[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props },
  ref,
) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/* -------------------------------- Inputs -------------------------------- */

const fieldBase =
  'w-full rounded-sm border border-sand bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/10 disabled:bg-paper disabled:text-muted';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className = '', invalid, ...props }, ref) {
    return <input ref={ref} className={`${fieldBase} ${invalid ? 'border-terra' : ''} ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className = '', invalid, ...props }, ref) {
  return (
    <textarea ref={ref} className={`${fieldBase} min-h-28 resize-y ${invalid ? 'border-terra' : ''} ${className}`} {...props} />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = '', children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={`${fieldBase} appearance-none bg-[right_0.75rem_center] pr-9 ${className}`} {...props}>
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = '',
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label className={`block ${className}`} htmlFor={htmlFor}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">
          {label}
          {required ? <span className="ml-0.5 text-terra">*</span> : null}
        </span>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-xs text-terra">{error}</span> : null}
    </label>
  );
}

/* -------------------------------- Display ------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'forest' | 'terra' | 'sand';
  className?: string;
}) {
  const tones = {
    neutral: 'border-line bg-paper text-muted',
    forest: 'border-forest/20 bg-forest/[0.06] text-forest',
    terra: 'border-terra/25 bg-terra/[0.08] text-[#8e4630]',
    sand: 'border-sand bg-sand/30 text-ink',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.12em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.1em] ${statusTone(status)}`}
    >
      {label ?? status.replaceAll('_', ' ')}
    </span>
  );
}

export function DemoBadge({ children = 'Demo data' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 border border-terra/30 bg-terra/[0.07] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#8e4630]">
      <span className="h-1 w-1 rounded-full bg-terra" aria-hidden />
      {children}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.18" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingBlock({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-16 w-full shimmer rounded-sm" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  eyebrow,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="border border-dashed border-sand bg-surface/60 px-6 py-14 text-center">
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h3 className="text-xl text-forest">{title}</h3>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'That did not load',
  body,
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="border border-terra/25 bg-[#fff8f4] px-6 py-10 text-center">
      <h3 className="text-xl text-[#7d3d28]">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#7d3d28]/80">
        {body ?? 'The server did not return the information. This is not a payment or order confirmation.'}
      </p>
      {onRetry ? (
        <div className="mt-5">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-sage/40 bg-sage/[0.08] text-forest',
    success: 'border-forest/25 bg-forest/[0.05] text-forest',
    warning: 'border-[#b9892f]/30 bg-[#fbf5e6] text-[#6f5218]',
    error: 'border-terra/35 bg-[#fff7f2] text-[#7d3d28]',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

/* -------------------------------- Layout -------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-5 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="max-w-2xl">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-3xl leading-[1.08] sm:text-4xl">{title}</h1>
        {lede ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-[15px]">{lede}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  action,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${className}`}>
      <div className="max-w-xl">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h2 className="text-2xl leading-tight sm:text-[2rem]">{title}</h2>
        {lede ? <p className="mt-2 text-sm leading-relaxed text-muted">{lede}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden>/</span> : null}
          {item.to ? (
            <Link to={item.to} className="hover:text-forest hover:underline underline-offset-2">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Stat({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  note?: string;
  tone?: 'default' | 'accent' | 'warning';
}) {
  return (
    <div
      className={`border p-4 ${
        tone === 'accent' ? 'border-forest/25 bg-forest text-paper' : tone === 'warning' ? 'border-[#b9892f]/25 bg-[#fbf5e6]' : 'border-line bg-surface'
      }`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${tone === 'accent' ? 'text-paper/60' : 'text-muted'}`}>
        {label}
      </p>
      <p className={`mt-2 font-serif text-2xl ${tone === 'accent' ? 'text-paper' : 'text-forest'}`}>{value}</p>
      {note ? <p className={`mt-1 text-[11px] ${tone === 'accent' ? 'text-paper/60' : 'text-muted'}`}>{note}</p> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (candidate) => candidate === 1 || candidate === totalPages || Math.abs(candidate - page) <= 1,
  );
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1.5">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      {pages.map((candidate, index) => (
        <span key={candidate} className="flex items-center gap-1.5">
          {index > 0 && candidate - pages[index - 1] > 1 ? <span className="px-1 text-muted">…</span> : null}
          <button
            type="button"
            onClick={() => onChange(candidate)}
            aria-current={candidate === page ? 'page' : undefined}
            className={`h-9 min-w-9 border px-2 text-[13px] ${
              candidate === page ? 'border-forest bg-forest text-paper' : 'border-line bg-surface text-ink hover:border-forest/40'
            }`}
          >
            {candidate}
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
      );
      target?.focus();
    }, 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(focusTimer);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} tabIndex={-1} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative max-h-[92vh] w-full overflow-y-auto border border-line bg-paper p-6 shadow-2xl sm:rounded-sm ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-line pb-4">
          <h2 id={titleId} className="text-xl">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink" aria-label="Close dialog">
            ✕
          </button>
        </div>
        {children}
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-line pt-5">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Tabs({
  items,
  current,
}: {
  items: { label: string; to: string; end?: boolean }[];
  current: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
            current === item.to
              ? 'border-forest text-forest'
              : 'border-transparent text-muted hover:border-sand hover:text-ink'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
