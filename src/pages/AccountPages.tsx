import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address, CartView, OrderView } from '@shared/types';
import { formatINR } from '@shared/types';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { formatDate, formatDateTime, orderStatusLabel, statusTone } from '@/lib/format';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
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

const ACCOUNT_TABS = [
  { label: 'Overview', to: '/account', end: true },
  { label: 'Orders', to: '/account/orders' },
  { label: 'Returns & requests', to: '/account/requests' },
  { label: 'Addresses', to: '/account/addresses' },
  { label: 'Saved items', to: '/account/wishlist' },
  { label: 'Notifications', to: '/account/notifications' },
  { label: 'Profile & security', to: '/account/profile' },
];

export function AccountLayout() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="flex flex-col gap-2 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="mt-2 text-3xl sm:text-4xl">{user?.fullName || 'Customer account'}</h1>
          <p className="mt-1 text-xs text-muted">{user?.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted">
          {user?.emailVerified ? <Badge tone="forest">Email confirmed</Badge> : <Badge tone="terra">Email not confirmed</Badge>}
          {user?.roles.includes('seller') ? <Badge tone="sand">Seller account</Badge> : null}
          {user?.roles.includes('admin') ? <Badge tone="sand">Administrator</Badge> : null}
        </div>
      </div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[210px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Account sections">
          {ACCOUNT_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-2.5 text-left text-[13px] transition-colors lg:border-b-0 lg:border-l-2 ${
                  isActive
                    ? 'border-forest font-medium text-forest'
                    : 'border-transparent text-muted hover:border-sand hover:text-ink'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  );
}

interface AccountOverview {
  profile: {
    fullName: string;
    email: string;
    phone: string | null;
    marketingConsent: boolean;
    emailVerified: boolean;
    deletionRequestedAt: string | null;
    roles: string[];
  };
  counts: { orders: number; wishlist: number; addresses: number; returns: number };
}

export function AccountOverviewPage() {
  const overview = useQuery({
    queryKey: ['account'],
    queryFn: () => api<AccountOverview>('/account'),
  });
  const orders = useQuery({
    queryKey: ['account-orders', 1],
    queryFn: () => api<{ items: { orderNumber: string; status: string; totalPaise: number; placedAt: string; itemCount: number; title: string }[] }>('/account/orders?page=1'),
  });

  if (overview.isLoading) return <LoadingBlock rows={3} />;
  if (overview.isError || !overview.data) return <ErrorState onRetry={() => void overview.refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="At a glance" title="Your account" lede="Orders, saved items and support requests in one place." />
      {overview.data.profile.deletionRequestedAt ? (
        <Alert tone="warning" title="Deletion request recorded">
          Requested {formatDate(overview.data.profile.deletionRequestedAt)}. The team will review it against record-retention
          obligations before deleting anything.
        </Alert>
      ) : null}
      {!overview.data.profile.emailVerified ? (
        <Alert tone="warning" title="Confirm your email address">
          Your email is not confirmed. Order updates and account recovery depend on it. Sign out and use the confirmation
          link, or ask support for a new one.
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={overview.data.counts.orders} />
        <Stat label="Saved items" value={overview.data.counts.wishlist} />
        <Stat label="Addresses" value={overview.data.counts.addresses} />
        <Stat label="Requests" value={overview.data.counts.returns} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg">Recent orders</h2>
            <Link to="/account/orders" className="text-[11px] text-muted underline underline-offset-2 hover:text-forest">View all</Link>
          </div>
          {orders.data?.items.length ? (
            <ul className="divide-y divide-line">
              {orders.data.items.slice(0, 4).map((order) => (
                <li key={order.orderNumber}>
                  <Link to={`/account/orders/${order.orderNumber}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-paper/60">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-forest">{order.orderNumber}</p>
                      <p className="truncate text-[11.5px] text-muted">{order.title} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {formatDate(order.placedAt)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm">{formatINR(order.totalPaise)}</p>
                      <span className={`mt-1 inline-flex border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] ${statusTone(order.status)}`}>
                        {orderStatusLabel(order.status)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5 text-sm text-muted">No orders yet. <Link to="/shop" className="link-underline text-forest">Browse the catalogue.</Link></div>
          )}
        </section>
        <section className="border border-line bg-surface p-5">
          <h2 className="text-lg">Account details</h2>
          <dl className="mt-4 space-y-3 text-[12.5px]">
            <div className="flex justify-between gap-4"><dt className="text-muted">Name</dt><dd className="text-right text-ink">{overview.data.profile.fullName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd className="break-all text-right text-ink">{overview.data.profile.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Phone</dt><dd className="text-right text-ink">{overview.data.profile.phone ?? 'Not added'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Marketing email</dt><dd className="text-right text-ink">{overview.data.profile.marketingConsent ? 'Opted in' : 'Not opted in'}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton to="/account/profile" size="sm" variant="secondary">Edit profile</LinkButton>
            <LinkButton to="/account/addresses" size="sm" variant="ghost">Manage addresses</LinkButton>
          </div>
        </section>
      </div>
    </div>
  );
}

interface OrderListRow {
  id: string;
  orderNumber: string;
  status: string;
  totalPaise: number;
  placedAt: string;
  paidAt: string | null;
  itemCount: number;
  title: string;
  imageUrl: string | null;
  sellerCount: number;
  shipmentStatus: string | null;
}

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ['account-orders', page],
    queryFn: () => api<{ items: OrderListRow[]; page: number; totalPages: number; total: number }>(`/account/orders?page=${page}`),
  });

  return (
    <div>
      <PageHeader eyebrow="Purchases" title="Orders" lede="Each order can contain shipments from more than one seller. Tracking is shown per shipment." />
      <div className="mt-7">
        {orders.isLoading ? <LoadingBlock rows={4} /> : null}
        {orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : null}
        {orders.data?.items.length === 0 ? (
          <EmptyState title="No orders yet" body="When you place an order it will appear here with its seller shipments and tracking." action={<LinkButton to="/shop">Browse the shop</LinkButton>} />
        ) : null}
        {orders.data?.items.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {orders.data.items.map((order) => (
              <li key={order.id}>
                <Link to={`/account/orders/${order.orderNumber}`} className="grid gap-4 py-5 hover:bg-surface/70 sm:grid-cols-[80px_1fr_auto] sm:items-center">
                  <div className="h-20 w-20 overflow-hidden bg-sand/40">
                    {order.imageUrl ? <img src={order.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-forest">{order.orderNumber}</p>
                      <StatusBadge status={order.status} label={orderStatusLabel(order.status)} />
                      {order.shipmentStatus ? <Badge tone="sand">{order.shipmentStatus.replaceAll('_', ' ')}</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-ink">{order.title}</p>
                    <p className="mt-1 text-[11.5px] text-muted">
                      {formatDate(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {order.sellerCount} seller shipment{order.sellerCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm font-medium">{formatINR(order.totalPaise)}</p>
                    <span className="mt-1 inline-block text-[11px] text-forest underline underline-offset-2">View order</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {orders.data ? <Pagination page={page} totalPages={orders.data.totalPages} onChange={setPage} /> : null}
      </div>
    </div>
  );
}

const CANCEL_REASONS = [
  'Ordered the wrong item',
  'Found it cheaper elsewhere',
  'Delivery is taking too long',
  'Changed my mind',
  'Other reason',
];

const RETURN_REASONS = [
  'Item arrived damaged',
  'Wrong item received',
  'Item does not match the description',
  'Missing parts or quantity',
  'Quality not as expected',
  'Other reason',
];

export function OrderDetailPage() {
  const { orderNumber = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [cancelSeller, setCancelSeller] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelNote, setCancelNote] = useState('');
  const [returnSeller, setReturnSeller] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnNote, setReturnNote] = useState('');
  const [reviewItem, setReviewItem] = useState<{ id: string; name: string } | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [busy, setBusy] = useState(false);

  const order = useQuery({
    queryKey: ['account-order', orderNumber],
    queryFn: () => api<{ order: OrderView }>(`/account/orders/${encodeURIComponent(orderNumber)}`),
    enabled: Boolean(orderNumber),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['account-order', orderNumber] });
    await queryClient.invalidateQueries({ queryKey: ['account-orders'] });
    await queryClient.invalidateQueries({ queryKey: ['account'] });
  };

  const submitCancel = async () => {
    if (!cancelSeller) return;
    const reason = `${cancelReason}${cancelNote.trim() ? ` — ${cancelNote.trim()}` : ''}`;
    if (reason.trim().length < 10) {
      toast.push('Add a little more detail (at least 10 characters).', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/account/orders/${encodeURIComponent(orderNumber)}/cancel`, {
        method: 'POST',
        body: { sellerOrderId: cancelSeller, reason },
      });
      setCancelSeller(null);
      setCancelNote('');
      toast.push('Cancellation request recorded. The seller shipment has been cancelled where eligible.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitReturn = async () => {
    if (!returnSeller) return;
    setBusy(true);
    try {
      await api(`/account/orders/${encodeURIComponent(orderNumber)}/returns`, {
        method: 'POST',
        body: { sellerOrderId: returnSeller, reason: returnReason, description: returnNote || undefined },
      });
      setReturnSeller(null);
      setReturnNote('');
      toast.push('Return request submitted for review.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async () => {
    if (!reviewItem) return;
    if (reviewBody.trim().length < 20) {
      toast.push('Write at least 20 characters.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/account/reviews', {
        method: 'POST',
        body: { orderItemId: reviewItem.id, rating, title: reviewTitle || undefined, body: reviewBody },
      });
      setReviewItem(null);
      setReviewTitle('');
      setReviewBody('');
      toast.push('Review submitted with a verified-purchase marker.');
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (order.isLoading) return <LoadingBlock rows={4} />;
  if (order.isError || !order.data) return <ErrorState title="Order not found" body="The order may belong to another account or may not exist." onRetry={() => void order.refetch()} />;

  const data = order.data.order;
  return (
    <div className="space-y-7">
      <Breadcrumbs items={[{ label: 'Account', to: '/account' }, { label: 'Orders', to: '/account/orders' }, { label: data.orderNumber }]} />
      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Order</p>
          <h1 className="mt-2 text-3xl">{data.orderNumber}</h1>
          <p className="mt-1 text-xs text-muted">Placed {formatDateTime(data.placedAt)} · {data.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} label={orderStatusLabel(data.status)} />
          {data.payment ? <Badge tone={data.payment.status === 'paid' ? 'forest' : 'sand'}>Payment: {data.payment.status}</Badge> : null}
          {data.status === 'pending_payment' ? (
            <LinkButton to={`/checkout?resume=${encodeURIComponent(data.orderNumber)}`} size="sm">Complete payment</LinkButton>
          ) : null}
        </div>
      </div>

      {data.isDemo ? (
        <Alert tone="warning" title="DEMO ORDER — NOT A REAL PURCHASE">
          This order was placed in simulated checkout mode for development and testing. No payment was charged, and no real items will be shipped.
        </Alert>
      ) : null}

      {data.status === 'pending_payment' && data.reservationExpiresAt ? (
        <Alert tone="warning" title="Payment is still pending">
          Stock is reserved until {formatDateTime(data.reservationExpiresAt)}. If the reservation expires, the order is
          released and stock returns to the seller.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          {data.sellerOrders.map((sellerOrder) => (
            <section key={sellerOrder.id} className="border border-line bg-surface">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Seller shipment</p>
                  <h2 className="mt-1 font-serif text-xl text-forest">{sellerOrder.sellerName}</h2>
                  <p className="text-[11px] text-muted">{sellerOrder.reference}</p>
                </div>
                <StatusBadge status={sellerOrder.status} />
              </div>
              <ul className="divide-y divide-line">
                {sellerOrder.items.map((item) => (
                  <li key={item.id} className="flex gap-4 px-5 py-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden bg-sand/40">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{item.name}</p>
                      <p className="text-[11px] text-muted">SKU {item.sku} · Qty {item.quantity} · {formatINR(item.unitPricePaise)} each</p>
                      <p className="mt-1 text-xs">{formatINR(item.lineSubtotalPaise)}</p>
                    </div>
                    <div className="shrink-0">
                      {item.canReview ? (
                        <Button size="sm" variant="secondary" onClick={() => setReviewItem({ id: item.id, name: item.name })}>Write review</Button>
                      ) : item.reviewed ? (
                        <Badge tone="forest">Reviewed</Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-4 text-[12px]">
                <div className="flex justify-between py-0.5"><span className="text-muted">Product value</span><span>{formatINR(sellerOrder.subtotalPaise)}</span></div>
                {sellerOrder.discountPaise > 0 ? <div className="flex justify-between py-0.5"><span className="text-muted">Discount</span><span>−{formatINR(sellerOrder.discountPaise)}</span></div> : null}
                <div className="flex justify-between py-0.5"><span className="text-muted">Shipping</span><span>{sellerOrder.shippingPaise ? formatINR(sellerOrder.shippingPaise) : 'Free'}</span></div>
                {sellerOrder.taxPaise > 0 ? <div className="flex justify-between py-0.5"><span className="text-muted">Tax included</span><span>{formatINR(sellerOrder.taxPaise)}</span></div> : null}
                <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium"><span>Shipment total</span><span>{formatINR(sellerOrder.totalPaise)}</span></div>
              </div>
              {sellerOrder.shipment ? (
                <div className="border-t border-line bg-paper/50 px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Tracking</p>
                  <p className="mt-1 text-sm text-ink">
                    {sellerOrder.shipment.carrier} · {sellerOrder.shipment.trackingNumber}
                  </p>
                  <p className="text-[11px] text-muted">Shipped {formatDate(sellerOrder.shipment.shippedAt)}{sellerOrder.shipment.deliveredAt ? ` · Delivered ${formatDate(sellerOrder.shipment.deliveredAt)}` : ''}</p>
                  {sellerOrder.shipment.trackingUrl ? (
                    <a href={sellerOrder.shipment.trackingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-forest underline underline-offset-2">
                      Open carrier tracking
                    </a>
                  ) : null}
                  {sellerOrder.shipment.events.length ? (
                    <ol className="mt-3 space-y-1.5 text-[11.5px] text-muted">
                      {sellerOrder.shipment.events.map((event, index) => (
                        <li key={`${event.status}-${index}`}>{formatDate(event.occurredAt)} · {event.status.replaceAll('_', ' ')}{event.description ? ` — ${event.description}` : ''}</li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
                {data.canCancel && ['pending', 'confirmed'].includes(sellerOrder.status) ? (
                  <Button size="sm" variant="secondary" onClick={() => setCancelSeller(sellerOrder.id)}>Cancel shipment</Button>
                ) : null}
                {data.canRequestReturn && sellerOrder.status === 'delivered' ? (
                  <Button size="sm" variant="secondary" onClick={() => setReturnSeller(sellerOrder.id)}>Request return</Button>
                ) : null}
                {!data.canCancel && !data.canRequestReturn ? <span className="text-[11px] text-muted">No actions available for this shipment.</span> : null}
              </div>
            </section>
          ))}
        </div>
        <aside className="space-y-5">
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Payment summary</h2>
            <dl className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex justify-between gap-4"><dt className="text-muted">Product value</dt><dd>{formatINR(data.subtotalPaise)}</dd></div>
              {data.discountPaise > 0 ? <div className="flex justify-between gap-4"><dt className="text-muted">Discount {data.couponCode ? `(${data.couponCode})` : ''}</dt><dd>−{formatINR(data.discountPaise)}</dd></div> : null}
              <div className="flex justify-between gap-4"><dt className="text-muted">Shipping</dt><dd>{data.shippingPaise ? formatINR(data.shippingPaise) : 'Free'}</dd></div>
              {data.taxPaise > 0 ? <div className="flex justify-between gap-4"><dt className="text-muted">Tax included</dt><dd>{formatINR(data.taxPaise)}</dd></div> : null}
              <div className="flex justify-between gap-4 border-t border-line pt-2 font-medium"><dt>Total</dt><dd>{formatINR(data.totalPaise)}</dd></div>
            </dl>
            {data.payment ? (
              <p className="mt-3 break-all text-[10.5px] text-muted">
                {data.payment.provider} · {data.payment.status}{data.payment.providerPaymentId ? ` · ${data.payment.providerPaymentId}` : ''}
              </p>
            ) : null}
          </section>
          <section className="border border-line bg-surface p-5">
            <h2 className="text-lg">Delivery address</h2>
            <address className="mt-3 text-[12.5px] not-italic leading-relaxed text-ink/75">
              {data.shippingAddress.fullName}<br />
              {data.shippingAddress.line1}<br />
              {data.shippingAddress.line2 ? <>{data.shippingAddress.line2}<br /></> : null}
              {data.shippingAddress.city}, {data.shippingAddress.state} {data.shippingAddress.pincode}<br />
              {data.shippingAddress.phone}
            </address>
          </section>
          <div className="border border-line bg-paper p-5 text-[11.5px] leading-relaxed text-muted">
            <p className="font-medium text-ink">Need help with this order?</p>
            <p className="mt-1">Use the contact form and include {data.orderNumber}. Do not send card or bank credentials.</p>
            <Link to="/contact" className="mt-2 inline-block text-forest underline underline-offset-2">Contact support</Link>
          </div>
        </aside>
      </div>

      <Modal
        open={Boolean(cancelSeller)}
        onClose={() => setCancelSeller(null)}
        title="Cancel this seller shipment"
        footer={<><Button variant="ghost" onClick={() => setCancelSeller(null)}>Keep order</Button><Button variant="danger" loading={busy} onClick={submitCancel}>Request cancellation</Button></>}
      >
        <div className="space-y-4">
          <Alert tone="warning">Cancellation is only possible before dispatch. Refund timing depends on the original payment method and is shown after review.</Alert>
          <Field label="Reason" required>
            <Select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>
              {CANCEL_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </Select>
          </Field>
          <Field label="More detail" hint="Optional">
            <Textarea rows={3} value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(returnSeller)}
        onClose={() => setReturnSeller(null)}
        title="Request a return"
        footer={<><Button variant="ghost" onClick={() => setReturnSeller(null)}>Close</Button><Button loading={busy} onClick={submitReturn}>Submit return request</Button></>}
      >
        <div className="space-y-4">
          <Alert tone="info">Returns are reviewed manually. Perishable food and personalised items are only eligible when damaged or incorrect.</Alert>
          <Field label="Reason" required>
            <Select value={returnReason} onChange={(event) => setReturnReason(event.target.value)}>
              {RETURN_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </Select>
          </Field>
          <Field label="Describe the issue" hint="Optional">
            <Textarea rows={4} value={returnNote} onChange={(event) => setReturnNote(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(reviewItem)}
        onClose={() => setReviewItem(null)}
        title={reviewItem ? `Review ${reviewItem.name}` : 'Review'}
        footer={<><Button variant="ghost" onClick={() => setReviewItem(null)}>Cancel</Button><Button loading={busy} onClick={submitReview}>Publish review</Button></>}
      >
        <div className="space-y-4">
          <p className="text-[12px] leading-relaxed text-muted">Only delivered purchases can be reviewed. The review is attached to your order item and shown with a verified-purchase marker.</p>
          <Field label="Rating" required>
            <Select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
              {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? '' : 's'}</option>)}
            </Select>
          </Field>
          <Field label="Headline" hint="Optional">
            <Input maxLength={120} value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} />
          </Field>
          <Field label="Your review" required hint="At least 20 characters">
            <Textarea rows={5} minLength={20} maxLength={2000} value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

const EMPTY_ADDRESS = {
  label: 'Home',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: 'Himachal Pradesh',
  pincode: '',
  isDefault: false,
};

export function AddressesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api<{ addresses: Address[] }>('/account/addresses'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['addresses'] });

  const openNew = () => {
    setForm({ ...EMPTY_ADDRESS, fullName: '', isDefault: (addresses.data?.addresses.length ?? 0) === 0 });
    setFields({});
    setEditing('new');
  };

  const openEdit = (address: Address) => {
    setForm({
      label: address.label,
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      isDefault: address.isDefault,
    });
    setFields({});
    setEditing(address.id);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFields({});
    try {
      if (editing === 'new') {
        await api('/account/addresses', { method: 'POST', body: form });
      } else {
        await api(`/account/addresses/${editing}`, { method: 'PATCH', body: form });
      }
      await refresh();
      setEditing(null);
      toast.push('Address saved.');
    } catch (error) {
      setFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this address?')) return;
    try {
      await api(`/account/addresses/${id}`, { method: 'DELETE' });
      await refresh();
      toast.push('Address deleted.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const makeDefault = async (id: string) => {
    try {
      await api(`/account/addresses/${id}/default`, { method: 'POST' });
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Delivery"
        title="Saved addresses"
        lede="Addresses are used at checkout. The default address is preselected."
        actions={<Button onClick={openNew}>Add address</Button>}
      />
      <div className="mt-7">
        {addresses.isLoading ? <LoadingBlock rows={2} /> : null}
        {addresses.isError ? <ErrorState onRetry={() => void addresses.refetch()} /> : null}
        {addresses.data?.addresses.length === 0 ? (
          <EmptyState title="No saved addresses" body="Add one now, or add it during checkout." action={<Button onClick={openNew}>Add address</Button>} />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.data?.addresses.map((address) => (
            <article key={address.id} className="border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{address.label}</p>
                  <h2 className="mt-1 font-serif text-lg text-forest">{address.fullName}</h2>
                </div>
                {address.isDefault ? <Badge tone="forest">Default</Badge> : null}
              </div>
              <address className="mt-3 text-[12.5px] not-italic leading-relaxed text-ink/70">
                {address.line1}{address.line2 ? <><br />{address.line2}</> : null}<br />
                {address.city}, {address.state} {address.pincode}<br />
                {address.phone}
              </address>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(address)}>Edit</Button>
                {!address.isDefault ? <Button size="sm" variant="ghost" onClick={() => void makeDefault(address.id)}>Make default</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => void remove(address.id)}>Delete</Button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add an address' : 'Edit address'} wide>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label"><Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></Field>
            <Field label="Full name" required error={fields.fullName}><Input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" /></Field>
            <Field label="Mobile number" required error={fields.phone}><Input required inputMode="numeric" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} autoComplete="tel" /></Field>
            <Field label="PIN code" required error={fields.pincode}><Input required inputMode="numeric" value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} autoComplete="postal-code" /></Field>
            <Field label="Address line 1" required className="sm:col-span-2" error={fields.line1}><Input required value={form.line1} onChange={(event) => setForm({ ...form, line1: event.target.value })} autoComplete="address-line1" /></Field>
            <Field label="Address line 2" className="sm:col-span-2"><Input value={form.line2} onChange={(event) => setForm({ ...form, line2: event.target.value })} autoComplete="address-line2" /></Field>
            <Field label="City or town" required error={fields.city}><Input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} autoComplete="address-level2" /></Field>
            <Field label="State" required error={fields.state}><Input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} autoComplete="address-level1" /></Field>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-muted">
            <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} className="accent-forest" />
            Use as my default delivery address
          </label>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save address</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

interface WishlistItem {
  productId: string;
  slug: string;
  name: string;
  pricePaise: number;
  imageUrl: string | null;
  imageAlt: string | null;
  sellerName: string;
  stock: number;
  available: boolean;
}

export function WishlistPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const wishlist = useQuery({
    queryKey: ['wishlist'],
    queryFn: () => api<{ items: WishlistItem[] }>('/account/wishlist'),
  });

  const remove = async (productId: string) => {
    try {
      await api(`/account/wishlist/${productId}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.push('Removed from saved items.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const addToBag = async (productId: string) => {
    try {
      const result = await api<{ cart: CartView }>('/cart/items', { method: 'POST', body: { productId, quantity: 1 } });
      queryClient.setQueryData(['cart'], result);
      toast.push('Added to your bag.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Saved for later" title="Your saved items" lede="Saved items do not reserve stock. Add them to the bag when you are ready." />
      <div className="mt-7">
        {wishlist.isLoading ? <LoadingBlock rows={2} /> : null}
        {wishlist.isError ? <ErrorState onRetry={() => void wishlist.refetch()} /> : null}
        {wishlist.data?.items.length === 0 ? (
          <EmptyState title="Nothing saved yet" body="Use the save control on a product page to keep it here." action={<LinkButton to="/shop">Browse the shop</LinkButton>} />
        ) : null}
        <ul className="divide-y divide-line border-y border-line">
          {wishlist.data?.items.map((item) => (
            <li key={item.productId} className="grid gap-4 py-5 sm:grid-cols-[80px_1fr_auto] sm:items-center">
              <Link to={`/shop/${item.slug}`} className="h-20 w-20 overflow-hidden bg-sand/40">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.imageAlt ?? item.name} className="h-full w-full object-cover" /> : null}
              </Link>
              <div>
                <p className="text-[10.5px] uppercase tracking-[0.13em] text-muted">{item.sellerName}</p>
                <Link to={`/shop/${item.slug}`} className="font-serif text-lg text-forest hover:text-terra">{item.name}</Link>
                <p className="mt-1 text-xs">{formatINR(item.pricePaise)} · {item.available ? 'In stock' : 'Unavailable'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!item.available} onClick={() => void addToBag(item.productId)}>Add to bag</Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(item.productId)}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface RequestsResponse {
  returns: { id: string; orderNumber: string; sellerName: string; reason: string; status: string; createdAt: string }[];
  cancellations: { id: string; orderNumber: string; reason: string; status: string; resolutionNote: string | null; createdAt: string }[];
}

export function RequestsPage() {
  const requests = useQuery({ queryKey: ['account-requests'], queryFn: () => api<RequestsResponse>('/account/requests') });
  return (
    <div>
      <PageHeader eyebrow="After-sales" title="Returns & cancellation requests" lede="Requests are reviewed by the marketplace team. A request is not an approved refund." />
      <div className="mt-7 space-y-8">
        {requests.isLoading ? <LoadingBlock rows={3} /> : null}
        {requests.isError ? <ErrorState onRetry={() => void requests.refetch()} /> : null}
        <section>
          <h2 className="mb-3 text-xl">Returns</h2>
          {requests.data?.returns.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {requests.data.returns.map((request) => (
                <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div>
                    <p className="text-[13px] font-medium text-forest">{request.orderNumber} · {request.sellerName}</p>
                    <p className="mt-1 text-[12px] text-ink/70">{request.reason}</p>
                    <p className="text-[11px] text-muted">{formatDate(request.createdAt)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          ) : <p className="border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No return requests.</p>}
        </section>
        <section>
          <h2 className="mb-3 text-xl">Cancellations</h2>
          {requests.data?.cancellations.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {requests.data.cancellations.map((request) => (
                <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div>
                    <p className="text-[13px] font-medium text-forest">{request.orderNumber}</p>
                    <p className="mt-1 text-[12px] text-ink/70">{request.reason}</p>
                    {request.resolutionNote ? <p className="mt-1 text-[11px] text-muted">Resolution: {request.resolutionNote}</p> : null}
                    <p className="text-[11px] text-muted">{formatDate(request.createdAt)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          ) : <p className="border border-dashed border-sand px-4 py-8 text-center text-sm text-muted">No cancellation requests.</p>}
        </section>
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ notifications: { id: string; type: string; subject: string; status: string; createdAt: string; sentAt: string | null }[] }>('/account/notifications'),
  });
  return (
    <div>
      <PageHeader
        eyebrow="Account activity"
        title="Notifications"
        lede="A record of messages generated for your account. When SMTP is not configured, entries are stored with a skipped status and no email is sent."
      />
      <div className="mt-7">
        {notifications.isLoading ? <LoadingBlock rows={3} /> : null}
        {notifications.isError ? <ErrorState onRetry={() => void notifications.refetch()} /> : null}
        {notifications.data?.notifications.length === 0 ? (
          <EmptyState title="No notifications yet" body="Order and account notifications will be listed here." />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {notifications.data?.notifications.map((notification) => (
              <li key={notification.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-[13px] text-ink">{notification.subject}</p>
                  <p className="mt-1 text-[11px] text-muted">{notification.type.replaceAll('_', ' ')} · {formatDateTime(notification.createdAt)}</p>
                </div>
                <Badge tone={notification.status === 'sent' ? 'forest' : notification.status === 'failed' ? 'terra' : 'sand'}>{notification.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const account = useQuery({ queryKey: ['account'], queryFn: () => api<AccountOverview>('/account') });
  const [profile, setProfile] = useState({ fullName: '', phone: '', marketingConsent: false });
  const [profileFields, setProfileFields] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordFields, setPasswordFields] = useState<Record<string, string>>({});
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [showDeletion, setShowDeletion] = useState(false);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  // React's documented pattern for adjusting editable state when fetched data
  // arrives. Guarded by the account email so it runs once per loaded profile.
  if (account.data && prefilledFor !== account.data.profile.email) {
    setPrefilledFor(account.data.profile.email);
    setProfile({
      fullName: account.data.profile.fullName,
      phone: account.data.profile.phone ?? '',
      marketingConsent: account.data.profile.marketingConsent,
    });
  }

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileFields({});
    try {
      await api('/account', { method: 'PATCH', body: { fullName: profile.fullName, phone: profile.phone, marketingConsent: profile.marketingConsent } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['account'] }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
      await refresh();
      toast.push('Profile updated.');
    } catch (error) {
      setProfileFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirm) {
      toast.push('The two passwords do not match.', 'error');
      return;
    }
    setSavingPassword(true);
    setPasswordFields({});
    try {
      await api('/account/password', {
        method: 'POST',
        body: { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword },
      });
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      toast.push('Password updated. Other sessions were signed out.');
    } catch (error) {
      setPasswordFields(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const requestDeletion = async () => {
    try {
      const result = await api<{ message: string }>('/account/deletion-request', { method: 'POST', body: { reason: deletionReason || undefined } });
      toast.push(result.message);
      setShowDeletion(false);
      await queryClient.invalidateQueries({ queryKey: ['account'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  if (account.isLoading) return <LoadingBlock rows={3} />;
  if (account.isError || !account.data) return <ErrorState onRetry={() => void account.refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Account" title="Profile & security" lede="Keep your contact details current. Order records and statutory obligations may limit account erasure." />
      {!user?.emailVerified ? <Alert tone="warning" title="Email not confirmed">Confirm your email address to secure account recovery.</Alert> : null}
      <section className="border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-xl">Contact details</h2>
        <form onSubmit={saveProfile} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={profileFields.fullName}>
              <Input required value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} autoComplete="name" />
            </Field>
            <Field label="Email address" hint="Contact support to change">
              <Input value={account.data.profile.email} disabled />
            </Field>
            <Field label="Mobile number" hint="10 digits, optional" error={profileFields.phone}>
              <Input inputMode="numeric" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} autoComplete="tel" />
            </Field>
          </div>
          <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-muted">
            <input type="checkbox" checked={profile.marketingConsent} onChange={(event) => setProfile({ ...profile, marketingConsent: event.target.checked })} className="mt-0.5 accent-forest" />
            Send me occasional notes about new makers and seasonal stock. I can unsubscribe at any time.
          </label>
          <Button type="submit" loading={savingProfile}>Save changes</Button>
        </form>
      </section>
      <section className="border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-xl">Change password</h2>
        <p className="mt-1 text-xs text-muted">Changing your password signs out every other session.</p>
        <form onSubmit={savePassword} className="mt-5 space-y-4">
          <Field label="Current password" required error={passwordFields.currentPassword}>
            <Input type="password" required autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" required hint="10+ characters, letters and numbers" error={passwordFields.newPassword}>
              <Input type="password" required minLength={10} autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} />
            </Field>
            <Field label="Repeat new password" required>
              <Input type="password" required autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" loading={savingPassword}>Update password</Button>
        </form>
      </section>
      <section className="border border-terra/30 bg-[#fff8f4] p-5 sm:p-6">
        <h2 className="text-xl text-[#7d3d28]">Account deletion</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#7d3d28]/80">
          A request is reviewed before anything is deleted because order, tax, dispute and fraud-prevention records may need
          to be retained. Submitting this form does not immediately close the account.
        </p>
        {account.data.profile.deletionRequestedAt ? (
          <p className="mt-3 text-[12px] font-medium text-[#7d3d28]">Request recorded {formatDate(account.data.profile.deletionRequestedAt)}.</p>
        ) : (
          <Button className="mt-4" variant="danger" onClick={() => setShowDeletion(true)}>Request account deletion</Button>
        )}
      </section>
      <Modal
        open={showDeletion}
        onClose={() => setShowDeletion(false)}
        title="Request account deletion"
        footer={<><Button variant="ghost" onClick={() => setShowDeletion(false)}>Cancel</Button><Button variant="danger" onClick={() => void requestDeletion()}>Record request</Button></>}
      >
        <div className="space-y-4">
          <Alert tone="warning">This creates a review request, not an immediate deletion.</Alert>
          <Field label="Reason" hint="Optional">
            <Textarea rows={4} value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} maxLength={1000} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
