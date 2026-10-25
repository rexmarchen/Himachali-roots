import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Modal } from '@/components/ui';

/* Shared presentation primitives for the operations console. */

export function AdminPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-6 ${className}`}>{children}</div>;
}

export function AdminSection({
  title,
  description,
  action,
  children,
  className = '',
  bodyClassName = 'p-5',
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`border border-line bg-surface ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-xl leading-tight">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

type MetricTone = 'default' | 'accent' | 'gold' | 'muted';

const METRIC_TONES: Record<MetricTone, { shell: string; icon: string; value: string; label: string }> = {
  default: {
    shell: 'border-line bg-surface hover:border-forest/30',
    icon: 'bg-forest/[0.06] text-forest',
    value: 'text-forest',
    label: 'text-muted',
  },
  accent: {
    shell: 'border-forest bg-forest text-paper',
    icon: 'bg-white/10 text-butter',
    value: 'text-paper',
    label: 'text-paper/65',
  },
  gold: {
    shell: 'border-harvest/50 bg-[#fbf4e4]',
    icon: 'bg-harvest/15 text-[#7c5a1c]',
    value: 'text-[#5f4514]',
    label: 'text-[#7c5a1c]/80',
  },
  muted: {
    shell: 'border-line bg-paper',
    icon: 'bg-ink/[0.05] text-muted',
    value: 'text-ink',
    label: 'text-muted',
  },
};

export function AdminMetric({
  label,
  value,
  note,
  icon,
  tone = 'default',
  to,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  icon?: ReactNode;
  tone?: MetricTone;
  to?: string;
}) {
  const styles = METRIC_TONES[tone];
  const content = (
    <div className={`group flex h-full flex-col justify-between border p-4 transition-colors ${styles.shell}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}>{label}</p>
        {icon ? <span className={`flex h-8 w-8 items-center justify-center rounded-full ${styles.icon}`}>{icon}</span> : null}
      </div>
      <div className="mt-4">
        <p className={`font-serif text-[2rem] leading-none tracking-tight ${styles.value}`}>{value}</p>
        {note ? <p className={`mt-2 text-[11px] leading-relaxed ${tone === 'accent' ? 'text-paper/55' : 'text-muted'}`}>{note}</p> : null}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block focus-visible:outline-offset-4">
      {content}
    </Link>
  ) : (
    content
  );
}

export function AdminQueueRow({
  label,
  count,
  note,
  to,
  icon,
}: {
  label: string;
  count: number;
  note: string;
  to: string;
  icon?: ReactNode;
}) {
  const clear = count <= 0;
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-paper/70 focus-visible:outline-offset-[-2px]"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${clear ? 'bg-sage/10 text-sage' : 'bg-terra/[0.08] text-terra'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[10.5px] text-muted">{note}</span>
      </span>
      <span
        className={`shrink-0 border px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${
          clear ? 'border-sage/30 bg-sage/10 text-muted' : 'border-terra/25 bg-terra/[0.08] text-[#8e4630]'
        }`}
      >
        {clear ? 'Clear' : count}
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

export function AdminToolbar({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line pb-4">
      {children}
      {meta ? <div className="pb-2.5 text-[11px] text-muted sm:ml-auto">{meta}</div> : null}
    </div>
  );
}

export function AdminTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="min-w-full text-left text-[12.5px]" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'danger',
  loading = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center border border-transparent px-3.5 text-[13px] text-ink hover:bg-ink/[0.05]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex h-9 items-center justify-center gap-2 border px-3.5 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === 'danger' ? 'border-[#8e3b2b] bg-[#8e3b2b] hover:bg-[#772f22]' : 'border-forest bg-forest hover:bg-forest-deep'
            }`}
          >
            {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone={tone === 'danger' ? 'warning' : 'info'}>{children}</Alert>
        <p className="text-[11px] leading-relaxed text-muted">
          The action is recorded in the audit log. Irreversible actions cannot be undone from this screen.
        </p>
      </div>
    </Modal>
  );
}
