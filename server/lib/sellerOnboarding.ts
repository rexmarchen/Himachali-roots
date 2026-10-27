import { z } from 'zod';
import { execute, queryAll, queryOne, tx, type Db } from '../db.js';
import type { SessionUser } from '../../shared/types.js';
import { audit } from './audit.js';
import { badRequest, conflict, forbidden } from './http.js';
import { newId } from './ids.js';

/* -------------------------------------------------------------------------- */
/*                         Seller categories & config                         */
/* -------------------------------------------------------------------------- */

export const SELLER_CATEGORY_IDS = [
  'farmer_grower',
  'artisan_craftsperson',
  'food_producer',
  'home_business',
  'local_brand',
  'retailer',
] as const;
export type SellerCategoryId = (typeof SELLER_CATEGORY_IDS)[number];

export const SELLER_CATEGORY_CONFIG: Record<
  SellerCategoryId,
  { label: string; description: string; productGroups: string[]; originPrompts: string[] }
> = {
  farmer_grower: {
    label: 'Farmer / Grower',
    description: 'Orchards, terraced fields, apiaries and growers of fruit, grain, pulses or herbs.',
    productGroups: ['fresh_produce', 'grains_pulses', 'honey', 'herbs', 'seeds', 'other_farm'],
    originPrompts: [
      'Which village, valley or orchard does this come from?',
      'How is it grown, harvested and handled?',
      'Is the harvest seasonal? What should a buyer expect?',
    ],
  },
  artisan_craftsperson: {
    label: 'Artisan / Craftsperson',
    description: 'Weavers, woodcarvers, metalworkers, potters and other handmade craft traditions.',
    productGroups: ['handloom', 'wool_textiles', 'woodcraft', 'metalcraft', 'pottery', 'jewellery', 'other_craft'],
    originPrompts: [
      'Which craft tradition and place does your work belong to?',
      'Which materials and techniques do you use?',
      'Who makes each piece, and how long does it take?',
    ],
  },
  food_producer: {
    label: 'Food Producer',
    description: 'Home kitchens, bakeries, preserves, pickles, teas and packaged regional foods.',
    productGroups: ['preserves', 'pickles', 'tea_coffee', 'bakery', 'spices', 'ready_food', 'other_food'],
    originPrompts: [
      'Where is the food prepared and by whom?',
      'What ingredients and preservation methods are used?',
      'What is the shelf life and storage guidance?',
    ],
  },
  home_business: {
    label: 'Home Business',
    description: 'Small home-run enterprises selling products they make, grow or assemble locally.',
    productGroups: ['home_goods', 'textiles', 'food', 'craft', 'personal_care', 'other'],
    originPrompts: [
      'Where is your home workshop?',
      'What do you make yourself and what do you source?',
      'How do you keep quality consistent?',
    ],
  },
  local_brand: {
    label: 'Local Brand',
    description: 'Himachali brands with a defined range, packaging and a story rooted in the state.',
    productGroups: ['packaged_food', 'textiles', 'personal_care', 'home_goods', 'accessories', 'other'],
    originPrompts: [
      'Where is the brand based and where is production carried out?',
      'Which ingredients or materials come from Himachal?',
      'Who makes the products and how is quality checked?',
    ],
  },
  retailer: {
    label: 'Retailer',
    description: 'Shops and distributors reselling authentic Himachali products with authorisation.',
    productGroups: ['multi_category', 'food', 'textiles', 'craft', 'other'],
    originPrompts: [
      'Which makers or brands do you stock?',
      'Do you hold written authorisation to resell their products?',
      'How do you store and dispatch products?',
    ],
  },
};

export const SELLER_TYPES = [
  'individual',
  'artisan',
  'farmer',
  'home_business',
  'proprietorship',
  'partnership',
  'private_limited',
  'cooperative',
  'self_help_group',
  'other',
] as const;

