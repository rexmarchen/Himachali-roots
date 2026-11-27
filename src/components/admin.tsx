import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Modal } from '@/components/ui';

/* Shared presentation primitives for the operations console. */

export function AdminPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 space-y-6 ${className}`}>{children}</div>;
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
    <section
      id={id}
      className={`min-w-0 overflow-hidden rounded-2xl border border-[#DFD5C6] bg-white shadow-[0_2px_14px_rgba(13,74,58,0.05)] ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EFE7DA] bg-gradient-to-r from-[#FDFBF7] via-white to-[#F7F1E7]/45 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold leading-tight text-[#0D4A3A] sm:text-xl">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[#5C6662]">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

type MetricTone = 'default' | 'accent' | 'gold' | 'muted';

const METRIC_TONES: Record<MetricTone, { shell: string; icon: string; value: string; label: string; note: string }> = {
  default: {
    shell:
      'border-[#DFD5C6] bg-white shadow-[0_2px_12px_rgba(13,74,58,0.04)] hover:border-[#14634E]/40 hover:shadow-[0_8px_20px_rgba(13,74,58,0.08)]',
    icon: 'bg-[#E7F4EE] text-[#0D4A3A] ring-1 ring-[#C6E3D5]',
    value: 'text-[#0D4A3A]',
    label: 'text-[#5C6662]',
    note: 'text-[#5C6662]',
  },
  accent: {
    shell:
      'border-[#0D4A3A] bg-gradient-to-br from-[#0D4A3A] via-[#14634E] to-[#19785D] text-white shadow-[0_8px_22px_rgba(13,74,58,0.22)] hover:shadow-[0_12px_26px_rgba(13,74,58,0.28)]',
    icon: 'bg-white/15 text-[#F4E8CE] ring-1 ring-white/25',
    value: 'text-white',
    label: 'text-[#F4E8CE]/85',
    note: 'text-white/75',
  },
  gold: {
    shell:
      'border-[#E5C98B] bg-gradient-to-br from-[#FFFDF7] to-[#FBF2DC] shadow-[0_2px_12px_rgba(154,106,28,0.06)] hover:border-[#D4A446] hover:shadow-[0_6px_18px_rgba(154,106,28,0.12)]',
    icon: 'bg-[#F4E3B8] text-[#7C5A1C] ring-1 ring-[#E5C98B]',
    value: 'text-[#5F4514]',
    label: 'text-[#7C5A1C]/90',
    note: 'text-[#7C5A1C]/80',
  },
  muted: {
    shell:
      'border-[#E4DACE] bg-[#F7F1E7]/90 hover:border-[#CBBFA8] hover:bg-[#FAF6EE]',
    icon: 'bg-white text-[#5C6662] ring-1 ring-[#E4DACE]',
    value: 'text-[#172321]',
    label: 'text-[#5C6662]',
    note: 'text-[#5C6662]',
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
    <div
      className={`group flex h-full flex-col justify-between rounded-2xl border p-4.5 transition-all duration-200 ${
        to ? 'hover:-translate-y-0.5' : ''
      } ${styles.shell}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[10.5px] font-semibold uppercase tracking-[0.15em] ${styles.label}`}>{label}</p>
        {icon ? <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>{icon}</span> : null}
      </div>
      <div className="mt-4">
        <p className={`font-serif text-[1.9rem] font-semibold leading-none tracking-tight sm:text-[2rem] ${styles.value}`}>{value}</p>
        {note ? <p className={`mt-2 text-[11.5px] leading-relaxed ${styles.note}`}>{note}</p> : null}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full focus-visible:outline-offset-4">
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
      className="group flex items-center gap-3.5 border-b border-[#EFE7DA] px-5 py-3.5 transition-colors last:border-b-0 hover:bg-[#F7F1E7]/75 focus-visible:outline-offset-[-2px]"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          clear ? 'bg-[#E7F4EE] text-[#2F6B4F] ring-1 ring-[#C6E3D5]' : 'bg-[#FDF0EB] text-[#B85A3A] ring-1 ring-[#EBC3B4]'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[#172321] group-hover:text-[#0D4A3A]">{label}</span>
        <span className="mt-0.5 block text-[11px] text-[#5C6662]">{note}</span>
      </span>
      <span
        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
          clear
            ? 'border-[#C6E3D5] bg-[#E7F4EE] text-[#2F6B4F]'
            : 'border-[#EBC3B4] bg-[#FDF0EB] text-[#8E4630]'
        }`}
      >
        {clear ? 'Clear' : count}
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-4 w-4 shrink-0 text-[#5C6662] transition-transform group-hover:translate-x-0.5 group-hover:text-[#0D4A3A]"
        aria-hidden
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

export function AdminToolbar({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-[#DFD5C6] bg-white p-4 shadow-[0_2px_10px_rgba(13,74,58,0.04)]">
      {children}
      {meta ? <div className="pb-2 text-[11.5px] font-medium text-[#5C6662] sm:ml-auto">{meta}</div> : null}
    </div>
  );
}

export function AdminTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#DFD5C6] bg-white shadow-[0_2px_14px_rgba(13,74,58,0.05)]">
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
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[#DFD5C6] bg-white px-4 text-[13px] font-medium text-[#172321] transition-colors hover:bg-[#F7F1E7]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              tone === 'danger'
                ? 'border-[#9B3D2D] bg-[#9B3D2D] hover:bg-[#823022]'
                : 'border-[#0D4A3A] bg-[#0D4A3A] hover:bg-[#14634E]'
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
        <p className="text-[11.5px] leading-relaxed text-[#5C6662]">
          The action is recorded in the audit log. Irreversible actions cannot be undone from this screen.
        </p>
      </div>
    </Modal>
  );
}
