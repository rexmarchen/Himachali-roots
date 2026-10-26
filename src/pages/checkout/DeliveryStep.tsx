import type { Address } from '@shared/types';
import { Link } from 'react-router-dom';
import { Alert, Field, Input, Textarea } from '@/components/ui';
import { CheckoutAction, CheckoutPanel, SectionHeading } from './CheckoutParts';
import { INDIAN_STATES, type AddressDraft, type FieldErrors } from './checkoutUtils';

export function AddressFields({
  draft,
  errors,
  onChange,
  idPrefix = 'checkout',
}: {
  draft: AddressDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<AddressDraft>) => void;
  idPrefix?: string;
}) {
  const stateListId = `${idPrefix}-states`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" required error={errors.fullName}>
        <Input
          value={draft.fullName}
          onChange={(event) => onChange({ fullName: event.target.value })}
          autoComplete="name"
          placeholder="Name of the person receiving the parcel"
          invalid={Boolean(errors.fullName)}
          maxLength={120}
        />
      </Field>

      <Field label="Mobile number" required error={errors.phone} hint="+91">
        <div className="flex">
          <span className="inline-flex items-center border border-r-0 border-sand bg-[#F6F0E6] px-3 text-[13px] text-[#6B7269]">
            +91
          </span>
          <Input
            value={draft.phone}
            onChange={(event) => onChange({ phone: event.target.value.replace(/\D/g, '').slice(0, 10) })}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="10-digit mobile number"
            invalid={Boolean(errors.phone)}
            maxLength={10}
            className="rounded-l-none"
          />
        </div>
      </Field>

      <Field label="Address line 1" required error={errors.line1} className="sm:col-span-2">
        <Input
          value={draft.line1}
          onChange={(event) => onChange({ line1: event.target.value })}
          autoComplete="address-line1"
          placeholder="House or building, street, locality"
          invalid={Boolean(errors.line1)}
          maxLength={200}
        />
      </Field>

      <Field label="Address line 2" hint="Optional" error={errors.line2} className="sm:col-span-2">
        <Input
          value={draft.line2}
          onChange={(event) => onChange({ line2: event.target.value })}
          autoComplete="address-line2"
          placeholder="Landmark, apartment, floor"
          invalid={Boolean(errors.line2)}
          maxLength={200}
        />
      </Field>

      <Field label="City or town" required error={errors.city}>
        <Input
          value={draft.city}
          onChange={(event) => onChange({ city: event.target.value })}
          autoComplete="address-level2"
          placeholder="City or town"
          invalid={Boolean(errors.city)}
          maxLength={100}
        />
      </Field>

      <Field label="State" required error={errors.state}>
        <Input
          value={draft.state}
          onChange={(event) => onChange({ state: event.target.value })}
          autoComplete="address-level1"
          placeholder="State"
          list={stateListId}
          invalid={Boolean(errors.state)}
          maxLength={100}
        />
        <datalist id={stateListId}>
          {INDIAN_STATES.map((state) => (
            <option key={state} value={state} />
          ))}
        </datalist>
      </Field>

      <Field label="PIN code" required error={errors.pincode} hint="6 digits">
        <Input
          value={draft.pincode}
          onChange={(event) => onChange({ pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="171001"
          invalid={Boolean(errors.pincode)}
          maxLength={6}
        />
      </Field>

      <Field label="Save this address as" hint="Optional" error={errors.label}>
        <Input
          value={draft.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Home, Work, Parents"
          maxLength={30}
          invalid={Boolean(errors.label)}
        />
      </Field>
    </div>
  );
}

export function DeliveryStep({
  addresses,
  addressesLoading,
  addressesError,
  selectedId,
  onSelect,
  draft,
  onChangeDraft,
  errors,
  note,
  onNoteChange,
  saveNewAddress,
  onSaveNewAddressChange,
  onEditAddress,
  onContinue,
  saving,
}: {
  addresses: Address[];
  addressesLoading: boolean;
  addressesError?: string | null;
  selectedId: string | 'new';
  onSelect: (id: string | 'new') => void;
  draft: AddressDraft;
  onChangeDraft: (patch: Partial<AddressDraft>) => void;
  errors: FieldErrors;
  note: string;
  onNoteChange: (value: string) => void;
  saveNewAddress: boolean;
  onSaveNewAddressChange: (value: boolean) => void;
  onEditAddress: (address: Address) => void;
  onContinue: () => void;
  saving: boolean;
}) {
  const enteringNew = selectedId === 'new' || addresses.length === 0;

  return (
    <CheckoutPanel className="p-5 sm:p-6">
      <SectionHeading
        step="Step one"
        title="Where should it go?"
        description="Choose a saved address or enter a new one. We use the mobile number only for delivery updates about this order."
        action={
          <Link
            to="/account/addresses"
            className="text-[11px] text-[#6B7269] underline decoration-[#C9BFB0] underline-offset-4 hover:text-[#234638]"
          >
            Manage addresses
          </Link>
        }
      />

      {addressesError && !addressesLoading ? (
        <div className="mt-5">
          <Alert tone="warning" title="Saved addresses could not be loaded">
            {addressesError} You can still enter a delivery address below for this order.
          </Alert>
        </div>
      ) : null}

      {addressesLoading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading saved addresses">
          <div className="h-28 shimmer rounded-sm" />
          <div className="h-28 shimmer rounded-sm" />
        </div>
      ) : addresses.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => {
            const selected = selectedId === address.id;
            return (
              <div
                key={address.id}
                className={`relative border transition-colors ${
                  selected ? 'border-[#234638] bg-[#234638]/[0.035]' : 'border-[#E3D9C9] bg-white hover:border-[#234638]/35'
                }`}
              >
                <label className="flex cursor-pointer gap-3 p-4 pr-16">
                  <input
                    type="radio"
                    name="delivery-address"
                    className="mt-1 h-4 w-4 shrink-0 accent-[#234638]"
                    checked={selected}
                    onChange={() => onSelect(address.id)}
                  />
                  <span className="min-w-0 text-[12px] leading-relaxed text-[#5E675F]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#234638]">
                        {address.label}
                      </span>
                      {address.isDefault ? (
                        <span className="border border-[#D8CDBC] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-[#7A8179]">
                          Default
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block font-medium text-[#234638]">{address.fullName}</span>
                    <span className="block">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ''}
                    </span>
                    <span className="block">
                      {address.city}, {address.state} {address.pincode}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[#7A8179]">+91 {address.phone}</span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => onEditAddress(address)}
                  className="absolute right-3 top-3 border border-[#E3D9C9] bg-white px-2 py-1 text-[10.5px] text-[#5E675F] transition-colors hover:border-[#234638]/40 hover:text-[#234638]"
                >
                  Edit
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => onSelect('new')}
            aria-pressed={selectedId === 'new'}
            className={`flex min-h-[124px] items-center justify-center gap-2 border border-dashed px-4 py-5 text-[12px] transition-colors ${
              selectedId === 'new'
                ? 'border-[#234638] bg-[#234638]/[0.035] text-[#234638]'
                : 'border-[#CFC3B1] text-[#5E675F] hover:border-[#234638]/50 hover:text-[#234638]'
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Add a new address
          </button>
        </div>
      ) : null}

      {enteringNew && !addressesLoading ? (
        <div className="mt-5 border border-[#E3D9C9] bg-[#FBF8F2] p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-[19px] text-[#234638]">New delivery address</h3>
            {addresses.length > 0 ? (
              <button
                type="button"
                onClick={() => onSelect(addresses[0].id)}
                className="text-[11px] text-[#6B7269] underline underline-offset-4 hover:text-[#234638]"
              >
                Use a saved address instead
              </button>
            ) : null}
          </div>
          <div className="mt-4">
            <AddressFields draft={draft} errors={errors} onChange={onChangeDraft} />
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[11.5px] leading-relaxed text-[#5E675F]">
            <input
              type="checkbox"
              checked={saveNewAddress}
              onChange={(event) => onSaveNewAddressChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#234638]"
            />
            <span>
              Save this address to my account for future orders.
              <span className="block text-[10.5px] text-[#7A8179]">
                You can edit or remove saved addresses from your account at any time.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      <div className="mt-6 border-t border-[#EDE5D8] pt-5">
        <label htmlFor="checkout-note" className="text-[13px] font-medium text-[#234638]">
          Delivery instructions <span className="font-normal text-[#7A8179]">(optional)</span>
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-[#7A8179]">
          Anything the maker or courier should know. Do not include card, UPI or password details.
        </p>
        <Textarea
          id="checkout-note"
          className="mt-2 min-h-20 text-[13px]"
          maxLength={500}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Landmark, preferred delivery window, or a note for the maker"
        />
        <p className="mt-1 text-right text-[10px] text-[#8A8F87]">{note.length}/500</p>
      </div>

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 border-t border-[#EDE5D8] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10.5px] leading-relaxed text-[#7A8179]">
          We deliver within India only. Shipping charges are confirmed in the summary.
        </p>
        <CheckoutAction type="button" onClick={onContinue} loading={saving || addressesLoading} className="w-full sm:w-auto">
          Continue to payment
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
            <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </CheckoutAction>
      </div>
    </CheckoutPanel>
  );
}