export const DOCUMENT_TYPES = [
  'id_proof',
  'address_proof',
  'business_registration',
  'gst_certificate',
  'fssai',
  'craft_evidence',
  'land_record',
  'cooperative_registration',
  'resale_authorisation',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
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

/**
 * Requirements are deliberately not one-size-fits-all. GSTIN is never
 * mandatory here because registration depends on turnover and the seller's
 * circumstances; it remains optional evidence. FSSAI is mandatory for food.
 */
export function documentRequirements(
  category: SellerCategoryId | null | undefined,
  sellerType: string | null | undefined,
): { required: DocumentType[]; optional: DocumentType[] } {
  const required = new Set<DocumentType>(['id_proof']);
  const optional = new Set<DocumentType>(['address_proof', 'other']);

  if (['cooperative', 'self_help_group', 'partnership', 'private_limited', 'proprietorship'].includes(sellerType ?? '')) {
    required.add('business_registration');
  }
  if (category === 'food_producer') {
    required.add('fssai');
  }
  if (category === 'local_brand') {
    required.add('business_registration');
    optional.add('gst_certificate');
  }
  if (category === 'retailer') {
    required.add('business_registration');
    required.add('resale_authorisation');
    optional.add('gst_certificate');
  }
  if (category === 'artisan_craftsperson') {
    optional.add('craft_evidence');
  }
  if (category === 'farmer_grower') {
    optional.add('land_record');
    optional.add('cooperative_registration');
  }
  if (category === 'home_business') {
    optional.add('business_registration');
  }
  return { required: [...required], optional: [...optional] };
}

/* -------------------------------------------------------------------------- */
/*                                   States                                   */
/* -------------------------------------------------------------------------- */

export const APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STORE_STATUSES = ['setup_incomplete', 'pending_activation', 'active', 'suspended'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'changes_requested', 'rejected', 'approved', 'withdrawn'],
  under_review: ['changes_requested', 'rejected', 'approved', 'suspended', 'withdrawn'],
  changes_requested: ['submitted', 'rejected', 'withdrawn'],
  approved: ['suspended', 'under_review'],
  rejected: ['submitted', 'draft', 'withdrawn'],
  suspended: ['under_review', 'approved'],
  withdrawn: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw conflict(
      `An application cannot move from ${from.replaceAll('_', ' ')} to ${to.replaceAll('_', ' ')}. Refresh and try again.`,
      'invalid_transition',
    );
  }
}

export function storeStatusForApplication(status: ApplicationStatus): StoreStatus {
  if (status === 'approved') return 'active';
  if (status === 'suspended') return 'suspended';
  if (status === 'submitted' || status === 'under_review') return 'pending_activation';
  return 'setup_incomplete';
}

/** Profile status is the coarser compatibility field used by existing guards. */
export function profileStatusForApplication(status: ApplicationStatus): string {
  if (status === 'changes_requested') return 'more_info_required';
  // A withdrawal is applicant-driven and returns the account to a pre-submission
  // state. The application row itself keeps the explicit `withdrawn` status.
  if (status === 'withdrawn') return 'draft';
  return status;
}

/* -------------------------------------------------------------------------- */
/*                              Wizard validation                             */
/* -------------------------------------------------------------------------- */

const pincode = z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.');

export const addressSchema = z.object({
  line1: z.string().trim().min(4, 'Enter the street, building or landmark.').max(200),
  line2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(2, 'Enter the town or tehsil.').max(80),
  state: z.string().trim().min(2).max(80).default('Himachal Pradesh'),
  pincode,
});

export const shippingSchema = z.object({
  dispatchDays: z.coerce.number().int().min(1, 'Dispatch within 1–15 days.').max(15, 'Dispatch within 15 days or fewer.'),
  packaging: z.string().trim().min(5, 'Describe how products are packed.').max(500),
  shipsAcrossIndia: z.boolean().default(true),
  coldChain: z.boolean().default(false),
  notes: z.string().trim().max(800).optional().default(''),
});

export const payoutSchema = z.object({
  method: z.enum(['bank_transfer', 'upi']),
  accountHolderName: z.string().trim().min(2, 'Enter the account holder name.').max(120),
  accountLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter the last four digits of the account only.')
    .optional()
    .or(z.literal('')),
  ifsc: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'Enter a valid IFSC code.')
    .optional()
    .or(z.literal('')),
  upiIdMasked: z.string().trim().max(80).optional().or(z.literal('')),
  consent: z.literal(true, { message: 'Confirm that these payout details belong to the seller.' }),
});

