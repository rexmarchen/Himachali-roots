import { useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, ProductStatus, SellerProduct } from '@shared/types';
import { APPLICATION_STATUS_LABELS, PRODUCT_WORKFLOW_LABELS, STORE_STATUS_LABELS, formatINR } from '@shared/types';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { formatDate, formatDateTime, humanise, percentFromBp, sellerOrderStatusLabel } from '@/lib/format';
import {
  Alert,
  Badge,
  Button,
  DemoBadge,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LinkButton,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Stat,
  StatusBadge,
  Textarea,
} from '@/components/ui';

interface SellerApplicationResponse {
  exists: boolean;
  seller?: {
    id: string;
    businessName: string;
    slug: string;
    status: string;
    sellerType: string;
    sellerCategory: string | null;
    storeStatus: string;
    storeStatusReason: string | null;
    payoutStatus: string;
    region: string | null;
    village: string | null;
    tagline: string | null;
    story: string | null;
    operatingAddress: { line1: string; line2?: string; city: string; state: string; pincode: string; phone?: string } | null;
    pickupAddress: Record<string, unknown> | null;
    gstin: string | null;
    panLast4: string | null;
    rejectionReason: string | null;
    onboardingStep: number;
    createdAt: string;
    approvedAt: string | null;
  };
  application?: {
    id: string;
    status: string;
    revision: number;
    currentStep: number;
    businessName: string;
    sellerType: string;
    sellerCategory: string | null;
    categories: string[];
    gstin: string | null;
    phone: string | null;
    notes: string | null;
    data: Record<string, unknown>;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    lastSavedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  documents: {
    id: string;
    docType: string;
    docLabel: string | null;
    originalName: string;
    status: string;
    reviewNote: string | null;
    uploadedAt: string;
  }[];
  events?: {
    id: string;
    event: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    actorEmail: string | null;
    createdAt: string;
  }[];
  requirements?: { required: string[]; optional: string[]; missing: string[]; labels: Record<string, string> };
  checklist?: { id: string; label: string; status: string; detail: string; href?: string }[];
  verification?: { emailVerified: boolean; phoneVerified: boolean; smsConfigured: boolean };
  payoutProvider?: { configured: boolean; provider: string; message: string };
  commissionNote: string;
}

interface SellerNotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  draft_started: 'Draft started',
  application_submitted: 'Application submitted',
  document_uploaded: 'Document uploaded',
  admin_start_review: 'Review started',
  admin_request_changes: 'Changes requested',
  admin_approve: 'Application approved',
  admin_reject: 'Application not approved',
  admin_suspend: 'Store suspended',
  admin_reinstate: 'Store reinstated',
  admin_request_reverification: 'Re-verification requested',
  document_reviewed: 'Document reviewed',
};

const SELLER_NAV = [
  { label: 'Overview', to: '/seller', end: true },
  { label: 'Application & verification', to: '/seller/application' },
  { label: 'Products', to: '/seller/products' },
  { label: 'Inventory', to: '/seller/inventory' },
  { label: 'Orders', to: '/seller/orders' },
  { label: 'Earnings', to: '/seller/earnings' },
  { label: 'Returns & requests', to: '/seller/requests' },
  { label: 'Store profile', to: '/seller/profile' },
  { label: 'Notifications', to: '/seller/notifications' },
];

