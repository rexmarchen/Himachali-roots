// Shared API types between the React client and the Express server.
// Money is always integer paise.

export type Role = 'customer' | 'seller' | 'admin';

export type ProductStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'paused' | 'archived';
export type ProductWorkflowStatus = 'draft' | 'submitted' | 'changes_requested' | 'approved' | 'published' | 'rejected' | 'paused' | 'archived';
export type SellerStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'more_info_required';
export type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'suspended';
export type StoreStatus = 'setup_incomplete' | 'pending_activation' | 'active' | 'suspended';
export type SellerCategoryId =
  | 'farmer_grower'
  | 'artisan_craftsperson'
  | 'food_producer'
  | 'home_business'
  | 'local_brand'
  | 'retailer';
export type PayoutStatus = 'not_started' | 'pending_configuration' | 'pending_verification' | 'verified' | 'blocked';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  sellerId: string | null;
  sellerStatus: SellerStatus | null;
  emailVerified: boolean;
  /** False for accounts created through a provider until a password is set. */
  hasPassword?: boolean;
  /** Linked sign-in providers, e.g. ["google"]. */
  authProviders?: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  imageUrl: string | null;
  productCount?: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  credit: string | null;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  pricePaise: number;
  compareAtPricePaise: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  sellerName: string;
  sellerSlug: string;
  categoryName: string;
  categorySlug: string;
  stock: number;
  isDemo: boolean;
  region: string | null;
  isFeatured: boolean;
  ratingAverage: number | null;
  ratingCount: number;
  /** Pre-campaign selling price, present only while a valid campaign price applies. */
  originalPricePaise?: number | null;
  /** Rounded discount percentage derived from originalPricePaise and pricePaise. */
  discountPercent?: number | null;
  campaignSlug?: string | null;
  campaignName?: string | null;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  sku: string;
  unit: string;
  weightG: number | null;
  dimensions: string | null;
  materials: string | null;
  careInstructions: string | null;
  foodInfo: string | null;
  originPlace: string | null;
  originVerified: boolean;
  varietyGrade?: string | null;
  harvestInfo?: string | null;
  dispatchConditions?: string | null;
  attributes: Record<string, string> | null;
  taxRateBp: number;
  images: ProductImage[];
  seller: {
    id: string;
    name: string;
    slug: string;
    tagline: string | null;
    story: string | null;
    region: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
  };
  category: { id: string; name: string; slug: string };
  reviews: Review[];
  reviewSummary: { average: number | null; count: number; distribution: Record<string, number> };
  related: ProductSummary[];
  returnPolicy: string;
  shippingEstimate: string;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  createdAt: string;
  verifiedPurchase: boolean;
}

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  imageAlt: string | null;
  unitPricePaise: number;
  originalUnitPricePaise?: number | null;
  quantity: number;
  lineTotalPaise: number;
  stock: number;
  sellerId: string;
  sellerName: string;
  status: ProductStatus;
  maxQuantity: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'expired' | 'archived';

export interface CampaignSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  posterUrl: string | null;
  posterAlt: string | null;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  maxDiscountBp: number;
  productCount: number;
  /** Deepest saving actually available in this campaign today, rounded. */
  maxDiscountPercent: number;
}

export interface CartView {
  lines: CartLine[];
  subtotalPaise: number;
  itemCount: number;
  hasUnavailable: boolean;
  shippingEstimatePaise: number;
  freeShippingThresholdPaise: number;
}

export interface OrderAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderItemSummary {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPricePaise: number;
  originalUnitPricePaise: number | null;
  lineSubtotalPaise: number;
  status: string;
  sellerName: string;
  sellerOrderId: string;
  canReview: boolean;
  reviewed: boolean;
}

export interface ShipmentView {
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  status: string;
  shippedAt: string;
  deliveredAt: string | null;
  events: { status: string; description: string | null; occurredAt: string }[];
}

export interface SellerOrderView {
  id: string;
  reference: string;
  status: string;
  sellerName: string;
  subtotalPaise: number;
  shippingPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  commissionPaise: number;
  sellerEarningPaise: number;
  items: OrderItemSummary[];
  shipment: ShipmentView | null;
  dispatchBy: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  email: string;
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxPaise: number;
  totalPaise: number;
  couponCode: string | null;
  placedAt: string;
  paidAt: string | null;
  shippingAddress: OrderAddress;
  sellerOrders: SellerOrderView[];
  payment: { provider: string; status: string; providerPaymentId: string | null } | null;
  canCancel: boolean;
  canRequestReturn: boolean;
  reservationExpiresAt: string | null;
  isDemo?: boolean;
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface SellerProduct {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  workflowStatus?: ProductWorkflowStatus;
  moderationNote?: string | null;
  pricePaise: number;
  sku: string;
  stock: number;
  reserved: number;
  categoryName: string;
  imageUrl: string | null;
  rejectionReason: string | null;
  updatedAt: string;
  isDemo: boolean;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorShape {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export const FREE_SHIPPING_THRESHOLD_PAISE = 149900;
export const FLAT_SHIPPING_PAISE = 7900;
export const DEFAULT_COMMISSION_BP = 1500;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  partially_fulfilled: 'Partially dispatched',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  expired: 'Payment expired',
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for review',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Not approved',
  suspended: 'Suspended',
};

export const STORE_STATUS_LABELS: Record<string, string> = {
  setup_incomplete: 'Setup incomplete',
  pending_activation: 'Pending activation',
  active: 'Active',
  suspended: 'Suspended',
};

export const PRODUCT_WORKFLOW_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  paused: 'Paused',
  archived: 'Archived',
};

export const SELLER_ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'New — confirm stock',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refunded: 'Refunded',
};

export function formatINR(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const value = Math.abs(paise);
  return `${sign}₹${(value / 100).toLocaleString('en-IN', {
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