export const agreementsSchema = z.object({
  sellerAgreement: z.literal(true, { message: 'Accept the seller agreement.' }),
  commissionDisclosure: z.literal(true, { message: 'Accept the commission disclosure.' }),
  authenticityPolicy: z.literal(true, { message: 'Accept the authenticity and origin policy.' }),
  privacyPolicy: z.literal(true, { message: 'Accept the privacy notice.' }),
  version: z.string().trim().min(1).max(40),
});

export const wizardDataSchema = z.object({
  fullName: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(10).optional().default(''),
  businessName: z.string().trim().max(140).optional().default(''),
  sellerType: z.enum(SELLER_TYPES).optional().default('individual'),
  sellerCategory: z.enum(SELLER_CATEGORY_IDS).optional(),
  tagline: z.string().trim().max(160).optional().default(''),
  story: z.string().trim().max(3000).optional().default(''),
  region: z.string().trim().max(80).optional().default(''),
  village: z.string().trim().max(120).optional().default(''),
  address: addressSchema.partial().optional(),
  dispatchAddress: addressSchema.partial().optional(),
  dispatchSameAsOperating: z.boolean().optional().default(true),
  categorySlugs: z.array(z.string().trim().min(1).max(80)).max(8).optional().default([]),
  productGroups: z.array(z.string().trim().min(1).max(60)).max(10).optional().default([]),
  originNarrative: z.string().trim().max(2000).optional().default(''),
  authenticityDeclaration: z.boolean().optional().default(false),
  categoryAnswers: z.record(z.string().max(60), z.string().max(800)).optional().default({}),
  gstin: z.string().trim().max(20).optional().default(''),
  panLast4: z.string().trim().max(4).optional().default(''),
  fssaiNumber: z.string().trim().max(20).optional().default(''),
  udyamNumber: z.string().trim().max(30).optional().default(''),
  businessRegistrationNumber: z.string().trim().max(60).optional().default(''),
  yearsOperating: z.coerce.number().int().min(0).max(100).optional(),
  shipping: shippingSchema.partial().optional(),
  payout: payoutSchema.partial().optional(),
  agreements: agreementsSchema.partial().optional(),
});

export type WizardData = z.infer<typeof wizardDataSchema>;

export const draftInputSchema = z.object({
  currentStep: z.coerce.number().int().min(1).max(10).optional(),
  data: z.record(z.string(), z.unknown()),
});

