import { useEffect, useState } from 'react';
import {
  EXTERNAL_FIXED_MARKUP_PAISE,
  formatINR,
  type AvailabilityPolicy,
  type FulfilmentMethod,
  type ImageAuthorizationStatus,
  type ProductSourcingSummary,
  type ProductVariant,
  type ReturnShippingBearer,
} from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';

export interface ExternalSourcingPanelProduct {
  id: string;
  pricePaise: number;
  fulfilmentMethod: FulfilmentMethod | string;
  isSelectCurated?: boolean;
  availabilityPolicy?: AvailabilityPolicy;
  maxOrderQuantity?: number;
  returnWindowDays?: number | null;
  returnShippingBearer?: ReturnShippingBearer | string | null;
  returnPolicyOverride?: string | null;
  variants?: ProductVariant[];
  sourcing?: ProductSourcingSummary | null;
  externalReadiness?: { ready: boolean; blockers: string[] } | null;
}

function rupeesStr(paise: number | null | undefined): string {
  if (!paise || paise <= 0) return '';
  return (paise / 100).toFixed(2).replace(/\.00$/, '');
}

export function ExternalSourcingPanel({
  endpoint,
  product,
  onSaved,
  isAdmin = false,
}: {
  endpoint: string;
  product: ExternalSourcingPanelProduct;
  onSaved: () => Promise<void>;
  isAdmin?: boolean;
}) {
  const toast = useToast();
  const s = product.sourcing;
  const [saving, setSaving] = useState(false);

  const [sourcingChannel, setSourcingChannel] = useState(s?.sourcingChannel ?? 'meesho');
  const [supplierName, setSupplierName] = useState(s?.supplierName ?? '');
  const [sourceUrl, setSourceUrl] = useState(s?.sourceUrl ?? '');
  const [supplierCatalogId, setSupplierCatalogId] = useState(s?.supplierCatalogId ?? '');
  const [supplierSkuRef, setSupplierSkuRef] = useState(s?.supplierSkuRef ?? '');
  const [supplierPriceRupees, setSupplierPriceRupees] = useState(rupeesStr(s?.supplierPricePaise));
  const [supplierShippingRupees, setSupplierShippingRupees] = useState(rupeesStr(s?.supplierShippingPaise));
  const [otherCostRupees, setOtherCostRupees] = useState(rupeesStr(s?.otherSourcingCostPaise));
  const [markupRupees, setMarkupRupees] = useState(
    rupeesStr(Math.max(EXTERNAL_FIXED_MARKUP_PAISE, s?.markupPaise ?? EXTERNAL_FIXED_MARKUP_PAISE)) || '100',
  );
  const [autoPriceFromLanded, setAutoPriceFromLanded] = useState(true);
  const [priceVerified, setPriceVerified] = useState(Boolean(s?.priceVerified));
  const [supplierAvailable, setSupplierAvailable] = useState(Boolean(s?.supplierAvailable));
  const [availabilityVerified, setAvailabilityVerified] = useState(Boolean(s?.availabilityVerified));
  const [imageAuthStatus, setImageAuthStatus] = useState<ImageAuthorizationStatus>(
    s?.imageAuthorizationStatus ?? 'pending_authorization',
  );
  const [imageAuthNote, setImageAuthNote] = useState(s?.imageAuthorizationNote ?? '');
  const [supplierReturnNote, setSupplierReturnNote] = useState(s?.supplierReturnPolicyNote ?? '');
  const [internalNotes, setInternalNotes] = useState(s?.internalNotes ?? '');

  const [isSelectCurated, setIsSelectCurated] = useState(Boolean(product.isSelectCurated));
  const [availabilityPolicy, setAvailabilityPolicy] = useState<AvailabilityPolicy>(
    product.availabilityPolicy ?? 'on_demand_external',
  );
  const [maxOrderQty, setMaxOrderQty] = useState(String(product.maxOrderQuantity ?? 5));
  const [returnWindowDays, setReturnWindowDays] = useState(
    product.returnWindowDays !== null && product.returnWindowDays !== undefined ? String(product.returnWindowDays) : '7',
  );
  const [returnBearer, setReturnBearer] = useState<string>(product.returnShippingBearer ?? 'partner_defective_only');
  const [returnOverride, setReturnOverride] = useState(product.returnPolicyOverride ?? '');
  const [variants, setVariants] = useState<ProductVariant[]>(product.variants ?? []);

  useEffect(() => {
    const next = product.sourcing;
    setSourcingChannel(next?.sourcingChannel ?? 'meesho');
    setSupplierName(next?.supplierName ?? '');
    setSourceUrl(next?.sourceUrl ?? '');
    setSupplierCatalogId(next?.supplierCatalogId ?? '');
    setSupplierSkuRef(next?.supplierSkuRef ?? '');
    setSupplierPriceRupees(rupeesStr(next?.supplierPricePaise));
    setSupplierShippingRupees(rupeesStr(next?.supplierShippingPaise));
    setOtherCostRupees(rupeesStr(next?.otherSourcingCostPaise));
    setMarkupRupees(
      rupeesStr(Math.max(EXTERNAL_FIXED_MARKUP_PAISE, next?.markupPaise ?? EXTERNAL_FIXED_MARKUP_PAISE)) || '100',
    );
    setPriceVerified(Boolean(next?.priceVerified));
    setSupplierAvailable(Boolean(next?.supplierAvailable));
    setAvailabilityVerified(Boolean(next?.availabilityVerified));
    setImageAuthStatus(next?.imageAuthorizationStatus ?? 'pending_authorization');
    setImageAuthNote(next?.imageAuthorizationNote ?? '');
    setSupplierReturnNote(next?.supplierReturnPolicyNote ?? '');
    setInternalNotes(next?.internalNotes ?? '');
    setIsSelectCurated(Boolean(product.isSelectCurated));
    setAvailabilityPolicy(product.availabilityPolicy ?? 'on_demand_external');
    setMaxOrderQty(String(product.maxOrderQuantity ?? 5));
    setReturnWindowDays(
      product.returnWindowDays !== null && product.returnWindowDays !== undefined ? String(product.returnWindowDays) : '7',
    );
    setReturnBearer(product.returnShippingBearer ?? 'partner_defective_only');
    setReturnOverride(product.returnPolicyOverride ?? '');
    setVariants(product.variants ?? []);
  }, [product]);

  const toPaiseVal = (str: string) => Math.max(0, Math.round(Number(str || 0) * 100));
  const spPaise = toPaiseVal(supplierPriceRupees);
  const ssPaise = toPaiseVal(supplierShippingRupees);
  const ocPaise = toPaiseVal(otherCostRupees);
  const mkPaise = Math.max(EXTERNAL_FIXED_MARKUP_PAISE, toPaiseVal(markupRupees) || EXTERNAL_FIXED_MARKUP_PAISE);
  const landedPaise = spPaise + ssPaise + ocPaise;
  const computedPricePaise = landedPaise + mkPaise;

  const addVariantRow = () => {
    setVariants((prev) => [
      ...prev,
      {
        id: `var_${Math.random().toString(36).slice(2, 8)}`,
        label: '',
        color: '',
        colorHex: null,
        size: '',
        priceDeltaPaise: 0,
        available: true,
      },
    ]);
  };

  const saveSourcing = async (verifyNow = false) => {
    setSaving(true);
    try {
      const cleanedVariants = variants
        .filter((v) => v.label.trim().length > 0)
        .map((v) => ({
          ...v,
          label: v.label.trim(),
          color: v.color?.trim() || null,
          colorHex: v.colorHex && /^#[0-9a-fA-F]{6}$/.test(v.colorHex) ? v.colorHex : null,
          size: v.size?.trim() || null,
          priceDeltaPaise: Number.isFinite(v.priceDeltaPaise) ? Math.round(v.priceDeltaPaise ?? 0) : 0,
          available: v.available !== false,
        }));

      await api(endpoint, {
        method: 'PATCH',
        body: {
          sourcingChannel: sourcingChannel.trim() || 'meesho',
          supplierName: supplierName.trim() || null,
          sourceUrl: sourceUrl.trim() || null,
          supplierCatalogId: supplierCatalogId.trim() || null,
          supplierSkuRef: supplierSkuRef.trim() || null,
          supplierPricePaise: spPaise,
          supplierShippingPaise: ssPaise,
          otherSourcingCostPaise: ocPaise,
          markupPaise: mkPaise,
          autoPriceFromLanded,
          priceVerified: verifyNow ? true : priceVerified,
          supplierAvailable: verifyNow ? true : supplierAvailable,
          availabilityVerified: verifyNow ? true : availabilityVerified,
          imageAuthorizationStatus: imageAuthStatus,
          imageAuthorizationNote: imageAuthNote.trim() || null,
          supplierReturnPolicyNote: supplierReturnNote.trim() || null,
          internalNotes: internalNotes.trim() || null,
          ...(isAdmin ? { isSelectCurated, availabilityPolicy } : {}),
          maxOrderQuantity: Math.max(1, Math.min(20, Number(maxOrderQty) || 5)),
          returnWindowDays: returnWindowDays.trim() === '' ? null : Math.max(0, Math.min(30, Number(returnWindowDays) || 0)),
          returnShippingBearer: (returnBearer || null) as ReturnShippingBearer | null,
          returnPolicyOverride: returnOverride.trim() || null,
          variants: cleanedVariants,
        },
      });
      toast.push(
        verifyNow
          ? 'Sourcing verified, landed cost recalculated & ₹100 markup applied.'
          : 'External sourcing & pricing ledger saved.',
      );
      await onSaved();
    } catch (err) {
      toast.push(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#D98263]/40 bg-[#FAF7F2] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4DACE] pb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B85738]">
            Confidential Internal Sourcing Ledger
          </p>
          <h3 className="font-serif text-lg font-bold text-[#172321]">
            External Supplier Pricing &amp; ₹100 Markup Engine
          </h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={s?.priceVerified ? 'forest' : 'terra'}>
            {s?.priceVerified ? 'Price Verified' : 'Verify Price'}
          </Badge>
          <Badge tone={s?.imageAuthorizationStatus === 'authorized' ? 'forest' : 'terra'}>
            {s?.imageAuthorizationStatus === 'authorized' ? 'Images Authorized' : 'Needs Image Auth'}
          </Badge>
        </div>
      </div>

      {product.externalReadiness && !product.externalReadiness.ready ? (
        <Alert tone="warning" title="Publish gate — verification required before going live">
          <ul className="mt-1 list-disc pl-4 text-xs space-y-0.5">
            {product.externalReadiness.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Alert>
      ) : product.fulfilmentMethod === 'EXTERNAL_SUPPLIER' ? (
        <Alert tone="info" title="Publish gate ready">
          Supplier pricing (+₹100 floor), live availability, authorized imagery, and brand compliance passed.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Internal Channel">
          <Input value={sourcingChannel} onChange={(e) => setSourcingChannel(e.target.value)} placeholder="meesho" />
        </Field>
        <Field label="Supplier / Vendor Name">
          <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name" />
        </Field>
        <Field label="Supplier Catalog / SKU Code">
          <Input value={supplierCatalogId} onChange={(e) => setSupplierCatalogId(e.target.value)} placeholder="Catalog ID" />
        </Field>
        <Field label="Internal Source Reference URL (Private)" className="sm:col-span-2 lg:col-span-3">
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://www.meesho.com/..." />
        </Field>
      </div>

      <div className="rounded-xl border border-[#E4DACE] bg-white p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Supplier Base Price (₹)">
            <Input
              inputMode="decimal"
              value={supplierPriceRupees}
              onChange={(e) => setSupplierPriceRupees(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Supplier Shipping (₹)">
            <Input
              inputMode="decimal"
              value={supplierShippingRupees}
              onChange={(e) => setSupplierShippingRupees(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Other Direct Cost (₹)">
            <Input
              inputMode="decimal"
              value={otherCostRupees}
              onChange={(e) => setOtherCostRupees(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Markup (₹, min ₹100)">
            <Input
              inputMode="decimal"
              value={markupRupees}
              onChange={(e) => setMarkupRupees(e.target.value)}
              placeholder="100"
            />
          </Field>
        </div>

        <div className="grid gap-3 rounded-lg bg-[#FAF7F2] p-3 text-xs sm:grid-cols-3">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted">Total Landed Sourcing Cost</span>
            <p className="mt-0.5 font-serif text-lg font-bold text-[#172321]">{formatINR(landedPaise)}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted">Auto Selling Price (Landed + ₹100)</span>
            <p className="mt-0.5 font-serif text-lg font-bold text-forest">
              {landedPaise > 0 ? formatINR(computedPricePaise) : 'Enter supplier cost'}
            </p>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted">Live Listing Price</span>
            <p className="mt-0.5 font-serif text-lg font-bold text-[#B85738]">{formatINR(product.pricePaise)}</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-[#172321]">
          <input
            type="checkbox"
            checked={autoPriceFromLanded}
            onChange={(e) => setAutoPriceFromLanded(e.target.checked)}
            className="accent-forest"
          />
          <span>Automatically update Customer Selling Price = Total Landed Cost + Markup when saved</span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[#E4DACE] bg-white p-3 space-y-2 text-xs">
          <p className="font-semibold text-[#172321]">Verification Status</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={priceVerified} onChange={(e) => setPriceVerified(e.target.checked)} className="accent-forest" />
            <span>Supplier price &amp; shipping verified</span>
          </label>
          {s?.lastPriceVerifiedAt ? (
            <p className="text-[10.5px] text-muted">Last verified: {formatDateTime(s.lastPriceVerifiedAt)}</p>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={supplierAvailable} onChange={(e) => setSupplierAvailable(e.target.checked)} className="accent-forest" />
            <span>Supplier currently in stock / available</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={availabilityVerified} onChange={(e) => setAvailabilityVerified(e.target.checked)} className="accent-forest" />
            <span>Availability independently verified</span>
          </label>
          {s?.lastAvailabilityVerifiedAt ? (
            <p className="text-[10.5px] text-muted">Availability checked: {formatDateTime(s.lastAvailabilityVerifiedAt)}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-[#E4DACE] bg-white p-3 space-y-2 text-xs">
          <Field label="Image Usage Authorization Status">
            <Select
              value={imageAuthStatus}
              onChange={(e) => setImageAuthStatus(e.target.value as ImageAuthorizationStatus)}
            >
              <option value="pending_authorization">Pending authorization (publish blocked)</option>
              <option value="authorized">Authorized (supplier permission / original media)</option>
              <option value="rejected">Rejected / do not publish</option>
            </Select>
          </Field>
          <Field label="Image Authorization Evidence / Note">
            <Input
              value={imageAuthNote}
              onChange={(e) => setImageAuthNote(e.target.value)}
              placeholder="e.g. Supplier permission ref / own studio shoot"
            />
          </Field>
          {isAdmin ? (
            <div className="flex flex-wrap gap-3 pt-1">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={isSelectCurated}
                  onChange={(e) => setIsSelectCurated(e.target.checked)}
                  className="accent-forest"
                />
                <span>Show DEAR HILLS SELECT badge</span>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {/* Return eligibility & on-demand qty */}
      <div className="grid gap-3 rounded-lg border border-[#E4DACE] bg-white p-3.5 sm:grid-cols-3">
        <Field label="Max Qty per Order">
          <Input
            inputMode="numeric"
            value={maxOrderQty}
            onChange={(e) => setMaxOrderQty(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="Return Window (days, 0 = non-returnable)">
          <Input
            inputMode="numeric"
            value={returnWindowDays}
            onChange={(e) => setReturnWindowDays(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="Return Shipping / Policy Rule">
          <Select value={returnBearer} onChange={(e) => setReturnBearer(e.target.value)}>
            <option value="partner_defective_only">Damaged / defective / wrong item only</option>
            <option value="customer">Open return (customer return shipping)</option>
            <option value="seller">Open return (seller-covered)</option>
            <option value="non_returnable">Non-returnable (damaged replacement only)</option>
          </Select>
        </Field>
        <Field label="Customer-Facing Return Policy Override (optional)" className="sm:col-span-3">
          <Textarea
            rows={2}
            value={returnOverride}
            onChange={(e) => setReturnOverride(e.target.value)}
            placeholder="Leave empty to auto-format from return window/bearer above (never mention Meesho or supplier)."
          />
        </Field>
      </div>

      {/* Verified Variants Manager */}
      <div className="rounded-lg border border-[#E4DACE] bg-white p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[#172321]">Verified Options / Variants (Color, Size)</p>
          <Button type="button" size="sm" variant="secondary" onClick={addVariantRow}>
            + Add variant
          </Button>
        </div>
        {variants.length === 0 ? (
          <p className="text-[11px] text-muted">No separate color/size variants configured yet.</p>
        ) : (
          <div className="space-y-2">
            {variants.map((v, idx) => (
              <div key={v.id} className="grid gap-2 rounded border border-line bg-[#FAF7F2]/60 p-2 sm:grid-cols-5 items-center">
                <Input
                  value={v.label}
                  onChange={(e) =>
                    setVariants((prev) => prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)))
                  }
                  placeholder="Label (e.g. Black · M)"
                />
                <Input
                  value={v.size ?? ''}
                  onChange={(e) =>
                    setVariants((prev) => prev.map((row, i) => (i === idx ? { ...row, size: e.target.value } : row)))
                  }
                  placeholder="Size (Free / M / L)"
                />
                <Input
                  value={v.color ?? ''}
                  onChange={(e) =>
                    setVariants((prev) => prev.map((row, i) => (i === idx ? { ...row, color: e.target.value } : row)))
                  }
                  placeholder="Color"
                />
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={v.available !== false}
                    onChange={(e) =>
                      setVariants((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, available: e.target.checked } : row)),
                      )
                    }
                  />
                  <span>Available</span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-terra"
                  onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Field label="Internal Sourcing / Return Notes (Private)">
        <Textarea rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={saving} onClick={() => void saveSourcing(false)}>
          Save Sourcing Ledger
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={landedPaise <= 0 || imageAuthStatus !== 'authorized'}
          loading={saving}
          onClick={() => void saveSourcing(true)}
        >
          Verify Price &amp; Availability Now
        </Button>
      </div>
    </div>
  );
}
