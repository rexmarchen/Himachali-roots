import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FULFILMENT_METHOD_DESCRIPTIONS,
  FULFILMENT_METHOD_LABELS,
  FULFILMENT_STATUS_LABELS,
  PUBLIC_FULFILMENT_METHOD_LABELS,
  type FulfilmentMethod,
  type OrderFulfilmentView,
  type SellerPickupLocation,
} from '@shared/types';
import { safeExternalUrl } from '@shared/urls';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDate, formatDateTime, humanise } from '@/lib/format';
import { Alert, Badge, Button, Field, Input, Modal, Textarea } from '@/components/ui';

export interface ProductShippingFormState {
  fulfilmentMethod: FulfilmentMethod;
  pickupLocationId: string;
  packageWeightG: string;
  packageLengthCm: string;
  packageBreadthCm: string;
  packageHeightCm: string;
  handlingDays: string;
  shippingNotes: string;
  deliveryArea: string;
  serviceablePincodes: string;
  deliveryRadiusKm: string;
  deliveryChargeRupees: string;
  estimatedDeliveryDaysOwn: string;
  contactName: string;
  contactPhone: string;
  deliveryInstructions: string;
  supplierName: string;
  supplierReference: string;
  processingTimeDays: string;
  estimatedDeliveryDaysExternal: string;
  fulfilmentInstructions: string;
}

export const DEFAULT_PRODUCT_SHIPPING_STATE: ProductShippingFormState = {
  fulfilmentMethod: 'OWN_DELIVERY',
  pickupLocationId: '',
  packageWeightG: '500',
  packageLengthCm: '18',
  packageBreadthCm: '14',
  packageHeightCm: '10',
  handlingDays: '2',
  shippingNotes: '',
  deliveryArea: '',
  serviceablePincodes: '',
  deliveryRadiusKm: '',
  deliveryChargeRupees: '0',
  estimatedDeliveryDaysOwn: '2–4 days',
  contactName: '',
  contactPhone: '',
  deliveryInstructions: '',
  supplierName: '',
  supplierReference: '',
  processingTimeDays: '2',
  estimatedDeliveryDaysExternal: '5–8 days',
  fulfilmentInstructions: '',
};

/* ============================================================================
   1. SELLER PICKUP LOCATIONS MANAGER
   ============================================================================ */