export interface ApplicationRow {
  id: string;
  seller_id: string;
  status: ApplicationStatus;
  revision: number;
  current_step: number;
  seller_category: string | null;
  business_name: string;
  seller_type: string;
  categories: string;
  address: string;
  gstin: string | null;
  phone: string | null;
  notes: string | null;
  data_json: string;
  verification_json: string | null;
  shipping_json: string | null;
  payout_json: string | null;
  agreement_json: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  last_saved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function latestApplication(db: Db, sellerId: string): ApplicationRow | undefined {
  return queryOne<ApplicationRow>(
    db,
    'SELECT * FROM seller_applications WHERE seller_id = ? ORDER BY created_at DESC, revision DESC LIMIT 1',
    sellerId,
  );
}

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normaliseWizardData(input: unknown): WizardData {
  return wizardDataSchema.parse(input ?? {});
}

export const draftAddressSchema = z.object({
  line1: z.string().trim().max(200).optional().default(''),
  line2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().max(80).optional().default('Himachal Pradesh'),
  pincode: z.string().trim().max(10).optional().default(''),
});

export const draftShippingSchema = z.object({
  dispatchDays: z.coerce.number().int().min(0).max(30).optional().default(0),
  packaging: z.string().trim().max(500).optional().default(''),
  shipsAcrossIndia: z.boolean().optional().default(true),
  coldChain: z.boolean().optional().default(false),
  notes: z.string().trim().max(800).optional().default(''),
});

export const draftPayoutSchema = z.object({
  method: z.enum(['bank_transfer', 'upi']).optional().default('bank_transfer'),
  accountHolderName: z.string().trim().max(120).optional().default(''),
  accountLast4: z.string().trim().max(10).optional().default(''),
  ifsc: z.string().trim().max(20).optional().default(''),
  upiIdMasked: z.string().trim().max(80).optional().default(''),
  consent: z.boolean().optional().default(false),
});

export const draftAgreementsSchema = z.object({
  sellerAgreement: z.boolean().optional().default(false),
  commissionDisclosure: z.boolean().optional().default(false),
  authenticityPolicy: z.boolean().optional().default(false),
  privacyPolicy: z.boolean().optional().default(false),
  version: z.string().trim().max(40).optional().default(''),
});

export const draftDataSchema = z.object({
  fullName: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(20).optional().default(''),
  businessName: z.string().trim().max(140).optional().default(''),
  sellerType: z.enum(SELLER_TYPES).optional().default('individual'),
  sellerCategory: z.enum(SELLER_CATEGORY_IDS).optional(),
  tagline: z.string().trim().max(160).optional().default(''),
  story: z.string().trim().max(3000).optional().default(''),
  region: z.string().trim().max(80).optional().default(''),
  village: z.string().trim().max(120).optional().default(''),
  address: draftAddressSchema.optional(),
  dispatchAddress: draftAddressSchema.optional(),
  dispatchSameAsOperating: z.boolean().optional().default(true),
  categorySlugs: z.array(z.string().trim().max(80)).max(20).optional().default([]),
  productGroups: z.array(z.string().trim().max(60)).max(20).optional().default([]),
  originNarrative: z.string().trim().max(2000).optional().default(''),
  authenticityDeclaration: z.boolean().optional().default(false),
  categoryAnswers: z.record(z.string().max(60), z.string().max(800)).optional().default({}),
  gstin: z.string().trim().max(20).optional().default(''),
  panLast4: z.string().trim().max(10).optional().default(''),
  fssaiNumber: z.string().trim().max(30).optional().default(''),
  udyamNumber: z.string().trim().max(30).optional().default(''),
  businessRegistrationNumber: z.string().trim().max(60).optional().default(''),
  yearsOperating: z.coerce.number().int().min(0).max(100).optional(),
  shipping: draftShippingSchema.optional(),
  payout: draftPayoutSchema.optional(),
  agreements: draftAgreementsSchema.optional(),
});

/**
 * Save-as-draft tolerates incomplete input but never accepts fields outside the
 * wizard contract, and rejects oversized payloads before they reach SQLite.
 */
export function normaliseDraft(input: unknown): { currentStep: number; data: Partial<WizardData> } {
  const parsed = draftInputSchema.parse(input);
  const serialised = JSON.stringify(parsed.data);
  if (serialised.length > 64_000) {
    throw badRequest('This draft is too large to save. Remove long text or attachments.', { data: 'Draft too large.' });
  }
  const data = draftDataSchema.parse(parsed.data ?? {});
  return { currentStep: parsed.currentStep ?? 1, data: data as Partial<WizardData> };
}

export function listDocuments(db: Db, sellerId: string): Array<{
  id: string;
  doc_type: DocumentType;
  doc_label: string | null;
  original_name: string;
  status: string;
  review_note: string | null;
  uploaded_at: string;
  application_id: string | null;
}> {
  return queryAll(
    db,
    `SELECT id, doc_type, doc_label, original_name, status, review_note, uploaded_at, application_id
       FROM seller_documents WHERE seller_id = ? ORDER BY uploaded_at DESC`,
    sellerId,
  );
}

export function checkDocumentRequirements(
  db: Db,
  sellerId: string,
  category: SellerCategoryId | null | undefined,
  sellerType: string | null | undefined,
): { required: DocumentType[]; optional: DocumentType[]; missing: DocumentType[]; rejected: DocumentType[] } {
  const requirements = documentRequirements(category, sellerType);
  const docs = listDocuments(db, sellerId);
  const acceptedOrSubmitted = new Set(
    docs.filter((doc) => doc.status !== 'rejected').map((doc) => doc.doc_type as DocumentType),
  );
  const rejectedDocs = new Set(docs.filter((doc) => doc.status === 'rejected').map((doc) => doc.doc_type as DocumentType));
  return {
    ...requirements,
    missing: requirements.required.filter((type) => !acceptedOrSubmitted.has(type)),
    rejected: requirements.required.filter((type) => rejectedDocs.has(type) && !acceptedOrSubmitted.has(type)),
  };
}

export function assertCompleteSubmission(
  db: Db,
  sellerId: string,
  rawData: unknown,
): WizardData {
  const data = normaliseWizardData(rawData);
  const errors: Record<string, string> = {};

  if (!data.fullName || data.fullName.length < 2) errors.fullName = 'Enter your full name.';
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  if (!data.businessName || data.businessName.length < 2) errors.businessName = 'Enter your shop or maker name.';
  if (!data.sellerCategory) errors.sellerCategory = 'Choose the category that best describes you.';
  if (!data.story || data.story.length < 80) {
    errors.story = 'Tell buyers about your work and background in at least 80 characters.';
  }
  if (!data.region || data.region.length < 2) errors.region = 'Choose your Himachal district.';
  if (!data.village || data.village.length < 2) errors.village = 'Enter your village, town or valley.';

  const address = addressSchema.safeParse(data.address);
  if (!address.success) {
    for (const issue of address.error.issues) errors[`address.${issue.path.join('.')}`] = issue.message;
  }
  if (!data.dispatchSameAsOperating) {
    const dispatch = addressSchema.safeParse(data.dispatchAddress);
    if (!dispatch.success) {
      for (const issue of dispatch.error.issues) errors[`dispatchAddress.${issue.path.join('.')}`] = issue.message;
    }
  }
  if (!data.categorySlugs.length) errors.categorySlugs = 'Choose at least one product category.';
  if (!data.productGroups.length) errors.productGroups = 'Choose at least one product group.';
  if (!data.originNarrative || data.originNarrative.length < 40) {
    errors.originNarrative = 'Describe where and how your products are made in at least 40 characters.';
  }
  if (!data.authenticityDeclaration) {
    errors.authenticityDeclaration = 'Confirm the origin and authenticity declaration.';
  }
  if (data.sellerCategory === 'food_producer' && !data.fssaiNumber) {
    errors.fssaiNumber = 'Enter your FSSAI registration or licence number.';
  }
  if (!data.categoryAnswers || Object.values(data.categoryAnswers).every((value) => !value.trim())) {
    if (data.sellerCategory === 'food_producer' || data.sellerCategory === 'retailer') {
      errors.categoryAnswers = 'Answer the category-specific questions.';
    }
  }

  const shipping = shippingSchema.safeParse(data.shipping);
  if (!shipping.success) {
    for (const issue of shipping.error.issues) errors[`shipping.${issue.path.join('.')}`] = issue.message;
  }
  // Payout details are deliberately not collected during onboarding. They are
  // introduced later through a separate, secured payout process once a
  // settlement provider is configured. Legacy drafts may still carry values,
  // and those are preserved rather than validated as a submission requirement.
  const agreements = agreementsSchema.safeParse(data.agreements);
  if (!agreements.success) {
    for (const issue of agreements.error.issues) errors[`agreements.${issue.path.join('.')}`] = issue.message;
  }

  const docs = checkDocumentRequirements(db, sellerId, data.sellerCategory, data.sellerType);
  for (const type of docs.missing) {
    errors[`documents.${type}`] = `${DOCUMENT_LABELS[type]} is required before submission.`;
  }

  if (Object.keys(errors).length) {
    const first = Object.values(errors)[0] ?? 'Please complete the required information.';
    throw badRequest(first, errors);
  }
  return data;
}

/* -------------------------------------------------------------------------- */
/*                        Customer-visible checklists                         */
/* -------------------------------------------------------------------------- */

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'complete' | 'pending' | 'action';
  detail: string;
  href?: string;
}

