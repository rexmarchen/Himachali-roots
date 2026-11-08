import type { ApplicationStatus, SellerCategoryId } from '@shared/types';

export const AGREEMENT_VERSION = '2026-10';

export const HIMACHAL_DISTRICTS = [
  'Bilaspur',
  'Chamba',
  'Hamirpur',
  'Kangra',
  'Kinnaur',
  'Kullu',
  'Lahaul & Spiti',
  'Mandi',
  'Shimla',
  'Sirmaur',
  'Solan',
  'Una',
] as const;

export type HimachalDistrict = (typeof HIMACHAL_DISTRICTS)[number];

export type CoreBusinessType = 'maker_artisan' | 'farmer_producer' | 'local_brand' | 'other_business';

export interface AddressForm {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export interface ShippingForm {
  dispatchDays: string;
  packaging: string;
  shipsAcrossIndia: boolean;
  coldChain: boolean;
  notes: string;
}

export interface PayoutForm {
  method: 'bank_transfer' | 'upi';
  accountHolderName: string;
  accountLast4: string;
  ifsc: string;
  upiIdMasked: string;
  consent: boolean;
}

export interface AgreementsForm {
  sellerAgreement: boolean;
  commissionDisclosure: boolean;
  authenticityPolicy: boolean;
  privacyPolicy: boolean;
  version: string;
}

export interface WizardForm {
  fullName: string;
  phone: string;
  businessName: string;
  sellerType: string;
  sellerCategory: SellerCategoryId | '';
  tagline: string;
  story: string;
  region: string;
  village: string;
  address: AddressForm;
  dispatchAddress: AddressForm;
  dispatchSameAsOperating: boolean;
  categorySlugs: string[];
  productGroups: string[];
  originNarrative: string;
  authenticityDeclaration: boolean;
  categoryAnswers: Record<string, string>;
  gstin: string;
  panLast4: string;
  fssaiNumber: string;
  udyamNumber: string;
  businessRegistrationNumber: string;
  shipping: ShippingForm;
  payout: PayoutForm;
  agreements: AgreementsForm;
  yearsOperating: string;
}

export const emptyForm: WizardForm = {
  fullName: '',
  phone: '',
  businessName: '',
  sellerType: 'artisan',
  sellerCategory: 'artisan_craftsperson',
  tagline: '',
  story: '',
  region: 'Kangra',
  village: '',
  address: {
    line1: '',
    line2: '',
    city: '',
    state: 'Himachal Pradesh',
    pincode: '',
  },
  dispatchAddress: {
    line1: '',
    line2: '',
    city: '',
    state: 'Himachal Pradesh',
    pincode: '',
  },
  dispatchSameAsOperating: true,
  categorySlugs: ['crafts-and-handicrafts'],
  productGroups: ['handloom'],
  originNarrative: '',
  authenticityDeclaration: true,
  categoryAnswers: {},
  gstin: '',
  panLast4: '',
  fssaiNumber: '',
  udyamNumber: '',
  businessRegistrationNumber: '',
  shipping: {
    dispatchDays: '3',
    packaging: '',
    shipsAcrossIndia: true,
    coldChain: false,
    notes: '',
  },
  payout: {
    method: 'bank_transfer',
    accountHolderName: '',
    accountLast4: '',
    ifsc: '',
    upiIdMasked: '',
    consent: false,
  },
  agreements: {
    sellerAgreement: false,
    commissionDisclosure: false,
    authenticityPolicy: false,
    privacyPolicy: false,
    version: AGREEMENT_VERSION,
  },
  yearsOperating: '',
};

export interface ApplicationDocument {
  id: string;
  docType: string;
  doc_type?: string;
  docLabel?: string;
  originalName?: string;
  original_name?: string;
  mimeType?: string;
  mime_type?: string;
  sizeBytes?: number;
  size_bytes?: number;
  status: string;
  reviewNote?: string | null;
  review_note?: string | null;
  uploadedAt?: string;
  uploaded_at?: string;
  fileUrl?: string;
}

export interface ApplicationResponse {
  exists: boolean;
  seller?: {
    id: string;
    businessName: string;
    sellerCategory: string | null;
    sellerType: string;
    status: string;
    storeStatus?: string;
    storeStatusReason?: string | null;
    payoutStatus?: string;
    region?: string;
    village?: string;
    operatingAddress?: unknown;
    pickupAddress?: unknown;
    tagline?: string | null;
    story?: string | null;
    gstin?: string | null;
    panLast4?: string | null;
  };
  application?: {
    id: string;
    status: ApplicationStatus;
    revision: number;
    currentStep: number;
    submittedAt?: string | null;
    reviewedAt?: string | null;
    lastSavedAt?: string | null;
    rejectionReason?: string | null;
    categories?: string[];
    phone?: string;
  };
  data?: unknown;
  documents?: ApplicationDocument[];
  requirements?: {
    required: string[];
    optional: string[];
    missing: string[];
    rejected: string[];
    labels: Record<string, string>;
  };
  checklist?: { id: string; label: string; status: string; detail: string; href?: string }[];
  events?: {
    id: string;
    event: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    actorEmail: string | null;
    createdAt: string;
  }[];
  canWithdraw?: boolean;
}

export interface SellerConfigResponse {
  sellerCategories: {
    id: SellerCategoryId;
    label: string;
    description: string;
    productGroups: string[];
    originPrompts: string[];
  }[];
  documentTypes: { id: string; label: string; description?: string }[];
  commissionBps: { defaultRateBp: number };
}

export const FALLBACK_DOC_LABELS: Record<string, string> = {
  id_proof: 'Government photo identity',
  address_proof: 'Address proof',
  business_registration: 'Business registration (Udyam, MSME or Shop licence)',
  gst_certificate: 'GST registration certificate (if registered)',
  fssai: 'FSSAI food registration or licence',
  craft_evidence: 'Craft or workshop evidence',
  land_record: 'Land, orchard or cultivation record',
  cooperative_registration: 'Cooperative or SHG registration',
  resale_authorisation: 'Reseller authorisation from makers/brands',
  other: 'Other supporting document',
};
