import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FULFILMENT_METHOD_LABELS,
  FULFILMENT_STATUS_LABELS,
  type FulfilmentMethod,
  type OrderFulfilmentView,
  type SellerPickupLocation,
} from '@shared/types';
import { safeExternalUrl } from '@shared/urls';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateTime, humanise } from '@/lib/format';
import { AdminMetric, AdminPage, AdminSection } from '@/components/admin';
import { Alert, Badge, Button, EmptyState, ErrorState, Field, Input, LoadingBlock, Modal, PageHeader } from '@/components/ui';

type FilterTab =
  | 'all'
  | 'shiprocket'
  | 'own_delivery'
  | 'external_supplier'
  | 'pending_sync'
  | 'failed_sync'
  | 'awaiting_pickup'
  | 'in_transit'
  | 'delivered';

interface ShippingOverviewRes {
  counts: Record<FilterTab | 'flagged_review' | 'unverified_pickups', number>;
  shiprocketConfigured: boolean;
  webhookConfigured: boolean;
}

interface PickupAdminRow extends SellerPickupLocation {
  sellerName: string;
}

interface WebhookLogRow {
  id: string;
  provider: string;
  eventKey: string | null;
  awbCode: string | null;
  shiprocketShipmentId: number | null;
  shiprocketOrderId: number | null;
  fulfilmentId: string | null;
  rawStatus: string | null;
  mappedStatus: string | null;
  outcome: string;
  note: string | null;
  receivedAt: string;
}

