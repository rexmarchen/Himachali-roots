import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, sellerOrderStatusLabel } from '@/lib/format';
import { formatINR } from '@shared/types';
import { Badge, EmptyState, LoadingBlock, PageHeader, StatusBadge } from '@/components/ui';
import { SellerPickupLocationsCard } from '@/components/shipping/FulfilmentComponents';

interface SellerOrderShippingRow {
  id: string;
  reference: string;
  orderNumber: string;
  status: string;
  totalPaise: number;
  dispatchBy: string | null;
  customerName: string;
  destination: string;
  fulfilmentMethods?: string[];
  hasFailedSync?: boolean;
  awaitingReadyToShip?: boolean;
}

export function SellerShippingPage() {
  const orders = useQuery({
    queryKey: ['seller-orders-shipping'],
    queryFn: () => api<{ orders: SellerOrderShippingRow[] }>('/seller/orders'),
  });

  const active = (orders.data?.orders ?? []).filter((o) => !['delivered', 'cancelled', 'returned', 'refunded'].includes(o.status));

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Logistics & Pickup Setup"
        title="Shipping & Tracking"
        lede="Register and verify your Shiprocket pickup addresses, track Shiprocket order syncs, and mark Shiprocket parcels Ready to Ship once packed."
      />

      <SellerPickupLocationsCard />

      <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#172321]">Active Orders Requiring Dispatch</h2>
          <p className="mt-1 text-xs text-[#172321]/65">
            Open any order to schedule Shiprocket pickups (Ready to Ship), update Own Delivery milestones, or record External Supplier tracking.
          </p>
        </div>

        {orders.isLoading ? <LoadingBlock rows={3} /> : null}
        {!orders.isLoading && active.length === 0 ? (
          <EmptyState title="No active shipments pending dispatch" body="Confirmed customer orders appear here automatically." />
        ) : null}
        {active.length > 0 ? (
          <div className="divide-y divide-[#E4DACE] border-y border-[#E4DACE]">
            {active.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/seller/orders/${o.id}`} className="font-bold text-sm text-forest hover:text-terra">
                      {o.reference}
                    </Link>
                    <span className="font-mono text-[#172321]/60">{o.orderNumber}</span>
                    {(o.fulfilmentMethods ?? []).map((m) => (
                      <Badge key={m} tone="neutral">{m}</Badge>
                    ))}
                    {o.hasFailedSync ? <Badge tone="terra">Sync failed — retry</Badge> : null}
                    {o.awaitingReadyToShip ? <Badge tone="forest">Shiprocket Synced · Mark Ready to Ship</Badge> : null}
                  </div>
                  <p className="text-[#172321]/70">
                    {o.customerName} · {o.destination} · {formatINR(o.totalPaise)}
                    {o.dispatchBy ? ` · Dispatch by ${formatDate(o.dispatchBy)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={o.status} label={sellerOrderStatusLabel(o.status)} />
                  <Link
                    to={`/seller/orders/${o.id}`}
                    className="rounded border border-forest/30 bg-forest/5 px-3 py-1.5 font-semibold text-forest hover:bg-forest hover:text-white transition-colors"
                  >
                    Open Fulfilment →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
