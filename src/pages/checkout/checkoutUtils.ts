import type { Address, CartView, OrderAddress, OrderView } from '@shared/types';
import { FLAT_SHIPPING_PAISE } from '@shared/types';
import type { SiteConfig } from '@/lib/session';

export type CheckoutStage = 1 | 2 | 3;
export type PaymentMethod = 'razorpay' | 'development';

export interface PaymentInit {
  provider: 'razorpay' | 'unconfigured';
  keyId?: string;
  providerOrderId?: string;
  amountPaise: number;
  orderNumber: string;
  message?: string;
  devPaymentsEnabled: boolean;
}

export interface AppliedCoupon {
  code: string;
  description: string | null;
  discountPaise: number;
  subtotalPaise: number;
}

export interface AddressDraft {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export type FieldErrors = Record<string, string>;

export interface Totals {
  subtotalPaise: number;
  discountPaise: number;
  discountedSubtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  savingsPaise: number;
  amountToFreeShippingPaise: number;
}

export const EMPTY_ADDRESS_DRAFT: AddressDraft = {
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

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export function validateAddressDraft(draft: AddressDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.fullName.trim().length < 2) errors.fullName = 'Enter the recipient’s full name.';
  if (!/^[6-9]\d{9}$/.test(draft.phone.replace(/\D/g, ''))) {
    errors.phone = 'Enter a 10-digit Indian mobile number.';
  }
  if (draft.line1.trim().length < 4) errors.line1 = 'Enter the house, street and locality.';
  if (draft.line2.trim().length > 200) errors.line2 = 'Keep this line under 200 characters.';
  if (draft.city.trim().length < 2) errors.city = 'Enter the city or town.';
  if (draft.state.trim().length < 2) errors.state = 'Enter the state.';
  if (!/^\d{6}$/.test(draft.pincode)) errors.pincode = 'Enter a 6-digit PIN code.';
  if (draft.label.trim().length > 30) errors.label = 'Use 30 characters or fewer.';
  return errors;
}

export function toOrderAddress(
  draft: Pick<AddressDraft, 'fullName' | 'phone' | 'line1' | 'city' | 'state' | 'pincode'> & { line2?: string | null },
): OrderAddress {
  return {
    fullName: draft.fullName.trim(),
    phone: draft.phone.replace(/\D/g, ''),
    line1: draft.line1.trim(),
    line2: draft.line2?.trim() || undefined,
    city: draft.city.trim(),
    state: draft.state.trim(),
    pincode: draft.pincode.trim(),
  };
}

export function draftFromAddress(address: Address): AddressDraft {
  return {
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    isDefault: address.isDefault,
  };
}

export function draftToAddressBody(draft: AddressDraft) {
  return {
    label: draft.label.trim() || 'Home',
    fullName: draft.fullName.trim(),
    phone: draft.phone.replace(/\D/g, ''),
    line1: draft.line1.trim(),
    line2: draft.line2.trim() || undefined,
    city: draft.city.trim(),
    state: draft.state.trim(),
    pincode: draft.pincode.trim(),
    isDefault: draft.isDefault,
  };
}

/**
 * Mirrors server/lib/pricing.ts: shipping is charged on the subtotal after
 * discounts. Prices are GST-inclusive; no tax is added on top.
 */
export function computeTotals(cart: CartView, discountPaise: number, flatShippingPaise = FLAT_SHIPPING_PAISE): Totals {
  const subtotalPaise = cart.subtotalPaise;
  const discount = Math.max(0, Math.min(discountPaise, subtotalPaise));
  const discountedSubtotalPaise = subtotalPaise - discount;
  const threshold = cart.freeShippingThresholdPaise;
  // Mirror shippingFor() exactly: a zero threshold means shipping is free.
  const shippingPaise =
    discountedSubtotalPaise <= 0
      ? 0
      : discountedSubtotalPaise >= threshold
        ? 0
        : flatShippingPaise;

  const productSavings = cart.lines.reduce((sum, line) => {
    const original = line.originalUnitPricePaise;
    if (!original || original <= line.unitPricePaise) return sum;
    return sum + (original - line.unitPricePaise) * line.quantity;
  }, 0);

  return {
    subtotalPaise,
    discountPaise: discount,
    discountedSubtotalPaise,
    shippingPaise,
    totalPaise: discountedSubtotalPaise + shippingPaise,
    savingsPaise: productSavings + discount,
    amountToFreeShippingPaise:
      threshold > 0 && discountedSubtotalPaise > 0 && discountedSubtotalPaise < threshold
        ? threshold - discountedSubtotalPaise
        : 0,
  };
}

export function paymentOptions(config: SiteConfig | null): {
  razorpay: boolean;
  development: boolean;
  available: boolean;
} {
  const razorpay = Boolean(config?.payments.configured);
  const development = !razorpay && Boolean(config?.payments.devPaymentsEnabled && config?.devMode);
  return { razorpay, development, available: razorpay || development };
}

export function isOrderPaid(order: OrderView): boolean {
  return order.payment?.status === 'paid' || Boolean(order.paidAt);
}

export function orderItemCount(order: OrderView): number {
  return order.sellerOrders.reduce(
    (sum, sellerOrder) => sum + sellerOrder.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
}