export function AdminShippingPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [sectionTab, setSectionTab] = useState<'fulfilments' | 'pickups' | 'webhooks'>('fulfilments');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [extEdit, setExtEdit] = useState<OrderFulfilmentView | null>(null);
  const [extRef, setExtRef] = useState('');
  const [extCourier, setExtCourier] = useState('');
  const [extTracking, setExtTracking] = useState('');
  const [extUrl, setExtUrl] = useState('');
  const [extExceptionType, setExtExceptionType] = useState<'supplier_out_of_stock' | 'supplier_price_increased' | 'supplier_delayed'>('supplier_price_increased');
  const [extNewCostRupees, setExtNewCostRupees] = useState('');
  const [extNote, setExtNote] = useState('');

  const overview = useQuery({
    queryKey: ['admin-shipping-overview'],
    queryFn: () => api<ShippingOverviewRes>('/admin/shipping/overview'),
  });

  const fulfilments = useQuery({
    queryKey: ['admin-shipping-fulfilments', filter, deferredSearch, page],
    queryFn: () =>
      api<{ fulfilments: OrderFulfilmentView[]; page: number; total: number; totalPages: number }>(
        `/admin/shipping/fulfilments?filter=${encodeURIComponent(filter)}&page=${page}&pageSize=20${
          deferredSearch.trim() ? `&q=${encodeURIComponent(deferredSearch.trim())}` : ''
        }`,
      ),
    enabled: sectionTab === 'fulfilments',
  });

  const pickups = useQuery({
    queryKey: ['admin-shipping-pickups'],
    queryFn: () => api<{ pickupLocations: PickupAdminRow[]; shiprocketConfigured: boolean }>('/admin/shipping/pickup-locations'),
    enabled: sectionTab === 'pickups',
  });

  const webhooks = useQuery({
    queryKey: ['admin-shipping-webhooks'],
    queryFn: () => api<{ logs: WebhookLogRow[] }>('/admin/shipping/webhooks'),
    enabled: sectionTab === 'webhooks',
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-shipping-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-shipping-fulfilments'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-shipping-pickups'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-shipping-webhooks'] }),
    ]);
  };

  const runAction = async (id: string, url: string, body: Record<string, unknown>, message: string) => {
    setBusyId(id);
    try {
      await api(url, { method: 'POST', body });
      toast.push(message);
      await refreshAll();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const counts = overview.data?.counts;
  const filterButtons: Array<{ key: FilterTab; label: string; count?: number }> = [
    { key: 'all', label: 'All', count: counts?.all },
    { key: 'shiprocket', label: 'Shiprocket', count: counts?.shiprocket },
    { key: 'own_delivery', label: 'Own Delivery', count: counts?.own_delivery },
    { key: 'external_supplier', label: 'External Supplier', count: counts?.external_supplier },
    { key: 'pending_sync', label: 'Pending Sync', count: counts?.pending_sync },
    { key: 'failed_sync', label: 'Failed Shiprocket', count: counts?.failed_sync },
    { key: 'awaiting_pickup', label: 'Awaiting Pickup', count: counts?.awaiting_pickup },
    { key: 'in_transit', label: 'In Transit', count: counts?.in_transit },
    { key: 'delivered', label: 'Delivered', count: counts?.delivered },
  ];

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Logistics & Fulfilment"
        title="Shipping Management"
        lede="Inspect product-wise fulfilment routing across Shiprocket, Own Delivery, and External Supplier packages, approve seller pickup locations, and troubleshoot courier webhooks."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetric label="Total Fulfilments" value={String(counts?.all ?? 0)} />
        <AdminMetric
          label="Shiprocket Failed Sync"
          value={String(counts?.failed_sync ?? 0)}
          note={counts?.failed_sync ? 'Requires retry or pickup fix' : 'All synced'}
        />
        <AdminMetric label="Awaiting Pickup" value={String(counts?.awaiting_pickup ?? 0)} />
        <AdminMetric label="Unverified Pickups" value={String(counts?.unverified_pickups ?? 0)} />
      </div>

      {!overview.data?.shiprocketConfigured ? (
        <Alert tone="warning" title="Shiprocket credentials not configured in current environment">
          Automatic Shiprocket order creation will remain queued until `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` are active.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {[
          { key: 'fulfilments' as const, label: 'Order Fulfilments' },
          { key: 'pickups' as const, label: `Seller Pickup Locations (${counts?.unverified_pickups ?? 0} pending)` },
          { key: 'webhooks' as const, label: 'Shiprocket Webhook Logs' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSectionTab(t.key)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              sectionTab === t.key ? 'bg-[#172321] text-white' : 'bg-white border border-line text-ink hover:bg-sand/30'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sectionTab === 'fulfilments' && (
        <AdminSection title="Fulfilment Packages">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {filterButtons.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => {
                    setFilter(btn.key);
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    filter === btn.key
                      ? 'border-[#172321] bg-[#172321] text-white'
                      : 'border-line bg-white text-ink hover:border-forest'
                  }`}
                >
                  {btn.label} {btn.count !== undefined ? `(${btn.count})` : ''}
                </button>
              ))}
            </div>

            <div className="max-w-md">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search order #, seller, AWB, Shiprocket order ID, external ref..."
              />
            </div>

            {fulfilments.isLoading ? <LoadingBlock rows={4} /> : null}
            {fulfilments.isError ? (
              <ErrorState body={errorMessage(fulfilments.error)} onRetry={() => void fulfilments.refetch()} />
            ) : null}
            {!fulfilments.isLoading && !fulfilments.isError && fulfilments.data?.fulfilments.length === 0 ? (
              <EmptyState title="No fulfilment packages match this view" body="Switch filters or wait for confirmed orders." />
            ) : null}

            <div className="space-y-3">
              {fulfilments.data?.fulfilments.map((f) => {
                const safeLabel = safeExternalUrl(f.labelUrl);
                const safeTrack = safeExternalUrl(f.trackingUrl);
                return (
                  <article key={f.id} className="rounded-xl border border-line bg-white p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 pb-2.5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/admin/orders/${f.orderNumber}`}
                            className="font-mono text-sm font-bold text-forest hover:underline"
                          >
                            {f.orderNumber}
                          </Link>
                          <Badge tone="neutral">
                            {FULFILMENT_METHOD_LABELS[f.fulfilmentMethod as FulfilmentMethod] ?? f.fulfilmentMethod}
                          </Badge>
                          <span className="text-xs text-muted">Seller: {f.sellerName}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink">
                          {f.items.map((i) => `${i.name} × ${i.quantity} (${i.sku})`).join(', ')}
                        </p>
                      </div>
                      <Badge
                        tone={
                          f.status === 'delivered'
                            ? 'forest'
                            : f.status === 'sync_failed' || f.status === 'flagged_admin_review'
                              ? 'terra'
                              : 'neutral'
                        }
                      >
                        {FULFILMENT_STATUS_LABELS[f.status] ?? humanise(f.status)}
                      </Badge>
                    </div>

                    <div className="grid gap-3 text-xs sm:grid-cols-4">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-muted">Package Specs</span>
                        <p className="font-medium text-ink">
                          {f.packageWeightG} g · {f.packageLengthCm}×{f.packageBreadthCm}×{f.packageHeightCm} cm
                        </p>
                      </div>
                      {f.fulfilmentMethod === 'SHIPROCKET' ? (
                        <>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">Pickup Address</span>
                            <p className="font-medium text-ink">
                              {f.pickupLocationSummary?.shiprocketLocationName ?? 'Missing'} (
                              {f.pickupLocationSummary?.pincode ?? '—'})
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">Shiprocket Refs</span>
                            <p className="font-mono text-ink">
                              Order: {f.shiprocketOrderId ?? '—'} · Ship: {f.shiprocketShipmentId ?? '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">AWB / Courier</span>
                            <p className="font-mono text-ink">
                              {f.awbCode ?? 'Not assigned'} {f.courierName ? `(${f.courierName})` : ''}
                            </p>
                          </div>
                        </>
                      ) : f.fulfilmentMethod === 'EXTERNAL_SUPPLIER' ? (
                        <>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">Supplier</span>
                            <p className="font-medium text-ink">{f.externalSupplierName ?? 'External Supplier'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">External Order Ref</span>
                            <p className="font-mono text-ink">{f.externalOrderRef ?? 'Pending'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">External Tracking</span>
                            <p className="font-mono text-ink">
                              {f.trackingNumber ?? 'Pending'} {f.courierName ? `(${f.courierName})` : ''}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">Mode</span>
                            <p className="font-medium text-ink">Own Delivery (Shiprocket Bypassed)</p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">Evidence</span>
                            <p className="text-ink">
                              {f.ownDeliveryEvidence?.recipientName || f.ownDeliveryEvidence?.note || 'No evidence yet'}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted">Updated</span>
                            <p className="text-ink">{formatDateTime(f.updatedAt)}</p>
                          </div>
                        </>
                      )}
                    </div>

                    {f.sourcingExceptionType ? (
                      <Alert tone="warning" title={`Sourcing Exception: ${humanise(f.sourcingExceptionType)}`}>
                        {f.sourcingExceptionNewCostPaise ? `Updated supplier cost: ₹${(f.sourcingExceptionNewCostPaise / 100).toFixed(2)}. ` : ''}
                        {f.sourcingExceptionNote ?? 'Review required.'}
                        {f.sourcingExceptionResolvedAction ? ` (Resolved: ${humanise(f.sourcingExceptionResolvedAction)})` : ''}
                      </Alert>
                    ) : null}

                    {f.lastSyncError || f.adminReviewReason ? (
                      <Alert tone="error" title="Sync / Routing Issue">
                        {f.lastSyncError || f.adminReviewReason}
                      </Alert>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {f.fulfilmentMethod === 'SHIPROCKET' &&
                      ['pending_sync', 'sync_failed'].includes(f.status) &&
                      !f.shiprocketOrderId ? (
                        <Button
                          size="sm"
                          loading={busyId === f.id}
                          onClick={() =>
                            void runAction(
                              f.id,
                              `/admin/shipping/fulfilments/${f.id}/retry-sync`,
                              {},
                              'Shiprocket order sync executed.',
                            )
                          }
                        >
                          Retry Shiprocket Sync
                        </Button>
                      ) : null}

                      {f.fulfilmentMethod === 'SHIPROCKET' &&
                      f.shiprocketOrderId &&
                      !f.awbCode &&
                      !['cancelled', 'delivered'].includes(f.status) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busyId === f.id}
                          onClick={() =>
                            void runAction(
                              f.id,
                              `/admin/shipping/fulfilments/${f.id}/ready-to-ship`,
                              {},
                              'Marked Ready to Ship & pickup scheduled.',
                            )
                          }
                        >
                          Schedule Pickup (Ready to Ship)
                        </Button>
                      ) : null}

                      {f.fulfilmentMethod === 'SHIPROCKET' && f.awbCode && !['delivered', 'cancelled'].includes(f.status) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busyId === f.id}
                          onClick={() =>
                            void runAction(
                              f.id,
                              `/admin/shipping/fulfilments/${f.id}/refresh-tracking`,
                              {},
                              'Live Shiprocket tracking updated.',
                            )
                          }
                        >
                          Sync Tracking
                        </Button>
                      ) : null}

                      {f.fulfilmentMethod === 'EXTERNAL_SUPPLIER' && !['delivered', 'cancelled'].includes(f.status) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setExtEdit(f);
                            setExtRef(f.externalOrderRef ?? '');
                            setExtCourier(f.courierName ?? '');
                            setExtTracking(f.trackingNumber ?? '');
                            setExtUrl(f.trackingUrl ?? '');
                            setExtNewCostRupees(
                              f.sourcingExceptionNewCostPaise ? String(Math.round(f.sourcingExceptionNewCostPaise / 100)) : '',
                            );
                            setExtNote(f.sourcingExceptionNote ?? '');
                          }}
                        >
                          Update External Supplier / Tracking
                        </Button>
                      ) : null}

                      {safeLabel ? (
                        <a href={safeLabel} target="_blank" rel="noreferrer" className="text-xs font-semibold text-forest underline">
                          Label ↗
                        </a>
                      ) : null}
                      {safeTrack ? (
                        <a href={safeTrack} target="_blank" rel="noreferrer" className="text-xs font-semibold text-forest underline">
                          Track ↗
                        </a>
                      ) : null}

                      {!['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'].includes(f.status) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-700"
                          loading={busyId === f.id}
                          onClick={() =>
                            void runAction(
                              f.id,
                              `/admin/shipping/fulfilments/${f.id}/cancel`,
                              { reason: 'Cancelled by Admin' },
                              'Package cancelled.',
                            )
                          }
                        >
                          Cancel Package
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </AdminSection>
      )}

      {sectionTab === 'pickups' && (
        <AdminSection title="Seller Shiprocket Pickup Locations">
          {pickups.isLoading ? <LoadingBlock rows={3} /> : null}
          {pickups.data?.pickupLocations.length === 0 ? (
            <EmptyState title="No pickup locations registered" body="Sellers add Shiprocket pickup locations in Seller Studio." />
          ) : null}
          <div className="space-y-3">
            {pickups.data?.pickupLocations.map((loc) => (
              <div
                key={loc.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-ink">{loc.sellerName}</span>
                    <span className="text-xs text-muted">· {loc.nickname}</span>
                    <span className="rounded bg-sand/40 px-2 py-0.5 font-mono text-[10px]">SR: {loc.shiprocketLocationName}</span>
                    <Badge tone={loc.isVerified && loc.isApproved ? 'forest' : 'terra'}>
                      {loc.isVerified && loc.isApproved ? 'Verified & Approved' : 'Pending Verification / Approval'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {loc.contactName} ({loc.phone}) · {loc.line1}
                    {loc.line2 ? `, ${loc.line2}` : ''}, {loc.city}, {loc.state} — {loc.pincode}
                  </p>
                  {loc.verificationNote ? <p className="text-[11px] text-muted">{loc.verificationNote}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {pickups.data?.shiprocketConfigured ? (
                    <Button
                      size="sm"
                      loading={busyId === loc.id}
                      onClick={() =>
                        void runAction(
                          loc.id,
                          `/admin/shipping/pickup-locations/${loc.id}/decision`,
                          { decision: 'verify_shiprocket' },
                          'Verified with Shiprocket & approved.',
                        )
                      }
                    >
                      Verify on Shiprocket
                    </Button>
                  ) : null}
                  {!(loc.isVerified && loc.isApproved) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === loc.id}
                      onClick={() =>
                        void runAction(
                          loc.id,
                          `/admin/shipping/pickup-locations/${loc.id}/decision`,
                          { decision: 'approve' },
                          'Pickup location approved.',
                        )
                      }
                    >
                      Approve
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700"
                      loading={busyId === loc.id}
                      onClick={() =>
                        void runAction(
                          loc.id,
                          `/admin/shipping/pickup-locations/${loc.id}/decision`,
                          { decision: 'reject' },
                          'Pickup approval revoked.',
                        )
                      }
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AdminSection>
      )}

      {sectionTab === 'webhooks' && (
        <AdminSection title="Recent Shiprocket Webhook Events">
          {webhooks.isLoading ? <LoadingBlock rows={3} /> : null}
          {webhooks.data?.logs.length === 0 ? (
            <EmptyState title="No webhooks received yet" body="Incoming courier status updates appear here automatically." />
          ) : null}
          <div className="space-y-2">
            {webhooks.data?.logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-line bg-white p-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={log.outcome === 'processed' ? 'forest' : 'terra'}>{log.outcome}</Badge>
                    <span className="font-mono font-semibold">{log.awbCode ?? `Ship #${log.shiprocketShipmentId ?? '—'}`}</span>
                    <span>
                      {log.rawStatus} → {log.mappedStatus ?? '—'}
                    </span>
                  </div>
                  <span className="text-muted">{formatDateTime(log.receivedAt)}</span>
                </div>
                {log.note ? <p className="text-[11px] text-muted">{log.note}</p> : null}
              </div>
            ))}
          </div>
        </AdminSection>
      )}

      {/* Admin External Supplier Modal */}
      <Modal
        open={Boolean(extEdit)}
        onClose={() => setExtEdit(null)}
        title="Admin: Update External Supplier Fulfilment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExtEdit(null)}>Cancel</Button>
            <Button
              loading={busyId === extEdit?.id}
              onClick={() => {
                if (!extEdit) return;
                const target = extEdit;
                setExtEdit(null);
                if (extTracking.trim() && extCourier.trim()) {
                  void runAction(
                    target.id,
                    `/admin/shipping/fulfilments/${target.id}/external`,
                    {
                      action: 'update_tracking',
                      externalOrderRef: extRef.trim() || undefined,
                      courierName: extCourier.trim(),
                      trackingId: extTracking.trim(),
                      trackingUrl: extUrl.trim() || undefined,
                    },
                    'External supplier tracking saved.',
                  );
                } else {
                  void runAction(
                    target.id,
                    `/admin/shipping/fulfilments/${target.id}/external`,
                    {
                      action: 'place_external_order',
                      externalOrderRef: extRef.trim(),
                    },
                    'External order reference saved.',
                  );
                }
              }}
            >
              Save External Update
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-semibold">White-Label Partner Fulfilment Checklist</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li>Confirm no third-party invoice, supplier slip, or Meesho branding is included in parcel.</li>
              <li>
                Ordered variants:{' '}
                {extEdit?.items.map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} × ${i.quantity}`).join(', ')}
              </li>
            </ul>
          </div>
          <Field label="External Order Reference">
            <Input value={extRef} onChange={(e) => setExtRef(e.target.value)} />
          </Field>
          <Field label="Courier Name">
            <Input value={extCourier} onChange={(e) => setExtCourier(e.target.value)} />
          </Field>
          <Field label="Tracking ID">
            <Input value={extTracking} onChange={(e) => setExtTracking(e.target.value)} />
          </Field>
          <Field label="Tracking URL">
            <Input value={extUrl} onChange={(e) => setExtUrl(e.target.value)} placeholder="https://" />
          </Field>

          <div className="border-t border-line pt-3 space-y-2">
            <p className="text-xs font-semibold text-ink">Supplier Availability / Cost Exception Controls</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Exception Reason">
                <select
                  value={extExceptionType}
                  onChange={(e) => setExtExceptionType(e.target.value as typeof extExceptionType)}
                  className="h-10 w-full rounded border border-line bg-white px-2.5 text-xs"
                >
                  <option value="supplier_price_increased">Supplier Price Increased</option>
                  <option value="supplier_out_of_stock">Supplier Out of Stock</option>
                  <option value="supplier_delayed">Supplier Dispatch Delayed</option>
                </select>
              </Field>
              <Field label="Updated Supplier Cost (₹)">
                <Input
                  inputMode="decimal"
                  value={extNewCostRupees}
                  onChange={(e) => setExtNewCostRupees(e.target.value)}
                  placeholder="Optional updated cost"
                />
              </Field>
            </div>
            <Field label="Exception Note">
              <Input value={extNote} onChange={(e) => setExtNote(e.target.value)} placeholder="Internal audit note" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!extEdit}
                onClick={() => {
                  if (!extEdit) return;
                  const target = extEdit;
                  setExtEdit(null);
                  void runAction(
                    target.id,
                    `/admin/shipping/fulfilments/${target.id}/external`,
                    {
                      action: 'flag_sourcing_exception',
                      exceptionType: extExceptionType,
                      newCostPaise: extNewCostRupees.trim() ? Math.round(Number(extNewCostRupees) * 100) : undefined,
                      note: extNote.trim() || undefined,
                    },
                    'Sourcing exception recorded.',
                  );
                }}
              >
                Flag Exception
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!extEdit}
                onClick={() => {
                  if (!extEdit) return;
                  const target = extEdit;
                  setExtEdit(null);
                  void runAction(
                    target.id,
                    `/admin/shipping/fulfilments/${target.id}/external`,
                    {
                      action: 'resolve_sourcing_exception',
                      resolutionAction: 'accept_updated_cost',
                      newCostPaise: extNewCostRupees.trim() ? Math.round(Number(extNewCostRupees) * 100) : undefined,
                      externalOrderRef: extRef.trim() || undefined,
                      note: extNote.trim() || 'Accepted updated supplier cost',
                    },
                    'Accepted updated supplier cost & resumed.',
                  );
                }}
              >
                Accept Cost &amp; Proceed
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={!extEdit}
                onClick={() => {
                  if (!extEdit) return;
                  const target = extEdit;
                  setExtEdit(null);
                  void runAction(
                    target.id,
                    `/admin/shipping/fulfilments/${target.id}/external`,
                    {
                      action: 'resolve_sourcing_exception',
                      resolutionAction: 'cancel_and_refund',
                      note: extNote.trim() || 'Cancelled due to supplier unavailability — refund initiated.',
                    },
                    'Package cancelled & refund requested.',
                  );
                }}
              >
                Cancel &amp; Refund Buyer
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </AdminPage>
  );
}