export function SellerLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const application = useQuery({
    queryKey: ['seller-application'],
    queryFn: () => api<SellerApplicationResponse>('/seller/application'),
    retry: false,
  });
  const notifications = useQuery({
    queryKey: ['seller-notifications'],
    queryFn: () => api<{ notifications: SellerNotificationRow[]; unread: number }>('/seller/notifications'),
    retry: false,
  });

  if (application.isLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"><LoadingBlock rows={3} /></div>;
  }
  if (application.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState title="Seller workspace unavailable" body="The seller application could not be loaded." onRetry={() => void application.refetch()} />
      </div>
    );
  }

  if (!application.data?.exists) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Seller portal" title="No seller application yet" lede="Start an application first. This workspace opens as soon as a draft exists." />
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton to="/sell">Start an application</LinkButton>
          <LinkButton to="/account" variant="secondary">Back to account</LinkButton>
        </div>
        {user?.roles.includes('admin') ? (
          <div className="mt-8"><Alert tone="info">You are signed in as an administrator without a seller profile. Use the admin portal for marketplace operations.</Alert></div>
        ) : null}
      </div>
    );
  }

  const seller = application.data.seller!;
  const status = seller.status;
  const applicationStatus = application.data.application?.status ?? status;
  const approved = status === 'approved';
  const unread = notifications.data?.unread ?? 0;

  if (!approved) {
    const allowed = ['/seller/application', '/seller/notifications'];
    const path = location.pathname.replace(/\/+$/, '') || '/seller';
    if (!allowed.includes(path)) {
      return <Navigate to="/seller/application" replace />;
    }
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Maker application</p>
            <h1 className="mt-2 text-3xl">{seller.businessName}</h1>
            <p className="mt-1 text-xs text-muted">
              {seller.region ?? 'Himachal Pradesh'} · Store: {humanise(seller.storeStatus)} · Payouts: {humanise(seller.payoutStatus)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={applicationStatus} />
            <Link to="/sell?edit=1&step=1" className="text-[11px] text-forest underline underline-offset-2">
              Open application form
            </Link>
          </div>
        </div>
        <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
          {[
            { label: 'Application & verification', to: '/seller/application' },
            { label: `Notifications${unread ? ` (${unread})` : ''}`, to: '/seller/notifications' },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
                  isActive ? 'border-forest font-medium text-forest' : 'border-transparent text-muted hover:border-sand hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/account/profile"
            className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13px] text-muted hover:border-sand hover:text-ink"
          >
            Account security
          </Link>
        </div>
        <div className="mt-7"><Outlet /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Seller workspace</p>
          <h1 className="mt-2 text-3xl">{seller.businessName}</h1>
          <p className="mt-1 text-xs text-muted">
            {seller.region ?? 'Himachal Pradesh'} · Approved {formatDate(seller.approvedAt)} · Store {humanise(seller.storeStatus)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="forest">Approved seller</Badge>
          <Link to={`/makers/${seller.slug}`} className="text-[11px] text-forest underline underline-offset-2">View public storefront</Link>
          <Link to="/account/profile" className="text-[11px] text-muted underline underline-offset-2">Account security</Link>
        </div>
      </div>
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
        {SELLER_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : undefined}
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
                isActive ? 'border-forest font-medium text-forest' : 'border-transparent text-muted hover:border-sand hover:text-ink'
              }`
            }
          >
            {item.to === '/seller/notifications' && unread ? `${item.label} (${unread})` : item.label}
          </NavLink>
        ))}
      </div>
      <div className="mt-7"><Outlet /></div>
    </div>
  );
}

function applicationStatusLabel(status: string | undefined): string {
  return APPLICATION_STATUS_LABELS[status ?? ''] ?? humanise(status ?? 'draft');
}

export function SellerApplicationPage() {
  const application = useQuery<SellerApplicationResponse>({
    queryKey: ['seller-application'],
    queryFn: () => api<SellerApplicationResponse>('/seller/application'),
    retry: false,
  });

  if (application.isLoading) return <LoadingBlock rows={4} />;
  if (application.isError || !application.data) {
    return <ErrorState onRetry={() => void application.refetch()} />;
  }
  if (!application.data.exists || !application.data.seller) {
    return (
      <EmptyState
        title="No application yet"
        body="Start a maker application and it will appear here with its status, documents and review history."
        action={<LinkButton to="/sell">Start an application</LinkButton>}
      />
    );
  }

  const data = application.data;
  const seller = data.seller!;
  const app = data.application;
  const status = app?.status ?? seller.status;
  const canEdit = ['draft', 'changes_requested', 'rejected'].includes(status);
  const requirements = data.requirements;
  const events = data.events ?? [];
  const checklist = data.checklist ?? [];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Application & verification"
        title={seller.businessName}
        lede="This is the canonical record of your maker application. Reviewer notes, document decisions and status history stay here."
        actions={<StatusBadge status={status} label={applicationStatusLabel(status)} />}
      />

      {status === 'draft' ? (
        <Alert tone="info" title="Draft not submitted">
          Your application is saved but has not reached the review team.{' '}
          <Link to="/sell?edit=1&step=10" className="underline underline-offset-2">Review and submit it</Link> when it is ready.
        </Alert>
      ) : null}
      {status === 'changes_requested' ? (
        <Alert tone="warning" title="Changes requested">
          <p>{app?.rejectionReason ?? 'The review team has asked for changes. Open the application form to see the affected sections.'}</p>
          <div className="mt-3">
            <LinkButton to="/sell?edit=1&step=1" size="sm">Revise application</LinkButton>
          </div>
        </Alert>
      ) : null}
      {status === 'rejected' ? (
        <Alert tone="error" title="Application not approved">
          <p>{app?.rejectionReason ?? 'The review team could not approve this application.'}</p>
          <div className="mt-3">
            <LinkButton to="/sell?edit=1&step=1" size="sm" variant="secondary">Revise and resubmit</LinkButton>
          </div>
        </Alert>
      ) : null}
      {status === 'suspended' ? (
        <Alert tone="error" title="Store suspended">
          <p>{seller.storeStatusReason ?? app?.rejectionReason ?? 'Your store is suspended. Contact support before making changes.'}</p>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Application</p>
          <p className="mt-2 text-sm text-ink">{applicationStatusLabel(status)}</p>
          <p className="mt-1 text-[11px] text-muted">Revision {app?.revision ?? 1}{app?.submittedAt ? ` · submitted ${formatDate(app.submittedAt)}` : ''}</p>
        </div>
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Store</p>
          <p className="mt-2 text-sm text-ink">{STORE_STATUS_LABELS[seller.storeStatus] ?? humanise(seller.storeStatus)}</p>
          <p className="mt-1 text-[11px] text-muted">{seller.sellerCategory ? humanise(seller.sellerCategory) : 'Category not set'}</p>
        </div>
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Payouts</p>
          <p className="mt-2 text-sm text-ink">{humanise(seller.payoutStatus)}</p>
          <p className="mt-1 text-[11px] text-muted">Manual review until a payout provider is configured.</p>
        </div>
      </div>

      {requirements?.missing.length ? (
        <Alert tone="warning" title="Evidence still required">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {requirements.missing.map((type) => (
              <li key={type}>{requirements.labels[type] ?? type}</li>
            ))}
          </ul>
          <div className="mt-3">
            <LinkButton to="/sell?edit=1&step=6" size="sm">Open documents</LinkButton>
          </div>
        </Alert>
      ) : null}

      {checklist.length ? (
        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-lg">Onboarding checklist</h2>
            <p className="mt-1 text-[11px] text-muted">Derived from your saved application and documents — not a promise of approval.</p>
          </div>
          <ul className="divide-y divide-line">
            {checklist.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-[13px] text-ink">{item.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{item.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10.5px] uppercase tracking-[0.1em] ${
                      item.status === 'complete' ? 'text-forest' : item.status === 'action' ? 'text-[#8e4630]' : 'text-muted'
                    }`}
                  >
                    {item.status === 'complete' ? 'Complete' : item.status === 'action' ? 'Action needed' : 'Pending'}
                  </span>
                  {item.href && canEdit ? (
                    <Link to={item.href} className="text-[11px] text-forest underline underline-offset-2">Open</Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-lg">Verification documents</h2>
          <p className="mt-1 text-[11px] text-muted">Private files are visible only to authorised reviewers. They are never published.</p>
        </div>
        {data.documents.length ? (
          <ul className="divide-y divide-line">
            {data.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">{document.docLabel ?? humanise(document.docType)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {document.originalName} · uploaded {formatDate(document.uploadedAt)}
                  </p>
                  {document.reviewNote ? <p className="mt-1 text-[11px] text-[#8e4630]">Reviewer: {document.reviewNote}</p> : null}
                </div>
                <Badge tone={document.status === 'accepted' ? 'forest' : document.status === 'rejected' ? 'terra' : 'sand'}>
                  {document.status === 'accepted' ? 'Accepted' : document.status === 'rejected' ? 'Rejected' : 'Awaiting review'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted">No documents uploaded yet.</p>
        )}
        <div className="border-t border-line px-5 py-3">
          <Link to="/sell?edit=1&step=6" className="text-[11px] text-forest underline underline-offset-2">Manage documents in the application form</Link>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><h2 className="text-lg">Status history</h2></div>
          {events.length ? (
            <ol className="space-y-4 px-5 py-4">
              {events.map((event) => (
                <li key={event.id} className="border-l border-line pl-3">
                  <p className="text-[13px] text-ink">{EVENT_LABELS[event.event] ?? humanise(event.event)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatDateTime(event.createdAt)}
                    {event.toStatus ? ` · ${applicationStatusLabel(event.toStatus)}` : ''}
                  </p>
                  {event.reason ? <p className="mt-1 text-[11.5px] text-bark">{event.reason}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">No recorded events yet.</p>
          )}
        </section>
        <section className="space-y-4">
          <div className="border border-line bg-surface p-5">
            <h2 className="text-lg">Account verification</h2>
            <dl className="mt-3 space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Email</dt>
                <dd className={data.verification?.emailVerified ? 'text-forest' : 'text-[#8e4630]'}>
                  {data.verification?.emailVerified ? 'Confirmed' : 'Not confirmed'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Mobile</dt>
                <dd className="text-bark">
                  {data.verification?.phoneVerified ? 'Verified' : 'Verified manually during review (SMS not configured)'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Commission</p>
            <p className="mt-1">{data.commissionNote}</p>
            <p className="mt-2">{data.payoutProvider?.message ?? 'Payouts are settled manually after review; no provider is connected in this environment.'}</p>
          </div>
        </section>
      </div>
    </div>
  );
}

interface InventoryItem {
  productId: string;
  name: string;
  sku: string;
  status: string;
  pricePaise: number;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  updatedAt: string;
}

function InventoryLine({ item }: { item: InventoryItem }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [threshold, setThreshold] = useState(String(item.lowStockThreshold));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.push('Enter a whole number for stock.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api(`/seller/inventory/${item.productId}`, {
        method: 'POST',
        body: {
          quantity: parsed,
          lowStockThreshold: threshold === '' ? undefined : Number(threshold),
          note: note || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['seller-inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      setNote('');
      toast.push('Stock updated.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="align-top">
      <td className="px-4 py-4">
        <Link to={`/seller/products/${item.productId}/edit`} className="text-[13px] font-medium text-forest hover:text-terra">{item.name}</Link>
        <p className="mt-0.5 text-[10.5px] text-muted">{item.sku} · {PRODUCT_WORKFLOW_LABELS[item.status] ?? humanise(item.status)}</p>
      </td>
      <td className="px-4 py-4 text-[12.5px]">
        <p>{item.available} available</p>
        <p className="text-[10.5px] text-muted">{item.reserved} reserved · {item.quantity} on hand</p>
      </td>
      <td className="px-4 py-4 text-[12.5px]">{formatINR(item.pricePaise)}</td>
      <td className="px-4 py-4">
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] uppercase tracking-[0.1em] text-muted">
            On hand
            <Input
              value={quantity}
              inputMode="numeric"
              className="mt-1 w-20"
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
              aria-label={`Stock on hand for ${item.name}`}
            />
          </label>
          <label className="text-[10px] uppercase tracking-[0.1em] text-muted">
            Alert at
            <Input
              value={threshold}
              inputMode="numeric"
              className="mt-1 w-20"
              onChange={(event) => setThreshold(event.target.value.replace(/\D/g, ''))}
              aria-label={`Low stock threshold for ${item.name}`}
            />
          </label>
          <label className="text-[10px] uppercase tracking-[0.1em] text-muted">
            Note
            <Input
              value={note}
              className="mt-1 w-36"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
              aria-label={`Stock note for ${item.name}`}
            />
          </label>
          <Button type="submit" size="sm" variant="secondary" loading={saving}>Update</Button>
        </form>
        <p className="mt-1 text-[10px] text-muted">Updated {formatDate(item.updatedAt)}</p>
      </td>
    </tr>
  );
}

export function SellerInventoryPage() {
  const inventory = useQuery({
    queryKey: ['seller-inventory'],
    queryFn: () => api<{ inventory: InventoryItem[] }>('/seller/inventory'),
  });

  if (inventory.isLoading) return <LoadingBlock rows={4} />;
  if (inventory.isError) return <ErrorState onRetry={() => void inventory.refetch()} />;

  const items = inventory.data?.inventory ?? [];
  const low = items.filter((item) => item.available <= item.lowStockThreshold).length;

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Stock on hand"
        lede="Stock is reserved when an order is paid. You cannot reduce on-hand stock below the reserved quantity."
        actions={<LinkButton to="/seller/products" variant="secondary">Back to products</LinkButton>}
      />
      {low ? (
        <div className="mt-5"><Alert tone="warning" title={`${low} listing${low === 1 ? '' : 's'} at or below the low-stock threshold`}>Restock before new orders arrive, or pause the listing.</Alert></div>
      ) : null}
      <div className="mt-6 overflow-x-auto border border-line bg-surface">
        {items.length ? (
          <table className="min-w-full text-left text-[12.5px]">
            <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Adjust stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item) => <InventoryLine key={item.productId} item={item} />)}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No inventory yet" body="Create a product draft; an inventory record is created automatically." action={<LinkButton to="/seller/products/new">Add a product</LinkButton>} />
        )}
      </div>
    </div>
  );
}

export function SellerNotificationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['seller-notifications'],
    queryFn: () => api<{ notifications: SellerNotificationRow[]; unread: number }>('/seller/notifications'),
  });
  const [busy, setBusy] = useState<string | null>(null);

  const markRead = async (id: string) => {
    setBusy(id);
    try {
      await api(`/seller/notifications/${id}/read`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-notifications'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  const markAll = async () => {
    setBusy('all');
    try {
      await api('/seller/notifications/read-all', { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-notifications'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (notifications.isLoading) return <LoadingBlock rows={3} />;
  if (notifications.isError) return <ErrorState onRetry={() => void notifications.refetch()} />;

  const rows = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="Application and store updates"
        lede="Status changes, reviewer notes and document decisions are recorded here. Email delivery depends on the configured mail provider."
        actions={unread ? <Button variant="secondary" size="sm" loading={busy === 'all'} onClick={() => void markAll()}>Mark all read</Button> : undefined}
      />
      {rows.length ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className={`px-5 py-4 ${row.readAt ? '' : 'bg-butter/25'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    {!row.readAt ? <span className="h-1.5 w-1.5 rounded-full bg-orchard" aria-label="Unread" /> : null}
                    <p className="text-[13px] font-medium text-ink">{row.title}</p>
                    <span className="text-[10.5px] text-muted">{formatDateTime(row.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{row.body}</p>
                  {row.actionUrl ? (
                    <Link to={row.actionUrl} className="mt-2 inline-block text-[11px] text-forest underline underline-offset-2">Open</Link>
                  ) : null}
                </div>
                {!row.readAt ? (
                  <Button size="sm" variant="ghost" loading={busy === row.id} onClick={() => void markRead(row.id)}>Mark read</Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title="No notifications yet" body="Updates about your application, documents and store will appear here." />
        </div>
      )}
    </div>
  );
}

interface DashboardResponse {
  store: { status: string; payoutStatus: string; sellerCategory: string | null; statusReason: string | null };
  application: { id: string; status: string; revision: number; submittedAt: string | null; reviewedAt: string | null; rejectionReason: string | null } | null;
  checklist: { id: string; label: string; status: string; detail: string; href?: string }[];
  products: { active: number; pending: number; low_stock: number; drafts: number };
  orders: { pending: number; confirmed: number; packed: number; shipped: number; delivered: number; cancelled: number };
  period: { days: number; since: string };
  sales: { gross: number; commission: number; earnings: number; orders: number };
  ledger: { pending: number; eligible: number; settled: number; refunds: number };
  settlement: { pending_batches: number; paid_total: number };
  recentOrders: { id: string; reference: string; orderNumber: string; status: string; totalPaise: number; earningPaise: number; dispatchBy: string | null }[];
  commissionNote: string;
}

export function SellerDashboardPage() {
  const dashboard = useQuery({ queryKey: ['seller-dashboard'], queryFn: () => api<DashboardResponse>('/seller/dashboard') });
  if (dashboard.isLoading) return <LoadingBlock rows={4} />;
  if (dashboard.isError || !dashboard.data) return <ErrorState onRetry={() => void dashboard.refetch()} />;
  const data = dashboard.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Last 30 days"
        title="Your workshop, at a glance"
        lede="Sales figures are based on paid orders. Earnings become eligible after delivery and the return window."
        actions={<LinkButton to="/seller/products/new">Add a product</LinkButton>}
      />
      {data.orders.pending > 0 ? (
        <Alert tone="warning" title={`${data.orders.pending} order${data.orders.pending === 1 ? '' : 's'} need confirmation`}>
          Confirm stock and dispatch promptly. <Link to="/seller/orders?status=pending" className="underline underline-offset-2">Open new orders</Link>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Store readiness</h2>
            <StatusBadge status={data.store.status} label={STORE_STATUS_LABELS[data.store.status] ?? humanise(data.store.status)} />
          </div>
          <dl className="mt-4 space-y-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Application</dt>
              <dd className="text-ink">{applicationStatusLabel(data.application?.status)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Store</dt>
              <dd className="text-ink">{STORE_STATUS_LABELS[data.store.status] ?? humanise(data.store.status)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Payouts</dt>
              <dd className="text-ink">{humanise(data.store.payoutStatus)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Seller category</dt>
              <dd className="text-ink">{data.store.sellerCategory ? humanise(data.store.sellerCategory) : '—'}</dd>
            </div>
          </dl>
          {data.store.statusReason ? <p className="mt-3 text-[11px] text-[#8e4630]">{data.store.statusReason}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton to="/seller/application" size="sm" variant="secondary">Application & verification</LinkButton>
            <LinkButton to="/seller/notifications" size="sm" variant="ghost">Notifications</LinkButton>
          </div>
        </section>

        <section className="border border-line bg-surface p-5">
          <h2 className="text-lg">Onboarding checklist</h2>
          <p className="mt-1 text-[11px] text-muted">What is complete in your seller record, and what still needs attention.</p>
          {data.checklist.length ? (
            <ul className="mt-3 space-y-2">
              {data.checklist.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-2 text-[12px] last:border-b-0 last:pb-0">
                  <span className="text-ink">{item.label}</span>
                  <span
                    className={`text-[10px] uppercase tracking-[0.1em] ${
                      item.status === 'complete' ? 'text-forest' : item.status === 'action' ? 'text-[#8e4630]' : 'text-muted'
                    }`}
                  >
                    {item.status === 'complete' ? 'Complete' : item.status === 'action' ? 'Action needed' : 'Pending'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[12px] text-muted">Your checklist will appear once the application is saved.</p>
          )}
        </section>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Product value" value={formatINR(data.sales.gross)} note="After discounts, before commission" />
        <Stat label="Commission" value={formatINR(data.sales.commission)} note="Marketplace share" />
        <Stat label="Your earnings" value={formatINR(data.sales.earnings)} note="On paid orders" tone="accent" />
        <Stat label="Paid orders" value={data.sales.orders} note="Last 30 days" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Ledger pending</p>
          <p className="mt-2 font-serif text-2xl text-forest">{formatINR(data.ledger.pending)}</p>
          <p className="mt-1 text-[11px] text-muted">Awaiting delivery or the return window.</p>
        </div>
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Eligible now</p>
          <p className="mt-2 font-serif text-2xl text-forest">{formatINR(data.ledger.eligible)}</p>
          <p className="mt-1 text-[11px] text-muted">Available for a reviewed settlement.</p>
        </div>
        <div className="border border-line bg-surface p-4">
          <p className="eyebrow">Settled to date</p>
          <p className="mt-2 font-serif text-2xl text-forest">{formatINR(data.ledger.settled)}</p>
          <p className="mt-1 text-[11px] text-muted">Recorded payouts only.</p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg">Recent seller orders</h2>
            <Link to="/seller/orders" className="text-[11px] text-muted underline underline-offset-2">All orders</Link>
          </div>
          {data.recentOrders.length ? (
            <ul className="divide-y divide-line">
              {data.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link to={`/seller/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-paper/60">
                    <div>
                      <p className="text-[13px] font-medium text-forest">{order.reference}</p>
                      <p className="text-[11px] text-muted">{order.orderNumber} · dispatch by {order.dispatchBy ? formatDate(order.dispatchBy) : '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{formatINR(order.totalPaise)}</span>
                      <StatusBadge status={order.status} label={sellerOrderStatusLabel(order.status)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted">No paid orders yet.</p>
          )}
        </section>
        <div className="space-y-4">
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Catalogue</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Live</dt><dd className="mt-1 font-serif text-xl">{data.products.active}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">In review</dt><dd className="mt-1 font-serif text-xl">{data.products.pending}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Drafts</dt><dd className="mt-1 font-serif text-xl">{data.products.drafts}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-[0.12em] text-muted">Low stock</dt><dd className="mt-1 font-serif text-xl text-terra">{data.products.low_stock}</dd></div>
            </dl>
            <LinkButton to="/seller/products" size="sm" variant="secondary" className="mt-4">Manage products</LinkButton>
          </section>
          <section className="border border-line bg-paper p-5">
            <h2 className="text-lg">Commission</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{data.commissionNote}</p>
            <p className="mt-3 text-[11px] text-muted">
              Settlement batches: {data.settlement.pending_batches} pending · {formatINR(data.settlement.paid_total)} paid to date.
              Payouts are recorded manually with a bank/UPI reference; automated payouts are not enabled.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function SellerProductsPage() {
  const [status, setStatus] = useState('');
  const products = useQuery({
    queryKey: ['seller-products', status],
    queryFn: () => api<{ products: SellerProduct[] }>(`/seller/products${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (product: SellerProduct, action: 'submit' | 'pause' | 'resume' | 'archive') => {
    if (action === 'archive' && !window.confirm(`Archive ${product.name}? It will leave the public catalogue.`)) return;
    setBusy(product.id);
    try {
      await api(`/seller/products/${product.id}/${action}`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
      toast.push('Product status updated.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        lede="Draft and edit listings, add photographs, keep stock honest, and submit changes for moderation."
        actions={<LinkButton to="/seller/products/new">Add product</LinkButton>}
      />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="max-w-52">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">In review / changes requested</option>
          <option value="approved">Live</option>
          <option value="rejected">Rejected</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </Select>
        <p className="text-[11px] text-muted">{products.data?.products.length ?? 0} listing{products.data?.products.length === 1 ? '' : 's'}</p>
      </div>
      <div className="mt-6">
        {products.isLoading ? <LoadingBlock rows={4} /> : null}
        {products.isError ? <ErrorState onRetry={() => void products.refetch()} /> : null}
        {products.data?.products.length === 0 ? (
          <EmptyState
            title="No products in this view"
            body="Create a draft, add at least one photograph and stock, then submit it for review."
            action={<LinkButton to="/seller/products/new">Add product</LinkButton>}
          />
        ) : null}
        <div className="overflow-x-auto border border-line bg-surface">
          {products.data?.products.length ? (
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.data.products.map((product) => (
                  <tr key={product.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden bg-sand/40">
                          {product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link to={`/seller/products/${product.id}/edit`} className="font-medium text-forest hover:text-terra">{product.name}</Link>
                            {product.isDemo ? <DemoBadge /> : null}
                          </div>
                          <p className="text-[10.5px] text-muted">{product.sku} · {product.categoryName}</p>
                          {product.moderationNote ? <p className="mt-1 max-w-xs text-[10.5px] text-[#8e4630]">Reviewer: {product.moderationNote}</p> : product.rejectionReason ? <p className="mt-1 max-w-xs text-[10.5px] text-terra">{product.rejectionReason}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4"><StatusBadge status={product.workflowStatus ?? product.status} label={PRODUCT_WORKFLOW_LABELS[product.workflowStatus ?? product.status]} /></td>
                    <td className="px-4 py-4">{formatINR(product.pricePaise)}</td>
                    <td className="px-4 py-4">
                      <p>{product.stock}</p>
                      {product.reserved > 0 ? <p className="text-[10.5px] text-muted">{product.reserved} reserved</p> : null}
                    </td>
                    <td className="px-4 py-4 text-muted">{formatDate(product.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <LinkButton to={`/seller/products/${product.id}/edit`} size="sm" variant="secondary">Edit</LinkButton>
                        {['draft', 'rejected', 'paused'].includes(product.status) || product.workflowStatus === 'changes_requested' ? (
                          <Button size="sm" loading={busy === product.id} onClick={() => void act(product, 'submit')}>Submit</Button>
                        ) : null}
                        {product.status === 'approved' ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(product, 'pause')}>Pause</Button>
                        ) : null}
                        {product.status === 'paused' ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(product, 'resume')}>Resume</Button>
                        ) : null}
                        {product.status !== 'archived' ? (
                          <Button size="sm" variant="ghost" onClick={() => void act(product, 'archive')}>Archive</Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ProductCompliance {
  ingredients: string;
  shelfLife: string;
  batchNumber: string;
  fssaiLicense: string;
  storage: string;
  allergenInfo: string;
}

interface ProductEditorResponse {
  product: {
    id: string;
    name: string;
    slug: string;
    categoryId: string;
    shortDescription: string;
    description: string;
    pricePaise: number;
    compareAtPricePaise: number | null;
    sku: string;
    unit: string;
    weightG: number | null;
    dimensions: string | null;
    materials: string | null;
    careInstructions: string | null;
    foodInfo: string | null;
    compliance: Partial<ProductCompliance> | null;
    workflowStatus: string;
    moderationNote: string | null;
    originPlace: string | null;
    originVerified: boolean;
    region: string | null;
    attributes: Record<string, string> | null;
    status: ProductStatus;
    rejectionReason: string | null;
    images: { id: string; url: string; alt: string; credit: string | null }[];
    inventory: { quantity: number; reserved: number; lowStockThreshold: number };
    taxRateBp: number;
    isDemo: boolean;
  };
  commissionNote: string;
}

const EMPTY_COMPLIANCE: ProductCompliance = {
  ingredients: '',
  shelfLife: '',
  batchNumber: '',
  fssaiLicense: '',
  storage: '',
  allergenInfo: '',
};

const EMPTY_PRODUCT = {
  name: '',
  categoryId: '',
  shortDescription: '',
  description: '',
  priceRupees: '',
  compareAtRupees: '',
  sku: '',
  unit: 'piece',
  weightG: '',
  dimensions: '',
  materials: '',
  careInstructions: '',
  foodInfo: '',
  compliance: { ...EMPTY_COMPLIANCE },
  originPlace: '',
  region: '',
};

function toPaise(value: string): number {
  return Math.round(Number(value || 0) * 100);
}

export function SellerProductEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [prefilledProductId, setPrefilledProductId] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState('');
  const [imageCredit, setImageCredit] = useState('');
  const [uploading, setUploading] = useState(false);
  const [inventory, setInventory] = useState({ quantity: '0', lowStockThreshold: '3', note: '' });
  const [savingStock, setSavingStock] = useState(false);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[]; subcategories: Category[] }>('/categories'),
  });
  const product = useQuery({
    queryKey: ['seller-product', id],
    queryFn: () => api<ProductEditorResponse>(`/seller/products/${id}`),
    enabled: Boolean(id),
  });
  const sellerApplication = useQuery<SellerApplicationResponse>({
    queryKey: ['seller-application'],
    queryFn: () => api<SellerApplicationResponse>('/seller/application'),
    retry: false,
    staleTime: 60_000,
  });
  const isFoodSeller = sellerApplication.data?.seller?.sellerCategory === 'food_producer';
  const workflowStatus = product.data?.product?.workflowStatus;
  const inReview = workflowStatus === 'submitted';

  // Populate the editor once per product. Adjusting state during render is the
  // documented React pattern for deriving editable state from fetched data.
  const loadedProduct = product.data?.product;
  if (loadedProduct && prefilledProductId !== loadedProduct.id) {
    setPrefilledProductId(loadedProduct.id);
    setForm({
      name: loadedProduct.name,
      categoryId: loadedProduct.categoryId,
      shortDescription: loadedProduct.shortDescription,
      description: loadedProduct.description,
      priceRupees: (loadedProduct.pricePaise / 100).toFixed(2).replace(/\.00$/, ''),
      compareAtRupees: loadedProduct.compareAtPricePaise ? (loadedProduct.compareAtPricePaise / 100).toFixed(2).replace(/\.00$/, '') : '',
      sku: loadedProduct.sku,
      unit: loadedProduct.unit,
      weightG: loadedProduct.weightG ? String(loadedProduct.weightG) : '',
      dimensions: loadedProduct.dimensions ?? '',
      materials: loadedProduct.materials ?? '',
      careInstructions: loadedProduct.careInstructions ?? '',
      foodInfo: loadedProduct.foodInfo ?? '',
      compliance: {
        ingredients: loadedProduct.compliance?.ingredients ?? '',
        shelfLife: loadedProduct.compliance?.shelfLife ?? '',
        batchNumber: loadedProduct.compliance?.batchNumber ?? '',
        fssaiLicense: loadedProduct.compliance?.fssaiLicense ?? '',
        storage: loadedProduct.compliance?.storage ?? '',
        allergenInfo: loadedProduct.compliance?.allergenInfo ?? '',
      },
      originPlace: loadedProduct.originPlace ?? '',
      region: loadedProduct.region ?? '',
    });
    setInventory({
      quantity: String(loadedProduct.inventory.quantity),
      lowStockThreshold: String(loadedProduct.inventory.lowStockThreshold),
      note: '',
    });
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (inReview) {
      toast.push('This listing is with a reviewer. Wait for the decision before editing it.', 'error');
      return;
    }
    setSaving(true);
    setFields({});
    const compliance = Object.fromEntries(
      Object.entries(form.compliance)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0),
    );
    const payload = {
      name: form.name,
      categoryId: form.categoryId,
      shortDescription: form.shortDescription,
      description: form.description,
      pricePaise: toPaise(form.priceRupees),
      compareAtPricePaise: form.compareAtRupees ? toPaise(form.compareAtRupees) : null,
      sku: form.sku,
      unit: form.unit || 'piece',
      weightG: form.weightG ? Number(form.weightG) : null,
      dimensions: form.dimensions || undefined,
      materials: form.materials || undefined,
      careInstructions: form.careInstructions || undefined,
      foodInfo: form.foodInfo || undefined,
      compliance: Object.keys(compliance).length ? compliance : undefined,
      originPlace: form.originPlace || undefined,
      region: form.region || undefined,
    };
    try {
      if (isNew) {
        const result = await api<{ id: string }>('/seller/products', { method: 'POST', body: payload });
        await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
        toast.push('Draft created. Add a photograph, stock and submit for review.');
        navigate(`/seller/products/${result.id}/edit`, { replace: true });
      } else {
        const result = await api<{ status: string; message: string }>(`/seller/products/${id}`, { method: 'PATCH', body: payload });
        await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
        await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
        toast.push(result.message);
      }
    } catch (error) {
      setFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    if (imageAlt.trim().length < 5) {
      toast.push('Add descriptive alt text (at least 5 characters).', 'error');
      return;
    }
    const input = document.getElementById('product-image-input') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      toast.push('Choose an image first.', 'error');
      return;
    }
    const data = new FormData();
    data.append('image', file);
    data.append('alt', imageAlt);
    data.append('credit', imageCredit);
    setUploading(true);
    try {
      await api(`/seller/products/${id}/images`, { method: 'POST', body: data });
      await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
      setImageAlt('');
      setImageCredit('');
      if (input) input.value = '';
      toast.push('Photograph added.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (imageId: string) => {
    if (!id || !window.confirm('Delete this photograph?')) return;
    try {
      await api(`/seller/products/${id}/images/${imageId}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
      toast.push('Photograph deleted.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const saveStock = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;
    setSavingStock(true);
    try {
      await api(`/seller/inventory/${id}`, {
        method: 'POST',
        body: {
          quantity: Number(inventory.quantity),
          lowStockThreshold: Number(inventory.lowStockThreshold),
          note: inventory.note || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      toast.push('Stock updated.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setSavingStock(false);
    }
  };

  const submitForReview = async () => {
    if (!id) return;
    try {
      await api(`/seller/products/${id}/submit`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['seller-product', id] });
      await queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      toast.push('Listing submitted for review.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  if (id && product.isLoading) return <LoadingBlock rows={4} />;
  if (id && (product.isError || !product.data)) return <ErrorState title="Product not found" body="This listing does not belong to your seller account." onRetry={() => void product.refetch()} />;
  const current = product.data?.product;

  return (
    <div>
      <PageHeader
        eyebrow={isNew ? 'New listing' : `Listing · ${PRODUCT_WORKFLOW_LABELS[current?.workflowStatus ?? current?.status ?? 'draft'] ?? humanise(current?.status ?? 'draft')}`}
        title={isNew ? 'Add a product' : current?.name ?? 'Edit product'}
        lede="Write what the buyer needs to know. Claims must be supportable, photographs must be yours or properly licensed, and stock must reflect what you can actually ship."
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton to="/seller/products" variant="secondary" size="sm">Back to products</LinkButton>
            {!isNew && current && (['draft', 'rejected', 'paused'].includes(current.status) || current.workflowStatus === 'changes_requested') ? (
              <Button size="sm" onClick={() => void submitForReview()}>
                {current.workflowStatus === 'changes_requested' ? 'Resubmit for review' : 'Submit for review'}
              </Button>
            ) : null}
            {!isNew && current?.status === 'approved' ? (
              <LinkButton to={`/shop/${current.slug}`} size="sm" variant="secondary">View live</LinkButton>
            ) : null}
          </div>
        }
      />
      {current?.workflowStatus === 'changes_requested' ? (
        <div className="mt-5">
          <Alert tone="warning" title="Changes requested by the reviewer">
            {current.moderationNote ?? current.rejectionReason ?? 'Update this listing, then resubmit it for review.'} Saving is enabled so you can fix the listing, then press Resubmit for review.
          </Alert>
        </div>
      ) : current?.rejectionReason ? (
        <div className="mt-5"><Alert tone="warning" title="Changes requested">{current.rejectionReason}</Alert></div>
      ) : null}
      {inReview ? (
        <div className="mt-5">
          <Alert tone="info" title="With a reviewer">
            This listing is under moderation and is read-only until a decision is recorded. Any reviewer note will appear here.
          </Alert>
        </div>
      ) : null}
      {!isNew && current?.isDemo ? (
        <div className="mt-5"><Alert tone="info" title="Demonstration listing">This seeded listing is labelled as demo data in the public catalogue. Replace it with real seller content before launch.</Alert></div>
      ) : null}

      <form onSubmit={save} className="mt-7 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-xl">The listing</h2>
            <div className="mt-4 space-y-4">
              <Field label="Product name" required error={fields.name}>
                <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" required error={fields.categoryId}>
                  <Select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                    <option value="">Choose a category</option>
                    {categories.data?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    {categories.data?.subcategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </Select>
                </Field>
                <Field label="SKU" required hint="Unique within your catalogue" error={fields.sku}>
                  <Input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value.toUpperCase() })} />
                </Field>
              </div>
              <Field label="Short summary" required hint="At least 20 characters" error={fields.shortDescription}>
                <Textarea required minLength={20} maxLength={240} rows={2} value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} />
              </Field>
              <Field label="Full description" required hint="At least 80 characters" error={fields.description}>
                <Textarea required minLength={80} maxLength={6000} rows={8} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
            </div>
          </section>

          <section className="border border-line bg-surface p-5 sm:p-6">
            <h2 className="text-xl">Price & materials</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Selling price" required hint="₹, GST inclusive" error={fields.pricePaise}>
                <Input required inputMode="decimal" value={form.priceRupees} onChange={(event) => setForm({ ...form, priceRupees: event.target.value })} />
              </Field>
              <Field label="Compare-at price" hint="Optional, ₹">
                <Input inputMode="decimal" value={form.compareAtRupees} onChange={(event) => setForm({ ...form, compareAtRupees: event.target.value })} />
              </Field>
              <Field label="Unit" required>
                <Input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="piece, 100 g, pair" />
              </Field>
              <Field label="Packed weight (g)" required hint="Needed to submit" error={fields.weightG}>
                <Input inputMode="numeric" value={form.weightG} onChange={(event) => setForm({ ...form, weightG: event.target.value.replace(/\D/g, '') })} />
              </Field>
              <Field label="Dimensions" hint="Optional">
                <Input value={form.dimensions} onChange={(event) => setForm({ ...form, dimensions: event.target.value })} placeholder="30 × 20 × 5 cm" />
              </Field>
              <Field label="Region" hint="Shown on the listing">
                <Input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} />
              </Field>
              <Field label="Materials" className="sm:col-span-2">
                <Input value={form.materials} onChange={(event) => setForm({ ...form, materials: event.target.value })} />
              </Field>
              <Field label="Place of origin" hint="Only if supportable">
                <Input value={form.originPlace} onChange={(event) => setForm({ ...form, originPlace: event.target.value })} />
              </Field>
              <Field label="Care instructions">
                <Input value={form.careInstructions} onChange={(event) => setForm({ ...form, careInstructions: event.target.value })} />
              </Field>
              <Field label="Food information" hint="Ingredients, allergens, shelf life" className="sm:col-span-2">
                <Textarea rows={4} value={form.foodInfo} onChange={(event) => setForm({ ...form, foodInfo: event.target.value })} />
              </Field>
            </div>
          </section>

          {isFoodSeller ? (
            <section className="border border-line bg-surface p-5 sm:p-6">
              <h2 className="text-xl">Food compliance</h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                Required because your seller category is Food Producer. Each food listing needs an FSSAI licence number,
                ingredients and shelf life before it can be submitted for review. These details must match the product,
                not just the business.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="FSSAI licence number" required error={fields['compliance.fssaiLicense']}>
                  <Input
                    value={form.compliance.fssaiLicense}
                    onChange={(event) =>
                      setForm({ ...form, compliance: { ...form.compliance, fssaiLicense: event.target.value.replace(/\s/g, '') } })
                    }
                    maxLength={30}
                  />
                </Field>
                <Field label="Shelf life" required hint="e.g. 6 months from packing">
                  <Input
                    value={form.compliance.shelfLife}
                    onChange={(event) => setForm({ ...form, compliance: { ...form.compliance, shelfLife: event.target.value } })}
                    maxLength={120}
                  />
                </Field>
                <Field label="Ingredients" required className="sm:col-span-2" error={fields['compliance.ingredients']}>
                  <Textarea
                    rows={3}
                    value={form.compliance.ingredients}
                    onChange={(event) => setForm({ ...form, compliance: { ...form.compliance, ingredients: event.target.value } })}
                    maxLength={1000}
                  />
                </Field>
                <Field label="Batch number" hint="If already assigned">
                  <Input
                    value={form.compliance.batchNumber}
                    onChange={(event) => setForm({ ...form, compliance: { ...form.compliance, batchNumber: event.target.value } })}
                    maxLength={80}
                  />
                </Field>
                <Field label="Storage instructions">
                  <Input
                    value={form.compliance.storage}
                    onChange={(event) => setForm({ ...form, compliance: { ...form.compliance, storage: event.target.value } })}
                    maxLength={300}
                  />
                </Field>
                <Field label="Allergen information" className="sm:col-span-2">
                  <Input
                    value={form.compliance.allergenInfo}
                    onChange={(event) => setForm({ ...form, compliance: { ...form.compliance, allergenInfo: event.target.value } })}
                    maxLength={300}
                  />
                </Field>
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" loading={saving} disabled={inReview}>{isNew ? 'Create draft' : 'Save changes'}</Button>
            <span className="self-center text-[11px] text-muted">
              {inReview
                ? 'Read-only while a reviewer holds this listing.'
                : 'Material changes to a live listing return it to moderation.'}
            </span>
          </div>
        </div>

        <aside className="space-y-6">
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Photographs</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">At least one is required before submission. Maximum six. Alt text is required for accessibility.</p>
            {current?.images.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {current.images.map((image) => (
                  <div key={image.id} className="border border-line">
                    <img src={image.url} alt={image.alt} className="aspect-square w-full object-cover" />
                    <div className="p-2">
                      <p className="line-clamp-2 text-[10.5px] text-muted">{image.alt}</p>
                      <button type="button" onClick={() => void deleteImage(image.id)} className="mt-1 text-[10.5px] text-terra underline underline-offset-2">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 border border-dashed border-sand px-3 py-6 text-center text-xs text-muted">No photographs yet.</p>}
            {isNew ? (
              <p className="mt-4 text-[11px] text-muted">Create the draft first, then upload photographs.</p>
            ) : (
              <form onSubmit={uploadImage} className="mt-5 space-y-3 border-t border-line pt-4">
                <Field label="Image file"><Input id="product-image-input" type="file" accept=".jpg,.jpeg,.png,.webp" required /></Field>
                <Field label="Alt text" required><Input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Describe what is visible" /></Field>
                <Field label="Credit" hint="Optional"><Input value={imageCredit} onChange={(event) => setImageCredit(event.target.value)} placeholder="Photographer or licence" /></Field>
                <Button type="submit" size="sm" variant="secondary" loading={uploading}>Upload photograph</Button>
              </form>
            )}
          </section>

          {!isNew && current ? (
            <section className="border border-line bg-surface p-5">
              <h2 className="text-lg">Stock</h2>
              <p className="mt-1 text-[11px] text-muted">Reserved units are held by paid or in-progress orders and cannot be removed.</p>
              <form onSubmit={saveStock} className="mt-4 space-y-3">
                <Field label="Quantity" required><Input required inputMode="numeric" value={inventory.quantity} onChange={(event) => setInventory({ ...inventory, quantity: event.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="Low stock threshold"><Input inputMode="numeric" value={inventory.lowStockThreshold} onChange={(event) => setInventory({ ...inventory, lowStockThreshold: event.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="Note" hint="Recorded in inventory movements"><Input value={inventory.note} onChange={(event) => setInventory({ ...inventory, note: event.target.value })} /></Field>
                <p className="text-[11px] text-muted">{current.inventory.reserved} unit{current.inventory.reserved === 1 ? '' : 's'} currently reserved.</p>
                <Button type="submit" size="sm" variant="secondary" loading={savingStock}>Update stock</Button>
              </form>
            </section>
          ) : null}

          <section className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Moderation notes</p>
            <p className="mt-1">
              Approval requires at least one photograph and an 80-character description. Rejected listings show the reviewer's
              note here. Commission is calculated on product value after discounts, excluding shipping and taxes.
            </p>
            {current?.moderationNote ? (
              <p className="mt-2 border-l-2 border-harvest pl-2 text-bark">{current.moderationNote}</p>
            ) : null}
            {current?.taxRateBp !== undefined ? <p className="mt-2">Tax rate on file: {percentFromBp(current.taxRateBp)}.</p> : null}
          </section>
        </aside>
      </form>
    </div>
  );
}

interface SellerOrderRow {
  id: string;
  reference: string;
  orderNumber: string;
  status: string;
  totalPaise: number;
  earningPaise: number;
  commissionPaise: number;
  createdAt: string;
  dispatchBy: string | null;
  itemCount: number;
  customerName: string;
  destination: string;
}

export function SellerOrdersPage() {
  const [status, setStatus] = useState('');
  const orders = useQuery({
    queryKey: ['seller-orders', status],
    queryFn: () => api<{ orders: SellerOrderRow[] }>(`/seller/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  });
  return (
    <div>
      <PageHeader
        eyebrow="Fulfilment"
        title="Orders"
        lede="Confirm stock, pack, dispatch with tracking, and mark delivery. The buyer sees each seller shipment separately."
      />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} className="max-w-52">
          <option value="">All statuses</option>
          {['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded'].map((value) => (
            <option key={value} value={value}>{sellerOrderStatusLabel(value)}</option>
          ))}
        </Select>
      </div>
      <div className="mt-6">
        {orders.isLoading ? <LoadingBlock rows={4} /> : null}
        {orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : null}
        {orders.data?.orders.length === 0 ? <EmptyState title="No orders in this view" body="Paid orders from customers will appear here for confirmation." /> : null}
        {orders.data?.orders.length ? (
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Earning</th>
                  <th className="px-4 py-3">Dispatch by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.data.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-4">
                      <Link to={`/seller/orders/${order.id}`} className="font-medium text-forest hover:text-terra">{order.reference}</Link>
                      <p className="text-[10.5px] text-muted">{order.orderNumber} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-4 py-4">{order.customerName}<p className="text-[10.5px] text-muted">{order.destination}</p></td>
                    <td className="px-4 py-4"><StatusBadge status={order.status} label={sellerOrderStatusLabel(order.status)} /></td>
                    <td className="px-4 py-4">{formatINR(order.totalPaise)}</td>
                    <td className="px-4 py-4">{formatINR(order.earningPaise)}</td>
                    <td className="px-4 py-4">{order.dispatchBy ? formatDate(order.dispatchBy) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SellerOrderDetail {
  order: {
    id: string;
    reference: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    dispatchBy: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    taxPaise: number;
    totalPaise: number;
    commissionPaise: number;
    commissionRateBp: number;
    earningPaise: number;
    customerNote: string | null;
    address: { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
    items: { id: string; name: string; sku: string; quantity: number; unitPricePaise: number; lineSubtotalPaise: number; status: string; imageUrl: string | null }[];
    shipment: { carrier: string; trackingNumber: string; trackingUrl: string | null; status: string; shippedAt: string; deliveredAt: string | null; events: { status: string; description: string | null; occurredAt: string }[] } | null;
    commissionNote: string;
  };
}

export function SellerOrderDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [shipOpen, setShipOpen] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const order = useQuery({
    queryKey: ['seller-order', id],
    queryFn: () => api<SellerOrderDetail>(`/seller/orders/${id}`),
    enabled: Boolean(id),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['seller-order', id] });
    await queryClient.invalidateQueries({ queryKey: ['seller-orders'] });
    await queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] });
  };

  const act = async (action: string) => {
    setBusy(true);
    try {
      await api(`/seller/orders/${id}/action`, {
        method: 'POST',
        body: action === 'ship' ? { action, carrier, trackingNumber, trackingUrl: trackingUrl || undefined, note: note || undefined } : { action, note: note || undefined },
      });
      setShipOpen(false);
      setNote('');
      toast.push('Order updated.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (order.isLoading) return <LoadingBlock rows={4} />;
  if (order.isError || !order.data) return <ErrorState title="Order not found" body="This seller order may not belong to your account." onRetry={() => void order.refetch()} />;
  const data = order.data.order;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Seller order"
        title={data.reference}
        lede={`Marketplace order ${data.orderNumber} · placed ${formatDateTime(data.createdAt)}`}
        actions={<StatusBadge status={data.status} label={sellerOrderStatusLabel(data.status)} />}
      />
      <div className="flex flex-wrap gap-2">
        {data.status === 'pending' ? <Button onClick={() => void act('confirm')} loading={busy}>Confirm order</Button> : null}
        {['pending', 'confirmed'].includes(data.status) ? <Button variant="secondary" onClick={() => void act('pack')} loading={busy}>Mark packed</Button> : null}
        {['confirmed', 'packed'].includes(data.status) ? <Button onClick={() => setShipOpen(true)}>Dispatch with tracking</Button> : null}
        {data.status === 'shipped' ? <Button onClick={() => void act('deliver')} loading={busy}>Mark delivered</Button> : null}
        {['pending', 'confirmed'].includes(data.status) ? <Button variant="danger" onClick={() => void act('cancel')} loading={busy}>Cancel shipment</Button> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><h2 className="text-lg">Items</h2></div>
            <ul className="divide-y divide-line">
              {data.items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden bg-sand/40">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : null}</div>
                  <div className="flex-1">
                    <p className="text-sm text-ink">{item.name}</p>
                    <p className="text-[11px] text-muted">SKU {item.sku} · Qty {item.quantity} · {formatINR(item.unitPricePaise)} each</p>
                  </div>
                  <p className="text-sm">{formatINR(item.lineSubtotalPaise)}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Payment & commission</h2>
            <dl className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-muted">Product value</dt><dd>{formatINR(data.subtotalPaise)}</dd></div>
              {data.discountPaise ? <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd>−{formatINR(data.discountPaise)}</dd></div> : null}
              <div className="flex justify-between"><dt className="text-muted">Shipping (marketplace)</dt><dd>{formatINR(data.shippingPaise)}</dd></div>
              {data.taxPaise ? <div className="flex justify-between"><dt className="text-muted">Tax included</dt><dd>{formatINR(data.taxPaise)}</dd></div> : null}
              <div className="flex justify-between border-t border-line pt-2"><dt className="text-muted">Buyer paid</dt><dd>{formatINR(data.totalPaise)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Commission ({percentFromBp(data.commissionRateBp)})</dt><dd>−{formatINR(data.commissionPaise)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-medium"><dt>Your earning</dt><dd>{formatINR(data.earningPaise)}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{data.commissionNote}</p>
          </section>
          {data.shipment ? (
            <section className="border border-line bg-surface p-5">
              <h2 className="text-lg">Shipment</h2>
              <p className="mt-2 text-sm">{data.shipment.carrier} · {data.shipment.trackingNumber}</p>
              <p className="text-[11px] text-muted">Shipped {formatDate(data.shipment.shippedAt)}{data.shipment.deliveredAt ? ` · delivered ${formatDate(data.shipment.deliveredAt)}` : ''}</p>
              {data.shipment.trackingUrl ? <a href={data.shipment.trackingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-forest underline underline-offset-2">Open tracking</a> : null}
              <ol className="mt-3 space-y-1 text-[11.5px] text-muted">
                {data.shipment.events.map((event, index) => <li key={`${event.status}-${index}`}>{formatDate(event.occurredAt)} · {event.status.replaceAll('_', ' ')}{event.description ? ` — ${event.description}` : ''}</li>)}
              </ol>
            </section>
          ) : null}
        </div>
        <aside className="space-y-5">
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Ship to</h2>
            <address className="mt-3 text-[12.5px] not-italic leading-relaxed text-ink/75">
              {data.address.fullName}<br />
              {data.address.line1}<br />
              {data.address.line2 ? <>{data.address.line2}<br /></> : null}
              {data.address.city}, {data.address.state} {data.address.pincode}<br />
              {data.address.phone}
            </address>
          </section>
          {data.customerNote ? (
            <section className="border border-line bg-[#fbf5e6] p-5">
              <h2 className="text-lg">Customer note</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink/75">{data.customerNote}</p>
            </section>
          ) : null}
          <section className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Dispatch checklist</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Match the SKU and quantity before packing.</li>
              <li>Use protective packaging appropriate to the item.</li>
              <li>Add the real carrier and tracking number, not a placeholder.</li>
              <li>Keep the dispatch evidence until the return window closes.</li>
            </ul>
          </section>
        </aside>
      </div>

      <Modal
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="Dispatch this shipment"
        footer={<><Button variant="ghost" onClick={() => setShipOpen(false)}>Cancel</Button><Button loading={busy} onClick={() => void act('ship')}>Record dispatch</Button></>}
      >
        <div className="space-y-4">
          <Alert tone="info">This build does not create a carrier label. Enter the carrier and tracking reference from your own dispatch process.</Alert>
          <Field label="Carrier" required><Input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="e.g. India Post, Delhivery" /></Field>
          <Field label="Tracking number" required><Input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} /></Field>
          <Field label="Tracking URL" hint="Optional"><Input type="url" value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)} placeholder="https://" /></Field>
          <Field label="Internal note" hint="Optional"><Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

interface EarningsResponse {
  entries: { id: string; type: string; amountPaise: number; status: string; reference: string; note: string | null; availableAt: string | null; createdAt: string; orderNumber: string | null }[];
  totals: { pending: number; eligible: number; settled: number; reversed: number };
  commissions: { sellerOrderId: string; basisPaise: number; rateBp: number; amountPaise: number; createdAt: string }[];
  settlements: { id: string; reference: string; periodStart: string; periodEnd: string; netPaise: number; status: string; paidAt: string | null; providerReference: string | null }[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  commissionNote: string;
}

export function SellerEarningsPage() {
  const [page, setPage] = useState(1);
  const earnings = useQuery({
    queryKey: ['seller-earnings', page],
    queryFn: () => api<EarningsResponse>(`/seller/earnings?page=${page}`),
  });
  if (earnings.isLoading) return <LoadingBlock rows={4} />;
  if (earnings.isError || !earnings.data) return <ErrorState onRetry={() => void earnings.refetch()} />;
  const data = earnings.data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Money"
        title="Earnings & settlements"
        lede="A ledger, not a promise. Entries become eligible after delivery and the 7-day return window. A settlement is marked paid only with a recorded bank/UPI reference."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending" value={formatINR(data.totals.pending)} note="Not yet available" />
        <Stat label="Eligible" value={formatINR(data.totals.eligible)} note="Ready for settlement review" tone="accent" />
        <Stat label="Settled" value={formatINR(data.totals.settled)} note="Recorded payouts" />
        <Stat label="Reversed" value={formatINR(data.totals.reversed)} note="Refunds and adjustments" tone="warning" />
      </div>
      <Alert tone="info" title="Manual payouts only">
        This deployment does not automate marketplace payouts. The operator reviews eligible entries, creates a settlement
        batch, transfers funds through the business bank account or UPI, and records the reference. No payout is implied until
        that reference exists.
      </Alert>
      <section>
        <h2 className="text-xl">Settlement batches</h2>
        {data.settlements.length ? (
          <div className="mt-3 overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Net</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Payment reference</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.settlements.map((settlement) => (
                  <tr key={settlement.id}>
                    <td className="px-4 py-3 text-forest">{settlement.reference}</td>
                    <td className="px-4 py-3">{formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}</td>
                    <td className="px-4 py-3">{formatINR(settlement.netPaise)}</td>
                    <td className="px-4 py-3"><StatusBadge status={settlement.status} /></td>
                    <td className="px-4 py-3 text-muted">{settlement.providerReference ?? (settlement.status === 'paid' ? 'Recorded' : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No settlement batches yet.</p>}
      </section>
      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl">Ledger entries</h2>
          <p className="text-[11px] text-muted">{data.pagination.total} entries</p>
        </div>
        {data.entries.length ? (
          <div className="mt-3 overflow-x-auto border border-line bg-surface">
            <table className="min-w-full text-left text-[12.5px]">
              <thead className="border-b border-line bg-paper text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-muted">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3">{humanise(entry.type)}</td>
                    <td className="px-4 py-3"><span className="text-forest">{entry.reference}</span>{entry.orderNumber ? <p className="text-[10.5px] text-muted">{entry.orderNumber}</p> : null}</td>
                    <td className="px-4 py-3"><StatusBadge status={entry.status} /></td>
                    <td className="px-4 py-3 text-right">{formatINR(entry.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No ledger entries yet.</p>}
        <Pagination page={page} totalPages={data.pagination.totalPages} onChange={setPage} />
      </section>
      <section className="border border-line bg-surface p-5">
        <h2 className="text-xl">Commission entries</h2>
        <p className="mt-1 text-[11px] text-muted">{data.commissionNote}</p>
        {data.commissions.length ? (
          <ul className="mt-4 divide-y divide-line text-[12.5px]">
            {data.commissions.map((commission) => (
              <li key={`${commission.sellerOrderId}-${commission.createdAt}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="text-muted">{formatDate(commission.createdAt)} · basis {formatINR(commission.basisPaise)} · {percentFromBp(commission.rateBp)}</span>
                <span>{formatINR(commission.amountPaise)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-muted">No commission entries yet.</p>}
      </section>
    </div>
  );
}

interface RequestsResponse {
  returns: { id: string; seller_order_id: string; reason: string; description: string | null; status: string; created_at: string; order_number: string; item_name: string | null }[];
  cancellations: { id: string; seller_order_id: string; reason: string; status: string; created_at: string; order_number: string }[];
}

export function SellerRequestsPage() {
  const requests = useQuery({ queryKey: ['seller-requests'], queryFn: () => api<RequestsResponse>('/seller/requests') });
  if (requests.isLoading) return <LoadingBlock rows={3} />;
  if (requests.isError || !requests.data) return <ErrorState onRetry={() => void requests.refetch()} />;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="After-sales"
        title="Returns & cancellation requests"
        lede="The marketplace team decides return and cancellation requests. Contact support if evidence or a pickup address is needed."
      />
      <section>
        <h2 className="text-xl">Returns</h2>
        {requests.data.returns.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {requests.data.returns.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-[13px] font-medium text-forest">{request.order_number} · {request.item_name ?? 'Item'}</p>
                  <p className="mt-1 text-[12px] text-ink/70">{request.reason}</p>
                  {request.description ? <p className="mt-1 text-[11.5px] text-muted">{request.description}</p> : null}
                  <p className="text-[11px] text-muted">{formatDate(request.created_at)}</p>
                </div>
                <StatusBadge status={request.status} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No return requests.</p>}
      </section>
      <section>
        <h2 className="text-xl">Cancellations</h2>
        {requests.data.cancellations.length ? (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {requests.data.cancellations.map((request) => (
              <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-[13px] font-medium text-forest">{request.order_number}</p>
                  <p className="mt-1 text-[12px] text-ink/70">{request.reason}</p>
                  <p className="text-[11px] text-muted">{formatDate(request.created_at)}</p>
                </div>
                <StatusBadge status={request.status} />
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No cancellation requests.</p>}
      </section>
    </div>
  );
}

export function SellerProfilePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const application = useQuery({ queryKey: ['seller-application'], queryFn: () => api<SellerApplicationResponse>('/seller/application') });
  const [form, setForm] = useState({ businessName: '', tagline: '', story: '', region: '', village: '', line1: '', line2: '', city: '', state: 'Himachal Pradesh', pincode: '' });
  const [prefilledSellerId, setPrefilledSellerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [docType, setDocType] = useState('id_proof');
  const [uploading, setUploading] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const savedSeller = application.data?.seller;
  if (savedSeller && prefilledSellerId !== savedSeller.id) {
    setPrefilledSellerId(savedSeller.id);
    setForm({
      businessName: savedSeller.businessName,
      tagline: savedSeller.tagline ?? '',
      story: savedSeller.story ?? '',
      region: savedSeller.region ?? '',
      village: savedSeller.village ?? '',
      line1: savedSeller.operatingAddress?.line1 ?? '',
      line2: savedSeller.operatingAddress?.line2 ?? '',
      city: savedSeller.operatingAddress?.city ?? '',
      state: savedSeller.operatingAddress?.state ?? 'Himachal Pradesh',
      pincode: savedSeller.operatingAddress?.pincode ?? '',
    });
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFields({});
    try {
      await api('/seller/profile', {
        method: 'PATCH',
        body: {
          businessName: form.businessName,
          tagline: form.tagline || undefined,
          story: form.story || undefined,
          region: form.region || undefined,
          village: form.village || undefined,
          operatingAddress: {
            line1: form.line1,
            line2: form.line2 || undefined,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
          },
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      toast.push('Store profile updated.');
    } catch (error) {
      setFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const input = formElement.elements.namedItem('document') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      toast.push('Choose a document first.', 'error');
      return;
    }
    const data = new FormData();
    data.append('document', file);
    data.append('docType', docType);
    setUploading(true);
    try {
      await api('/seller/documents', { method: 'POST', body: data });
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      formElement.reset();
      toast.push('Document uploaded privately.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  if (application.isLoading) return <LoadingBlock rows={3} />;
  if (application.isError || !application.data) return <ErrorState onRetry={() => void application.refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Storefront"
        title="Store profile"
        lede="This information appears on your public maker page and listings. Keep claims accurate and up to date."
      />
      <form onSubmit={save} className="space-y-6">
        <section className="border border-line bg-surface p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business or maker name" required error={fields.businessName}>
              <Input required value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} />
            </Field>
            <Field label="Tagline"><Input maxLength={160} value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} /></Field>
            <Field label="Region"><Input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></Field>
            <Field label="Village or town"><Input value={form.village} onChange={(event) => setForm({ ...form, village: event.target.value })} /></Field>
          </div>
          <Field label="Store story" className="mt-4" hint="Up to 3,000 characters">
            <Textarea rows={6} maxLength={3000} value={form.story} onChange={(event) => setForm({ ...form, story: event.target.value })} />
          </Field>
        </section>
        <section className="border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-xl">Operating address</h2>
          <p className="mt-1 text-[11px] text-muted">Used for seller records and pickup. It is not shown publicly.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Address line 1" required className="sm:col-span-2" error={fields.line1}><Input required value={form.line1} onChange={(event) => setForm({ ...form, line1: event.target.value })} /></Field>
            <Field label="Address line 2" className="sm:col-span-2"><Input value={form.line2} onChange={(event) => setForm({ ...form, line2: event.target.value })} /></Field>
            <Field label="City or town" required error={fields.city}><Input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
            <Field label="State" required error={fields.state}><Input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></Field>
            <Field label="PIN code" required error={fields.pincode}><Input required inputMode="numeric" value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} /></Field>
          </div>
        </section>
        <Button type="submit" loading={saving}>Save store profile</Button>
      </form>
      <section className="border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-xl">Verification documents</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">Private files. Only you and administrators can open them.</p>
        {application.data.documents.length ? (
          <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
            {application.data.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{document.originalName}</p>
                  <p className="text-[11px] text-muted">{document.docType.replaceAll('_', ' ')} · {formatDate(document.uploadedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={document.status} />
                  <a href={`/api/seller/documents/${document.id}/file`} target="_blank" rel="noreferrer" className="text-[11px] text-forest underline underline-offset-2">Open</a>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-muted">No documents uploaded.</p>}
        <form onSubmit={upload} className="mt-5 grid gap-3 sm:grid-cols-[0.45fr_1fr_auto] sm:items-end">
          <Field label="Document type">
            <Select value={docType} onChange={(event) => setDocType(event.target.value)}>
              <option value="id_proof">Identity proof</option>
              <option value="business_registration">Business registration</option>
              <option value="gst_certificate">GST certificate</option>
              <option value="fssai">FSSAI registration</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="File"><Input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png" required /></Field>
          <Button type="submit" variant="secondary" loading={uploading}>Upload</Button>
        </form>
      </section>
      <div className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
        <p className="font-medium text-ink">Commission on file</p>
        <p className="mt-1">{application.data.commissionNote}</p>
        <p className="mt-2">Contact support if your business details, ownership or registrations change. Suspension can follow inaccurate verification information.</p>
      </div>
    </div>
  );
}