export function onboardingChecklist(
  db: Db,
  sellerId: string,
  application: ApplicationRow | undefined,
  emailVerified: boolean,
): ChecklistItem[] {
  const data = parseJson<Partial<WizardData>>(application?.data_json ?? null, {});
  const docs = listDocuments(db, sellerId);
  const requirements = documentRequirements(
    (application?.seller_category ?? data.sellerCategory) as SellerCategoryId | undefined,
    application?.seller_type ?? data.sellerType,
  );
  const hasDoc = (type: DocumentType) => docs.some((doc) => doc.doc_type === type && doc.status !== 'rejected');
  const submitted = application && application.status !== 'draft';
  const approved = application?.status === 'approved';
  return [
    {
      id: 'account',
      label: 'Account and email',
      status: emailVerified ? 'complete' : 'action',
      detail: emailVerified ? 'Email confirmed.' : 'Confirm your email address to continue.',
      href: emailVerified ? undefined : '/verify-email',
    },
    {
      id: 'profile',
      label: 'Shop and personal profile',
      status: data.businessName && data.story && data.sellerCategory ? 'complete' : 'pending',
      detail: data.businessName ? 'Profile details saved.' : 'Add your name, story and shop details.',
      href: '/sell?edit=1&step=3',
    },
    {
      id: 'location',
      label: 'Himachal location and dispatch address',
      status: data.region && data.address?.line1 ? 'complete' : 'pending',
      detail: data.region ? `${data.region}${data.village ? ` · ${data.village}` : ''}` : 'Location not added yet.',
      href: '/sell?edit=1&step=4',
    },
    {
      id: 'origin',
      label: 'Product origin and authenticity',
      status: data.originNarrative && data.authenticityDeclaration ? 'complete' : 'pending',
      detail: data.originNarrative ? 'Origin narrative saved.' : 'Describe where your products come from.',
      href: '/sell?edit=1&step=5',
    },
    {
      id: 'verification',
      label: 'Identity and category verification',
      status: requirements.required.every(hasDoc) ? 'complete' : 'action',
      detail: requirements.required.every(hasDoc)
        ? 'Required documents uploaded.'
        : `Upload: ${requirements.required.filter((type) => !hasDoc(type)).map((type) => DOCUMENT_LABELS[type]).join(', ')}`,
      href: '/sell?edit=1&step=6',
    },
    {
      id: 'shipping',
      label: 'Packaging and dispatch',
      status: data.shipping?.dispatchDays ? 'complete' : 'pending',
      detail: data.shipping?.dispatchDays ? `Dispatch within ${data.shipping.dispatchDays} days.` : 'Set dispatch expectations.',
      href: '/sell?edit=1&step=7',
    },
    {
      id: 'agreements',
      label: 'Seller agreement and commission',
      status: data.agreements?.sellerAgreement && data.agreements?.commissionDisclosure ? 'complete' : 'pending',
      detail: data.agreements?.sellerAgreement ? 'Agreements accepted.' : 'Read and accept the seller terms.',
      href: '/sell?edit=1&step=9',
    },
    {
      id: 'submit',
      label: 'Submit for review',
      status: approved ? 'complete' : submitted ? 'pending' : 'action',
      detail: approved
        ? 'Approved. Keep your store profile and stock current.'
        : submitted
          ? 'Submitted. The marketplace team is reviewing your file.'
          : 'Submit when the sections above are complete.',
      href: submitted ? undefined : '/sell?edit=1&step=10',
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*                            Events & notifications                          */
/* -------------------------------------------------------------------------- */

export function recordApplicationEvent(
  db: Db,
  input: {
    applicationId: string;
    sellerId: string;
    actor?: Pick<SessionUser, 'id' | 'email'> | null;
    event: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    reason?: string | null;
    metadata?: unknown;
  },
): void {
  execute(
    db,
    `INSERT INTO seller_application_events
       (id, application_id, seller_id, actor_id, actor_email, event, from_status, to_status, reason, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('sev_'),
    input.applicationId,
    input.sellerId,
    input.actor?.id ?? null,
    input.actor?.email ?? null,
    input.event,
    input.fromStatus ?? null,
    input.toStatus ?? null,
    input.reason ?? null,
    input.metadata === undefined ? null : JSON.stringify(input.metadata),
  );
}

export function sellerNotification(
  db: Db,
  input: {
    sellerId: string;
    userId?: string | null;
    type: string;
    title: string;
    body: string;
    actionUrl?: string | null;
    dedupeKey?: string | null;
  },
): void {
  if (input.dedupeKey) {
    const existing = queryOne<{ id: string }>(db, 'SELECT id FROM seller_notifications WHERE dedupe_key = ?', input.dedupeKey);
    if (existing) return;
  }
  execute(
    db,
    `INSERT INTO seller_notifications (id, seller_id, user_id, type, title, body, action_url, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('snf_'),
    input.sellerId,
    input.userId ?? null,
    input.type,
    input.title.slice(0, 180),
    input.body.slice(0, 2000),
    input.actionUrl ?? null,
    input.dedupeKey ?? null,
  );
}

export interface DecisionResult {
  applicationId: string;
  sellerId: string;
  previousStatus: ApplicationStatus;
  nextStatus: ApplicationStatus;
  businessName: string;
}

/**
 * An applicant may withdraw an application that has not been approved. This is
 * deliberately separate from administrative decisions: it cannot approve,
 * reject, suspend or reinstate anything, and it records the applicant as actor.
 */
export function applyApplicantWithdrawal(
  db: Db,
  actor: SessionUser,
  sellerId: string,
  reason: string | null,
): DecisionResult {
  const seller = queryOne<{ id: string; user_id: string; status: string; business_name: string }>(
    db,
    'SELECT id, user_id, status, business_name FROM seller_profiles WHERE id = ? AND user_id = ?',
    sellerId,
    actor.id,
  );
  if (!seller) throw forbidden('You can only withdraw your own application.');
  const application = latestApplication(db, seller.id);
  if (!application) throw badRequest('There is no application to withdraw.');
  assertTransition(application.status, 'withdrawn');

  const now = new Date().toISOString();
  tx(db, () => {
    execute(
      db,
      `UPDATE seller_applications
          SET status = 'withdrawn', rejection_reason = ?, updated_at = ?
        WHERE id = ?`,
      reason,
      now,
      application.id,
    );
    execute(
      db,
      `UPDATE seller_profiles
          SET status = 'draft', store_status = 'setup_incomplete',
              store_status_reason = ?, rejection_reason = NULL, updated_at = ?
        WHERE id = ?`,
      'Application withdrawn by the applicant.',
      now,
      seller.id,
    );
    execute(
      db,
      "UPDATE products SET status = 'paused', updated_at = ? WHERE seller_id = ? AND status IN ('approved','pending')",
      now,
      seller.id,
    );
    recordApplicationEvent(db, {
      applicationId: application.id,
      sellerId: seller.id,
      actor,
      event: 'application_withdrawn',
      fromStatus: application.status,
      toStatus: 'withdrawn',
      reason,
    });
    sellerNotification(db, {
      sellerId: seller.id,
      userId: seller.user_id,
      type: 'application_withdrawn',
      title: 'Application withdrawn',
      body: reason?.trim()
        ? `Your application has been withdrawn. Reason recorded: ${reason.trim()} You can start a new draft whenever you are ready.`
        : 'Your application has been withdrawn. You can start a new draft whenever you are ready. Any listings that were live have been paused.',
      actionUrl: '/seller/application',
      dedupeKey: `withdrawn:${application.id}:${now}`,
    });
    audit(db, actor, 'seller.application_withdrawn', 'seller', seller.id, { status: application.status }, {
      applicationId: application.id,
      status: 'withdrawn',
      reason,
    });
  });

  return {
    applicationId: application.id,
    sellerId: seller.id,
    previousStatus: application.status,
    nextStatus: 'withdrawn',
    businessName: seller.business_name,
  };
}

/**
 * Apply an administrative decision inside one transaction. The caller owns
 * email delivery so a slow SMTP server never holds the write lock.
 */
export function applySellerDecision(
  db: Db,
  actor: SessionUser,
  sellerId: string,
  decision: 'start_review' | 'request_changes' | 'approve' | 'reject' | 'suspend' | 'reinstate' | 'request_reverification',
  reason: string | null,
): DecisionResult {
  const seller = queryOne<{ id: string; user_id: string; status: string; business_name: string; seller_category: string | null }>(
    db,
    'SELECT id, user_id, status, business_name, seller_category FROM seller_profiles WHERE id = ?',
    sellerId,
  );
  if (!seller) throw badRequest('Seller not found.');
  if (seller.user_id === actor.id) {
    throw forbidden('You cannot review or decide on your own seller application.');
  }
  const application = latestApplication(db, sellerId);
  if (!application) throw badRequest('This seller has no application to review.');
  if (application.status === 'draft') {
    throw conflict('This application has not been submitted yet.');
  }

  const nextStatus: Record<typeof decision, ApplicationStatus> = {
    start_review: 'under_review',
    request_changes: 'changes_requested',
    approve: 'approved',
    reject: 'rejected',
    suspend: 'suspended',
    reinstate: 'approved',
    request_reverification: 'under_review',
  };
  const target = nextStatus[decision];
  assertTransition(application.status, target);
  if (['request_changes', 'reject', 'suspend', 'request_reverification'].includes(decision) && (!reason || reason.trim().length < 5)) {
    throw badRequest('Record a clear reason for this decision.', { reason: 'A reason of at least 5 characters is required.' });
  }

  const now = new Date().toISOString();
  // Re-verification of an approved seller starts a fresh review without taking
  // the store offline: they still need to fulfil existing orders while evidence
  // is checked. Suspension remains the action that stops trading.
  const keepsTrading = decision === 'request_reverification' && seller.status === 'approved';
  const storeStatus = keepsTrading ? 'active' : storeStatusForApplication(target);
  const profileStatus = keepsTrading ? 'approved' : profileStatusForApplication(target);
  tx(db, () => {
    execute(
      db,
      `UPDATE seller_applications
          SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?`,
      target,
      decision === 'approve' || decision === 'reinstate' ? null : reason,
      actor.id,
      now,
      now,
      application.id,
    );
    execute(
      db,
      `UPDATE seller_profiles
          SET status = ?, store_status = ?, store_status_reason = ?,
              rejection_reason = CASE WHEN ? IN ('request_changes','reject','suspend') THEN ? ELSE NULL END,
              approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
              verified_at = CASE WHEN ? = 'approved' THEN ? ELSE verified_at END,
              updated_at = ?
        WHERE id = ?`,
      profileStatus,
      storeStatus,
      ['request_changes', 'reject', 'suspend'].includes(decision) ? reason : null,
      decision,
      reason,
      target,
      now,
      target,
      now,
      now,
      sellerId,
    );
    if (target === 'approved') {
      execute(db, "INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'seller')", seller.user_id);
    }
    if (target === 'suspended') {
      execute(
        db,
        "UPDATE products SET status = 'paused', updated_at = ? WHERE seller_id = ? AND status IN ('approved','pending')",
        now,
        sellerId,
      );
    }
    recordApplicationEvent(db, {
      applicationId: application.id,
      sellerId,
      actor,
      event: `admin_${decision}`,
      fromStatus: application.status,
      toStatus: target,
      reason,
      metadata: { storeStatus },
    });
    sellerNotification(db, {
      sellerId,
      userId: seller.user_id,
      type: `application_${target}`,
      title:
        target === 'approved'
          ? 'Your maker account is approved'
          : target === 'changes_requested'
            ? 'Changes requested on your application'
            : target === 'rejected'
              ? 'Update on your maker application'
              : target === 'suspended'
                ? 'Your store has been suspended'
                : 'Your application is under review',
      body:
        reason ??
        (target === 'approved'
          ? 'You can now add products. Keep your store profile accurate and dispatch on time.'
          : 'The marketplace team has updated your application status. Open your seller application to see the details.'),
      actionUrl: '/seller/application',
      dedupeKey: `seller-event:${application.id}:${decision}:${now}`,
    });
    audit(db, actor, `seller.${decision}`, 'seller', sellerId, {
      profileStatus: seller.status,
      applicationStatus: application.status,
    }, {
      applicationStatus: target,
      storeStatus,
      reason,
      tradingContinued: keepsTrading,
    });
  });

  return {
    applicationId: application.id,
    sellerId,
    previousStatus: application.status,
    nextStatus: target,
    businessName: seller.business_name,
  };
}