export function SellerPickupLocationsCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [nickname, setNickname] = useState('');
  const [srName, setSrName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Himachal Pradesh');
  const [pincode, setPincode] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [registerWithShiprocket, setRegisterWithShiprocket] = useState(true);

  const locationsQuery = useQuery({
    queryKey: ['seller-pickup-locations'],
    queryFn: () =>
      api<{ pickupLocations: SellerPickupLocation[]; shiprocketConfigured: boolean }>('/seller/pickup-locations'),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['seller-pickup-locations'] });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/seller/pickup-locations', {
        method: 'POST',
        body: {
          nickname,
          shiprocketLocationName: srName.trim() || undefined,
          contactName,
          phone,
          email: email.trim() || undefined,
          line1,
          line2: line2.trim() || undefined,
          city,
          state,
          pincode,
          isDefault,
          registerWithShiprocket,
        },
      });
      toast.push('Pickup location saved.');
      setModalOpen(false);
      setNickname('');
      setSrName('');
      setLine1('');
      setLine2('');
      setCity('');
      setPincode('');
      await refresh();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (locId: string) => {
    setBusyId(locId);
    try {
      await api(`/seller/pickup-locations/${locId}/verify`, { method: 'POST', body: {} });
      toast.push('Pickup address verified & registered with Shiprocket.');
      await refresh();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (locId: string) => {
    setBusyId(locId);
    try {
      await api(`/seller/pickup-locations/${locId}/default`, { method: 'POST', body: {} });
      toast.push('Default pickup location updated.');
      await refresh();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (locId: string) => {
    setBusyId(locId);
    try {
      await api(`/seller/pickup-locations/${locId}`, { method: 'DELETE' });
      toast.push('Pickup location removed.');
      await refresh();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const locations = locationsQuery.data?.pickupLocations ?? [];
  const shiprocketConfigured = locationsQuery.data?.shiprocketConfigured ?? false;

  return (
    <section className="rounded-2xl border border-[#E4DACE] bg-white p-5 sm:p-6 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4DACE] pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#D98263]">Shiprocket Pickup Addresses</p>
          <h2 className="mt-1 font-serif text-xl font-bold text-[#172321]">Registered & Approved Pickup Locations</h2>
          <p className="mt-1 text-xs text-[#172321]/65">
            Products shipped through Shiprocket require an approved pickup address verified on Shiprocket for your maker account.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          + Add Pickup Address
        </Button>
      </div>

      {locations.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#E4DACE] bg-[#FAF7F2] p-4 text-xs text-[#172321]/75">
          No Shiprocket pickup addresses saved yet. Add and verify your workshop or dispatch address to enable Shiprocket fulfilment on products.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {locations.map((loc) => {
            const ready = loc.isVerified && loc.isApproved && loc.isActive;
            return (
              <div
                key={loc.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-[#E4DACE] bg-[#FAF7F2]/60 p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-[#172321]">{loc.nickname}</span>
                    <span className="rounded bg-[#172321]/10 px-2 py-0.5 font-mono text-[10px] text-[#172321]">
                      SR: {loc.shiprocketLocationName}
                    </span>
                    {loc.isDefault ? <Badge tone="forest">Default</Badge> : null}
                    {ready ? (
                      <Badge tone="forest">Verified &amp; Approved</Badge>
                    ) : loc.isVerified ? (
                      <Badge tone="terra">Awaiting Admin Approval</Badge>
                    ) : (
                      <Badge tone="terra">Needs Shiprocket Verification</Badge>
                    )}
                  </div>
                  <p className="text-xs text-[#172321]/75">
                    {loc.contactName} ({loc.phone}) · {loc.line1}
                    {loc.line2 ? `, ${loc.line2}` : ''}, {loc.city}, {loc.state} — {loc.pincode}
                  </p>
                  {loc.verificationNote ? (
                    <p className="text-[11px] text-[#172321]/55">{loc.verificationNote}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {(!loc.isVerified || !loc.isApproved) && shiprocketConfigured ? (
                    <Button
                      type="button"
                      size="sm"
                      loading={busyId === loc.id}
                      onClick={() => void handleVerify(loc.id)}
                    >
                      Verify on Shiprocket
                    </Button>
                  ) : null}
                  {!loc.isDefault ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={busyId === loc.id}
                      onClick={() => void handleSetDefault(loc.id)}
                    >
                      Set Default
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-700"
                    loading={busyId === loc.id}
                    onClick={() => void handleDelete(loc.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Shiprocket Pickup Location"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-pickup-form" loading={saving}>
              Save Pickup Address
            </Button>
          </>
        }
      >
        <form id="add-pickup-form" onSubmit={(e) => void handleCreate(e)} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Address Label" required hint="e.g. Kullu Loom Workshop">
              <Input required value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Primary Workshop" />
            </Field>
            <Field label="Shiprocket Pickup Name" hint="Optional; auto-generated if left blank">
              <Input value={srName} onChange={(e) => setSrName(e.target.value)} placeholder="e.g. KulluHub01" />
            </Field>
            <Field label="Contact Person" required>
              <Input required value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="10-digit Mobile Number" required>
              <Input
                required
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98XXXXXXXX"
              />
            </Field>
          </div>
          <Field label="Contact Email" hint="Optional; defaults to your seller account email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Address Line 1" required>
            <Input required value={line1} onChange={(e) => setLine1(e.target.value)} />
          </Field>
          <Field label="Address Line 2">
            <Input value={line2} onChange={(e) => setLine2(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City / Town" required>
              <Input required value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="State" required>
              <Input required value={state} onChange={(e) => setState(e.target.value)} />
            </Field>
            <Field label="PIN Code" required>
              <Input
                required
                inputMode="numeric"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs text-[#172321]">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            <span>Make this my default Shiprocket pickup address</span>
          </label>
          {shiprocketConfigured ? (
            <label className="flex items-center gap-2 text-xs text-[#172321]">
              <input
                type="checkbox"
                checked={registerWithShiprocket}
                onChange={(e) => setRegisterWithShiprocket(e.target.checked)}
              />
              <span>Register and verify this pickup location immediately in Shiprocket</span>
            </label>
          ) : null}
        </form>
      </Modal>
    </section>
  );
}

/* ============================================================================
   2. PRODUCT EDITOR SHIPPING / FULFILMENT METHOD SELECTOR
   ============================================================================ */

export function ProductShippingMethodSection({
  shipping,
  setShipping,
  fields,
}: {
  shipping: ProductShippingFormState;
  setShipping: (next: ProductShippingFormState) => void;
  fields: Record<string, string>;
}) {
  const locationsQuery = useQuery({
    queryKey: ['seller-pickup-locations'],
    queryFn: () =>
      api<{ pickupLocations: SellerPickupLocation[]; shiprocketConfigured: boolean }>('/seller/pickup-locations'),
  });

  const allLocations = locationsQuery.data?.pickupLocations ?? [];
  const approvedLocations = allLocations.filter((l) => l.isVerified && l.isApproved && l.isActive);
  const canUseShiprocket = approvedLocations.length > 0;

  const methods: Array<{
    id: FulfilmentMethod;
    title: string;
    badge: string;
    disabled?: boolean;
    disabledReason?: string;
  }> = [
    {
      id: 'SHIPROCKET',
      title: `1. ${FULFILMENT_METHOD_LABELS.SHIPROCKET}`,
      badge: canUseShiprocket ? 'Auto-Sync on Confirmation' : 'Requires Approved Pickup',
      disabled: !canUseShiprocket,
      disabledReason: 'Add & verify at least one Shiprocket pickup location in Shipping & Tracking first.',
    },
    {
      id: 'OWN_DELIVERY',
      title: `2. ${FULFILMENT_METHOD_LABELS.OWN_DELIVERY}`,
      badge: 'Seller Managed · No Shiprocket',
    },
    {
      id: 'EXTERNAL_SUPPLIER',
      title: `3. ${FULFILMENT_METHOD_LABELS.EXTERNAL_SUPPLIER}`,
      badge: 'Manual Reseller Ref · No Shiprocket',
    },
  ];

  return (
    <div className="mt-6 space-y-5 border-t border-[#E4DACE] pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#172321]">
            Shipping / Fulfilment Method <span className="text-[#D98263]">*</span>
          </p>
          <p className="mt-0.5 text-xs text-[#172321]/65">
            Locked onto every customer order at checkout. Future changes only apply to new orders.
          </p>
        </div>
        <Link
          to="/seller/shipping"
          className="text-xs font-semibold text-[#D98263] underline underline-offset-2"
        >
          Manage Pickup Addresses →
        </Link>
      </div>

      {!canUseShiprocket ? (
        <Alert tone="warning" title="No verified Shiprocket pickup location yet">
          Shiprocket option is disabled until you register and approve at least one pickup location in{' '}
          <Link to="/seller/shipping" className="font-semibold underline">
            Shipping &amp; Tracking
          </Link>
          . You can still configure <strong>Own Delivery</strong> or <strong>External Supplier Direct Delivery</strong>.
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {methods.map((opt) => {
          const selected = shipping.fulfilmentMethod === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              onClick={() => {
                const defaultPickup =
                  opt.id === 'SHIPROCKET' && !shipping.pickupLocationId && approvedLocations[0]
                    ? approvedLocations[0].id
                    : shipping.pickupLocationId;
                setShipping({ ...shipping, fulfilmentMethod: opt.id, pickupLocationId: defaultPickup });
              }}
              className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                opt.disabled
                  ? 'cursor-not-allowed border-[#E4DACE] bg-slate-50 opacity-60'
                  : selected
                    ? 'border-[#172321] bg-[#FAF7F2] ring-2 ring-[#D98263]/40'
                    : 'border-[#E4DACE] bg-white hover:border-[#D98263]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-[#172321]">{opt.title}</span>
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center ${
                      selected ? 'border-[#172321] bg-[#172321]' : 'border-[#172321]/30'
                    }`}
                  >
                    {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                  </span>
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[#172321]/70">
                  {FULFILMENT_METHOD_DESCRIPTIONS[opt.id]}
                </p>
              </div>
              <span className="mt-3 inline-block w-fit rounded-full bg-[#172321]/5 px-2.5 py-0.5 text-[10px] font-semibold text-[#172321]">
                {opt.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* OPTION 1: SHIPROCKET CONFIG */}
      {shipping.fulfilmentMethod === 'SHIPROCKET' && (
        <div className="rounded-xl border border-[#E4DACE] bg-[#FAF7F2] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#172321]">Shiprocket Pickup & Package Dimensions</h3>
            <Badge tone="forest">Pickup scheduled only after Ready to Ship</Badge>
          </div>
          <Field
            label="Approved Seller Pickup Location"
            required
            error={fields.pickupLocationId}
            hint="Orders are routed to this exact warehouse/workshop address in Shiprocket."
          >
            <select
              required
              value={shipping.pickupLocationId}
              onChange={(e) => setShipping({ ...shipping, pickupLocationId: e.target.value })}
              className="w-full rounded-sm border border-line bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            >
              <option value="">Select verified pickup address...</option>
              {approvedLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.nickname} ({loc.shiprocketLocationName}) — {loc.city}, {loc.pincode}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label="Weight (grams)" required error={fields.packageWeightG}>
              <Input
                required
                inputMode="numeric"
                value={shipping.packageWeightG}
                onChange={(e) => setShipping({ ...shipping, packageWeightG: e.target.value.replace(/\D/g, '') })}
              />
            </Field>
            <Field label="Length (cm)" required error={fields.packageLengthCm}>
              <Input
                required
                inputMode="decimal"
                value={shipping.packageLengthCm}
                onChange={(e) => setShipping({ ...shipping, packageLengthCm: e.target.value.replace(/[^\d.]/g, '') })}
              />
            </Field>
            <Field label="Width (cm)" required error={fields.packageBreadthCm}>
              <Input
                required
                inputMode="decimal"
                value={shipping.packageBreadthCm}
                onChange={(e) => setShipping({ ...shipping, packageBreadthCm: e.target.value.replace(/[^\d.]/g, '') })}
              />
            </Field>
            <Field label="Height (cm)" required error={fields.packageHeightCm}>
              <Input
                required
                inputMode="decimal"
                value={shipping.packageHeightCm}
                onChange={(e) => setShipping({ ...shipping, packageHeightCm: e.target.value.replace(/[^\d.]/g, '') })}
              />
            </Field>
            <Field label="Handling (days)" required>
              <Input
                required
                inputMode="numeric"
                value={shipping.handlingDays}
                onChange={(e) => setShipping({ ...shipping, handlingDays: e.target.value.replace(/\D/g, '') })}
              />
            </Field>
          </div>
          <Field label="Shipping Instructions" hint="Optional fragile/packing note">
            <Input
              value={shipping.shippingNotes}
              onChange={(e) => setShipping({ ...shipping, shippingNotes: e.target.value })}
              placeholder="e.g. Wrap glass jar in honeycomb kraft paper"
            />
          </Field>
        </div>
      )}

      {/* OPTION 2: OWN DELIVERY CONFIG */}
      {shipping.fulfilmentMethod === 'OWN_DELIVERY' && (
        <div className="rounded-xl border border-[#E4DACE] bg-[#FAF7F2] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#172321]">Own Delivery Resources Configuration</h3>
            <Badge tone="neutral">Shiprocket Never Called</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery Area / Region" required error={fields['shippingConfig.deliveryArea']}>
              <Input
                required
                value={shipping.deliveryArea}
                onChange={(e) => setShipping({ ...shipping, deliveryArea: e.target.value })}
                placeholder="e.g. Kullu Valley, Manali, Bhuntar & Chandigarh"
              />
            </Field>
            <Field label="Serviceable PIN Codes (comma separated)" error={fields['shippingConfig.serviceablePincodes']}>
              <Input
                value={shipping.serviceablePincodes}
                onChange={(e) => setShipping({ ...shipping, serviceablePincodes: e.target.value })}
                placeholder="e.g. 175125, 175126, 171001"
              />
            </Field>
            <Field label="Or Delivery Radius (km)">
              <Input
                inputMode="numeric"
                value={shipping.deliveryRadiusKm}
                onChange={(e) => setShipping({ ...shipping, deliveryRadiusKm: e.target.value.replace(/\D/g, '') })}
                placeholder="e.g. 35"
              />
            </Field>
            <Field label="Delivery Charges (INR)" required>
              <Input
                inputMode="numeric"
                value={shipping.deliveryChargeRupees}
                onChange={(e) => setShipping({ ...shipping, deliveryChargeRupees: e.target.value.replace(/[^\d.]/g, '') })}
              />
            </Field>
            <Field label="Estimated Delivery Time" required>
              <Input
                required
                value={shipping.estimatedDeliveryDaysOwn}
                onChange={(e) => setShipping({ ...shipping, estimatedDeliveryDaysOwn: e.target.value })}
                placeholder="e.g. Same-day or 2–3 days"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Dispatch Contact Name" required error={fields['shippingConfig.contactName']}>
                <Input
                  required
                  value={shipping.contactName}
                  onChange={(e) => setShipping({ ...shipping, contactName: e.target.value })}
                />
              </Field>
              <Field label="Contact Phone" required error={fields['shippingConfig.contactPhone']}>
                <Input
                  required
                  inputMode="numeric"
                  value={shipping.contactPhone}
                  onChange={(e) => setShipping({ ...shipping, contactPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
              </Field>
            </div>
          </div>
          <Field label="Delivery Instructions">
            <Input
              value={shipping.deliveryInstructions}
              onChange={(e) => setShipping({ ...shipping, deliveryInstructions: e.target.value })}
              placeholder="e.g. Local rider calls 30 min prior to handover"
            />
          </Field>
        </div>
      )}

      {/* OPTION 3: EXTERNAL SUPPLIER DIRECT DELIVERY CONFIG */}
      {shipping.fulfilmentMethod === 'EXTERNAL_SUPPLIER' && (
        <div className="rounded-xl border border-[#E4DACE] bg-[#FAF7F2] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#172321]">External Supplier Direct Fulfilment</h3>
            <Badge tone="neutral">Reseller Manual Reference · No Shiprocket</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier / Source Name" required error={fields['shippingConfig.supplierName']}>
              <Input
                required
                value={shipping.supplierName}
                onChange={(e) => setShipping({ ...shipping, supplierName: e.target.value })}
                placeholder="e.g. Meesho Supplier Partner / Shimla Cooperative"
              />
            </Field>
            <Field label="Supplier Catalog Reference / Code">
              <Input
                value={shipping.supplierReference}
                onChange={(e) => setShipping({ ...shipping, supplierReference: e.target.value })}
                placeholder="e.g. SUP-LOT-442"
              />
            </Field>
            <Field label="Processing Time (days)" required>
              <Input
                required
                inputMode="numeric"
                value={shipping.processingTimeDays}
                onChange={(e) => setShipping({ ...shipping, processingTimeDays: e.target.value.replace(/\D/g, '') })}
              />
            </Field>
            <Field label="Estimated Delivery Window" required>
              <Input
                required
                value={shipping.estimatedDeliveryDaysExternal}
                onChange={(e) => setShipping({ ...shipping, estimatedDeliveryDaysExternal: e.target.value })}
                placeholder="e.g. 5–7 working days"
              />
            </Field>
          </div>
          <Field label="External Fulfilment Instructions">
            <Textarea
              rows={2}
              value={shipping.fulfilmentInstructions}
              onChange={(e) => setShipping({ ...shipping, fulfilmentInstructions: e.target.value })}
              placeholder="Notes on supplier ordering, white-label invoice or external tracking entry"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   3. CUSTOMER ORDER FULFILMENT TRACKING CARDS
   ============================================================================ */

function stepsForMethod(fulfilment: OrderFulfilmentView): Array<{ label: string; active: boolean; done: boolean }> {
  const s = fulfilment.status;
  if (fulfilment.fulfilmentMethod === 'SHIPROCKET') {
    const rankMap: Record<string, number> = {
      pending_sync: 1,
      sync_failed: 1,
      shiprocket_order_created: 2,
      ready_to_ship: 3,
      awb_assigned: 3,
      pickup_scheduled: 3,
      picked_up: 4,
      in_transit: 4,
      out_for_delivery: 5,
      delivered: 6,
    };
    const r = rankMap[s] ?? 1;
    return [
      { label: 'Order Confirmed', active: r === 1, done: r > 1 },
      { label: 'Shiprocket Synced', active: r === 2, done: r > 2 },
      { label: 'Ready / Pickup Scheduled', active: r === 3, done: r > 3 },
      { label: 'In Transit', active: r === 4, done: r > 4 },
      { label: 'Out for Delivery', active: r === 5, done: r > 5 },
      { label: 'Delivered', active: r === 6, done: r >= 6 },
    ];
  }
  if (fulfilment.fulfilmentMethod === 'OWN_DELIVERY') {
    const rankMap: Record<string, number> = {
      order_confirmed: 1,
      accepted: 2,
      preparing: 3,
      out_for_delivery: 4,
      delivered: 5,
      delivery_failed: 4,
    };
    const r = rankMap[s] ?? 1;
    return [
      { label: 'Confirmed', active: r === 1, done: r > 1 },
      { label: 'Accepted', active: r === 2, done: r > 2 },
      { label: 'Preparing', active: r === 3, done: r > 3 },
      { label: 'Out for Delivery', active: r === 4, done: r > 4 },
      { label: 'Delivered', active: r === 5, done: r >= 5 },
    ];
  }
  const rankMap: Record<string, number> = {
    order_confirmed: 1,
    supplier_confirmed: 2,
    external_order_placed: 3,
    in_transit: 4,
    out_for_delivery: 4,
    delivered: 5,
  };
  const r = rankMap[s] ?? 1;
  return [
    { label: 'Order Confirmed', active: r === 1, done: r > 1 },
    { label: 'Preparing', active: r === 2, done: r > 2 },
    { label: 'Dispatched', active: r === 3, done: r > 3 },
    { label: 'In Transit', active: r === 4, done: r > 4 },
    { label: 'Delivered', active: r === 5, done: r >= 5 },
  ];
}

export function OrderFulfilmentsTrackCard({ fulfilments }: { fulfilments: OrderFulfilmentView[] }) {
  if (!fulfilments || fulfilments.length === 0) return null;

  return (
    <div className="space-y-4">
      {fulfilments.length > 1 ? (
        <Alert tone="info" title="Split Fulfilment">
          Your order contains {fulfilments.length} separate shipments with individual tracking and delivery schedules.
        </Alert>
      ) : null}

      {fulfilments.map((f) => {
        const steps = stepsForMethod(f);
        const safeUrl = safeExternalUrl(f.trackingUrl);
        return (
          <section key={f.id} className="border border-line bg-surface p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                    {PUBLIC_FULFILMENT_METHOD_LABELS[f.fulfilmentMethod as FulfilmentMethod] ?? 'Partner Dispatch'}
                  </span>
                  {f.estimatedDeliveryText ? (
                    <span className="text-[11px] text-forest">· {f.estimatedDeliveryText}</span>
                  ) : null}
                </div>
                <p className="mt-1 font-medium text-sm text-ink">
                  {f.items.map((item) => `${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} × ${item.quantity}`).join(', ')}
                </p>
              </div>
              <Badge tone={f.status === 'delivered' ? 'forest' : f.status === 'cancelled' || f.status.includes('fail') ? 'terra' : 'neutral'}>
                {FULFILMENT_STATUS_LABELS[f.status] ?? humanise(f.status)}
              </Badge>
            </div>

            {f.status !== 'cancelled' ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                {steps.map((step) => (
                  <div
                    key={step.label}
                    className={`rounded border px-2.5 py-2 text-[11px] ${
                      step.done
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 font-medium'
                        : step.active
                          ? 'border-forest bg-sand/30 text-forest font-semibold'
                          : 'border-line bg-paper/60 text-muted'
                    }`}
                  >
                    {step.done ? '✓ ' : step.active ? '● ' : '○ '}
                    {step.label}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
              <div className="space-y-0.5">
                {f.courierName || f.trackingNumber ? (
                  <p className="text-ink">
                    <strong>{f.courierName || 'Courier'}:</strong> {f.trackingNumber ?? f.awbCode}
                  </p>
                ) : null}
                {f.deliveredAt ? <p>Delivered on {formatDate(f.deliveredAt)}</p> : null}
                {f.ownDeliveryEvidence?.recipientName ? (
                  <p>Received by {f.ownDeliveryEvidence.recipientName}</p>
                ) : null}
              </div>
              {safeUrl ? (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-forest underline underline-offset-2"
                >
                  Open Live Tracking ↗
                </a>
              ) : null}
            </div>

            {f.events.length > 0 ? (
              <ol className="space-y-1 border-t border-line pt-3 text-[11.5px] text-muted">
                {f.events.map((ev) => (
                  <li key={ev.id}>
                    {formatDateTime(ev.occurredAt)} · <strong className="text-ink/80">{humanise(ev.status)}</strong>
                    {ev.description ? ` — ${ev.description}` : ''}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/* ============================================================================
   4. SELLER FULFILMENT WORKFLOW CARD (PER FULFILMENT PACKAGE)
   ============================================================================ */

export function SellerFulfilmentCard({
  fulfilment,
  onUpdated,
}: {
  fulfilment: OrderFulfilmentView;
  onUpdated: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Own Delivery modal state
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [proofUrl, setProofUrl] = useState('');

  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState('');

  // External Supplier modal state
  const [extOrderOpen, setExtOrderOpen] = useState(false);
  const [extSupplierName, setExtSupplierName] = useState(fulfilment.externalSupplierName ?? '');
  const [extOrderRef, setExtOrderRef] = useState(fulfilment.externalOrderRef ?? '');
  const [extTrackOpen, setExtTrackOpen] = useState(false);
  const [courierName, setCourierName] = useState(fulfilment.courierName ?? '');
  const [trackingId, setTrackingId] = useState(fulfilment.trackingNumber ?? '');
  const [trackingUrl, setTrackingUrl] = useState(fulfilment.trackingUrl ?? '');
  const [dispatchDate, setDispatchDate] = useState('');
  const [extDeliveryStatus, setExtDeliveryStatus] = useState<'in_transit' | 'out_for_delivery'>('in_transit');

  const runPost = async (path: string, body: Record<string, unknown>, okMessage: string) => {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body });
      toast.push(okMessage);
      await onUpdated();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const safeLabelUrl = safeExternalUrl(fulfilment.labelUrl);
  const safeTrackUrl = safeExternalUrl(fulfilment.trackingUrl);

  return (
    <section className="rounded-xl border border-[#E4DACE] bg-white p-5 space-y-4 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4DACE] pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#172321] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {FULFILMENT_METHOD_LABELS[fulfilment.fulfilmentMethod as FulfilmentMethod] ?? fulfilment.fulfilmentMethod}
            </span>
            <span className="font-mono text-[11px] text-[#172321]/60">{fulfilment.id}</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-[#172321]">
            {fulfilment.items.map((i) => `${i.name} × ${i.quantity}`).join(' · ')}
          </p>
          <p className="text-[11.5px] text-[#172321]/65">
            Package: {fulfilment.packageWeightG} g · {fulfilment.packageLengthCm}×{fulfilment.packageBreadthCm}×
            {fulfilment.packageHeightCm} cm
          </p>
        </div>
        <Badge tone={fulfilment.status === 'delivered' ? 'forest' : fulfilment.status.includes('fail') ? 'terra' : 'neutral'}>
          {FULFILMENT_STATUS_LABELS[fulfilment.status] ?? humanise(fulfilment.status)}
        </Badge>
      </div>

      {/* METHOD A: SHIPROCKET */}
      {fulfilment.fulfilmentMethod === 'SHIPROCKET' && (
        <div className="space-y-3">
          <div className="grid gap-3 rounded-lg border border-[#E4DACE] bg-[#FAF7F2] p-3.5 text-xs sm:grid-cols-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#172321]/55">Pickup Location</span>
              <p className="font-semibold text-[#172321]">
                {fulfilment.pickupLocationSummary?.nickname ?? 'Seller Verified Hub'}
              </p>
              <p className="text-[11px] text-[#172321]/65">
                {fulfilment.pickupLocationSummary?.shiprocketLocationName
                  ? `SR: ${fulfilment.pickupLocationSummary.shiprocketLocationName}`
                  : null}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#172321]/55">Shiprocket Order &amp; Shipment</span>
              <p className="font-mono font-semibold text-[#172321]">
                {fulfilment.shiprocketOrderId ? `#${fulfilment.shiprocketOrderId}` : 'Pending sync'}
              </p>
              <p className="font-mono text-[11px] text-[#172321]/65">
                {fulfilment.shiprocketShipmentId ? `Shipment #${fulfilment.shiprocketShipmentId}` : `Sync: ${fulfilment.shiprocketSyncStatus}`}
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#172321]/55">Courier / AWB</span>
              <p className="font-semibold text-[#172321]">
                {fulfilment.courierName ? fulfilment.courierName : 'Assigned at Ready-to-Ship'}
              </p>
              <p className="font-mono text-[11px] text-[#172321]/65">
                {fulfilment.awbCode ? `AWB: ${fulfilment.awbCode}` : 'Pickup not requested yet'}
              </p>
            </div>
          </div>

          {fulfilment.lastSyncError ? (
            <Alert tone="error" title="Shiprocket Sync Alert">
              {fulfilment.lastSyncError}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {['pending_sync', 'sync_failed'].includes(fulfilment.status) && !fulfilment.shiprocketOrderId ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() =>
                  void runPost(
                    `/seller/fulfilments/${fulfilment.id}/sync-shiprocket`,
                    {},
                    'Shiprocket order synchronized (waiting Ready to Ship for pickup).',
                  )
                }
              >
                Sync Order to Shiprocket
              </Button>
            ) : null}

            {['shiprocket_order_created', 'pending_sync', 'sync_failed'].includes(fulfilment.status) &&
            !fulfilment.awbCode ? (
              <Button
                size="sm"
                loading={busy}
                className="bg-[#D98263] text-white hover:bg-[#c26e50]"
                onClick={() =>
                  void runPost(
                    `/seller/fulfilments/${fulfilment.id}/ready-to-ship`,
                    {},
                    'Courier AWB assigned, label generated, and pickup scheduled!',
                  )
                }
              >
                Mark READY TO SHIP &amp; Request Pickup
              </Button>
            ) : null}

            {safeLabelUrl ? (
              <a
                href={safeLabelUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded border border-forest/30 bg-forest/5 px-3 py-1.5 text-xs font-semibold text-forest hover:bg-forest hover:text-white transition-colors"
              >
                Download Shipping Label ↗
              </a>
            ) : null}

            {fulfilment.awbCode && !['delivered', 'cancelled'].includes(fulfilment.status) ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() =>
                  void runPost(`/seller/fulfilments/${fulfilment.id}/refresh-tracking`, {}, 'Tracking refreshed from Shiprocket.')
                }
              >
                Sync Live Tracking
              </Button>
            ) : null}

            {['awb_assigned', 'pickup_scheduled'].includes(fulfilment.status) ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700"
                loading={busy}
                onClick={() =>
                  void runPost(`/seller/fulfilments/${fulfilment.id}/cancel-pickup`, {}, 'Pickup cancelled in Shiprocket.')
                }
              >
                Cancel Pickup
              </Button>
            ) : null}

            {!['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'].includes(fulfilment.status) ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700"
                loading={busy}
                onClick={() =>
                  void runPost(`/seller/fulfilments/${fulfilment.id}/cancel`, { reason: 'Cancelled by seller' }, 'Fulfilment package cancelled.')
                }
              >
                Cancel Package
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* METHOD B: OWN DELIVERY */}
      {fulfilment.fulfilmentMethod === 'OWN_DELIVERY' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-[#E4DACE] bg-[#FAF7F2] p-3.5 text-xs">
            <p className="font-semibold text-[#172321]">Own Delivery Workflow — Managed Directly by Your Resources</p>
            <p className="mt-0.5 text-[#172321]/65">
              Shiprocket is bypassed for this package. Update delivery milestones as your team dispatches it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fulfilment.status === 'order_confirmed' ? (
              <Button
                size="sm"
                loading={busy}
                onClick={() => void runPost(`/seller/fulfilments/${fulfilment.id}/own-delivery`, { action: 'accept' }, 'Own delivery order accepted.')}
              >
                Accept Order
              </Button>
            ) : null}
            {['order_confirmed', 'accepted'].includes(fulfilment.status) ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => void runPost(`/seller/fulfilments/${fulfilment.id}/own-delivery`, { action: 'preparing' }, 'Marked preparing order.')}
              >
                Preparing Order
              </Button>
            ) : null}
            {['order_confirmed', 'accepted', 'preparing', 'delivery_failed'].includes(fulfilment.status) ? (
              <Button
                size="sm"
                loading={busy}
                className="bg-[#172321] text-white"
                onClick={() =>
                  void runPost(`/seller/fulfilments/${fulfilment.id}/own-delivery`, { action: 'out_for_delivery' }, 'Marked Out for Delivery.')
                }
              >
                Out for Delivery
              </Button>
            ) : null}
            {['accepted', 'preparing', 'out_for_delivery'].includes(fulfilment.status) ? (
              <>
                <Button size="sm" loading={busy} onClick={() => setDeliverOpen(true)}>
                  Mark Delivered
                </Button>
                <Button size="sm" variant="danger" loading={busy} onClick={() => setFailOpen(true)}>
                  Delivery Failed
                </Button>
              </>
            ) : null}
            {!['out_for_delivery', 'delivered', 'cancelled'].includes(fulfilment.status) ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700"
                loading={busy}
                onClick={() =>
                  void runPost(`/seller/fulfilments/${fulfilment.id}/cancel`, { reason: 'Own delivery cancelled by seller' }, 'Package cancelled.')
                }
              >
                Cancel Package
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* METHOD C: EXTERNAL SUPPLIER */}
      {fulfilment.fulfilmentMethod === 'EXTERNAL_SUPPLIER' && (
        <div className="space-y-3">
          <div className="grid gap-3 rounded-lg border border-[#E4DACE] bg-[#FAF7F2] p-3.5 text-xs sm:grid-cols-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#172321]/55">Supplier Source</span>
              <p className="font-semibold text-[#172321]">{fulfilment.externalSupplierName ?? 'External Supplier'}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#172321]/55">External Order ID</span>
              <p className="font-mono font-semibold text-[#172321]">{fulfilment.externalOrderRef ?? 'Not recorded yet'}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#172321]/55">External Courier &amp; Tracking</span>
              <p className="font-semibold text-[#172321]">
                {fulfilment.courierName ? `${fulfilment.courierName} · ${fulfilment.trackingNumber ?? ''}` : 'Pending external dispatch'}
              </p>
              {safeTrackUrl ? (
                <a href={safeTrackUrl} target="_blank" rel="noreferrer" className="text-[11px] text-forest underline">
                  Tracking URL ↗
                </a>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {fulfilment.status === 'order_confirmed' ? (
              <Button
                size="sm"
                loading={busy}
                onClick={() =>
                  void runPost(`/seller/fulfilments/${fulfilment.id}/external`, { action: 'confirm_supplier' }, 'Supplier availability confirmed.')
                }
              >
                Confirm Supplier Availability
              </Button>
            ) : null}
            {!['delivered', 'cancelled'].includes(fulfilment.status) ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => setExtOrderOpen(true)}>
                  {fulfilment.externalOrderRef ? 'Edit External Order Ref' : 'Record External Supplier Order'}
                </Button>
                <Button size="sm" onClick={() => setExtTrackOpen(true)}>
                  Record Tracking / Dispatch
                </Button>
              </>
            ) : null}
            {['external_order_placed', 'in_transit', 'out_for_delivery', 'supplier_confirmed'].includes(fulfilment.status) ? (
              <Button
                size="sm"
                className="bg-[#66745A] text-white"
                loading={busy}
                onClick={() =>
                  void runPost(`/seller/fulfilments/${fulfilment.id}/external`, { action: 'delivered' }, 'External delivery marked completed.')
                }
              >
                Mark Delivered
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {/* Own Delivery: Delivered Modal */}
      <Modal
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        title="Confirm Own Delivery Completed"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeliverOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() => {
                setDeliverOpen(false);
                void runPost(
                  `/seller/fulfilments/${fulfilment.id}/own-delivery`,
                  {
                    action: 'delivered',
                    recipientName: recipientName.trim() || undefined,
                    note: deliveryNote.trim() || undefined,
                    proofUrl: proofUrl.trim() || undefined,
                  },
                  'Own delivery marked delivered.',
                );
              }}
            >
              Confirm Delivery
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Recipient Name" hint="Who received the parcel">
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </Field>
          <Field label="Delivery Evidence Note" hint="Handover remarks or POD details">
            <Textarea rows={2} value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
          </Field>
          <Field label="Evidence Photo / Proof URL" hint="Optional https:// link">
            <Input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="https://" />
          </Field>
        </div>
      </Modal>

      {/* Own Delivery: Failed Modal */}
      <Modal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        title="Record Own Delivery Attempt Failed"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFailOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                setFailOpen(false);
                void runPost(
                  `/seller/fulfilments/${fulfilment.id}/own-delivery`,
                  { action: 'delivery_failed', failedReason: failReason.trim() || 'Customer unavailable' },
                  'Delivery failure recorded.',
                );
              }}
            >
              Save Attempt Status
            </Button>
          </>
        }
      >
        <Field label="Failure Reason" required>
          <Textarea rows={2} value={failReason} onChange={(e) => setFailReason(e.target.value)} placeholder="e.g. Phone unreachable at doorstep" />
        </Field>
      </Modal>

      {/* External Order Reference Modal */}
      <Modal
        open={extOrderOpen}
        onClose={() => setExtOrderOpen(false)}
        title="Record External Supplier Order"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExtOrderOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() => {
                setExtOrderOpen(false);
                void runPost(
                  `/seller/fulfilments/${fulfilment.id}/external`,
                  {
                    action: 'place_external_order',
                    supplierName: extSupplierName.trim() || undefined,
                    externalOrderRef: extOrderRef.trim(),
                  },
                  'External supplier order reference saved.',
                );
              }}
            >
              Save Reference
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Supplier / Source Name">
            <Input value={extSupplierName} onChange={(e) => setExtSupplierName(e.target.value)} />
          </Field>
          <Field label="External Supplier Order ID" required>
            <Input value={extOrderRef} onChange={(e) => setExtOrderRef(e.target.value)} placeholder="e.g. MSH-89123401" />
          </Field>
        </div>
      </Modal>

      {/* External Tracking Modal */}
      <Modal
        open={extTrackOpen}
        onClose={() => setExtTrackOpen(false)}
        title="Update External Dispatch & Tracking"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExtTrackOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              onClick={() => {
                setExtTrackOpen(false);
                void runPost(
                  `/seller/fulfilments/${fulfilment.id}/external`,
                  {
                    action: 'update_tracking',
                    courierName: courierName.trim(),
                    trackingId: trackingId.trim(),
                    trackingUrl: trackingUrl.trim() || undefined,
                    dispatchDate: dispatchDate.trim() || undefined,
                    deliveryStatus: extDeliveryStatus,
                  },
                  'External tracking recorded.',
                );
              }}
            >
              Save Tracking
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Courier Name" required>
            <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="e.g. Xpressbees / Shadowfax / India Post" />
          </Field>
          <Field label="Tracking ID" required>
            <Input value={trackingId} onChange={(e) => setTrackingId(e.target.value)} />
          </Field>
          <Field label="Tracking URL" hint="Optional https:// link">
            <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dispatch Date" hint="YYYY-MM-DD">
              <Input value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} placeholder="2026-11-28" />
            </Field>
            <Field label="Status">
              <select
                value={extDeliveryStatus}
                onChange={(e) => setExtDeliveryStatus(e.target.value as 'in_transit' | 'out_for_delivery')}
                className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="in_transit">In Transit</option>
                <option value="out_for_delivery">Out for Delivery</option>
              </select>
            </Field>
          </div>
        </div>
      </Modal>
    </section>
  );
}
