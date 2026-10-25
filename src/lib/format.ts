import { ORDER_STATUS_LABELS, SELLER_ORDER_STATUS_LABELS, type Role, type SellerStatus } from '@shared/types';

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function relativeDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(value);
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

export function sellerOrderStatusLabel(status: string): string {
  return SELLER_ORDER_STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replaceAll('_', ' ').replace(/^\w/, (character) => character.toUpperCase());
}

export function percentFromBp(bp: number): string {
  return `${(bp / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
}

export function canAccess(userRoles: Role[] | undefined, roles: Role[]): boolean {
  return Boolean(userRoles?.some((role) => roles.includes(role)));
}

export const SELLER_STATUS_LABELS: Record<SellerStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted for review',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Not approved',
  suspended: 'Suspended',
  more_info_required: 'More information needed',
};

export function statusTone(status: string): string {
  if (['approved', 'delivered', 'fulfilled', 'paid', 'published', 'settled', 'eligible', 'active'].includes(status)) {
    return 'bg-forest/10 text-forest border-forest/20';
  }
  if (['pending', 'pending_payment', 'submitted', 'under_review', 'requested', 'processing', 'in_progress'].includes(status)) {
    return 'bg-[#b9892f]/10 text-[#7c5a1c] border-[#b9892f]/25';
  }
  if (['rejected', 'cancelled', 'failed', 'suspended', 'refunded', 'reversed', 'expired'].includes(status)) {
    return 'bg-terra/10 text-[#8e4630] border-terra/25';
  }
  if (['shipped', 'out_for_delivery', 'in_transit'].includes(status)) {
    return 'bg-sage/20 text-forest border-sage/40';
  }
  return 'bg-sand/30 text-ink border-sand';
}

export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoInput(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function dateInputToIso(value: string, endOfDay = false): string {
  const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return date.toISOString();
}
