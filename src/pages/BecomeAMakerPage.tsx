import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplicationStatus, Category, SellerCategoryId } from '@shared/types';
import { APPLICATION_STATUS_LABELS, STORE_STATUS_LABELS } from '@shared/types';
import { api, errorFields, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { formatDate, formatDateTime, percentFromBp } from '@/lib/format';
import { Alert, Button, Field, Input, Select, StatusBadge, Textarea, buttonClass } from '@/components/ui';

/* -------------------------------------------------------------------------- */
/*                              Constants & types                             */
/* -------------------------------------------------------------------------- */

const AGREEMENT_VERSION = '2026-10';
const TOTAL_STEPS = 10;

const HIMACHAL_DISTRICTS = [
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

const STEPS = [
  { number: 1, title: 'Account & verification', short: 'Account', hint: 'Your account and email' },
  { number: 2, title: 'Seller category', short: 'Category', hint: 'What you make or grow' },
  { number: 3, title: 'Personal & shop profile', short: 'Profile', hint: 'Your name and story' },
  { number: 4, title: 'Location & dispatch', short: 'Location', hint: 'Where you work from' },
  { number: 5, title: 'Products, origin & authenticity', short: 'Origin', hint: 'What you will sell' },
  { number: 6, title: 'Identity & verification', short: 'Documents', hint: 'Private evidence' },
  { number: 7, title: 'Shipping & packaging', short: 'Shipping', hint: 'How you dispatch' },
  { number: 8, title: 'Getting paid (after approval)', short: 'Payouts', hint: 'Separate, secured setup later' },
  { number: 9, title: 'Agreements & platform fee', short: 'Agreements', hint: 'Terms and disclosure' },
  { number: 10, title: 'Review & submit', short: 'Review', hint: 'Check and send' },
] as const;

/**
 * The application is grouped into three understandable stages while the
 * reviewer-facing form keeps its finer sub-steps. This is the progress model
 * makers see first: details, verification, then review.
 */
const STAGES = [
  {
    number: 1,
    title: 'Your details',
    hint: 'Account, what you make, your story and where you work.',
    steps: [1, 2, 3, 4, 5],
  },
  {
    number: 2,
    title: 'Verification & operations',
    hint: 'Documents, compliance and how you pack and dispatch.',
    steps: [6, 7, 8],
  },
  {
    number: 3,
    title: 'Review & submit',
    hint: 'Accept the terms, check everything and send it to the team.',
    steps: [9, 10],
  },
] as const;

function stageForStep(step: number) {
  return STAGES.find((stage) => (stage.steps as readonly number[]).includes(step)) ?? STAGES[0];
}

interface SellerCategoryOption {
  id: SellerCategoryId;
  label: string;
  description: string;
  productGroups: string[];
  originPrompts: string[];
}

const FALLBACK_CATEGORIES: SellerCategoryOption[] = [
  {
    id: 'farmer_grower',
    label: 'Farmer / Grower',
    description: 'Orchards, terraced fields, apiaries and growers of fruit, grain, pulses or herbs.',
    productGroups: ['fresh_produce', 'grains_pulses', 'honey', 'herbs', 'seeds', 'other_farm'],
    originPrompts: [
      'Which village, valley or orchard does this come from?',
      'How is it grown, harvested and handled?',
      'Is the harvest seasonal? What should a buyer expect?',
    ],
  },
  {
    id: 'artisan_craftsperson',
    label: 'Artisan / Craftsperson',
    description: 'Weavers, woodcarvers, metalworkers, potters and other handmade craft traditions.',
    productGroups: ['handloom', 'wool_textiles', 'woodcraft', 'metalcraft', 'pottery', 'jewellery', 'other_craft'],
    originPrompts: [
      'Which craft tradition and place does your work belong to?',
      'Which materials and techniques do you use?',
      'Who makes each piece, and how long does it take?',
    ],
  },
  {
    id: 'food_producer',
    label: 'Food Producer',
    description: 'Home kitchens, bakeries, preserves, pickles, teas and packaged regional foods.',
    productGroups: ['preserves', 'pickles', 'tea_coffee', 'bakery', 'spices', 'ready_food', 'other_food'],
    originPrompts: [
      'Where is the food prepared and by whom?',
      'What ingredients and preservation methods are used?',
      'What is the shelf life and storage guidance?',
    ],
  },
  {
    id: 'home_business',
    label: 'Home Business',
    description: 'Small home-run enterprises selling products they make, grow or assemble locally.',
    productGroups: ['home_goods', 'textiles', 'food', 'craft', 'personal_care', 'other'],
    originPrompts: [
      'Where is your home workshop?',
      'What do you make yourself and what do you source?',
      'How do you keep quality consistent?',
    ],
  },
  {
    id: 'local_brand',
    label: 'Local Brand',
    description: 'Himachali brands with a defined range, packaging and a story rooted in the state.',
    productGroups: ['packaged_food', 'textiles', 'personal_care', 'home_goods', 'accessories', 'other'],
    originPrompts: [
      'Where is the brand based and where is production carried out?',
      'Which ingredients or materials come from Himachal?',
      'Who makes the products and how is quality checked?',
    ],
  },
  {
    id: 'retailer',
    label: 'Retailer',
    description: 'Shops and distributors reselling authentic Himachali products with authorisation.',
    productGroups: ['multi_category', 'food', 'textiles', 'craft', 'other'],
    originPrompts: [
      'Which makers or brands do you stock?',
      'Do you hold written authorisation to resell their products?',
      'How do you store and dispatch products?',
    ],
  },
];

const PRODUCT_GROUP_LABELS: Record<string, string> = {
  fresh_produce: 'Fresh produce',
  grains_pulses: 'Grains & pulses',
  honey: 'Honey & hive products',
  herbs: 'Herbs & botanicals',
  seeds: 'Seeds & saplings',
  other_farm: 'Other farm produce',
  handloom: 'Handloom',
  wool_textiles: 'Wool & textiles',
  woodcraft: 'Woodcraft',
  metalcraft: 'Metalcraft',
  pottery: 'Pottery & ceramics',
  jewellery: 'Jewellery',
  other_craft: 'Other craft',
  preserves: 'Preserves & jams',
  pickles: 'Pickles & ferments',
  tea_coffee: 'Tea & coffee',
  bakery: 'Bakery',
  spices: 'Spices & masalas',
  ready_food: 'Ready-to-eat foods',
  other_food: 'Other food',
  home_goods: 'Home goods',
  textiles: 'Textiles',
  food: 'Food',
  craft: 'Craft',
  personal_care: 'Personal care',
  other: 'Other',
  packaged_food: 'Packaged food',
  accessories: 'Accessories',
  multi_category: 'Multiple categories',
};

const SELLER_TYPE_LABELS: Record<string, string> = {
  individual: 'Individual maker or grower',
  artisan: 'Artisan or craftsperson',
  farmer: 'Farmer, grower or orchardist',
  home_business: 'Home-based business',
  proprietorship: 'Sole proprietorship',
  partnership: 'Partnership firm',
  private_limited: 'Private limited company',
  cooperative: 'Cooperative society',
  self_help_group: 'Self-help group (SHG)',
  other: 'Other structure',
};

const FALLBACK_DOC_LABELS: Record<string, string> = {
  id_proof: 'Government photo identity',
  address_proof: 'Address proof',
  business_registration: 'Business registration (Udyam, incorporation or shop licence)',
  gst_certificate: 'GST registration certificate (if registered)',
  fssai: 'FSSAI registration or licence',
  craft_evidence: 'Craft or workshop evidence',
  land_record: 'Land, orchard or cultivation record',
  cooperative_registration: 'Cooperative or SHG registration',
  resale_authorisation: 'Reseller authorisation from makers/brands',
  other: 'Other supporting document',
};

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

interface AddressForm {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

interface ShippingForm {
  dispatchDays: string;
  packaging: string;
  shipsAcrossIndia: boolean;
  coldChain: boolean;
  notes: string;
}

interface PayoutForm {
  method: 'bank_transfer' | 'upi';
  accountHolderName: string;
  accountLast4: string;
  ifsc: string;
  upiIdMasked: string;
  consent: boolean;
}

interface AgreementsForm {
  sellerAgreement: boolean;
  commissionDisclosure: boolean;
  authenticityPolicy: boolean;
  privacyPolicy: boolean;
  version: string;
}

interface WizardForm {
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
  yearsOperating: string;
  shipping: ShippingForm;
  payout: PayoutForm;
  agreements: AgreementsForm;
}

interface ApplicationDocument {
  id: string;
  docType: string;
  docLabel: string | null;
  originalName: string;
  status: string;
  reviewNote: string | null;
  uploadedAt: string;
}

interface ApplicationEvent {
  id: string;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  actorEmail: string | null;
  createdAt: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  status: string;
  detail: string;
  href?: string;
}

interface ApplicationResponse {
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
    operatingAddress: Record<string, unknown> | null;
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
    status: ApplicationStatus;
    revision: number;
    currentStep: number;
    businessName: string;
    sellerType: string;
    sellerCategory: string | null;
    categories: string[];
    address: Record<string, unknown>;
    gstin: string | null;
    phone: string | null;
    notes: string | null;
    data: Record<string, unknown>;
    verification: unknown;
    shipping: unknown;
    payout: unknown;
    agreement: unknown;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    lastSavedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  documents?: ApplicationDocument[];
  events?: ApplicationEvent[];
  requirements?: {
    required: string[];
    optional: string[];
    missing: string[];
    labels: Record<string, string>;
  };
  checklist?: ChecklistItem[];
  canWithdraw?: boolean;
  verification?: { emailVerified: boolean; phoneVerified: boolean; smsConfigured: boolean };
  payoutProvider?: { configured: boolean; provider: string; message: string };
  commissionNote?: string;
}

interface SellerConfigResponse {
  sellerCategories: SellerCategoryOption[];
  sellerTypes: string[];
  documentTypes: { id: string; label: string }[];
  commission: { defaultBp: number; note: string };
  payoutProvider: { configured: boolean; provider: string; message: string };
  verification: { email: boolean; sms: boolean; note: string };
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function newSubmitKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function emptyAddress(): AddressForm {
  return { line1: '', line2: '', city: '', state: 'Himachal Pradesh', pincode: '' };
}

function emptyForm(): WizardForm {
  return {
    fullName: '',
    phone: '',
    businessName: '',
    sellerType: 'individual',
    sellerCategory: '',
    tagline: '',
    story: '',
    region: '',
    village: '',
    address: emptyAddress(),
    dispatchAddress: emptyAddress(),
    dispatchSameAsOperating: true,
    categorySlugs: [],
    productGroups: [],
    originNarrative: '',
    authenticityDeclaration: false,
    categoryAnswers: {},
    gstin: '',
    panLast4: '',
    fssaiNumber: '',
    udyamNumber: '',
    businessRegistrationNumber: '',
    yearsOperating: '',
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
  };
}

function mergeAddress(primary: unknown, fallback: unknown): AddressForm {
  const a = asRecord(primary);
  const b = asRecord(fallback);
  const pick = (key: keyof AddressForm) => asString(a[key]) || asString(b[key]);
  return {
    line1: pick('line1'),
    line2: pick('line2'),
    city: pick('city'),
    state: pick('state') || 'Himachal Pradesh',
    pincode: pick('pincode'),
  };
}

function hydrateForm(response: ApplicationResponse | undefined, user: { fullName: string; email: string; emailVerified: boolean }): WizardForm {
  const form = emptyForm();
  if (!response?.exists) {
    return { ...form, fullName: user.fullName || '', phone: '' };
  }
  const seller = response.seller;
  const application = response.application;
  const data = asRecord(application?.data);

  const shipping = asRecord(data.shipping ?? application?.shipping);
  const payout = asRecord(data.payout ?? application?.payout);
  const agreements = asRecord(data.agreements ?? application?.agreement);
  const payoutMethod = asString(payout.method) === 'upi' ? 'upi' : 'bank_transfer';

  return {
    ...form,
    fullName: asString(data.fullName) || user.fullName || '',
    phone: asString(data.phone) || asString(application?.phone) || asString(asRecord(seller?.operatingAddress).phone),
    businessName: asString(data.businessName) || seller?.businessName || '',
    sellerType: asString(data.sellerType) || seller?.sellerType || 'individual',
    sellerCategory: (asString(data.sellerCategory) || seller?.sellerCategory || '') as SellerCategoryId | '',
    tagline: asString(data.tagline) || seller?.tagline || '',
    story: asString(data.story) || seller?.story || '',
    region: asString(data.region) || seller?.region || '',
    village: asString(data.village) || seller?.village || '',
    address: mergeAddress(data.address, seller?.operatingAddress),
    dispatchAddress: mergeAddress(data.dispatchAddress, seller?.pickupAddress),
    dispatchSameAsOperating: asBoolean(data.dispatchSameAsOperating, true),
    categorySlugs: asStringArray(data.categorySlugs).length
      ? asStringArray(data.categorySlugs)
      : asStringArray(application?.categories),
    productGroups: asStringArray(data.productGroups),
    originNarrative: asString(data.originNarrative),
    authenticityDeclaration: asBoolean(data.authenticityDeclaration),
    categoryAnswers: Object.fromEntries(
      Object.entries(asRecord(data.categoryAnswers))
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .slice(0, 12),
    ),
    gstin: asString(data.gstin) || seller?.gstin || '',
    panLast4: asString(data.panLast4) || seller?.panLast4 || '',
    fssaiNumber: asString(data.fssaiNumber),
    udyamNumber: asString(data.udyamNumber),
    businessRegistrationNumber: asString(data.businessRegistrationNumber),
    shipping: {
      dispatchDays: String(shipping.dispatchDays ?? form.shipping.dispatchDays),
      packaging: asString(shipping.packaging),
      shipsAcrossIndia: asBoolean(shipping.shipsAcrossIndia, true),
      coldChain: asBoolean(shipping.coldChain),
      notes: asString(shipping.notes),
    },
    payout: {
      method: payoutMethod,
      accountHolderName: asString(payout.accountHolderName),
      accountLast4: asString(payout.accountLast4),
      ifsc: asString(payout.ifsc),
      upiIdMasked: asString(payout.upiIdMasked),
      consent: asBoolean(payout.consent),
    },
    agreements: {
      sellerAgreement: asBoolean(agreements.sellerAgreement),
      commissionDisclosure: asBoolean(agreements.commissionDisclosure),
      authenticityPolicy: asBoolean(agreements.authenticityPolicy),
      privacyPolicy: asBoolean(agreements.privacyPolicy),
      version: asString(agreements.version, AGREEMENT_VERSION),
    },
    yearsOperating:
      data.yearsOperating === undefined || data.yearsOperating === null
        ? ''
        : String(data.yearsOperating),
  };
}

function requiredDocTypes(category: string, sellerType: string): string[] {
  const required = new Set<string>(['id_proof']);
  if (['cooperative', 'self_help_group', 'partnership', 'private_limited', 'proprietorship'].includes(sellerType)) {
    required.add('business_registration');
  }
  if (category === 'food_producer') required.add('fssai');
  if (category === 'local_brand') required.add('business_registration');
  if (category === 'retailer') {
    required.add('business_registration');
    required.add('resale_authorisation');
  }
  return [...required];
}

function optionalDocTypes(category: string, sellerType: string): string[] {
  const optional = new Set<string>(['address_proof', 'other']);
  if (['local_brand', 'retailer'].includes(category) || sellerType !== 'individual') optional.add('gst_certificate');
  if (category === 'artisan_craftsperson') optional.add('craft_evidence');
  if (category === 'farmer_grower') {
    optional.add('land_record');
    optional.add('cooperative_registration');
  }
  if (category === 'home_business') optional.add('business_registration');
  return [...optional];
}

function statusLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status as ApplicationStatus] ?? status.replaceAll('_', ' ');
}

function storeStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  return STORE_STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

function isLockedStatus(status: string | undefined): boolean {
  return ['submitted', 'under_review', 'approved', 'suspended'].includes(status ?? '');
}

function toPayload(form: WizardForm) {
  return {
    ...form,
    sellerCategory: form.sellerCategory || undefined,
    yearsOperating: form.yearsOperating === '' ? undefined : Number(form.yearsOperating),
    shipping: {
      ...form.shipping,
      dispatchDays: Number(form.shipping.dispatchDays) || 0,
    },
  };
}

function validateStep(
  step: number,
  form: WizardForm,
  context: { missingDocuments: string[]; hasUser: boolean },
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 1 && !context.hasUser) {
    errors.account = 'Create an account or sign in before continuing.';
  }
  if (step === 2 && !form.sellerCategory) {
    errors.sellerCategory = 'Choose the category that best describes your work.';
  }
  if (step === 3) {
    if (form.fullName.trim().length < 2) errors.fullName = 'Enter your full name.';
    if (!/^[6-9]\d{9}$/.test(form.phone.trim())) errors.phone = 'Enter a 10-digit Indian mobile number.';
    if (form.businessName.trim().length < 2) errors.businessName = 'Enter your shop, farm or maker name.';
    if (!form.sellerType) errors.sellerType = 'Choose the structure that applies to you.';
    if (form.story.trim().length < 80) errors.story = 'Tell buyers about your work in at least 80 characters.';
  }
  if (step === 4) {
    if (form.region.trim().length < 2) errors.region = 'Enter your district or region.';
    if (form.village.trim().length < 2) errors.village = 'Enter your village, town or valley.';
    if (form.address.line1.trim().length < 4) errors['address.line1'] = 'Enter the street, building or landmark.';
    if (form.address.city.trim().length < 2) errors['address.city'] = 'Enter the town or tehsil.';
    if (!/^\d{6}$/.test(form.address.pincode.trim())) errors['address.pincode'] = 'Enter a valid 6-digit PIN code.';
    if (!form.dispatchSameAsOperating) {
      if (form.dispatchAddress.line1.trim().length < 4) {
        errors['dispatchAddress.line1'] = 'Enter the dispatch street, building or landmark.';
      }
      if (form.dispatchAddress.city.trim().length < 2) errors['dispatchAddress.city'] = 'Enter the dispatch town or tehsil.';
      if (!/^\d{6}$/.test(form.dispatchAddress.pincode.trim())) {
        errors['dispatchAddress.pincode'] = 'Enter a valid 6-digit PIN code.';
      }
    }
  }
  if (step === 5) {
    if (!form.categorySlugs.length) errors.categorySlugs = 'Choose at least one product category.';
    if (!form.productGroups.length) errors.productGroups = 'Choose at least one product group.';
    if (form.originNarrative.trim().length < 40) {
      errors.originNarrative = 'Describe where and how your products are made in at least 40 characters.';
    }
    if (!form.authenticityDeclaration) {
      errors.authenticityDeclaration = 'Confirm the origin and authenticity declaration.';
    }
    if (['food_producer', 'retailer'].includes(form.sellerCategory)) {
      const answered = Object.values(form.categoryAnswers).some((value) => value.trim().length > 0);
      if (!answered) errors.categoryAnswers = 'Answer at least one of the category-specific questions.';
    }
  }
  if (step === 6) {
    for (const type of context.missingDocuments) {
      errors[`documents.${type}`] = `${FALLBACK_DOC_LABELS[type] ?? type} is required before submission.`;
    }
    if (form.sellerCategory === 'food_producer' && !form.fssaiNumber.trim()) {
      errors.fssaiNumber = 'Enter your FSSAI registration or licence number.';
    }
  }
  if (step === 7) {
    const days = Number(form.shipping.dispatchDays);
    if (!Number.isInteger(days) || days < 1 || days > 15) errors['shipping.dispatchDays'] = 'Choose a dispatch window of 1–15 days.';
    if (form.shipping.packaging.trim().length < 5) {
      errors['shipping.packaging'] = 'Describe how products are packed.';
    }
  }
  if (step === 9) {
    if (!form.agreements.sellerAgreement) errors['agreements.sellerAgreement'] = 'Accept the seller agreement.';
    if (!form.agreements.commissionDisclosure) {
      errors['agreements.commissionDisclosure'] = 'Accept the platform fee disclosure.';
    }
    if (!form.agreements.authenticityPolicy || !form.agreements.privacyPolicy) {
      errors['agreements.authenticityPolicy'] = 'Accept the authenticity and privacy terms.';
    }
  }
  return errors;
}

function firstStepWithErrors(errors: Record<string, string>): number {
  const keys = Object.keys(errors);
  if (keys.some((key) => ['account', 'email'].includes(key))) return 1;
  if (keys.some((key) => key === 'sellerCategory')) return 2;
  if (keys.some((key) => ['fullName', 'phone', 'businessName', 'sellerType', 'story'].includes(key))) return 3;
  if (keys.some((key) => key.startsWith('address.') || key.startsWith('dispatchAddress.') || ['region', 'village'].includes(key))) {
    return 4;
  }
  if (
    keys.some((key) =>
      ['categorySlugs', 'productGroups', 'originNarrative', 'authenticityDeclaration', 'categoryAnswers'].includes(key),
    )
  ) {
    return 5;
  }
  if (keys.some((key) => key.startsWith('documents.') || key === 'fssaiNumber')) return 6;
  if (keys.some((key) => key.startsWith('shipping.'))) return 7;
  if (keys.some((key) => key.startsWith('agreements.'))) return 9;
  return 10;
}

/* -------------------------------------------------------------------------- */
/*                                  Page                                      */
/* -------------------------------------------------------------------------- */

export function BecomeAMakerPage() {
  const { user, refresh, config: siteConfig } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [step, setStep] = useState(1);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedNow, setSubmittedNow] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState('');
  const [forceEdit, setForceEdit] = useState(() => params.get('edit') === '1');
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regTerms, setRegTerms] = useState(false);

  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const revisionRef = useRef(0);
  // Assigned lazily on the first submit attempt so rendering stays pure and a
  // retry of the same submit action reuses the same idempotency key.
  const submitKeyRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingDocTypeRef = useRef<string>('id_proof');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);

  const config = useQuery({
    queryKey: ['seller-config'],
    queryFn: () => api<SellerConfigResponse>('/seller/config'),
    enabled: Boolean(user),
    staleTime: 300_000,
  });

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[]; subcategories: Category[] }>('/categories'),
    staleTime: 300_000,
  });

  const application = useQuery({
    // Scope the cached application to the signed-in account so switching
    // accounts in one tab cannot show another maker's draft.
    queryKey: ['seller-application', user?.id ?? 'anonymous'],
    queryFn: () => api<ApplicationResponse>('/seller/application'),
    enabled: Boolean(user),
    retry: false,
  });

  const applicationStatus = application.data?.application?.status;
  const locked = isLockedStatus(applicationStatus);

  const sellerCategories: SellerCategoryOption[] =
    config.data?.sellerCategories?.length ? config.data.sellerCategories : FALLBACK_CATEGORIES;
  const selectedCategory =
    sellerCategories.find((category) => category.id === form.sellerCategory) ??
    FALLBACK_CATEGORIES.find((category) => category.id === form.sellerCategory);

  const docLabels = {
    ...FALLBACK_DOC_LABELS,
    ...(application.data?.requirements?.labels ?? {}),
    ...Object.fromEntries((config.data?.documentTypes ?? []).map((type) => [type.id, type.label])),
  };

  const documents = application.data?.documents ?? [];
  const requiredDocs = requiredDocTypes(form.sellerCategory, form.sellerType);
  const optionalDocs = optionalDocTypes(form.sellerCategory, form.sellerType).filter(
    (type) => !requiredDocs.includes(type),
  );
  const availableDocTypes = new Set(
    documents.filter((document) => document.status !== 'rejected').map((document) => document.docType),
  );
  const missingDocuments = requiredDocs.filter((type) => !availableDocTypes.has(type));

  // Hydrate the editable form once per signed-in account. Adjusting state
  // during render is the documented React pattern for deriving editable state
  // from fetched data; the `hydratedFor` marker makes it a one-time change.
  if (user && application.data && hydratedFor !== user.id) {
    setHydratedFor(user.id);
    setForm(hydrateForm(application.data, user));
    setLastSavedAt(application.data.application?.lastSavedAt ?? null);
    const requested = Number(params.get('step'));
    const candidate =
      Number.isInteger(requested) && requested >= 1 && requested <= TOTAL_STEPS
        ? requested
        : application.data.application?.currentStep || 1;
    setStep(Math.min(Math.max(candidate, 1), TOTAL_STEPS));
  }
  const hydrated = Boolean(user && hydratedFor === user.id);

  const persistDraft = useCallback(
    async (nextStep: number, payload: WizardForm, silent = false): Promise<boolean> => {
      if (!user) return false;
      const revision = revisionRef.current;
      setSaving(true);
      try {
        const result = await api<{ savedAt: string }>('/seller/application/draft', {
          method: 'POST',
          body: { currentStep: nextStep, data: toPayload(payload) },
        });
        setLastSavedAt(result.savedAt);
        setSaveError(null);
        if (revisionRef.current === revision) setDirty(false);
        if (!silent) toast.push('Draft saved.');
        return true;
      } catch (error) {
        setSaveError(errorMessage(error));
        if (!silent) toast.push(errorMessage(error), 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [toast, user],
  );

  useEffect(() => {
    if (!hydrated || !user || !dirty || locked) return;
    const timer = setTimeout(() => {
      void persistDraft(step, form, true);
    }, 1400);
    return () => clearTimeout(timer);
  }, [dirty, form, hydrated, locked, persistDraft, step, user]);

  const patch = useCallback((changes: Partial<WizardForm>) => {
    revisionRef.current += 1;
    setDirty(true);
    setForm((previous) => ({ ...previous, ...changes }));
  }, []);

  const patchAddress = useCallback((key: 'address' | 'dispatchAddress', changes: Partial<AddressForm>) => {
    revisionRef.current += 1;
    setDirty(true);
    setForm((previous) => ({ ...previous, [key]: { ...previous[key], ...changes } }));
  }, []);

  const patchShipping = useCallback((changes: Partial<ShippingForm>) => {
    revisionRef.current += 1;
    setDirty(true);
    setForm((previous) => ({ ...previous, shipping: { ...previous.shipping, ...changes } }));
  }, []);

  const patchAgreements = useCallback((changes: Partial<AgreementsForm>) => {
    revisionRef.current += 1;
    setDirty(true);
    setForm((previous) => ({ ...previous, agreements: { ...previous.agreements, ...changes } }));
  }, []);

  const focusHeading = () => {
    window.setTimeout(() => {
      headingRef.current?.focus();
      wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  };

  const goNext = async () => {
    const nextErrors = validateStep(step, form, { missingDocuments, hasUser: Boolean(user) });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.push('A few fields still need attention.', 'error');
      return;
    }
    setErrors({});
    if (user && !locked) {
      const ok = await persistDraft(Math.min(step + 1, TOTAL_STEPS), form, true);
      if (!ok) {
        toast.push('We could not save your progress. Check your connection and try again.', 'error');
        return;
      }
    }
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
    focusHeading();
  };

  const goBack = () => {
    setErrors({});
    setStep((current) => Math.max(current - 1, 1));
    focusHeading();
  };

  const jumpTo = (target: number) => {
    if (!user && target > 1) {
      toast.push('Create your maker account or sign in first to save your progress.', 'info');
      setStep(1);
      focusHeading();
      return;
    }
    setErrors({});
    setStep(target);
    focusHeading();
  };

  const register = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (regFullName.trim().length < 2) nextErrors.fullName = 'Enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(regEmail.trim())) nextErrors.email = 'Enter a valid email address.';
    if (regPassword.length < 10 || !/[a-zA-Z]/.test(regPassword) || !/[0-9]/.test(regPassword)) {
      nextErrors.password = 'Use at least 10 characters with at least one letter and one number.';
    }
    if (regPassword !== regConfirm) nextErrors.confirm = 'The two passwords do not match.';
    if (!regTerms) nextErrors.terms = 'Accept the terms to create an account.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setRegistering(true);
    try {
      const result = await api<{ devVerifyUrl?: string | null }>('/auth/register', {
        method: 'POST',
        body: {
          fullName: regFullName.trim(),
          email: regEmail.trim(),
          password: regPassword,
          acceptedTerms: true,
        },
      });
      patch({ fullName: regFullName.trim() });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      if (result.devVerifyUrl) setDevVerifyUrl(result.devVerifyUrl);
      toast.push('Account created. Confirm your email, then continue.');
    } catch (error) {
      setErrors(errorFields(error));
      toast.push(errorMessage(error), 'error');
    } finally {
      setRegistering(false);
    }
  };

  const resendVerification = async () => {
    setResending(true);
    try {
      const result = await api<{ devVerifyUrl?: string | null }>('/auth/resend-verification', { method: 'POST' });
      setDevVerifyUrl(result.devVerifyUrl ?? null);
      toast.push('Verification email requested. Check your inbox.');
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setResending(false);
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.push('Documents must be 5 MB or smaller.', 'error');
      return;
    }
    setUploadingType(pendingDocTypeRef.current);
    try {
      const body = new FormData();
      body.append('document', file);
      body.append('docType', pendingDocTypeRef.current);
      await api('/seller/documents', { method: 'POST', body });
      toast.push('Document uploaded privately. Only authorised reviewers can open it.');
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setUploadingType(null);
    }
  };

  const removeDocument = async (document: ApplicationDocument) => {
    if (!window.confirm(`Remove ${document.originalName}? Reviewers will no longer see this file.`)) return;
    try {
      await api(`/seller/documents/${document.id}`, { method: 'DELETE' });
      toast.push('Document removed.');
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    }
  };

  const withdrawApplication = async () => {
    setWithdrawing(true);
    try {
      await api('/seller/application/withdraw', {
        method: 'POST',
        body: { reason: withdrawReason.trim() || undefined },
      });
      setWithdrawOpen(false);
      setWithdrawReason('');
      setSubmittedNow(false);
      // Stay on the read-only summary so the withdrawal is visible. The
      // "Start a new application" action opens the wizard with the previous
      // answers still in the form.
      submitKeyRef.current = '';
      setDirty(false);
      toast.push('Application withdrawn. Your previous answers are kept if you want to start again.');
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  const startNewApplication = async () => {
    setSaving(true);
    try {
      // A withdrawn application stays on record. Saving first opens a fresh
      // draft so the maker can continue editing without overwriting history.
      await persistDraft(step, form, true);
      setForceEdit(true);
      submitKeyRef.current = '';
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      await refresh();
    } catch (error) {
      toast.push(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      setStep(1);
      return;
    }
    const combined: Record<string, string> = {};
    for (let number = 1; number <= TOTAL_STEPS; number += 1) {
      Object.assign(combined, validateStep(number, form, { missingDocuments, hasUser: true }));
    }
    if (!user.emailVerified) {
      combined.email = 'Confirm your email address before submitting.';
    }
    if (Object.keys(combined).length) {
      setErrors(combined);
      setStep(firstStepWithErrors(combined));
      toast.push('Some sections still need attention. We have taken you to the first one.', 'error');
      focusHeading();
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      if (!submitKeyRef.current) {
        submitKeyRef.current = newSubmitKey();
      }
      const result = await api<{ message: string; deduplicated?: boolean }>('/seller/application/submit', {
        method: 'POST',
        body: { data: toPayload(form), idempotencyKey: submitKeyRef.current },
      });
      setSubmittedMessage(
        result.deduplicated
          ? 'This submission was already received. We have not created a duplicate.'
          : result.message,
      );
      setSubmittedNow(true);
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['seller-application'] });
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      await refresh();
      focusHeading();
    } catch (error) {
      setErrors(errorFields(error));
      toast.push(errorMessage(error), 'error');
      const fields = errorFields(error);
      if (Object.keys(fields).length) setStep(firstStepWithErrors(fields));
    } finally {
      setSubmitting(false);
    }
  };

  const completedSteps = STEPS.filter((entry) => {
    if (entry.number === 1) return Boolean(user);
    return Object.keys(validateStep(entry.number, form, { missingDocuments, hasUser: Boolean(user) })).length === 0;
  }).length;

  const commissionBp = config.data?.commission.defaultBp ?? 1500;

  const renderAccountStep = () => {
    if (!user) {
      return (
        <form className="space-y-5" onSubmit={register} noValidate>
          <Alert tone="info" title="One account, saved progress">
            Create your account first. Everything you enter afterwards is saved as a draft against this account, so you
            can leave and return without starting again.
          </Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.fullName} htmlFor="reg-name">
              <Input
                id="reg-name"
                autoComplete="name"
                value={regFullName}
                invalid={Boolean(errors.fullName)}
                onChange={(event) => setRegFullName(event.target.value)}
              />
            </Field>
            <Field label="Email address" required error={errors.email} htmlFor="reg-email">
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={regEmail}
                invalid={Boolean(errors.email)}
                onChange={(event) => setRegEmail(event.target.value)}
              />
            </Field>
            <Field
              label="Password"
              required
              hint="10+ characters, letter and number"
              error={errors.password}
              htmlFor="reg-password"
            >
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={regPassword}
                invalid={Boolean(errors.password)}
                onChange={(event) => setRegPassword(event.target.value)}
              />
            </Field>
            <Field label="Confirm password" required error={errors.confirm} htmlFor="reg-confirm">
              <Input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                value={regConfirm}
                invalid={Boolean(errors.confirm)}
                onChange={(event) => setRegConfirm(event.target.value)}
              />
            </Field>
          </div>
          <div>
            <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-bark">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#572B36]"
                checked={regTerms}
                onChange={(event) => setRegTerms(event.target.checked)}
              />
              <span>
                I accept the{' '}
                <Link to="/policies/terms" className="underline underline-offset-2 hover:text-orchard">
                  terms of use
                </Link>{' '}
                and{' '}
                <Link to="/policies/privacy" className="underline underline-offset-2 hover:text-orchard">
                  privacy notice
                </Link>
                .
              </span>
            </label>
            {errors.terms ? <p className="mt-1.5 text-xs text-terra" role="alert">{errors.terms}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" loading={registering}>
              Create account
            </Button>
            <Link
              to={`/login?next=${encodeURIComponent('/sell')}`}
              className="text-sm text-forest underline underline-offset-2 hover:text-orchard"
            >
              I already have an account
            </Link>
          </div>
        </form>
      );
    }

    return (
      <div className="space-y-5">
        <div className="border border-line bg-warm-paper p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">{user.fullName || 'Maker account'}</p>
              <p className="mt-0.5 text-sm text-muted">{user.email}</p>
            </div>
            <StatusBadge
              status={user.emailVerified ? 'approved' : 'pending'}
              label={user.emailVerified ? 'Email confirmed' : 'Email not confirmed'}
            />
          </div>
        </div>
        {user.emailVerified ? (
          <Alert tone="success" title="Email confirmed">
            Your account is verified. Keep filling the application — nothing is sent to the review team until the final review step.
          </Alert>
        ) : (
          <Alert tone="warning" title="Confirm your email to submit">
            <p>
              We sent a confirmation link to {user.email}. You can keep filling in the application, but it cannot be
              submitted until the address is confirmed.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Button type="button" variant="secondary" size="sm" loading={resending} onClick={resendVerification}>
                Resend confirmation email
              </Button>
              {devVerifyUrl ? (
                <a href={devVerifyUrl} className="text-xs underline underline-offset-2">
                  Open the development verification link
                </a>
              ) : null}
            </div>
          </Alert>
        )}
        <p className="text-xs leading-relaxed text-muted">
          Your mobile number is collected in the profile step. SMS verification is not configured here, so reviewers
          verify phone numbers manually during the application review.
        </p>
      </div>
    );
  };

  const renderCategoryStep = () => (
    <div className="space-y-5">
      <Alert tone="info" title="Choose what fits you best">
        This shapes the questions, evidence and product groups that follow. You can change it before submitting, but a
        different category may require different documents.
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Seller category">
        {sellerCategories.map((category) => {
          const selected = form.sellerCategory === category.id;
          return (
            <label
              key={category.id}
              className={`cursor-pointer border p-4 transition-colors ${
                selected ? 'border-orchard bg-orchard/[0.04]' : 'border-line bg-surface hover:border-orchard/40'
              }`}
            >
              <input
                type="radio"
                name="sellerCategory"
                value={category.id}
                checked={selected}
                onChange={() => patch({ sellerCategory: category.id, productGroups: [] })}
                className="sr-only"
              />
              <div className="flex items-start justify-between gap-3">
                <span className="font-display text-xl leading-tight text-orchard">{category.label}</span>
                <span
                  aria-hidden
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${
                    selected ? 'border-orchard bg-orchard' : 'border-sand bg-surface'
                  }`}
                />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{category.description}</p>
            </label>
          );
        })}
      </div>
      {errors.sellerCategory ? (
        <p className="text-xs text-terra" role="alert">
          {errors.sellerCategory}
        </p>
      ) : null}
    </div>
  );

  const renderProfileStep = () => (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.fullName} htmlFor="profile-name">
          <Input
            id="profile-name"
            autoComplete="name"
            value={form.fullName}
            invalid={Boolean(errors.fullName)}
            onChange={(event) => patch({ fullName: event.target.value })}
          />
        </Field>
        <Field
          label="Mobile number"
          required
          hint="10 digits, no country code"
          error={errors.phone}
          htmlFor="profile-phone"
        >
          <Input
            id="profile-phone"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            value={form.phone}
            invalid={Boolean(errors.phone)}
            onChange={(event) => patch({ phone: event.target.value.replace(/\D/g, '').slice(0, 10) })}
          />
        </Field>
        <Field label="Shop, farm or maker name" required error={errors.businessName} htmlFor="profile-business">
          <Input
            id="profile-business"
            value={form.businessName}
            invalid={Boolean(errors.businessName)}
            onChange={(event) => patch({ businessName: event.target.value })}
          />
        </Field>
        <Field label="How you operate" required error={errors.sellerType} htmlFor="profile-type">
          <Select
            id="profile-type"
            value={form.sellerType}
            onChange={(event) => patch({ sellerType: event.target.value })}
          >
            {Object.entries(SELLER_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Years of experience" hint="Optional" htmlFor="profile-years">
          <Input
            id="profile-years"
            inputMode="numeric"
            value={form.yearsOperating}
            onChange={(event) => patch({ yearsOperating: event.target.value.replace(/\D/g, '').slice(0, 3) })}
          />
        </Field>
        <Field label="One-line description" hint="Optional, up to 160 characters" htmlFor="profile-tagline">
          <Input
            id="profile-tagline"
            maxLength={160}
            value={form.tagline}
            onChange={(event) => patch({ tagline: event.target.value })}
            placeholder="Hand-knitted Kullu wool, made at home"
          />
        </Field>
      </div>
      <Field
        label="Your story"
        required
        hint={`${form.story.trim().length}/3000 characters · minimum 80`}
        error={errors.story}
        htmlFor="profile-story"
      >
        <Textarea
          id="profile-story"
          rows={6}
          maxLength={3000}
          value={form.story}
          invalid={Boolean(errors.story)}
          onChange={(event) => patch({ story: event.target.value })}
          placeholder="What do you make or grow? Who taught you? Where is your workshop, orchard or kitchen, and what should a buyer understand about your work?"
        />
      </Field>
    </div>
  );

  const renderAddressFields = (key: 'address' | 'dispatchAddress', prefix: string) => {
    const address = form[key];
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address line 1" required error={errors[`${prefix}.line1`]} className="sm:col-span-2" htmlFor={`${prefix}-line1`}>
          <Input
            id={`${prefix}-line1`}
            autoComplete="address-line1"
            value={address.line1}
            invalid={Boolean(errors[`${prefix}.line1`])}
            onChange={(event) => patchAddress(key, { line1: event.target.value })}
          />
        </Field>
        <Field label="Address line 2" hint="Optional" className="sm:col-span-2" htmlFor={`${prefix}-line2`}>
          <Input
            id={`${prefix}-line2`}
            autoComplete="address-line2"
            value={address.line2}
            onChange={(event) => patchAddress(key, { line2: event.target.value })}
          />
        </Field>
        <Field label="Town, tehsil or city" required error={errors[`${prefix}.city`]} htmlFor={`${prefix}-city`}>
          <Input
            id={`${prefix}-city`}
            autoComplete="address-level2"
            value={address.city}
            invalid={Boolean(errors[`${prefix}.city`])}
            onChange={(event) => patchAddress(key, { city: event.target.value })}
          />
        </Field>
        <Field label="PIN code" required error={errors[`${prefix}.pincode`]} htmlFor={`${prefix}-pincode`}>
          <Input
            id={`${prefix}-pincode`}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={address.pincode}
            invalid={Boolean(errors[`${prefix}.pincode`])}
            onChange={(event) => patchAddress(key, { pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })}
          />
        </Field>
        <Field label="State" className="sm:col-span-2" htmlFor={`${prefix}-state`}>
          <Input
            id={`${prefix}-state`}
            value={address.state}
            onChange={(event) => patchAddress(key, { state: event.target.value })}
          />
        </Field>
      </div>
    );
  };

  const renderLocationStep = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="District or region" required error={errors.region} htmlFor="location-region">
          <Input
            id="location-region"
            list="himachal-districts"
            value={form.region}
            invalid={Boolean(errors.region)}
            onChange={(event) => patch({ region: event.target.value })}
            placeholder="Kullu"
          />
          <datalist id="himachal-districts">
            {HIMACHAL_DISTRICTS.map((district) => (
              <option key={district} value={district} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Village, town or valley"
          required
          error={errors.village}
          htmlFor="location-village"
        >
          <Input
            id="location-village"
            value={form.village}
            invalid={Boolean(errors.village)}
            onChange={(event) => patch({ village: event.target.value })}
            placeholder="Naggar"
          />
        </Field>
      </div>

      <div>
        <h3 className="font-display text-xl text-orchard">Operating address</h3>
        <p className="mt-1 text-xs text-muted">Where your work happens. This is not shown publicly unless you publish it.</p>
        <div className="mt-4">{renderAddressFields('address', 'address')}</div>
      </div>

      <label className="flex items-start gap-2.5 border border-line bg-warm-paper p-4 text-[13px] leading-relaxed text-bark">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#572B36]"
          checked={form.dispatchSameAsOperating}
          onChange={(event) => patch({ dispatchSameAsOperating: event.target.checked })}
        />
        <span>Dispatch from the same address.</span>
      </label>

      {!form.dispatchSameAsOperating ? (
        <div>
          <h3 className="font-display text-xl text-orchard">Dispatch address</h3>
          <p className="mt-1 text-xs text-muted">
            Courier pickup details. Only shared with the delivery partner when an order is despatched.
          </p>
          <div className="mt-4">{renderAddressFields('dispatchAddress', 'dispatchAddress')}</div>
        </div>
      ) : null}
    </div>
  );

  const toggleCategory = (slug: string) => {
    const selected = form.categorySlugs.includes(slug);
    patch({
      categorySlugs: selected
        ? form.categorySlugs.filter((item) => item !== slug)
        : [...form.categorySlugs, slug].slice(0, 8),
    });
  };

  const toggleProductGroup = (group: string) => {
    const selected = form.productGroups.includes(group);
    patch({
      productGroups: selected
        ? form.productGroups.filter((item) => item !== group)
        : [...form.productGroups, group],
    });
  };

  const setAnswer = (key: string, value: string) => {
    patch({ categoryAnswers: { ...form.categoryAnswers, [key]: value } });
  };

  const renderOriginStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-xl text-orchard">Product categories</h3>
        <p className="mt-1 text-xs text-muted">Choose up to eight. These control where your listings appear in the shop.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(categories.data?.categories ?? []).map((category) => {
            const checked = form.categorySlugs.includes(category.slug);
            return (
              <label
                key={category.id}
                className={`flex cursor-pointer items-center gap-2.5 border px-3 py-2.5 text-[13px] ${
                  checked ? 'border-orchard/50 bg-orchard/[0.04] text-ink' : 'border-line bg-surface text-bark'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#572B36]"
                  checked={checked}
                  onChange={() => toggleCategory(category.slug)}
                />
                <span>{category.name}</span>
              </label>
            );
          })}
        </div>
        {categories.isLoading ? <p className="mt-2 text-xs text-muted">Loading shop categories…</p> : null}
        {categories.isError ? (
          <p className="mt-2 text-xs text-terra" role="alert">
            Shop categories could not be loaded. Refresh the page before submitting.
          </p>
        ) : null}
        {errors.categorySlugs ? (
          <p className="mt-2 text-xs text-terra" role="alert">
            {errors.categorySlugs}
          </p>
        ) : null}
      </div>

      {selectedCategory ? (
        <div>
          <h3 className="font-display text-xl text-orchard">What you will sell</h3>
          <p className="mt-1 text-xs text-muted">Specific groups help us route your application to the right reviewer.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedCategory.productGroups.map((group) => {
              const checked = form.productGroups.includes(group);
              return (
                <label
                  key={group}
                  className={`cursor-pointer border px-3 py-1.5 text-[12px] ${
                    checked ? 'border-orchard bg-orchard text-warm-paper' : 'border-line bg-surface text-bark'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleProductGroup(group)}
                  />
                  {PRODUCT_GROUP_LABELS[group] ?? group}
                </label>
              );
            })}
          </div>
          {errors.productGroups ? (
            <p className="mt-2 text-xs text-terra" role="alert">
              {errors.productGroups}
            </p>
          ) : null}
        </div>
      ) : null}

      <Field
        label="Where it comes from and how it is made"
        required
        hint={`${form.originNarrative.trim().length}/2000 characters · minimum 40`}
        error={errors.originNarrative}
        htmlFor="origin-narrative"
      >
        <Textarea
          id="origin-narrative"
          rows={6}
          maxLength={2000}
          value={form.originNarrative}
          invalid={Boolean(errors.originNarrative)}
          onChange={(event) => patch({ originNarrative: event.target.value })}
          placeholder="Name the village or valley, the materials or ingredients, the season, and the people involved. This is the evidence a reviewer uses to understand provenance."
        />
      </Field>

      {selectedCategory ? (
        <div className="space-y-4 border border-line bg-warm-paper p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-harvest">Category-specific questions</p>
          {selectedCategory.originPrompts.map((prompt, index) => {
            const key = `prompt-${index}`;
            return (
              <Field key={key} label={prompt} htmlFor={`origin-${key}`}>
                <Textarea
                  id={`origin-${key}`}
                  rows={3}
                  maxLength={800}
                  value={form.categoryAnswers[key] ?? ''}
                  onChange={(event) => setAnswer(key, event.target.value)}
                />
              </Field>
            );
          })}
          {errors.categoryAnswers ? (
            <p className="text-xs text-terra" role="alert">
              {errors.categoryAnswers}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-bark">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[#572B36]"
            checked={form.authenticityDeclaration}
            onChange={(event) => patch({ authenticityDeclaration: event.target.checked })}
          />
          <span>
            I confirm that the origin, materials and production details I have given are accurate, and that I can
            evidence them if asked. I understand that misleading provenance claims can lead to removal from the
            marketplace.
          </span>
        </label>
        {errors.authenticityDeclaration ? (
          <p className="mt-1.5 text-xs text-terra" role="alert">
            {errors.authenticityDeclaration}
          </p>
        ) : null}
      </div>
    </div>
  );

  const renderDocRow = (type: string, required: boolean) => {
    const current = documents.find((document) => document.docType === type && document.status !== 'rejected');
    const rejected = documents.find((document) => document.docType === type && document.status === 'rejected');
    return (
      <li key={type} className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
        <div className="min-w-0">
          <p className="text-sm text-ink">
            {docLabels[type] ?? type}
            {required ? <span className="ml-1 text-terra">*</span> : null}
          </p>
          {current ? (
            <p className="mt-1 truncate text-xs text-muted">
              {current.originalName} · {formatDate(current.uploadedAt)} ·{' '}
              {current.status === 'accepted' ? 'Accepted' : 'Awaiting review'}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              {required ? 'Required before submission' : 'Optional supporting evidence'}
            </p>
          )}
          {rejected ? (
            <p className="mt-1 text-xs text-[#8e4630]">
              Previous file rejected{rejected.reviewNote ? `: ${rejected.reviewNote}` : '.'}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={uploadingType === type}
            onClick={() => {
              pendingDocTypeRef.current = type;
              fileInputRef.current?.click();
            }}
          >
            {current ? 'Replace' : 'Upload'}
          </Button>
          {current ? (
            <button
              type="button"
              className="text-xs text-muted underline underline-offset-2 hover:text-terra"
              onClick={() => void removeDocument(current)}
            >
              Remove
            </button>
          ) : null}
        </div>
      </li>
    );
  };

  const extraDocuments = documents.filter(
    (document) => !requiredDocs.includes(document.docType) && !optionalDocs.includes(document.docType),
  );

  const renderVerificationStep = () => (
    <div className="space-y-6">
      <Alert tone="info" title="Only what applies to you">
        GSTIN, incorporation and trademark registration are not demanded from every seller. Requirements depend on your
        structure, turnover, products and applicable law. Food businesses must hold the applicable FSSAI registration or
        licence before selling.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="GSTIN" hint="If registered; optional evidence" htmlFor="verify-gstin">
          <Input
            id="verify-gstin"
            value={form.gstin}
            onChange={(event) => patch({ gstin: event.target.value.toUpperCase() })}
            maxLength={20}
          />
        </Field>
        <Field label="PAN (last four characters)" hint="Optional" htmlFor="verify-pan">
          <Input
            id="verify-pan"
            value={form.panLast4}
            onChange={(event) => patch({ panLast4: event.target.value.toUpperCase() })}
            maxLength={4}
          />
        </Field>
        <Field
          label="FSSAI registration or licence number"
          required={form.sellerCategory === 'food_producer'}
          hint={form.sellerCategory === 'food_producer' ? 'Required for food' : 'If you sell food'}
          error={errors.fssaiNumber}
          htmlFor="verify-fssai"
        >
          <Input
            id="verify-fssai"
            value={form.fssaiNumber}
            invalid={Boolean(errors.fssaiNumber)}
            onChange={(event) => patch({ fssaiNumber: event.target.value.replace(/\s/g, '') })}
            maxLength={20}
          />
        </Field>
        <Field label="Udyam registration number" hint="Optional" htmlFor="verify-udyam">
          <Input
            id="verify-udyam"
            value={form.udyamNumber}
            onChange={(event) => patch({ udyamNumber: event.target.value.toUpperCase() })}
            maxLength={30}
          />
        </Field>
        <Field label="Business registration number" hint="If applicable" className="sm:col-span-2" htmlFor="verify-business">
          <Input
            id="verify-business"
            value={form.businessRegistrationNumber}
            onChange={(event) => patch({ businessRegistrationNumber: event.target.value })}
            maxLength={60}
          />
        </Field>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl text-orchard">Private verification documents</h3>
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted">PDF, JPEG or PNG · max 5 MB</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Files are stored outside the public web root and served only through authorised review endpoints. They are not
          attached to your public maker page.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={handleFile}
          aria-label="Upload verification document"
        />
        <ul className="mt-4 border-t border-line">
          {requiredDocs.map((type) => renderDocRow(type, true))}
          {optionalDocs.map((type) => renderDocRow(type, false))}
          {extraDocuments.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-line py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink">{document.docLabel ?? docLabels[document.docType] ?? document.docType}</p>
                <p className="mt-1 truncate text-xs text-muted">
                  {document.originalName} · {formatDate(document.uploadedAt)} ·{' '}
                  {document.status === 'accepted' ? 'Accepted' : document.status === 'rejected' ? 'Rejected' : 'Awaiting review'}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted underline underline-offset-2 hover:text-terra"
                onClick={() => void removeDocument(document)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {missingDocuments.length ? (
          <p className="mt-3 text-xs text-[#8e4630]" role="status">
            Still required: {missingDocuments.map((type) => docLabels[type] ?? type).join(', ')}
          </p>
        ) : (
          <p className="mt-3 text-xs text-forest" role="status">
            All currently required documents are uploaded. Reviewers may still ask for clarification.
          </p>
        )}
      </div>
    </div>
  );

  const renderShippingStep = () => (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Dispatch window"
          required
          hint="Working days after a paid order"
          error={errors['shipping.dispatchDays']}
          htmlFor="shipping-days"
        >
          <Select
            id="shipping-days"
            value={form.shipping.dispatchDays}
            onChange={(event) => patchShipping({ dispatchDays: event.target.value })}
          >
            {Array.from({ length: 15 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={String(day)}>
                Within {day} {day === 1 ? 'day' : 'days'}
              </option>
            ))}
          </Select>
        </Field>
        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-2.5 text-[13px] text-bark">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#572B36]"
              checked={form.shipping.shipsAcrossIndia}
              onChange={(event) => patchShipping({ shipsAcrossIndia: event.target.checked })}
            />
            Ships across India
          </label>
          <label className="flex items-center gap-2.5 text-[13px] text-bark">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#572B36]"
              checked={form.shipping.coldChain}
              onChange={(event) => patchShipping({ coldChain: event.target.checked })}
            />
            Requires cold-chain handling
          </label>
        </div>
      </div>
      <Field
        label="How you pack orders"
        required
        hint="Materials, protection and labelling"
        error={errors['shipping.packaging']}
        htmlFor="shipping-packaging"
      >
        <Textarea
          id="shipping-packaging"
          rows={4}
          maxLength={500}
          value={form.shipping.packaging}
          invalid={Boolean(errors['shipping.packaging'])}
          onChange={(event) => patchShipping({ packaging: event.target.value })}
          placeholder="Recycled board box, wool wrap, tamper-evident label, and a note about storage."
        />
      </Field>
      <Field label="Dispatch notes" hint="Optional, up to 800 characters" htmlFor="shipping-notes">
        <Textarea
          id="shipping-notes"
          rows={3}
          maxLength={800}
          value={form.shipping.notes}
          onChange={(event) => patchShipping({ notes: event.target.value })}
          placeholder="Seasonal delays, courier preferences, or fragile-item handling."
        />
      </Field>
    </div>
  );

  const payoutMessage =
    application.data?.payoutProvider?.message ??
    config.data?.payoutProvider.message ??
    'Marketplace payouts are not connected to an automated provider in this environment.';

  const renderPayoutStep = () => (
    <div className="space-y-6">
      <Alert tone="info" title="Bank and UPI details are collected after approval">
        {payoutMessage} We do not ask for account numbers during the first application. If you are approved, the team
        will invite you to a separate, secured payout setup. No automatic transfer is promised until a provider is
        configured, and nothing on this page is a payment instruction.
      </Alert>

      <div className="border border-line bg-warm-paper p-5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-harvest">What happens later</p>
        <ol className="mt-3 space-y-3 text-sm leading-relaxed text-bark">
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-harvest" aria-hidden />
            You finish this application, verification and product review.
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-harvest" aria-hidden />
            Once approved, the operator opens a restricted payout onboarding step.
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-harvest" aria-hidden />
            Settlement records remain visible in your workspace, but no payout is claimed before it is actually made.
          </li>
        </ol>
      </div>
    </div>
  );

  const renderAgreementsStep = () => {
    const commissionNote =
      config.data?.commission.note ??
      siteConfig?.commissionBasisNote ??
      'Commission is calculated at the time of sale and shown in your earnings ledger. Final terms are confirmed during review.';
    const confirmations = [
      {
        key: 'sellerAgreement',
        index: '01',
        title: 'Marketplace seller terms',
        detail: 'Listing standards, dispatch expectations, returns and the operating terms for selling on DEAR HILLS.',
        links: [{ label: 'Seller agreement', to: '/policies/seller-terms' }],
        checked: form.agreements.sellerAgreement,
        error: errors['agreements.sellerAgreement'],
      },
      {
        key: 'commissionDisclosure',
        index: '02',
        title: 'Platform fee terms (0% Diwali Launch Offer)',
        detail: `✨ Festive Launch Benefit: 0% marketplace platform fee for your first 6 months! (Standard 12% platform fee is fully waived so you keep 100% of your earnings). Shipping and taxes are excluded, and refunds reverse platform fee proportionally.`,
        links: [{ label: 'How platform fee works', to: '/policies/seller-terms' }],
        checked: form.agreements.commissionDisclosure,
        error: errors['agreements.commissionDisclosure'],
      },
      {
        key: 'authenticityPolicy',
        index: '03',
        title: 'Authenticity & privacy',
        detail:
          'Provenance claims must be supportable, and your account, identity and payout data are handled under our privacy notice.',
        links: [
          { label: 'Authenticity policy', to: '/policies/authenticity' },
          { label: 'Privacy notice', to: '/policies/privacy' },
        ],
        checked: form.agreements.authenticityPolicy && form.agreements.privacyPolicy,
        error: errors['agreements.authenticityPolicy'] ?? errors['agreements.privacyPolicy'],
      },
    ];
    const accepted = confirmations.filter((item) => item.checked).length;

    return (
      <div className="space-y-5">
        <div className="border-b border-line pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-harvest">Sign-off</p>
              <p className="mt-1 text-sm text-bark" aria-live="polite">
                {accepted} of {confirmations.length} confirmations accepted
              </p>
            </div>
            {accepted < confirmations.length ? (
              <button
                type="button"
                className="text-xs font-medium text-forest underline underline-offset-2 transition-colors hover:text-orchard"
                onClick={() =>
                  patchAgreements({
                    sellerAgreement: true,
                    commissionDisclosure: true,
                    authenticityPolicy: true,
                    privacyPolicy: true,
                  })
                }
              >
                Accept all three
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-forest">
                <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none">
                  <path d="m3 8.5 3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                All accepted
              </span>
            )}
          </div>
          <div
            className="mt-3 h-1 w-full overflow-hidden bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={confirmations.length}
            aria-valuenow={accepted}
            aria-label="Agreements accepted"
          >
            <div
              className="h-full bg-forest transition-[width] duration-300"
              style={{ width: `${(accepted / confirmations.length) * 100}%` }}
            />
          </div>
        </div>

        <ol className="space-y-3">
          {confirmations.map((item) => (
            <li key={item.key}>
              <div
                className={`border px-4 py-4 transition-colors sm:px-5 ${
                  item.checked
                    ? 'border-forest/35 bg-forest/[0.045]'
                    : 'border-line bg-warm-paper hover:border-orchard/30'
                }`}
              >
                <input
                  id={`agreement-${item.key}`}
                  type="checkbox"
                  className="peer sr-only"
                  checked={item.checked}
                  aria-invalid={Boolean(item.error) || undefined}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    if (item.key === 'sellerAgreement') {
                      patchAgreements({ sellerAgreement: checked });
                    } else if (item.key === 'commissionDisclosure') {
                      patchAgreements({ commissionDisclosure: checked });
                    } else {
                      patchAgreements({ authenticityPolicy: checked, privacyPolicy: checked });
                    }
                  }}
                />
                <label
                  htmlFor={`agreement-${item.key}`}
                  className="flex cursor-pointer items-start gap-3.5 rounded-sm peer-focus-visible:ring-2 peer-focus-visible:ring-terra/40"
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold transition-colors ${
                      item.checked
                        ? 'border-forest bg-forest text-warm-paper'
                        : 'border-sand bg-surface text-muted'
                    }`}
                  >
                    {item.checked ? (
                      <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                        <path
                          d="m3 8.5 3 3 7-7"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      item.index
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg leading-snug text-orchard">{item.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-bark">{item.detail}</span>
                  </span>
                </label>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-[2.375rem] text-[11px]">
                  {item.links.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="font-medium text-forest underline decoration-forest/30 underline-offset-2 transition-colors hover:text-orchard hover:decoration-orchard/40"
                    >
                      {link.label} →
                    </Link>
                  ))}
                </div>
              </div>
              {item.error ? (
                <p className="mt-1.5 text-xs text-terra" role="alert">
                  {item.error}
                </p>
              ) : null}
            </li>
          ))}
        </ol>

        <p className="text-[11px] leading-relaxed text-muted">
          Agreement version {AGREEMENT_VERSION} · Your acceptance, the version and a timestamp are stored with this
          application in the review audit trail. {commissionNote}
        </p>
      </div>
    );
  };

  const reviewRows = (rows: [string, string][]) => (
    <dl className="mt-2 space-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 text-[13px] sm:grid-cols-[180px_minmax(0,1fr)]">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words text-ink">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );

  const reviewSections: { step: number; title: string; rows: [string, string][] }[] = [
    {
      step: 1,
      title: 'Account',
      rows: [
        ['Name', form.fullName],
        ['Email', user?.email ?? ''],
        ['Email confirmed', user?.emailVerified ? 'Yes' : 'No'],
      ],
    },
    {
      step: 2,
      title: 'Seller category',
      rows: [['Category', selectedCategory?.label ?? '']],
    },
    {
      step: 3,
      title: 'Profile',
      rows: [
        ['Shop or maker name', form.businessName],
        ['Structure', SELLER_TYPE_LABELS[form.sellerType] ?? form.sellerType],
        ['Mobile', form.phone],
        ['Tagline', form.tagline],
        ['Story', form.story],
      ],
    },
    {
      step: 4,
      title: 'Location & dispatch',
      rows: [
        ['Region', [form.village, form.region].filter(Boolean).join(', ')],
        [
          'Operating address',
          [form.address.line1, form.address.line2, form.address.city, form.address.state, form.address.pincode]
            .filter(Boolean)
            .join(', '),
        ],
        [
          'Dispatch address',
          form.dispatchSameAsOperating
            ? 'Same as operating address'
            : [form.dispatchAddress.line1, form.dispatchAddress.city, form.dispatchAddress.state, form.dispatchAddress.pincode]
                .filter(Boolean)
                .join(', '),
        ],
      ],
    },
    {
      step: 5,
      title: 'Products & origin',
      rows: [
        ['Shop categories', form.categorySlugs.join(', ')],
        ['Product groups', form.productGroups.map((group) => PRODUCT_GROUP_LABELS[group] ?? group).join(', ')],
        ['Origin narrative', form.originNarrative],
        ['Authenticity declared', form.authenticityDeclaration ? 'Yes' : 'No'],
      ],
    },
    {
      step: 6,
      title: 'Verification',
      rows: [
        ['FSSAI', form.fssaiNumber],
        ['GSTIN', form.gstin],
        ['PAN last four', form.panLast4],
        ['Udyam', form.udyamNumber],
        ['Documents', requiredDocs.map((type) => `${docLabels[type] ?? type}: ${availableDocTypes.has(type) ? 'uploaded' : 'missing'}`).join(' · ')],
      ],
    },
    {
      step: 7,
      title: 'Shipping',
      rows: [
        ['Dispatch', `Within ${form.shipping.dispatchDays} days`],
        ['Packaging', form.shipping.packaging],
        ['Ships across India', form.shipping.shipsAcrossIndia ? 'Yes' : 'No'],
        ['Cold chain', form.shipping.coldChain ? 'Yes' : 'No'],
      ],
    },
    {
      step: 8,
      title: 'Payouts',
      rows: [['Collected later', 'Bank and UPI details are not requested during the initial application.']],
    },
    {
      step: 9,
      title: 'Agreements',
      rows: [
        ['Seller agreement', form.agreements.sellerAgreement ? 'Accepted' : 'Not accepted'],
        ['Platform fee terms', form.agreements.commissionDisclosure ? 'Accepted' : 'Not accepted'],
        [
          'Authenticity & privacy',
          form.agreements.authenticityPolicy && form.agreements.privacyPolicy
            ? 'Accepted'
            : 'Not accepted',
        ],
        ['Version', form.agreements.version],
      ],
    },
  ];

  const renderReviewStep = () => (
    <form className="space-y-6" onSubmit={submit} noValidate>
      {Object.keys(errors).length ? (
        <Alert tone="error" title="Some details still need attention">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {Object.values(errors)
              .slice(0, 8)
              .map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
          </ul>
        </Alert>
      ) : null}

      <div className="space-y-4">
        {reviewSections.map((section) => (
          <section key={section.title} className="border border-line bg-warm-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-xl text-orchard">{section.title}</h3>
              <button
                type="button"
                className="text-xs text-forest underline underline-offset-2 hover:text-orchard"
                onClick={() => jumpTo(section.step)}
              >
                Edit
              </button>
            </div>
            {reviewRows(section.rows)}
          </section>
        ))}
      </div>

      <Alert tone="info" title="What happens after submission">
        Your application moves to submitted and then to manual review. Reviewers may request specific changes with a
        reason. You will see every status change and reviewer note in your seller workspace and by email. Products cannot
        be published before approval.
      </Alert>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={submitting}>
          Submit application for review
        </Button>
        <span className="text-xs text-muted">
          Nothing is sent until you press this button. Your draft remains saved.
        </span>
      </div>
    </form>
  );

  const renderSubmitted = () => (
    <div className="space-y-5" role="status">
      <div className="border border-forest/20 bg-forest/[0.05] p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-forest">Application submitted</p>
        <h3 className="font-display mt-2 text-3xl text-orchard">Your application is with us.</h3>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-bark">{submittedMessage}</p>
      </div>
      <ol className="space-y-3 text-sm text-bark">
        <li className="flex gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-harvest" aria-hidden />
          Status, reviewer notes and document decisions appear in your seller workspace.
        </li>
        <li className="flex gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-harvest" aria-hidden />
          If changes are requested, you can revise and resubmit without creating a second application.
        </li>
        <li className="flex gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-harvest" aria-hidden />
          Keep your contact details current so the review team can reach you.
        </li>
      </ol>
      <div className="flex flex-wrap gap-3">
        <Link to="/seller" className={buttonClass('primary')}>
          Open seller workspace
        </Link>
        <Link to="/shop" className={buttonClass('secondary')}>
          Continue browsing the shop
        </Link>
      </div>
    </div>
  );

  const renderStatusPanel = () => {
    const view = application.data;
    const seller = view?.seller;
    const app = view?.application;
    const events = view?.events ?? [];
    const checklist = view?.checklist ?? [];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={app?.status ?? seller?.status ?? 'draft'} label={statusLabel(app?.status ?? seller?.status ?? 'draft')} />
          <span className="text-xs text-muted">Revision {app?.revision ?? 1}</span>
        </div>

        <p className="text-sm leading-relaxed text-bark">
          {app?.status === 'approved'
            ? 'Your maker account is approved. Add your first listing, keep stock accurate, and dispatch within the window you promised.'
            : app?.status === 'suspended'
              ? 'Your store is suspended. Review the reason below and contact support before making changes.'
              : app?.status === 'changes_requested'
                ? 'The review team needs specific changes before this application can be approved.'
                : app?.status === 'rejected'
                  ? 'This application was not approved. The reason is recorded below; you can revise and resubmit if that is appropriate.'
                  : app?.status === 'withdrawn'
                    ? 'You withdrew this application, so it is no longer in the review queue. Your answers are kept if you decide to apply again.'
                    : 'Your application is in the review queue. You will be notified when its status changes.'}
        </p>

        {app?.rejectionReason ? (
          <Alert tone="warning" title="Reviewer note">
            {app.rejectionReason}
          </Alert>
        ) : null}

        {seller?.storeStatusReason && seller.storeStatus !== 'setup_incomplete' ? (
          <Alert tone="info" title="Store status note">
            {seller.storeStatusReason}
          </Alert>
        ) : null}

        <dl className="grid gap-4 border border-line bg-warm-paper p-4 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-muted">Submitted</dt>
            <dd className="mt-0.5 text-ink">{app?.submittedAt ? formatDateTime(app.submittedAt) : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Last reviewed</dt>
            <dd className="mt-0.5 text-ink">{app?.reviewedAt ? formatDateTime(app.reviewedAt) : 'Not yet reviewed'}</dd>
          </div>
          <div>
            <dt className="text-muted">Store status</dt>
            <dd className="mt-0.5 text-ink">{storeStatusLabel(seller?.storeStatus)}</dd>
          </div>
          <div>
            <dt className="text-muted">Payout status</dt>
            <dd className="mt-0.5 text-ink">{(seller?.payoutStatus ?? 'not_started').replaceAll('_', ' ')}</dd>
          </div>
        </dl>

        {checklist.length ? (
          <div>
            <h3 className="font-display text-xl text-orchard">Onboarding checklist</h3>
            <ul className="mt-2 space-y-2">
              {checklist.map((item) => (
                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 text-[13px] last:border-b-0">
                  <span className="text-ink">{item.label}</span>
                  <span className={item.status === 'complete' ? 'text-forest' : item.status === 'action' ? 'text-[#8e4630]' : 'text-muted'}>
                    {item.status === 'complete' ? 'Complete' : item.status === 'action' ? 'Action needed' : 'Pending'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {events.length ? (
          <div>
            <h3 className="font-display text-xl text-orchard">Status history</h3>
            <ol className="mt-2 space-y-3 border-l border-line pl-4">
              {events.map((event) => (
                <li key={event.id} className="relative text-[13px]">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-harvest" aria-hidden />
                  <p className="text-ink">{EVENT_LABELS[event.event] ?? event.event.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(event.createdAt)}
                    {event.toStatus ? ` · ${statusLabel(event.toStatus)}` : ''}
                    {event.actorEmail ? ` · ${event.actorEmail}` : ''}
                  </p>
                  {event.reason ? <p className="mt-1 text-xs text-bark">{event.reason}</p> : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {!locked && (app?.status === 'changes_requested' || app?.status === 'rejected') ? (
            <Button type="button" onClick={() => setForceEdit(true)}>
              Revise application
            </Button>
          ) : null}
          {app?.status === 'withdrawn' ? (
            <Button type="button" onClick={() => void startNewApplication()} loading={saving}>
              Start a new application
            </Button>
          ) : null}
          <Link to="/seller" className={buttonClass(locked ? 'primary' : 'secondary')}>
            Open seller workspace
          </Link>
        </div>

        {view?.canWithdraw && !locked ? (
          <div className="border-t border-line pt-4">
            {!withdrawOpen ? (
              <button
                type="button"
                onClick={() => setWithdrawOpen(true)}
                className="text-xs font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink"
              >
                Withdraw this application
              </button>
            ) : (
              <div role="group" aria-labelledby="withdraw-heading" className="space-y-3">
                <h3 id="withdraw-heading" className="font-display text-lg text-orchard">
                  Withdraw this application?
                </h3>
                <p className="text-[13px] leading-relaxed text-bark">
                  It will leave the review queue and any live listings will be paused. Your answers stay on record so you
                  can start a new application later. This cannot be undone from this page.
                </p>
                <Field
                  label="Reason (optional)"
                  hint="Only the marketplace team sees this."
                  htmlFor="withdraw-reason"
                >
                  <Textarea
                    id="withdraw-reason"
                    rows={3}
                    maxLength={500}
                    value={withdrawReason}
                    onChange={(event) => setWithdrawReason(event.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={() => setWithdrawOpen(false)} disabled={withdrawing}>
                    Keep my application
                  </Button>
                  <Button type="button" variant="danger" onClick={() => void withdrawApplication()} disabled={withdrawing}>
                    {withdrawing ? 'Withdrawing…' : 'Withdraw application'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return renderAccountStep();
      case 2:
        return renderCategoryStep();
      case 3:
        return renderProfileStep();
      case 4:
        return renderLocationStep();
      case 5:
        return renderOriginStep();
      case 6:
        return renderVerificationStep();
      case 7:
        return renderShippingStep();
      case 8:
        return renderPayoutStep();
      case 9:
        return renderAgreementsStep();
      case 10:
        return renderReviewStep();
      default:
        return renderAccountStep();
    }
  };

  const showStatusPanel =
    Boolean(applicationStatus) &&
    (locked ||
      (!forceEdit && ['changes_requested', 'rejected', 'withdrawn'].includes(applicationStatus ?? '')));

  const applicationLoading = Boolean(user) && !hydrated && (application.isLoading || application.isFetching);

  return (
    <div className="bg-warm-paper">
      {/* Diwali Shubh Aarambh Maker Launch Banner */}
      <section className="border-b border-[#D4A373]/30 bg-gradient-to-r from-[#2B1B17] via-[#3D2219] to-[#2B1B17] text-paper py-3.5 px-4 sm:px-6 shadow-inner">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E07A5F]/20 text-[#E07A5F] text-lg shrink-0">
              🪔
            </span>
            <div>
              <p className="text-xs font-bold tracking-wider text-[#F4D06F] uppercase">
                Diwali Shubh Aarambh · Maker Launch Initiative
              </p>
              <p className="text-[13px] text-[#F7EBE1]/90">
                Join our founding Himachal artisan cohort: <strong>0% Commission for 6 months</strong>, free craft storytelling, and guaranteed homepage Diwali spotlight!
              </p>
            </div>
          </div>
          <a
            href="#diwali-perks"
            className="inline-flex shrink-0 items-center justify-center rounded-sm bg-[#E07A5F] px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-[#D96B4E] shadow-xs"
          >
            Explore Diwali Perks &darr;
          </a>
        </div>
      </section>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(203,142,139,0.18),transparent_45%)]" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-20">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-harvest">Sell on DEAR HILLS</p>
            <h1 className="mt-5 font-display text-[clamp(2.9rem,6vw,4.7rem)] leading-[0.98] text-orchard">
              Your roots. Your craft. <span className="italic text-[#8a4a52]">Your story.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-bark">
              Bring the best of your corner of Himachal to homes across India.
            </p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
              A curated marketplace for growers, artisans, food producers and homegrown brands. Applications are read by
              people, identity documents stay private, and every listing is reviewed before it appears in the shop.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#apply" className={buttonClass('primary', 'lg')}>
                Become a Maker
              </a>
              <a href="#how-it-works" className={buttonClass('secondary', 'lg')}>
                How It Works
              </a>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                ['Review', 'Manual, reasoned'],
                ['Documents', 'Private by default'],
                ['Terms', 'Disclosed before submit'],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="text-[10px] uppercase tracking-[0.16em] text-harvest">{term}</dt>
                  <dd className="mt-1 text-[12px] leading-snug text-bark">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative">
            <div className="overflow-hidden border border-line bg-butter">
              <img
                src="/images/maker-sunset-studio.jpg"
                alt="A Himachali maker at work in a timber-framed studio at golden hour"
                className="aspect-[4/5] w-full object-cover"
                loading="eager"
              />
            </div>
            <div className="absolute -bottom-6 -left-3 hidden max-w-[15rem] border border-line bg-surface p-4 shadow-sm sm:block lg:-left-8">
              <p className="text-[10px] uppercase tracking-[0.16em] text-harvest">Made in Himachal</p>
              <p className="mt-1.5 font-display text-xl leading-snug text-orchard">
                Grown, woven and made close to home.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Diwali Maker Incentive Package */}
      <section id="diwali-perks" className="border-b border-line bg-[#FAF5EE] py-14 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#C06041]">
              Festive Season Launch Offer
            </p>
            <h2 className="mt-2 font-display text-3xl text-orchard sm:text-4xl">
              Why Himachal Makers Are Joining This Diwali
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              We know building the first shelf takes trust. That's why we are waiving platform fees and providing end-to-end launch support for our first 50 verified mountain workshops and growers.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-line bg-surface p-6 rounded-sm shadow-xs transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E07A5F]/15 text-[#E07A5F] text-xl mb-4">
                🏷️
              </div>
              <h3 className="font-display text-xl text-orchard">0% Commission</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Enjoy 0% platform fee for 6 full months. Every rupee paid by customers for your craft goes directly into your bank account.
              </p>
            </div>

            <div className="border border-line bg-surface p-6 rounded-sm shadow-xs transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/15 text-forest text-xl mb-4">
                ✍️
              </div>
              <h3 className="font-display text-xl text-orchard">Free Storytelling</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Our editorial team visits or video-calls you to document your loom, orchard or workshop, crafting a museum-quality biography.
              </p>
            </div>

            <div className="border border-line bg-surface p-6 rounded-sm shadow-xs transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-harvest/20 text-harvest text-xl mb-4">
                ✨
              </div>
              <h3 className="font-display text-xl text-orchard">Diwali Spotlight</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Your listings are given prime billing in our &quot;Pahadi Festive Glow&quot; Diwali collection, showcased to mindful shoppers nationwide.
              </p>
            </div>

            <div className="border border-line bg-surface p-6 rounded-sm shadow-xs transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sage/30 text-forest text-xl mb-4">
                📦
              </div>
              <h3 className="font-display text-xl text-orchard">Doorstep Pickup</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Insured doorstep courier dispatch from all 12 Himachal districts, plus eco-friendly packaging starter support.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-sm border border-[#D4A373]/40 bg-[#F5EBE1] p-4 text-center sm:text-left sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0">🎁</span>
              <p className="text-xs text-bark">
                <strong>Foundational Cohort Benefit:</strong> ₹1,500 shipping credits credited upon store approval, plus a verified GI / Heritage Mountain Maker badge.
              </p>
            </div>
            <a
              href="#apply"
              className="mt-3 inline-block sm:mt-0 shrink-0 text-xs font-semibold text-[#8a4a52] hover:text-orchard underline underline-offset-4"
            >
              Start Your Application &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Provenance */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-harvest">Provenance, not decoration</p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-orchard sm:text-5xl">
              A marketplace built for work that takes time.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-muted">
              Himachal's best products are not anonymous. They come from named orchards, kitchens, looms and workshops.
              DEAR HILLS asks for that detail up front so buyers can understand what they are buying and makers are not
              reduced to a generic Himalayan backdrop.
            </p>
            <ul className="mt-6 space-y-3 text-sm leading-relaxed text-bark">
              {[
                'Category-aware questions instead of one blanket form.',
                'Evidence requirements that reflect what you actually make.',
                'A review process with recorded reasons and a visible history.',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-harvest" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <img
              src="/images/maker-orchard.jpg"
              alt="Apple orchard terraces in Himachal Pradesh"
              className="col-span-2 aspect-[16/10] w-full border border-line object-cover"
              loading="lazy"
            />
            <img
              src="/images/weaving.jpg"
              alt="Hands weaving wool on a traditional loom"
              className="aspect-[3/4] w-full border border-line object-cover"
              loading="lazy"
            />
            <img
              src="/images/maker-food.jpg"
              alt="Himachali preserves and food prepared at home"
              className="aspect-[3/4] w-full border border-line object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-line bg-butter/45 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-harvest">How it works</p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-orchard sm:text-5xl">
              From first draft to first order.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              The application is long because the marketplace is curated. Each step can be saved, and you can return to
              it with the same account.
            </p>
          </div>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Create your account', 'Confirm your email so reviewers can reach you.'],
              ['Describe your work', 'Category, profile, location and provenance.'],
              ['Upload evidence', 'Only the identity and category documents that apply.'],
              ['Manual review', 'Reviewers approve, reject or request specific changes.'],
              ['Publish listings', 'Approved sellers submit products for a second review.'],
            ].map(([title, detail], index) => (
              <li key={title} className="border-t border-orchard/20 pt-4">
                <p className="font-display text-2xl text-harvest">{String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-2 font-display text-xl leading-snug text-orchard">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Application */}
      <section ref={wizardRef} id="apply" className="scroll-mt-24 border-b border-line py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-harvest">Maker application</p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-orchard sm:text-5xl">
              Three stages. Saved as you go.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Start with who you are and what you make. Add verification and dispatch details next. Then review
              everything before submitting. Your progress is saved as a draft, and nothing is sent until the final step.
            </p>
          </div>

          {!user ? (
            <div className="mt-6 max-w-2xl">
              <Alert tone="info" title="Sign in or create an account to begin">
                Already registered?{' '}
                <Link to={`/login?next=${encodeURIComponent('/sell')}`} className="underline underline-offset-2">
                  Sign in
                </Link>{' '}
                and your saved draft will load automatically.
              </Alert>
            </div>
          ) : null}

          <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <WizardProgress
              step={step}
              completed={completedSteps}
              locked={locked}
              status={applicationStatus}
              onSelect={jumpTo}
            />

            <div className="min-w-0 border border-line bg-surface">
              <div className="border-b border-line px-5 py-4 sm:px-7 sm:py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-harvest">
                    Stage {stageForStep(step).number} of {STAGES.length} · Step {step} of {TOTAL_STEPS}
                  </p>
                  <p className="text-[11px] text-muted" aria-live="polite">
                    {saving
                      ? 'Saving draft…'
                      : saveError
                        ? 'Draft not saved'
                        : lastSavedAt
                          ? `Draft saved ${formatDateTime(lastSavedAt)}`
                          : dirty
                            ? 'Unsaved changes'
                            : user
                              ? 'Draft ready'
                              : 'Not signed in'}
                  </p>
                </div>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="mt-2 font-display text-3xl leading-tight text-orchard outline-none"
                >
                  {STEPS[step - 1].title}
                </h2>
                <p className="mt-1 text-xs text-muted">{STEPS[step - 1].hint}</p>
              </div>

              <div className="px-5 py-6 sm:px-7">
                {saveError ? (
                  <div className="mb-5">
                    <Alert tone="warning" title="Draft not saved">
                      {saveError} Your changes are still in this browser; check your connection and use Save draft.
                    </Alert>
                  </div>
                ) : null}

                {applicationLoading ? (
                  <div className="space-y-3" aria-busy="true" aria-label="Loading your saved application">
                    {[0, 1, 2, 3].map((row) => (
                      <div key={row} className="h-14 w-full shimmer rounded-sm" />
                    ))}
                  </div>
                ) : submittedNow ? (
                  renderSubmitted()
                ) : showStatusPanel ? (
                  renderStatusPanel()
                ) : (
                  <>
                    {forceEdit && (applicationStatus === 'changes_requested' || applicationStatus === 'rejected') ? (
                      <div className="mb-5">
                        <Alert tone="warning" title="Revisions requested">
                          Update the sections mentioned in the reviewer note, then submit again. Your application keeps
                          its history and revision number.
                        </Alert>
                      </div>
                    ) : null}
                    {form.sellerCategory === 'food_producer' ? (
                      <div className="mb-5">
                        <Alert tone="info" title="Food applications">
                          You will need the applicable FSSAI registration or licence number and a private copy of the
                          certificate. Each food listing also needs ingredients, shelf life and batch details before it
                          can be submitted.
                        </Alert>
                      </div>
                    ) : null}

                    {renderStep()}

                    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                      <Button type="button" variant="ghost" onClick={goBack} disabled={step === 1}>
                        Back
                      </Button>
                      <div className="flex flex-wrap items-center gap-3">
                        {user && !locked ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            loading={saving}
                            onClick={() => void persistDraft(step, form)}
                          >
                            Save draft
                          </Button>
                        ) : null}
                        {step < TOTAL_STEPS && (user || step > 1) ? (
                          <Button type="button" onClick={goNext}>
                            Continue
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-harvest">Questions</p>
            <h2 className="mt-4 font-display text-4xl leading-tight text-orchard sm:text-5xl">
              Before you apply.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              If something is unclear, write to{' '}
              <a href={`mailto:${siteConfig?.supportEmail ?? 'support@dearhills.in'}`} className="underline underline-offset-2">
                {siteConfig?.supportEmail ?? 'support@dearhills.in'}
              </a>
              . The address may be a placeholder in this environment; check the site footer for the current contact.
            </p>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {[
              {
                question: 'Do I need GSTIN to sell?',
                answer:
                  'Not automatically. GST registration depends on turnover, the nature of your supplies and current law. GSTIN is optional evidence in this application, and reviewers may ask for it where it applies to your circumstances.',
              },
              {
                question: 'What about FSSAI?',
                answer:
                  'Food businesses must hold the FSSAI registration or licence that applies to them before selling food. The application asks for the number and a private copy of the certificate. Food listings also need ingredients, shelf life and batch details.',
              },
              {
                question: 'What does it cost to apply?',
                answer:
                  'No payment is taken during the application. The 12% marketplace platform fee is disclosed in step 9 and in the seller agreement before you submit. Final commercial terms are confirmed during review.',
              },
              {
                question: 'Who can see my identity documents?',
                answer:
                  'Documents are stored outside the public web root and served only through authorised review endpoints. They are not exposed on your public maker page or through seller-facing APIs.',
              },
              {
                question: 'How long does review take?',
                answer:
                  'Review is manual and depends on the completeness of your evidence and the category. There is no guaranteed turnaround. You will see status changes, reviewer notes and document decisions in the seller workspace.',
              },
            ].map((item) => (
              <details key={item.question} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink">
                  {item.question}
                  <span className="text-harvest transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-orchard px-4 py-20 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-apple-blossom">DEAR HILLS</p>
          <h2 className="mt-4 font-display text-4xl leading-tight text-warm-paper sm:text-5xl">
            Make the first draft today.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-warm-paper/80">
            Save it, sleep on it, and come back when your story and documents are ready. Reviewers read every
            application.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#apply" className={buttonClass('secondary', 'lg', 'border-warm-paper/40 text-warm-paper hover:border-warm-paper hover:bg-warm-paper/10')}>
              Become a Maker
            </a>
            <Link to="/shop" className={buttonClass('ghost', 'lg', 'text-warm-paper hover:bg-warm-paper/10')}>
              Browse the marketplace
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* SUBCOMPONENTS_MARKER */
function WizardProgress({
  step,
  completed,
  locked,
  status,
  onSelect,
}: {
  step: number;
  completed: number;
  locked: boolean;
  status?: string;
  onSelect: (step: number) => void;
}) {
  const percent = Math.round((completed / TOTAL_STEPS) * 100);
  const currentStage = stageForStep(step);
  return (
    <nav aria-label="Application steps" className="lg:sticky lg:top-24 lg:self-start">
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-harvest">
            Stage {currentStage.number} of {STAGES.length}
          </p>
          <ol className="mt-2 grid grid-cols-3 gap-1" aria-label="Application stages">
            {STAGES.map((stage) => {
              const active = stage.number === currentStage.number;
              const done = stage.number < currentStage.number;
              return (
                <li key={stage.number}>
                  <div
                    aria-current={active ? 'step' : undefined}
                    className={`border-t-2 pt-1.5 ${
                      active ? 'border-terra' : done ? 'border-forest/50' : 'border-line'
                    }`}
                  >
                    <span className={`block text-[10px] font-semibold uppercase tracking-[0.08em] ${active ? 'text-terra' : done ? 'text-forest' : 'text-muted'}`}>
                      {stage.number}. {stage.title}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[11px] leading-snug text-muted">{currentStage.hint}</p>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-harvest">Your progress</p>
            <p className="text-[11px] text-muted">{percent}% ready</p>
          </div>
          <div
            className="mt-2 h-1 w-full overflow-hidden bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Application completeness"
          >
            <div className="h-full bg-orchard transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
          {status ? (
            <div className="mt-3">
              <StatusBadge status={status} label={statusLabel(status)} />
            </div>
          ) : null}
        </div>

        {/* Mobile: horizontal chips */}
        <ol className="flex gap-2 overflow-x-auto px-3 py-3 lg:hidden" aria-label="Jump to a step">
          {STEPS.map((entry) => {
            const active = entry.number === step;
            return (
              <li key={entry.number} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(entry.number)}
                  aria-current={active ? 'step' : undefined}
                  className={`border px-3 py-1.5 text-[11px] ${
                    active
                      ? 'border-orchard bg-orchard text-warm-paper'
                      : 'border-line bg-warm-paper text-bark hover:border-orchard/40'
                  }`}
                >
                  {entry.number}. {entry.short}
                </button>
              </li>
            );
          })}
        </ol>

        {/* Desktop: vertical rail */}
        <ol className="hidden divide-y divide-line lg:block">
          {STEPS.map((entry) => {
            const active = entry.number === step;
            return (
              <li key={entry.number}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.number)}
                  aria-current={active ? 'step' : undefined}
                  className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    active ? 'bg-butter/50' : 'hover:bg-warm-paper'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                      active
                        ? 'border-orchard bg-orchard text-warm-paper'
                        : entry.number < step
                          ? 'border-forest/30 bg-forest/[0.06] text-forest'
                          : 'border-sand bg-surface text-muted'
                    }`}
                    aria-hidden
                  >
                    {entry.number}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[12.5px] leading-snug ${active ? 'font-medium text-orchard' : 'text-ink'}`}>
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-muted">
                      {entry.number === 10 ? 'Final check' : entry.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {locked ? (
          <p className="border-t border-line bg-warm-paper px-4 py-3 text-[11px] leading-relaxed text-muted">
            This application is in review and is read-only. Reviewer notes and status changes appear in the seller
            workspace.
          </p>
        ) : null}
      </div>
    </nav>
  );
}
