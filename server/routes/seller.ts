import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryAll, queryOne, tx, type Db } from '../db.js';
import { requireApprovedSeller, requireAuth } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound, parse } from '../lib/http.js';
import { newId, uniqueSlug } from '../lib/ids.js';
import { documentUpload, hasValidFileSignature, imageUpload, isInsidePrivateDocs } from '../lib/uploads.js';
import { notify, escapeHtml } from '../lib/email.js';
import { COMMISSION_BASIS_NOTE, resolveCommissionBp } from '../lib/pricing.js';
import { firstComplianceError, validateProductCompliance, COMPLIANCE_GUIDES } from '../lib/productCompliance.js';
import { sellerOrderAction, type SellerAction } from '../lib/orders.js';
import {
  applyApplicantWithdrawal,
  assertCompleteSubmission,
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  documentRequirements,
  latestApplication,
  listDocuments,
  normaliseDraft,
  onboardingChecklist,
  parseJson,
  recordApplicationEvent,
  sellerNotification,
  SELLER_CATEGORY_CONFIG,
  SELLER_CATEGORY_IDS,
  SELLER_TYPES,
  storeStatusForApplication,
  type ApplicationRow,
  type DocumentType,
  type SellerCategoryId,
  type WizardData,
} from '../lib/sellerOnboarding.js';

const applySchema = z.object({
  businessName: z.string().trim().min(2, 'Enter your business or maker name.').max(120),
  sellerType: z.enum(SELLER_TYPES),
  sellerCategory: z
    .enum(['farmer_grower', 'artisan_craftsperson', 'food_producer', 'home_business', 'local_brand', 'retailer'])
    .optional(),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.'),
  region: z.string().trim().min(2, 'Enter your district or region.').max(80),
  village: z.string().trim().max(120).optional(),
  categorySlugs: z.array(z.string().min(2)).min(1, 'Choose at least one category.').max(8),
  address: z.object({
    line1: z.string().trim().min(4).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.'),
  }),
  gstin: z.string().trim().max(20).optional(),
  panLast4: z.string().trim().regex(/^[A-Za-z0-9]{4}$/, 'Enter the last four characters of your PAN.').optional(),
  tagline: z.string().trim().max(160).optional(),
  story: z.string().trim().max(3000).optional(),
  notes: z.string().trim().max(1500).optional(),
});

interface SellerRow {
  id: string;
  user_id: string;
  business_name: string;
  slug: string;
  seller_type: string;
  seller_category: string | null;
  status: string;
  store_status: string;
  store_status_reason: string | null;
  payout_status: string;
  region: string | null;
  village: string | null;
  tagline: string | null;
  story: string | null;
  logo_url: string | null;
  cover_url: string | null;
  operating_address: string | null;
  pickup_address: string | null;
  gstin: string | null;
  pan_last4: string | null;
  rejection_reason: string | null;
  onboarding_step: number;
  created_at: string;
  approved_at: string | null;
}

function sellerForUser(db: Db, userId: string): SellerRow | undefined {
  return queryOne<SellerRow>(db, 'SELECT * FROM seller_profiles WHERE user_id = ?', userId);
}

function ensureSellerProfile(db: Db, userId: string, data: Partial<WizardData>): SellerRow {
  const existing = sellerForUser(db, userId);
  if (existing) return existing;
  const name = (data.businessName ?? '').trim() || 'New maker';
  const id = newId('sel_');
  const slug = uniqueSlug(name, (candidate) => Boolean(queryOne(db, 'SELECT 1 FROM seller_profiles WHERE slug = ?', candidate)));
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO seller_profiles
       (id, user_id, business_name, slug, seller_type, seller_category, region, village, status,
        store_status, payout_status, onboarding_step, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'setup_incomplete', 'not_started', 1, ?, ?)`,
    id,
    userId,
    name,
    slug,
    data.sellerType ?? 'individual',
    data.sellerCategory ?? null,
    data.region ?? null,
    data.village ?? null,
    now,
    now,
  );
  return sellerForUser(db, userId)!;
}

function applicationView(row: ApplicationRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    currentStep: row.current_step,
    businessName: row.business_name,
    sellerType: row.seller_type,
    sellerCategory: row.seller_category,
    categories: parseJson<string[]>(row.categories, []),
    address: parseJson<Record<string, unknown>>(row.address, {}),
    gstin: row.gstin,
    phone: row.phone,
    notes: row.notes,
    data: parseJson<Record<string, unknown>>(row.data_json, {}),
    verification: parseJson<Record<string, unknown> | null>(row.verification_json, null),
    shipping: parseJson<Record<string, unknown> | null>(row.shipping_json, null),
    payout: parseJson<Record<string, unknown> | null>(row.payout_json, null),
    agreement: parseJson<Record<string, unknown> | null>(row.agreement_json, null),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    lastSavedAt: row.last_saved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const productSchema = z.object({
  name: z.string().trim().min(2, 'Enter a product name.').max(140),
  categoryId: z.string().min(2, 'Choose a valid category.'),
  shortDescription: z.string().trim().max(240).optional().default(''),
  description: z.string().trim().max(6000).optional().default(''),
  pricePaise: z.number().int().min(100, 'Price must be at least ₹1.').max(10_000_000),
  compareAtPricePaise: z.number().int().min(0).max(10_000_000).nullable().optional(),
  sku: z.string().trim().max(60).optional().default(''),
  unit: z.string().trim().min(1).max(30).default('piece'),
  weightG: z.number().int().min(1, 'Add the packed weight in grams.').max(200_000).nullable().optional(),
  dimensions: z.string().trim().max(120).optional(),
  materials: z.string().trim().max(500).optional(),
  careInstructions: z.string().trim().max(1000).optional(),
  foodInfo: z.string().trim().max(1500).optional(),
  originPlace: z.string().trim().max(120).optional(),
  region: z.string().trim().max(80).optional(),
  varietyGrade: z.string().trim().max(120).optional(),
  harvestInfo: z.string().trim().max(200).optional(),
  dispatchConditions: z.string().trim().max(200).optional(),
  estimatedCostPaise: z.number().int().min(0).max(10_000_000).optional().default(0),
  packagingCostPaise: z.number().int().min(0).max(10_000_000).optional().default(0),
  attributes: z.record(z.string().max(40), z.string().max(200)).optional(),
  compliance: z
    .object({
      ingredients: z.string().trim().max(1000).optional(),
      shelfLife: z.string().trim().max(120).optional(),
      batchNumber: z.string().trim().max(80).optional(),
      fssaiLicense: z.string().trim().max(30).optional(),
      storage: z.string().trim().max(300).optional(),
      allergenInfo: z.string().trim().max(300).optional(),
    })
    .optional(),
});

function emptyToNull(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

export function sellerRouter(db: Db): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/config', (req, res) => {
    const seller = sellerForUser(db, req.user!.id);
    const categoryRows = queryAll<{ id: string }>(db, 'SELECT id FROM categories WHERE is_active = 1');
    const categoryRates: Record<string, number> = {};
    for (const category of categoryRows) {
      categoryRates[category.id] = seller
        ? resolveCommissionBp(db, seller.id, category.id)
        : env.defaultCommissionBp;
    }
    res.json({
      sellerCategories: SELLER_CATEGORY_IDS.map((id) => ({
        id,
        ...SELLER_CATEGORY_CONFIG[id],
      })),
      sellerTypes: SELLER_TYPES,
      documentTypes: DOCUMENT_TYPES.map((id) => ({ id, label: DOCUMENT_LABELS[id] })),
      commission: {
        defaultBp: seller ? resolveCommissionBp(db, seller.id, categoryRows[0]?.id ?? '') : env.defaultCommissionBp,
        categoryRates,
        note: COMMISSION_BASIS_NOTE,
      },
      payoutProvider: {
        configured: false,
        provider: 'not_configured',
        message:
          'Marketplace payouts are not yet connected to a provider. Bank/UPI preferences are recorded for manual, reviewed settlements; no automatic transfer is claimed.',
      },
      verification: {
        email: true,
        sms: false,
        note: 'Email verification is active. Mobile verification requires an SMS provider and is completed during manual review.',
      },
      productCompliance: COMPLIANCE_GUIDES,
    });
  });

  router.get('/application', (req, res) => {
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) {
      res.json({ exists: false, commissionNote: COMMISSION_BASIS_NOTE });
      return;
    }
    const application = latestApplication(db, seller.id);
    const documents = listDocuments(db, seller.id);
    const category = (application?.seller_category ?? seller.seller_category) as SellerCategoryId | null;
    const requirements = documentRequirements(category, application?.seller_type ?? seller.seller_type);
    const acceptedOrSubmitted = new Set(
      documents.filter((doc) => doc.status !== 'rejected').map((doc) => doc.doc_type as DocumentType),
    );
    const missing = requirements.required.filter((type) => !acceptedOrSubmitted.has(type));
    const events = queryAll<{
      id: string;
      event: string;
      from_status: string | null;
      to_status: string | null;
      reason: string | null;
      actor_email: string | null;
      created_at: string;
    }>(
      db,
      `SELECT id, event, from_status, to_status, reason, actor_email, created_at
         FROM seller_application_events WHERE seller_id = ? ORDER BY created_at DESC LIMIT 50`,
      seller.id,
    );
    res.json({
      exists: true,
      seller: {
        id: seller.id,
        businessName: seller.business_name,
        slug: seller.slug,
        status: seller.status,
        sellerType: seller.seller_type,
        sellerCategory: seller.seller_category,
        storeStatus: seller.store_status,
        storeStatusReason: seller.store_status_reason,
        payoutStatus: seller.payout_status,
        region: seller.region,
        village: seller.village,
        tagline: seller.tagline,
        story: seller.story,
        logoUrl: seller.logo_url,
        coverUrl: seller.cover_url,
        operatingAddress: seller.operating_address ? parseJson<Record<string, unknown>>(seller.operating_address, {}) : null,
        pickupAddress: seller.pickup_address ? parseJson<Record<string, unknown>>(seller.pickup_address, {}) : null,
        gstin: seller.gstin,
        panLast4: seller.pan_last4,
        rejectionReason: seller.rejection_reason,
        onboardingStep: seller.onboarding_step,
        createdAt: seller.created_at,
        approvedAt: seller.approved_at,
      },
      application: applicationView(application),
      canWithdraw: Boolean(
        application && ['draft', 'submitted', 'under_review', 'changes_requested', 'rejected'].includes(application.status),
      ),
      documents: documents.map((doc) => ({
        id: doc.id,
        docType: doc.doc_type,
        docLabel: doc.doc_label ?? DOCUMENT_LABELS[doc.doc_type as DocumentType],
        originalName: doc.original_name,
        status: doc.status,
        reviewNote: doc.review_note,
        uploadedAt: doc.uploaded_at,
      })),
      events: events.map((event) => ({
        id: event.id,
        event: event.event,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        reason: event.reason,
        actorEmail: event.actor_email,
        createdAt: event.created_at,
      })),
      requirements: {
        required: requirements.required,
        optional: requirements.optional,
        missing,
        labels: DOCUMENT_LABELS,
      },
      checklist: onboardingChecklist(db, seller.id, application, req.user!.emailVerified),
      verification: {
        emailVerified: req.user!.emailVerified,
        phoneVerified: false,
        smsConfigured: false,
      },
      payoutProvider: {
        configured: false,
        provider: 'not_configured',
        message:
          'Payouts are settled manually after review. Connect an eligible marketplace payout provider before promising automatic transfers.',
      },
      commissionNote: COMMISSION_BASIS_NOTE,
    });
  });

  router.post('/application/withdraw', (req, res) => {
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) throw badRequest('There is no application to withdraw.');
    const input = parse(
      z.object({
        reason: z.string().trim().max(500).optional(),
      }),
      req.body ?? {},
    );
    const result = applyApplicantWithdrawal(db, req.user!, seller.id, input.reason || null);
    res.json({
      ok: true,
      status: result.nextStatus,
      previousStatus: result.previousStatus,
      applicationId: result.applicationId,
      message: 'Application withdrawn. You can start a new draft at any time.',
    });
  });

  router.post('/application/draft', (req, res) => {
    const draft = normaliseDraft(req.body);
    const seller = ensureSellerProfile(db, req.user!.id, draft.data);
    const latest = latestApplication(db, seller.id);
    // A withdrawn application is preserved for history, but it is closed. A
    // fresh draft is created rather than mutating the withdrawn record.
    const current = latest && latest.status !== 'withdrawn' ? latest : undefined;
    if (current && ['submitted', 'under_review', 'approved', 'suspended'].includes(current.status)) {
      throw conflict(
        current.status === 'approved'
          ? 'Your seller account is already approved. Update your store profile instead.'
          : 'Your application is already in review and cannot be edited as a draft.',
      );
    }
    const now = new Date().toISOString();
    const data = { ...parseJson<Record<string, unknown>>(current?.data_json ?? null, {}), ...draft.data };
    const address = data.address ?? current?.address ?? {};
    const categories = Array.isArray(data.categorySlugs) ? data.categorySlugs : [];
    let applicationId = current?.id;

    tx(db, () => {
      if (current) {
        execute(
          db,
          `UPDATE seller_applications
              SET current_step = ?, seller_category = COALESCE(?, seller_category),
                  business_name = COALESCE(NULLIF(?, ''), business_name),
                  seller_type = COALESCE(?, seller_type),
                  categories = ?, address = ?, phone = COALESCE(NULLIF(?, ''), phone),
                  data_json = ?, last_saved_at = ?, updated_at = ?
            WHERE id = ?`,
          draft.currentStep,
          data.sellerCategory ?? null,
          data.businessName ?? '',
          data.sellerType ?? current.seller_type,
          JSON.stringify(categories),
          JSON.stringify(address),
          data.phone ?? '',
          JSON.stringify(data),
          now,
          now,
          current.id,
        );
      } else {
        applicationId = newId('app_');
        execute(
          db,
          `INSERT INTO seller_applications
             (id, seller_id, status, revision, current_step, seller_category, business_name, seller_type,
              categories, address, gstin, phone, notes, data_json, last_saved_at, created_at, updated_at)
           VALUES (?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
          applicationId,
          seller.id,
          draft.currentStep,
          data.sellerCategory ?? null,
          (data.businessName as string | undefined)?.trim() || seller.business_name,
          data.sellerType ?? seller.seller_type,
          JSON.stringify(categories),
          JSON.stringify(address),
          (data.gstin as string | undefined) || null,
          (data.phone as string | undefined) || null,
          JSON.stringify(data),
          now,
          now,
          now,
        );
        recordApplicationEvent(db, {
          applicationId,
          sellerId: seller.id,
          actor: req.user!,
          event: 'draft_started',
          toStatus: 'draft',
        });
        audit(db, req.user!, 'seller.draft_started', 'seller', seller.id, null, { applicationId });
      }
      execute(
        db,
        `UPDATE seller_profiles
            SET onboarding_step = ?, seller_category = COALESCE(?, seller_category),
                business_name = COALESCE(NULLIF(?, ''), business_name), updated_at = ?
          WHERE id = ?`,
        draft.currentStep,
        data.sellerCategory ?? null,
        data.businessName ?? '',
        now,
        seller.id,
      );
    });

    res.json({
      applicationId,
      status: current?.status ?? 'draft',
      currentStep: draft.currentStep,
      savedAt: now,
      message: 'Draft saved. You can leave and resume later.',
    });
  });

  async function submitApplication(
    req: Request,
    res: Response,
    data: WizardData,
    options: { idempotencyKey?: string | null; legacy?: boolean } = {},
  ): Promise<void> {
    if (!req.user!.emailVerified) {
      throw badRequest('Confirm your email address before submitting an application.', {
        email: 'Please confirm your email address first.',
      });
    }
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) throw badRequest('Save your application details before submitting.');
    const current = latestApplication(db, seller.id);
    if (!current) throw badRequest('Save your application details before submitting.');

    // Replay protection: a retry of the same submission returns the original
    // acknowledgement instead of creating a duplicate or a confusing conflict.
    const idempotencyKey = options.idempotencyKey ?? null;
    if (idempotencyKey) {
      const replay = queryOne<{ id: string }>(
        db,
        `SELECT id FROM seller_application_events
          WHERE application_id = ? AND event = 'application_submitted'
            AND json_extract(metadata_json, '$.idempotencyKey') = ? LIMIT 1`,
        current.id,
        idempotencyKey,
      );
      if (replay) {
        res.json({
          sellerId: seller.id,
          applicationId: current.id,
          status: 'submitted',
          message: 'This submission was already received. We have not created a duplicate.',
          deduplicated: true,
        });
        return;
      }
    }

    if (['submitted', 'under_review', 'approved', 'suspended'].includes(current.status)) {
      throw conflict('This application has already been submitted.');
    }
    if (!['draft', 'changes_requested', 'rejected'].includes(current.status)) {
      throw conflict('This application cannot be submitted in its current state.');
    }

    const validated = assertCompleteSubmission(db, seller.id, data);
    const categoryRows = queryAll<{ id: string; slug: string }>(
      db,
      `SELECT id, slug FROM categories WHERE is_active = 1 AND slug IN (${validated.categorySlugs.map(() => '?').join(',')})`,
      ...validated.categorySlugs,
    );
    if (categoryRows.length !== new Set(validated.categorySlugs).size) {
      throw badRequest('One or more selected categories are not available.', { categorySlugs: 'Choose valid categories.' });
    }

    const address: Record<string, unknown> = {
      ...(validated.address ?? {}),
      state: validated.address?.state || 'Himachal Pradesh',
      phone: validated.phone,
    };
    const dispatchAddress = validated.dispatchSameAsOperating
      ? address
      : { ...(validated.dispatchAddress ?? {}), state: validated.dispatchAddress?.state || 'Himachal Pradesh', phone: validated.phone };
    const now = new Date().toISOString();
    const nextRevision = current.revision + (current.status === 'draft' ? 0 : 1);

    tx(db, () => {
      execute(
        db,
        `UPDATE seller_applications
            SET status = 'submitted', revision = ?, current_step = 10,
                seller_category = ?, business_name = ?, seller_type = ?, categories = ?, address = ?,
                gstin = ?, phone = ?, notes = ?, data_json = ?, verification_json = ?, shipping_json = ?,
                payout_json = ?, agreement_json = ?, rejection_reason = NULL, submitted_at = ?,
                reviewed_by = NULL, reviewed_at = NULL, last_saved_at = ?, updated_at = ?
          WHERE id = ?`,
        nextRevision,
        validated.sellerCategory ?? null,
        validated.businessName,
        validated.sellerType,
        JSON.stringify(validated.categorySlugs),
        JSON.stringify(address),
        emptyToNull(validated.gstin),
        validated.phone,
        emptyToNull(
          [
            validated.businessRegistrationNumber,
            validated.udyamNumber,
            validated.fssaiNumber,
            validated.yearsOperating !== undefined ? `Years operating: ${validated.yearsOperating}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ),
        JSON.stringify(validated),
        JSON.stringify({
          documents: listDocuments(db, seller.id).map((doc) => ({ id: doc.id, type: doc.doc_type, status: doc.status })),
          requirements: documentRequirements(validated.sellerCategory, validated.sellerType),
        }),
        JSON.stringify(validated.shipping ?? {}),
        JSON.stringify(validated.payout ?? {}),
        JSON.stringify(validated.agreements ?? {}),
        now,
        now,
        now,
        current.id,
      );
      execute(
        db,
        `UPDATE seller_profiles
            SET business_name = ?, seller_type = ?, seller_category = ?, region = ?, village = ?,
                tagline = ?, story = ?, operating_address = ?, pickup_address = ?, gstin = ?, pan_last4 = ?,
                status = 'submitted', store_status = ?, payout_status = ?, onboarding_step = 10,
                rejection_reason = NULL, updated_at = ?
          WHERE id = ?`,
        validated.businessName,
        validated.sellerType,
        validated.sellerCategory ?? null,
        validated.region,
        emptyToNull(validated.village),
        emptyToNull(validated.tagline),
        emptyToNull(validated.story),
        JSON.stringify(address),
        JSON.stringify(dispatchAddress),
        emptyToNull(validated.gstin),
        emptyToNull(validated.panLast4),
        storeStatusForApplication('submitted'),
        'not_started',
        now,
        seller.id,
      );
      execute(db, "INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'seller')", req.user!.id);
      execute(db, 'UPDATE profiles SET phone = COALESCE(?, phone) WHERE id = ?', validated.phone, req.user!.id);
      recordApplicationEvent(db, {
        applicationId: current.id,
        sellerId: seller.id,
        actor: req.user!,
        event: 'application_submitted',
        fromStatus: current.status,
        toStatus: 'submitted',
        metadata: {
          revision: nextRevision,
          category: validated.sellerCategory,
          resubmission: current.status !== 'draft',
          idempotencyKey,
          legacy: Boolean(options.legacy),
        },
      });
      sellerNotification(db, {
        sellerId: seller.id,
        userId: req.user!.id,
        type: 'application_submitted',
        title: current.status === 'draft' ? 'Application submitted' : 'Application resubmitted',
        body: 'Your application is queued for manual review. We will contact you if documents or details need attention.',
        actionUrl: '/seller/application',
        dedupeKey: `submitted:${current.id}:${now}`,
      });
      audit(db, req.user!, 'seller.application_submitted', 'seller', seller.id, { status: current.status }, {
        applicationId: current.id,
        revision: nextRevision,
        businessName: validated.businessName,
        categories: validated.categorySlugs,
        sellerCategory: validated.sellerCategory,
      });
    });

    await notify(db, {
      userId: req.user!.id,
      email: req.user!.email,
      type: 'seller_application_received',
      subject: 'We have received your seller application',
      body: `<p>Hello ${escapeHtml(req.user!.fullName || 'there')},</p>
        <p>Thank you for applying to sell on DEAR HILLS. Our team reviews applications manually and may request clarification or documents.</p>
        <p><strong>Business:</strong> ${escapeHtml(validated.businessName)}</p>
        <p>You can follow the status in your seller application. Products cannot be published until the application is approved.</p>`,
      dedupeKey: `seller-application:${current.id}:${nextRevision}`,
    });
    await notify(db, {
      email: env.email.supportEmail,
      type: 'seller_application_admin',
      subject: `Seller application: ${validated.businessName}`,
      body: `<p>A seller application requires review.</p><p><strong>Applicant:</strong> ${escapeHtml(req.user!.email)}<br/><strong>Business:</strong> ${escapeHtml(validated.businessName)}<br/><strong>Category:</strong> ${escapeHtml(validated.sellerCategory ?? '—')}<br/><strong>Region:</strong> ${escapeHtml(validated.region)}</p>`,
      dedupeKey: `seller-application-admin:${current.id}:${nextRevision}`,
    });

    res.status(201).json({
      sellerId: seller.id,
      applicationId: current.id,
      status: 'submitted',
      revision: nextRevision,
      message: 'Application submitted. We will review it and may request documents or clarification.',
    });
  }

  router.post('/application/submit', async (req, res) => {
    const body = (req.body ?? {}) as { data?: unknown; idempotencyKey?: unknown };
    const raw = body.data ?? req.body;
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.length <= 120 ? body.idempotencyKey : null;
    await submitApplication(req, res, raw as WizardData, { idempotencyKey });
  });

  // Backwards-compatible endpoint used by older clients. It now runs through the
  // same validation and state machine, so required agreements and evidence
  // cannot be bypassed.
  router.post('/apply', async (req, res) => {
    const input = parse(applySchema, req.body);
    const seller = sellerForUser(db, req.user!.id);
    const now = new Date().toISOString();
    const data: WizardData = {
      fullName: req.user!.fullName || 'Maker',
      phone: input.phone,
      businessName: input.businessName,
      sellerType: input.sellerType,
      sellerCategory: input.sellerCategory ?? 'artisan_craftsperson',
      tagline: input.tagline ?? '',
      story: input.story ?? '',
      region: input.region,
      village: input.village ?? '',
      address: input.address,
      dispatchAddress: input.address,
      dispatchSameAsOperating: true,
      categorySlugs: input.categorySlugs,
      productGroups: [],
      originNarrative: input.notes ?? '',
      authenticityDeclaration: false,
      categoryAnswers: {},
      gstin: input.gstin ?? '',
      panLast4: input.panLast4 ?? '',
      fssaiNumber: '',
      udyamNumber: '',
      businessRegistrationNumber: '',
      shipping: {
        dispatchDays: 5,
        packaging: 'Packed by the seller and despatched through a recorded courier service.',
        shipsAcrossIndia: true,
        coldChain: false,
        notes: '',
      },
      agreements: {
        sellerAgreement: true,
        commissionDisclosure: true,
        authenticityPolicy: true,
        privacyPolicy: true,
        version: 'legacy',
      },
    };
    const sellerRecord = seller ?? ensureSellerProfile(db, req.user!.id, data);
    if (!latestApplication(db, sellerRecord.id)) {
      execute(
        db,
        `INSERT INTO seller_applications
           (id, seller_id, status, revision, current_step, seller_category, business_name, seller_type,
            categories, address, gstin, phone, data_json, last_saved_at, created_at, updated_at)
         VALUES (?, ?, 'draft', 1, 10, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId('app_'),
        sellerRecord.id,
        data.sellerCategory ?? null,
        data.businessName,
        data.sellerType,
        JSON.stringify(data.categorySlugs),
        JSON.stringify(data.address),
        emptyToNull(data.gstin),
        data.phone,
        JSON.stringify(data),
        now,
        now,
        now,
      );
    }
    await submitApplication(req, res, data, { legacy: true });
  });

  router.post('/documents', documentUpload().single('document'), (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Choose a document to upload.');
    if (!hasValidFileSignature(file.path, 'document')) {
      fs.unlinkSync(file.path);
      throw badRequest('That file does not look like a valid PDF, JPEG, or PNG document.');
    }
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) throw badRequest('Start your application before uploading documents.');
    const current = latestApplication(db, seller.id);
    if (current && ['submitted', 'under_review', 'approved', 'suspended'].includes(current.status)) {
      throw conflict('Documents cannot be replaced while the application is in review. Ask the review team to reopen it.');
    }
    const docType = String(req.body.docType ?? 'other') as DocumentType;
    if (!DOCUMENT_TYPES.includes(docType)) throw badRequest('Choose a valid document type.');
    const id = newId('doc_');
    execute(
      db,
      `INSERT INTO seller_documents
         (id, seller_id, application_id, doc_type, doc_label, file_path, original_name, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      seller.id,
      current?.id ?? null,
      docType,
      DOCUMENT_LABELS[docType],
      file.path,
      path.basename(file.originalname).slice(0, 160),
      file.mimetype,
      file.size,
    );
    if (current) {
      recordApplicationEvent(db, {
        applicationId: current.id,
        sellerId: seller.id,
        actor: req.user!,
        event: 'document_uploaded',
        metadata: { docType, documentId: id },
      });
    }
    audit(db, req.user!, 'seller.document_uploaded', 'seller', seller.id, null, { docType, id });
    res.status(201).json({
      id,
      docType,
      label: DOCUMENT_LABELS[docType],
      message: 'Document uploaded privately. Only authorized reviewers can open it.',
    });
  });

  router.delete('/documents/:id', (req, res) => {
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) throw notFound('Document not found.');
    const doc = queryOne<{ id: string; seller_id: string; file_path: string }>(
      db,
      'SELECT id, seller_id, file_path FROM seller_documents WHERE id = ? AND seller_id = ?',
      req.params.id,
      seller.id,
    );
    if (!doc) throw notFound('Document not found.');
    const current = latestApplication(db, seller.id);
    if (current && ['submitted', 'under_review', 'approved', 'suspended'].includes(current.status)) {
      throw conflict('Documents cannot be removed while the application is in review.');
    }
    execute(db, 'DELETE FROM seller_documents WHERE id = ?', doc.id);
    if (isInsidePrivateDocs(doc.file_path) && fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
    audit(db, req.user!, 'seller.document_deleted', 'seller', seller.id, { documentId: doc.id }, null);
    res.json({ ok: true });
  });

  router.get('/notifications', (req, res) => {
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) {
      res.json({ notifications: [], unread: 0 });
      return;
    }
    const notifications = queryAll<{
      id: string;
      type: string;
      title: string;
      body: string;
      action_url: string | null;
      read_at: string | null;
      created_at: string;
    }>(
      db,
      `SELECT id, type, title, body, action_url, read_at, created_at
         FROM seller_notifications WHERE seller_id = ? ORDER BY created_at DESC LIMIT 100`,
      seller.id,
    );
    res.json({
      notifications: notifications.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        actionUrl: row.action_url,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
      unread: notifications.filter((row) => !row.read_at).length,
    });
  });

  router.post('/notifications/:id/read', (req, res) => {
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) throw notFound('Notification not found.');
    const notification = queryOne<{ id: string }>(
      db,
      'SELECT id FROM seller_notifications WHERE id = ? AND seller_id = ?',
      req.params.id,
      seller.id,
    );
    if (!notification) throw notFound('Notification not found.');
    execute(db, 'UPDATE seller_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?', new Date().toISOString(), notification.id);
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', (req, res) => {
    const seller = sellerForUser(db, req.user!.id);
    if (!seller) {
      res.json({ ok: true });
      return;
    }
    execute(
      db,
      'UPDATE seller_notifications SET read_at = ? WHERE seller_id = ? AND read_at IS NULL',
      new Date().toISOString(),
      seller.id,
    );
    res.json({ ok: true });
  });

  router.get('/documents/:id/file', (req, res) => {
    const doc = queryOne<{ id: string; seller_id: string; file_path: string; mime_type: string; original_name: string }>(
      db,
      'SELECT * FROM seller_documents WHERE id = ?',
      req.params.id,
    );
    if (!doc) throw notFound('Document not found.');
    const isOwner = Boolean(
      queryOne(db, 'SELECT 1 FROM seller_profiles WHERE id = ? AND user_id = ?', doc.seller_id, req.user!.id),
    );
    if (!isOwner && !req.user!.roles.includes('admin')) throw notFound('Document not found.');
    if (!isInsidePrivateDocs(doc.file_path) || !fs.existsSync(doc.file_path)) throw notFound('Document file not found.');
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(doc.file_path).pipe(res);
  });

  /* -------------------------- Approved seller -------------------------- */

  router.use(requireApprovedSeller);

  function sellerId(req: { user?: { sellerId: string | null; roles: string[] } }): string {
    if (req.user?.roles.includes('admin') && !req.user.sellerId) {
      throw badRequest('Administrators do not have a seller workspace. Use the admin catalogue.');
    }
    return req.user!.sellerId!;
  }

  router.get('/dashboard', (req, res) => {
    const id = sellerId(req);
    const requestedDays = Number(req.query.days);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const products = queryOne<{ active: number; pending: number; low_stock: number; drafts: number }>(
      db,
      `SELECT
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'approved') AS active,
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'pending') AS pending,
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'draft') AS drafts,
        (SELECT COUNT(*) FROM products p JOIN inventory i ON i.product_id = p.id
          WHERE p.seller_id = ? AND p.status = 'approved' AND i.quantity - i.reserved_quantity <= i.low_stock_threshold) AS low_stock`,
      id,
      id,
      id,
      id,
    );
    const orderCounts = queryAll<{ status: string; count: number }>(
      db,
      'SELECT status, COUNT(*) AS count FROM seller_orders WHERE seller_id = ? GROUP BY status',
      id,
    );
    const sales = queryOne<{
      gross: number;
      commission: number;
      earnings: number;
      orders: number;
    }>(
      db,
      `SELECT COALESCE(SUM(so.subtotal_paise - so.discount_paise),0) AS gross,
              COALESCE(SUM(so.commission_paise),0) AS commission,
              COALESCE(SUM(so.seller_earning_paise),0) AS earnings,
              COUNT(*) AS orders
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE so.seller_id = ? AND o.paid_at IS NOT NULL AND o.created_at >= ?
          AND so.status != 'cancelled'`,
      id,
      since,
    );
    const ledger = queryOne<{ pending: number; eligible: number; settled: number; refunds: number }>(
      db,
      `SELECT
        (SELECT COALESCE(SUM(amount_paise),0) FROM seller_ledger_entries WHERE seller_id = ? AND status = 'pending') AS pending,
        (SELECT COALESCE(SUM(amount_paise),0) FROM seller_ledger_entries WHERE seller_id = ? AND status = 'eligible'
           AND settlement_id IS NULL AND (available_at IS NULL OR available_at <= ?)) AS eligible,
        (SELECT COALESCE(SUM(amount_paise),0) FROM seller_ledger_entries WHERE seller_id = ? AND status = 'settled') AS settled,
        (SELECT COALESCE(SUM(amount_paise),0) FROM seller_ledger_entries WHERE seller_id = ? AND type = 'refund') AS refunds`,
      id,
      id,
      new Date().toISOString(),
      id,
      id,
    );
    const recentOrders = queryAll<{
      id: string;
      reference: string;
      order_number: string;
      status: string;
      total_paise: number;
      seller_earning_paise: number;
      dispatch_by: string | null;
    }>(
      db,
      `SELECT so.id, so.reference, o.order_number, so.status, so.total_paise, so.seller_earning_paise, so.dispatch_by
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE so.seller_id = ? ORDER BY so.created_at DESC LIMIT 5`,
      id,
    );
    const settlement = queryOne<{ pending_batches: number; paid_total: number }>(
      db,
      `SELECT
        (SELECT COUNT(*) FROM settlement_batches WHERE seller_id = ? AND status IN ('pending','processing')) AS pending_batches,
        (SELECT COALESCE(SUM(net_paise),0) FROM settlement_batches WHERE seller_id = ? AND status = 'paid') AS paid_total`,
      id,
      id,
    );
    const profile = queryOne<{
      business_name: string;
      slug: string;
      region: string | null;
      village: string | null;
      tagline: string | null;
      story: string | null;
      logo_url: string | null;
      cover_url: string | null;
      seller_category: string | null;
      store_status: string;
      payout_status: string;
      store_status_reason: string | null;
      commission_rate_bp: number | null;
    }>(
      db,
      `SELECT business_name, slug, region, village, tagline, story, logo_url, cover_url, seller_category,
              store_status, payout_status, store_status_reason, commission_rate_bp
         FROM seller_profiles WHERE id = ?`,
      id,
    );
    const application = latestApplication(db, id);

    // Compute continuous daily series for interactive area chart
    const dailySeries = queryAll<{ day: string; gross_paise: number; order_count: number }>(
      db,
      `SELECT substr(o.created_at, 1, 10) AS day,
              COALESCE(SUM(so.subtotal_paise - so.discount_paise), 0) AS gross_paise,
              COUNT(*) AS order_count
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE so.seller_id = ? AND o.paid_at IS NOT NULL AND o.created_at >= ?
          AND so.status != 'cancelled'
        GROUP BY substr(o.created_at, 1, 10)
        ORDER BY day ASC`,
      id,
      since,
    );
    const seriesMap = new Map(dailySeries.map((s) => [s.day, s]));
    const series: { date: string; label: string; grossPaise: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const dayKey = d.toISOString().slice(0, 10);
      const match = seriesMap.get(dayKey);
      series.push({
        date: dayKey,
        label: d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        grossPaise: match ? match.gross_paise : 0,
        orders: match ? match.order_count : 0,
      });
    }

    // Cost and profit calculations based on seller-provided product costs
    const costs = queryOne<{ total_cogs: number; total_packaging: number; items_with_cost: number }>(
      db,
      `SELECT COALESCE(SUM(oi.quantity * COALESCE(p.estimated_cost_paise, 0)), 0) AS total_cogs,
              COALESCE(SUM(oi.quantity * COALESCE(p.packaging_cost_paise, 0)), 0) AS total_packaging,
              COUNT(CASE WHEN p.estimated_cost_paise > 0 THEN 1 END) AS items_with_cost
         FROM order_items oi
         JOIN seller_orders so ON so.id = oi.seller_order_id
         JOIN orders o ON o.id = so.order_id
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE so.seller_id = ? AND o.paid_at IS NOT NULL AND o.created_at >= ?
          AND so.status != 'cancelled'`,
      id,
      since,
    );

    const grossPaise = sales?.gross ?? 0;
    const commissionPaise = sales?.commission ?? 0;
    const netRevenuePaise = sales?.earnings ?? 0;
    const cogsPaise = costs?.total_cogs ?? 0;
    const packagingPaise = costs?.total_packaging ?? 0;
    const estimatedProfitPaise = Math.max(0, netRevenuePaise - cogsPaise - packagingPaise);
    const profitMarginPercent = grossPaise > 0 ? Math.round((estimatedProfitPaise / grossPaise) * 1000) / 10 : 0;

    // Top selling products for this seller within the selected timeframe
    const topProducts = queryAll<{
      id: string;
      name: string;
      units_sold: number;
      revenue_paise: number;
      cost_paise: number;
      profit_paise: number;
    }>(
      db,
      `SELECT oi.product_id AS id, oi.name,
              COALESCE(SUM(oi.quantity), 0) AS units_sold,
              COALESCE(SUM(oi.line_subtotal_paise), 0) AS revenue_paise,
              COALESCE(SUM(oi.quantity * COALESCE(p.estimated_cost_paise, 0)), 0) AS cost_paise,
              COALESCE(SUM(oi.seller_earning_paise - (oi.quantity * (COALESCE(p.estimated_cost_paise, 0) + COALESCE(p.packaging_cost_paise, 0)))), 0) AS profit_paise
         FROM order_items oi
         JOIN seller_orders so ON so.id = oi.seller_order_id
         JOIN orders o ON o.id = so.order_id
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE so.seller_id = ? AND o.paid_at IS NOT NULL AND o.created_at >= ?
          AND so.status != 'cancelled'
        GROUP BY oi.product_id, oi.name
        ORDER BY revenue_paise DESC
        LIMIT 5`,
      id,
      since,
    );

    res.json({
      store: {
        status: profile?.store_status ?? 'active',
        payoutStatus: profile?.payout_status ?? 'not_started',
        sellerCategory: profile?.seller_category ?? null,
        statusReason: profile?.store_status_reason ?? null,
      },
      identity: {
        businessName: profile?.business_name ?? null,
        slug: profile?.slug ?? null,
        region: profile?.region ?? null,
        village: profile?.village ?? null,
        tagline: profile?.tagline ?? null,
        story: profile?.story ?? null,
        logoUrl: profile?.logo_url ?? null,
        coverUrl: profile?.cover_url ?? null,
        commissionRateBp: profile?.commission_rate_bp ?? null,
      },
      application: application
        ? {
            id: application.id,
            status: application.status,
            revision: application.revision,
            submittedAt: application.submitted_at,
            reviewedAt: application.reviewed_at,
            rejectionReason: application.rejection_reason,
          }
        : null,
      checklist: onboardingChecklist(db, id, application, req.user!.emailVerified),
      products: products ?? { active: 0, pending: 0, low_stock: 0, drafts: 0 },
      orders: {
        pending: orderCounts.find((row) => row.status === 'pending')?.count ?? 0,
        confirmed: orderCounts.find((row) => row.status === 'confirmed')?.count ?? 0,
        packed: orderCounts.find((row) => row.status === 'packed')?.count ?? 0,
        shipped: orderCounts.find((row) => row.status === 'shipped')?.count ?? 0,
        delivered: orderCounts.find((row) => row.status === 'delivered')?.count ?? 0,
        cancelled: orderCounts.find((row) => row.status === 'cancelled')?.count ?? 0,
      },
      period: { days, since },
      sales: sales ?? { gross: 0, commission: 0, earnings: 0, orders: 0 },
      finances: {
        grossPaise,
        commissionPaise,
        netRevenuePaise,
        cogsPaise,
        packagingPaise,
        estimatedProfitPaise,
        profitMarginPercent,
        hasCostData: (costs?.items_with_cost ?? 0) > 0,
      },
      series,
      topProducts: topProducts.map((p) => ({
        id: p.id,
        name: p.name,
        unitsSold: p.units_sold,
        revenuePaise: p.revenue_paise,
        costPaise: p.cost_paise,
        profitPaise: p.profit_paise,
      })),
      ledger: ledger ?? { pending: 0, eligible: 0, settled: 0, refunds: 0 },
      settlement: settlement ?? { pending_batches: 0, paid_total: 0 },
      recentOrders: recentOrders.map((row) => ({
        id: row.id,
        reference: row.reference,
        orderNumber: row.order_number,
        status: row.status,
        totalPaise: row.total_paise,
        earningPaise: row.seller_earning_paise,
        dispatchBy: row.dispatch_by,
      })),
      commissionNote: COMMISSION_BASIS_NOTE,
    });
  });

  router.get('/inventory', (req, res) => {
    const id = sellerId(req);
    const rows = queryAll<{
      product_id: string;
      name: string;
      sku: string;
      status: string;
      price_paise: number;
      quantity: number;
      reserved_quantity: number;
      low_stock_threshold: number;
      updated_at: string;
    }>(
      db,
      `SELECT p.id AS product_id, p.name, p.sku, p.status, p.price_paise,
              i.quantity, i.reserved_quantity, i.low_stock_threshold, i.updated_at
         FROM products p JOIN inventory i ON i.product_id = p.id
        WHERE p.seller_id = ? AND p.status != 'archived'
        ORDER BY p.name`,
      id,
    );
    res.json({
      inventory: rows.map((row) => ({
        productId: row.product_id,
        name: row.name,
        sku: row.sku,
        status: row.status,
        pricePaise: row.price_paise,
        quantity: row.quantity,
        reserved: row.reserved_quantity,
        available: row.quantity - row.reserved_quantity,
        lowStockThreshold: row.low_stock_threshold,
        updatedAt: row.updated_at,
      })),
    });
  });

  router.get('/products', (req, res) => {
    const id = sellerId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = queryAll<{
      id: string;
      name: string;
      slug: string;
      status: string;
      price_paise: number;
      sku: string;
      stock: number;
      reserved: number;
      category_name: string;
      image_url: string | null;
      rejection_reason: string | null;
      moderation_note: string | null;
      changes_requested_at: string | null;
      updated_at: string;
      is_demo: number;
    }>(
      db,
      `SELECT p.id, p.name, p.slug, p.status, p.price_paise, p.sku, p.rejection_reason, p.moderation_note,
              p.changes_requested_at, p.updated_at, p.is_demo,
              c.name AS category_name, i.quantity AS stock, i.reserved_quantity AS reserved,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url
         FROM products p JOIN categories c ON c.id = p.category_id
         JOIN inventory i ON i.product_id = p.id
        WHERE p.seller_id = ? ${status ? 'AND p.status = ?' : ''}
        ORDER BY p.updated_at DESC`,
      ...(status ? [id, status] : [id]),
    );
    res.json({
      products: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        workflowStatus:
          row.status === 'approved'
            ? 'published'
            : row.status === 'pending'
              ? row.changes_requested_at
                ? 'changes_requested'
                : 'submitted'
              : row.status,
        pricePaise: row.price_paise,
        sku: row.sku,
        stock: row.stock,
        reserved: row.reserved,
        categoryName: row.category_name,
        imageUrl: row.image_url,
        rejectionReason: row.rejection_reason,
        moderationNote: row.moderation_note,
        updatedAt: row.updated_at,
        isDemo: row.is_demo === 1,
      })),
    });
  });

  router.get('/products/:id', (req, res) => {
    const id = sellerId(req);
    const product = queryOne<Record<string, unknown> & { status: string }>(
      db,
      'SELECT * FROM products WHERE id = ? AND seller_id = ?',
      req.params.id,
      id,
    );
    if (!product) throw notFound('Product not found.');
    const images = queryAll<{ id: string; url: string; alt: string; credit: string | null; sort_order: number }>(
      db,
      'SELECT id, url, alt, credit, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
      String(product.id),
    );
    const inventory = queryOne<{ quantity: number; reserved_quantity: number; low_stock_threshold: number }>(
      db,
      'SELECT quantity, reserved_quantity, low_stock_threshold FROM inventory WHERE product_id = ?',
      String(product.id),
    );
    res.json({
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        categoryId: product.category_id,
        shortDescription: product.short_description,
        description: product.description,
        pricePaise: product.price_paise,
        compareAtPricePaise: product.compare_at_price_paise,
        sku: product.sku,
        unit: product.unit,
        weightG: product.weight_g,
        dimensions: product.dimensions,
        materials: product.materials,
        careInstructions: product.care_instructions,
        foodInfo: product.food_info,
        compliance: product.compliance_json ? parseJson<Record<string, unknown>>(String(product.compliance_json), {}) : {},
        originPlace: product.origin_place,
        originVerified: product.origin_verified === 1,
        region: product.region,
        varietyGrade: (product.variety_grade as string | null) ?? null,
        harvestInfo: (product.harvest_info as string | null) ?? null,
        dispatchConditions: (product.dispatch_conditions as string | null) ?? null,
        estimatedCostPaise: (product.estimated_cost_paise as number) ?? 0,
        packagingCostPaise: (product.packaging_cost_paise as number) ?? 0,
        attributes: product.attributes ? JSON.parse(String(product.attributes)) : null,
        status: product.status,
        workflowStatus:
          product.status === 'approved'
            ? 'published'
            : product.status === 'pending'
              ? product.changes_requested_at
                ? 'changes_requested'
                : 'submitted'
              : product.status,
        moderationNote: product.moderation_note,
        rejectionReason: product.rejection_reason,
        images: images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, credit: image.credit })),
        inventory: {
          quantity: inventory?.quantity ?? 0,
          reserved: inventory?.reserved_quantity ?? 0,
          lowStockThreshold: inventory?.low_stock_threshold ?? 3,
        },
        taxRateBp: product.tax_rate_bp,
        isDemo: product.is_demo === 1,
      },
      commissionNote: COMMISSION_BASIS_NOTE,
    });
  });

  router.post('/products', (req, res) => {
    const id = sellerId(req);
    const input = parse(productSchema, req.body);
    if (input.compareAtPricePaise && input.compareAtPricePaise < input.pricePaise) {
      throw badRequest('Compare-at price must be at least the selling price.', {
        compareAtPricePaise: 'Must be at least the selling price.',
      });
    }
    const category = queryOne<{ id: string }>(db, 'SELECT id FROM categories WHERE id = ? AND is_active = 1', input.categoryId);
    if (!category) throw badRequest('Choose a valid category.', { categoryId: 'Invalid category.' });
    
    // Auto-generate unique SKU if empty or whitespace
    let sku = (input.sku || '').trim().toUpperCase();
    if (!sku) {
      const slugClean = input.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRD';
      sku = `HR-${slugClean}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    if (queryOne(db, 'SELECT 1 FROM products WHERE seller_id = ? AND sku = ?', id, sku)) {
      sku = `${sku}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const shortDescription = input.shortDescription?.trim() || '';
    const description = input.description?.trim() || '';

    const productId = newId('prd_');
    const slug = uniqueSlug(input.name, (candidate) => Boolean(queryOne(db, 'SELECT 1 FROM products WHERE slug = ?', candidate)));
    tx(db, () => {
      execute(
        db,
        `INSERT INTO products
           (id, seller_id, category_id, name, slug, short_description, description, price_paise, compare_at_price_paise,
            sku, unit, weight_g, dimensions, materials, care_instructions, food_info, compliance_json,
            origin_place, region, variety_grade, harvest_info, dispatch_conditions, estimated_cost_paise, packaging_cost_paise,
            attributes, status, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0)`,
        productId,
        id,
        input.categoryId,
        input.name,
        slug,
        shortDescription,
        description,
        input.pricePaise,
        input.compareAtPricePaise ?? null,
        sku,
        input.unit,
        input.weightG ?? null,
        emptyToNull(input.dimensions),
        emptyToNull(input.materials),
        emptyToNull(input.careInstructions),
        emptyToNull(input.foodInfo),
        input.compliance ? JSON.stringify(input.compliance) : null,
        emptyToNull(input.originPlace),
        emptyToNull(input.region),
        emptyToNull(input.varietyGrade),
        emptyToNull(input.harvestInfo),
        emptyToNull(input.dispatchConditions),
        input.estimatedCostPaise ?? 0,
        input.packagingCostPaise ?? 0,
        input.attributes ? JSON.stringify(input.attributes) : null,
      );
      execute(db, 'INSERT INTO inventory (product_id, quantity) VALUES (?, 0)', productId);
      audit(db, req.user!, 'product.created', 'product', productId, null, { name: input.name, productSeller: id });
    });
    res.status(201).json({ id: productId, slug, sku, status: 'draft', message: 'Draft saved. Add images, stock, and submit for review.' });
  });

  router.patch('/products/:id', (req, res) => {
    const id = sellerId(req);
    const existing = queryOne<Record<string, unknown> & {
      id: string;
      status: string;
      name: string;
      price_paise: number;
      short_description: string;
      description: string;
      category_id: string;
      materials: string | null;
      origin_place: string | null;
      region: string | null;
      compare_at_price_paise: number | null;
      sku: string;
    }>(db, 'SELECT * FROM products WHERE id = ? AND seller_id = ?', req.params.id, id);
    if (!existing) throw notFound('Product not found.');
    if (existing.status === 'pending' && !(existing as { changes_requested_at?: string | null }).changes_requested_at) {
      throw conflict('This listing is in review and cannot be edited until a reviewer responds.');
    }
    const input = parse(productSchema, req.body);
    if (input.compareAtPricePaise && input.compareAtPricePaise < input.pricePaise) {
      throw badRequest('Compare-at price must be at least the selling price.', {
        compareAtPricePaise: 'Must be at least the selling price.',
      });
    }
    const category = queryOne<{ id: string }>(db, 'SELECT id FROM categories WHERE id = ? AND is_active = 1', input.categoryId);
    if (!category) throw badRequest('Choose a valid category.', { categoryId: 'Invalid category.' });
    const effectiveSku = (input.sku || '').trim() || existing.sku;
    if (
      effectiveSku !== existing.sku &&
      queryOne(db, 'SELECT 1 FROM products WHERE seller_id = ? AND sku = ? AND id != ?', id, effectiveSku, existing.id)
    ) {
      throw badRequest('That SKU is already used in your catalogue.', { sku: 'SKU must be unique.' });
    }
    const shortDesc: string = input.shortDescription?.trim() || existing.short_description;
    const desc: string = input.description?.trim() || existing.description;
    const materialChange =
      input.name !== existing.name ||
      input.pricePaise !== existing.price_paise ||
      desc !== existing.description ||
      input.categoryId !== existing.category_id ||
      (input.materials ?? null) !== existing.materials ||
      (input.originPlace ?? null) !== existing.origin_place ||
      (input.region ?? null) !== existing.region ||
      (input.compareAtPricePaise ?? null) !== existing.compare_at_price_paise;
    const nextStatus =
      existing.status === 'approved' && materialChange
        ? 'pending'
        : existing.status === 'rejected'
          ? 'draft'
          : existing.status;
    tx(db, () => {
      execute(
        db,
        `UPDATE products SET category_id = ?, name = ?, short_description = ?, description = ?, price_paise = ?,
                compare_at_price_paise = ?, sku = ?, unit = ?, weight_g = ?, dimensions = ?, materials = ?,
                care_instructions = ?, food_info = ?, compliance_json = ?, origin_place = ?, region = ?,
                variety_grade = ?, harvest_info = ?, dispatch_conditions = ?,
                estimated_cost_paise = COALESCE(?, estimated_cost_paise), packaging_cost_paise = COALESCE(?, packaging_cost_paise),
                attributes = ?, status = ?, rejection_reason = CASE WHEN ? = 'pending' THEN NULL ELSE rejection_reason END, updated_at = ?
          WHERE id = ? AND seller_id = ?`,
        input.categoryId,
        input.name,
        shortDesc,
        desc,
        input.pricePaise,
        input.compareAtPricePaise ?? null,
        effectiveSku,
        input.unit,
        input.weightG ?? null,
        emptyToNull(input.dimensions),
        emptyToNull(input.materials),
        emptyToNull(input.careInstructions),
        emptyToNull(input.foodInfo),
        input.compliance ? JSON.stringify(input.compliance) : null,
        emptyToNull(input.originPlace),
        emptyToNull(input.region),
        emptyToNull(input.varietyGrade),
        emptyToNull(input.harvestInfo),
        emptyToNull(input.dispatchConditions),
        input.estimatedCostPaise ?? 0,
        input.packagingCostPaise ?? 0,
        input.attributes ? JSON.stringify(input.attributes) : null,
        nextStatus,
        nextStatus,
        new Date().toISOString(),
        existing.id,
        id,
      );
      audit(db, req.user!, 'product.updated', 'product', existing.id, { status: existing.status }, {
        status: nextStatus,
        materialChange,
      });
    });
    res.json({
      ok: true,
      status: nextStatus,
      message:
        nextStatus === 'pending'
          ? 'Saved. Material changes to a live listing return it to moderation.'
          : 'Saved.',
    });
  });

  router.post('/products/:id/images', imageUpload().single('image'), (req, res) => {
    const id = sellerId(req);
    const product = queryOne<{ id: string; status: string; name: string }>(
      db,
      'SELECT id, status, name FROM products WHERE id = ? AND seller_id = ?',
      String(req.params.id),
      id,
    );
    if (!product) throw notFound('Product not found.');
    if (!req.file) throw badRequest('Choose an image.');
    if (!hasValidFileSignature(req.file.path, 'image')) {
      fs.unlinkSync(req.file.path);
      throw badRequest('That file does not look like a valid JPEG, PNG, or WebP image.');
    }
    const count = queryOne<{ count: number }>(
      db,
      'SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?',
      String(product.id),
    );
    if ((count?.count ?? 0) >= 6) throw conflict('A product can have at most 6 images.');
    const rawAlt = String(req.body.alt ?? '').trim();
    const alt = rawAlt.length >= 3 ? rawAlt : `${product.name || 'Authentic Himachali Creation'} photograph`;
    const url = `/uploads/${path.basename(req.file.filename)}`;
    const imageId = newId('img_');
    const becomesPending = product.status === 'approved';
    tx(db, () => {
      execute(
        db,
        'INSERT INTO product_images (id, product_id, url, alt, credit, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        imageId,
        product.id,
        url,
        alt.slice(0, 200),
        String(req.body.credit ?? '').trim().slice(0, 200) || null,
        (count?.count ?? 0),
      );
      if (becomesPending) {
        execute(db, "UPDATE products SET status = 'pending', updated_at = ? WHERE id = ?", new Date().toISOString(), product.id);
      }
      audit(db, req.user!, 'product.image_added', 'product', product.id, null, { imageId, becomesPending });
    });
    res.status(201).json({
      id: imageId,
      url,
      status: becomesPending ? 'pending' : product.status,
      message: becomesPending ? 'Image added. The listing has returned to moderation.' : 'Image added.',
    });
  });

  router.delete('/products/:id/images/:imageId', (req, res) => {
    const id = sellerId(req);
    const image = queryOne<{ id: string; url: string; product_id: string }>(
      db,
      `SELECT pi.id, pi.url, pi.product_id FROM product_images pi
        JOIN products p ON p.id = pi.product_id
       WHERE pi.id = ? AND pi.product_id = ? AND p.seller_id = ?`,
      req.params.imageId,
      req.params.id,
      id,
    );
    if (!image) throw notFound('Image not found.');
    const count = queryOne<{ count: number }>(
      db,
      'SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?',
      image.product_id,
    );
    execute(db, 'DELETE FROM product_images WHERE id = ?', image.id);
    if ((count?.count ?? 0) <= 1) {
      execute(db, "UPDATE products SET status = 'draft', updated_at = ? WHERE id = ?", new Date().toISOString(), image.product_id);
    }
    const filename = path.basename(image.url);
    const filePath = path.join(env.uploadDir, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  });

  router.post('/products/:id/submit', async (req, res) => {
    const id = sellerId(req);
    const product = queryOne<{
      id: string;
      name: string;
      status: string;
      description: string;
      price_paise: number;
      weight_g: number | null;
      sku: string;
      category_id: string;
      category_slug: string;
      category_name: string;
      materials: string | null;
      dimensions: string | null;
      care_instructions: string | null;
      changes_requested_at: string | null;
      compliance_json: string | null;
    }>(
      db,
      `SELECT p.id, p.name, p.status, p.description, p.price_paise, p.weight_g, p.sku, p.category_id,
              p.materials, p.dimensions, p.care_instructions, p.changes_requested_at, p.compliance_json,
              c.slug AS category_slug, c.name AS category_name
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ? AND p.seller_id = ?`,
      req.params.id,
      id,
    );
    if (!product) throw notFound('Product not found.');
    const isChangeResubmission = product.status === 'pending' && Boolean(product.changes_requested_at);
    if (!['draft', 'rejected', 'paused'].includes(product.status) && !isChangeResubmission) {
      throw conflict('This product is already in review or live.');
    }
    if (product.description.length < 80) throw badRequest('Add a fuller description before submitting.');
    if (product.price_paise <= 0) throw badRequest('Set a selling price before submitting.');
    if (!product.weight_g) throw badRequest('Add the packed weight so shipping can be calculated.');
    const images = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?', product.id);
    if ((images?.count ?? 0) === 0) throw badRequest('Add at least one photograph before submitting.');

    const application = latestApplication(db, id);
    const applicationData = parseJson<Record<string, unknown>>(application?.data_json ?? null, {});
    const compliance = validateProductCompliance({
      categorySlug: product.category_slug,
      categoryName: product.category_name,
      product,
      sellerFssaiNumber: typeof applicationData.fssaiNumber === 'string' ? applicationData.fssaiNumber : null,
    });
    if (Object.keys(compliance.errors).length) {
      throw badRequest(firstComplianceError(compliance.errors), compliance.errors);
    }
    const now = new Date().toISOString();
    execute(
      db,
      `UPDATE products SET status = 'pending', submitted_at = ?, rejection_reason = NULL,
              moderation_note = NULL, changes_requested_at = NULL, updated_at = ? WHERE id = ?`,
      now,
      now,
      product.id,
    );
    audit(db, req.user!, 'product.submitted', 'product', product.id, { status: product.status }, {
      status: 'pending',
      resubmission: isChangeResubmission,
    });
    await notify(db, {
      email: env.email.supportEmail,
      type: 'product_submitted',
      subject: `Product awaiting moderation: ${product.name}`,
      body: `<p>A seller submitted a listing for review.</p><p><strong>Product:</strong> ${escapeHtml(product.name)}</p>`,
      dedupeKey: `product-submitted:${product.id}:${Date.now()}`,
    });
    res.json({ ok: true, status: 'pending' });
  });

  router.post('/products/:id/pause', (req, res) => {
    const id = sellerId(req);
    const product = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM products WHERE id = ? AND seller_id = ?', req.params.id, id);
    if (!product) throw notFound('Product not found.');
    if (product.status !== 'approved') throw conflict('Only a live listing can be paused.');
    execute(db, "UPDATE products SET status = 'paused', updated_at = ? WHERE id = ?", new Date().toISOString(), product.id);
    audit(db, req.user!, 'product.paused', 'product', product.id, { status: 'approved' }, { status: 'paused' });
    res.json({ ok: true, status: 'paused' });
  });

  router.post('/products/:id/resume', (req, res) => {
    const id = sellerId(req);
    const product = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM products WHERE id = ? AND seller_id = ?', req.params.id, id);
    if (!product) throw notFound('Product not found.');
    if (product.status !== 'paused') throw conflict('Only a paused listing can be resumed.');
    execute(db, "UPDATE products SET status = 'pending', updated_at = ? WHERE id = ?", new Date().toISOString(), product.id);
    res.json({ ok: true, status: 'pending', message: 'Listing returned to moderation before going live again.' });
  });

  router.post('/products/:id/archive', (req, res) => {
    const id = sellerId(req);
    const product = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM products WHERE id = ? AND seller_id = ?', req.params.id, id);
    if (!product) throw notFound('Product not found.');
    if (product.status === 'pending') throw conflict('Wait for moderation or ask an administrator to reject the listing first.');
    execute(db, "UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?", new Date().toISOString(), product.id);
    res.json({ ok: true, status: 'archived' });
  });

  router.post('/inventory/:productId', (req, res) => {
    const id = sellerId(req);
    const input = parse(
      z.object({
        quantity: z.number().int().min(0).max(100_000),
        note: z.string().trim().max(200).optional(),
        lowStockThreshold: z.number().int().min(0).max(1000).optional(),
      }),
      req.body,
    );
    const product = queryOne<{ id: string; name: string }>(db, 'SELECT id, name FROM products WHERE id = ? AND seller_id = ?', req.params.productId, id);
    if (!product) throw notFound('Product not found.');
    const inventory = queryOne<{ quantity: number; reserved_quantity: number }>(
      db,
      'SELECT quantity, reserved_quantity FROM inventory WHERE product_id = ?',
      product.id,
    );
    if (!inventory) throw notFound('Inventory record not found.');
    if (input.quantity < inventory.reserved_quantity) {
      throw conflict(
        `You cannot reduce stock below ${inventory.reserved_quantity} reserved by paid or in-progress orders.`,
      );
    }
    const delta = input.quantity - inventory.quantity;
    tx(db, () => {
      execute(
        db,
        'UPDATE inventory SET quantity = ?, low_stock_threshold = COALESCE(?, low_stock_threshold), updated_at = ? WHERE product_id = ?',
        input.quantity,
        input.lowStockThreshold ?? null,
        new Date().toISOString(),
        product.id,
      );
      if (delta !== 0) {
        execute(
          db,
          `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note, created_by)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
          newId('mov_'),
          product.id,
          delta,
          delta > 0 ? 'restock' : 'adjustment',
          input.note ?? 'Seller stock update',
          req.user!.id,
        );
      }
      audit(db, req.user!, 'inventory.updated', 'product', product.id, { quantity: inventory.quantity }, { quantity: input.quantity, delta });
    });
    res.json({ ok: true, quantity: input.quantity });
  });

  router.get('/orders', (req, res) => {
    const id = sellerId(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = queryAll<{
      id: string;
      reference: string;
      order_number: string;
      status: string;
      total_paise: number;
      seller_earning_paise: number;
      commission_paise: number;
      created_at: string;
      dispatch_by: string | null;
      shipping_address: string;
      customer_name: string;
      item_count: number;
    }>(
      db,
      `SELECT so.id, so.reference, o.order_number, so.status, so.total_paise, so.seller_earning_paise,
              so.commission_paise, so.created_at, so.dispatch_by, o.shipping_address,
              json_extract(o.shipping_address, '$.fullName') AS customer_name,
              (SELECT SUM(quantity) FROM order_items WHERE seller_order_id = so.id) AS item_count
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE so.seller_id = ? AND o.paid_at IS NOT NULL ${status ? 'AND so.status = ?' : ''}
        ORDER BY CASE so.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 WHEN 'packed' THEN 2 ELSE 3 END,
                 so.created_at DESC
        LIMIT 100`,
      ...(status ? [id, status] : [id]),
    );
    res.json({
      orders: rows.map((row) => {
        const address = JSON.parse(row.shipping_address) as { fullName: string; city: string; pincode: string; state: string };
        return {
          id: row.id,
          reference: row.reference,
          orderNumber: row.order_number,
          status: row.status,
          totalPaise: row.total_paise,
          earningPaise: row.seller_earning_paise,
          commissionPaise: row.commission_paise,
          createdAt: row.created_at,
          dispatchBy: row.dispatch_by,
          itemCount: row.item_count ?? 0,
          customerName: address.fullName,
          destination: `${address.city}, ${address.state} ${address.pincode}`,
        };
      }),
    });
  });

  router.get('/orders/:id', (req, res) => {
    const id = sellerId(req);
    const row = queryOne<{
      id: string;
      order_id: string;
      seller_id: string;
      reference: string;
      status: string;
      subtotal_paise: number;
      discount_paise: number;
      shipping_paise: number;
      tax_paise: number;
      total_paise: number;
      commission_paise: number;
      seller_earning_paise: number;
      commission_rate_bp: number;
      dispatch_by: string | null;
      shipped_at: string | null;
      delivered_at: string | null;
      created_at: string;
      order_number: string;
      shipping_address: string;
      customer_note: string | null;
      reservation_expires_at: string | null;
    }>(
      db,
      `SELECT so.*, o.order_number, o.shipping_address, o.customer_note, o.reservation_expires_at
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE so.id = ? AND so.seller_id = ?`,
      req.params.id,
      id,
    );
    if (!row) throw notFound('Seller order not found.');
    const sellerProfile = queryOne<{
      business_name: string;
      logo_url: string | null;
      region: string | null;
      village: string | null;
    }>(db, 'SELECT business_name, logo_url, region, village FROM seller_profiles WHERE id = ?', id);
    const items = queryAll<{
      id: string;
      name: string;
      sku: string;
      quantity: number;
      unit_price_paise: number;
      line_subtotal_paise: number;
      status: string;
      image_url: string | null;
    }>(
      db,
      'SELECT id, name, sku, quantity, unit_price_paise, line_subtotal_paise, status, image_url FROM order_items WHERE seller_order_id = ?',
      row.id,
    );
    const shipment = queryOne<{
      id: string;
      carrier: string;
      tracking_number: string;
      tracking_url: string | null;
      status: string;
      shipped_at: string;
      delivered_at: string | null;
    }>(db, 'SELECT * FROM shipments WHERE seller_order_id = ?', row.id);
    const events = shipment
      ? queryAll<{ status: string; description: string | null; occurred_at: string }>(
          db,
          'SELECT status, description, occurred_at FROM shipment_events WHERE shipment_id = ? ORDER BY occurred_at',
          shipment.id,
        )
      : [];
    const address = JSON.parse(row.shipping_address) as {
      fullName: string;
      phone: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
    };
    res.json({
      order: {
        id: row.id,
        reference: row.reference,
        orderNumber: row.order_number,
        status: row.status,
        createdAt: row.created_at,
        dispatchBy: row.dispatch_by,
        shippedAt: row.shipped_at,
        deliveredAt: row.delivered_at,
        subtotalPaise: row.subtotal_paise,
        discountPaise: row.discount_paise,
        shippingPaise: row.shipping_paise,
        taxPaise: row.tax_paise,
        totalPaise: row.total_paise,
        commissionPaise: row.commission_paise,
        commissionRateBp: row.commission_rate_bp,
        earningPaise: row.seller_earning_paise,
        customerNote: row.customer_note,
        seller: {
          businessName: sellerProfile?.business_name ?? null,
          logoUrl: sellerProfile?.logo_url ?? null,
          region: sellerProfile?.region ?? null,
          village: sellerProfile?.village ?? null,
        },
        address,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPricePaise: item.unit_price_paise,
          lineSubtotalPaise: item.line_subtotal_paise,
          status: item.status,
          imageUrl: item.image_url,
        })),
        shipment: shipment
          ? {
              carrier: shipment.carrier,
              trackingNumber: shipment.tracking_number,
              trackingUrl: shipment.tracking_url,
              status: shipment.status,
              shippedAt: shipment.shipped_at,
              deliveredAt: shipment.delivered_at,
              events: events.map((event) => ({
                status: event.status,
                description: event.description,
                occurredAt: event.occurred_at,
              })),
            }
          : null,
        commissionNote: COMMISSION_BASIS_NOTE,
      },
    });
  });

  router.post('/orders/:id/action', (req, res) => {
    const id = sellerId(req);
    const input = parse(
      z.object({
        action: z.enum(['confirm', 'accept', 'pack', 'ship', 'deliver', 'cancel', 'reject']),
        carrier: z.string().trim().max(80).optional(),
        trackingNumber: z.string().trim().max(120).optional(),
        trackingUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
        note: z.string().trim().max(500).optional(),
        reason: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const canonicalAction =
      input.action === 'accept' ? 'confirm' : input.action === 'reject' ? 'cancel' : input.action;

    sellerOrderAction(db, {
      sellerOrderId: req.params.id,
      ownerSellerId: id,
      actor: req.user!,
      action: canonicalAction as SellerAction,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl || undefined,
      note: input.reason || input.note,
    });

    const so = queryOne<{ reference: string; order_id: string }>(
      db,
      'SELECT reference, order_id FROM seller_orders WHERE id = ?',
      req.params.id,
    );
    const order = so
      ? queryOne<{ email: string; user_id: string; order_number: string }>(
          db,
          'SELECT email, user_id, order_number FROM orders WHERE id = ?',
          so.order_id,
        )
      : null;

    if (canonicalAction === 'confirm' && order) {
      void notify(db, {
        userId: order.user_id,
        email: order.email,
        type: 'order_accepted',
        subject: `Your order ${order.order_number} has been confirmed by the maker`,
        body: `<p>Great news! The artisan has confirmed your order (${so?.reference}) and is preparing it for dispatch from Himachal Pradesh.</p>`,
        dedupeKey: `order-accepted:${so?.reference}`,
      });
    }

    if (canonicalAction === 'ship' && order) {
      void notify(db, {
        userId: order.user_id,
        email: order.email,
        type: 'order_dispatched',
        subject: `Your order ${order.order_number} has been dispatched`,
        body: `<p>A shipment from your order is on its way from Himachal Pradesh.</p><p><strong>Courier:</strong> ${escapeHtml(input.carrier ?? '')}<br/><strong>Tracking:</strong> ${escapeHtml(input.trackingNumber ?? '')}</p>`,
        dedupeKey: `dispatch:${so?.reference}:${input.trackingNumber}`,
      });
    }

    if (canonicalAction === 'cancel' && order) {
      void notify(db, {
        userId: order.user_id,
        email: order.email,
        type: 'order_cancelled',
        subject: `Update regarding order ${order.order_number}`,
        body: `<p>Your seller order (${so?.reference}) could not be fulfilled and was cancelled by the maker.</p>${input.reason || input.note ? `<p><strong>Reason:</strong> ${escapeHtml(input.reason || input.note || '')}</p>` : ''}<p>A refund request has been recorded for review. No money has moved yet.</p>`,
        dedupeKey: `order-cancelled:${so?.reference}:${Date.now()}`,
      });
    }

    res.json({ ok: true, message: `Order ${canonicalAction}ed successfully.` });
  });

  router.post('/orders/:id/tracking', (req, res) => {
    const id = sellerId(req);
    const input = parse(
      z.object({
        status: z.enum(['in_transit', 'out_for_delivery', 'failed', 'rto']),
        description: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const shipment = queryOne<{ id: string; seller_order_id: string; status: string }>(
      db,
      `SELECT sh.id, sh.seller_order_id, sh.status FROM shipments sh
        JOIN seller_orders so ON so.id = sh.seller_order_id
       WHERE sh.seller_order_id = ? AND so.seller_id = ?`,
      req.params.id,
      id,
    );
    if (!shipment) throw notFound('Shipment not found.');
    if (shipment.status === 'delivered') throw conflict('This shipment is already delivered.');
    const occurredAt = new Date().toISOString();
    tx(db, () => {
      execute(db, 'UPDATE shipments SET status = ? WHERE id = ?', input.status, shipment.id);
      execute(
        db,
        `INSERT INTO shipment_events (id, shipment_id, event_id, status, description, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        newId('she_'),
        shipment.id,
        `manual:${shipment.id}:${input.status}:${occurredAt}`,
        input.status,
        input.description ?? null,
        occurredAt,
      );
      audit(db, req.user!, 'shipment.status_updated', 'shipment', shipment.id, { status: shipment.status }, {
        status: input.status,
        description: input.description ?? null,
      });
    });
    res.json({ ok: true, status: input.status });
  });

  router.get('/requests', (req, res) => {
    const id = sellerId(req);
    const returns = queryAll<{
      id: string;
      seller_order_id: string;
      reason: string;
      description: string | null;
      status: string;
      created_at: string;
      order_number: string;
      item_name: string;
    }>(
      db,
      `SELECT r.id, r.seller_order_id, r.reason, r.description, r.status, r.created_at, o.order_number,
              (SELECT name FROM order_items WHERE seller_order_id = r.seller_order_id LIMIT 1) AS item_name
         FROM return_requests r
         JOIN orders o ON o.id = r.order_id
         JOIN seller_orders so ON so.id = r.seller_order_id
        WHERE so.seller_id = ? ORDER BY r.created_at DESC`,
      id,
    );
    const cancellations = queryAll<{
      id: string;
      seller_order_id: string;
      reason: string;
      status: string;
      created_at: string;
      order_number: string;
    }>(
      db,
      `SELECT c.id, c.seller_order_id, c.reason, c.status, c.created_at, o.order_number
         FROM cancellation_requests c
         JOIN orders o ON o.id = c.order_id
         JOIN seller_orders so ON so.id = c.seller_order_id
        WHERE so.seller_id = ? ORDER BY c.created_at DESC`,
      id,
    );
    res.json({ returns, cancellations });
  });

  router.get('/earnings', (req, res) => {
    const id = sellerId(req);
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = 25;
    const totalEntries = queryOne<{ count: number }>(
      db,
      'SELECT COUNT(*) AS count FROM seller_ledger_entries WHERE seller_id = ?',
      id,
    )?.count ?? 0;
    const entries = queryAll<{
      id: string;
      type: string;
      amount_paise: number;
      status: string;
      reference: string;
      note: string | null;
      available_at: string | null;
      created_at: string;
      order_number: string | null;
    }>(
      db,
      `SELECT l.id, l.type, l.amount_paise, l.status, l.reference, l.note, l.available_at, l.created_at,
              o.order_number
         FROM seller_ledger_entries l LEFT JOIN orders o ON o.id = l.order_id
        WHERE l.seller_id = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      id,
      pageSize,
      (page - 1) * pageSize,
    );
    const totals = queryOne<{ pending: number; eligible: number; settled: number; reversed: number }>(
      db,
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_paise ELSE 0 END),0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'eligible' THEN amount_paise ELSE 0 END),0) AS eligible,
        COALESCE(SUM(CASE WHEN status = 'settled' THEN amount_paise ELSE 0 END),0) AS settled,
        COALESCE(SUM(CASE WHEN status = 'reversed' THEN amount_paise ELSE 0 END),0) AS reversed
       FROM seller_ledger_entries WHERE seller_id = ?`,
      id,
    );
    const commissions = queryAll<{
      seller_order_id: string;
      basis_paise: number;
      rate_bp: number;
      amount_paise: number;
      created_at: string;
    }>(
      db,
      'SELECT seller_order_id, basis_paise, rate_bp, amount_paise, created_at FROM commission_entries WHERE seller_id = ? ORDER BY created_at DESC LIMIT 25',
      id,
    );
    const settlements = queryAll<{
      id: string;
      reference: string;
      period_start: string;
      period_end: string;
      net_paise: number;
      status: string;
      paid_at: string | null;
      provider_reference: string | null;
    }>(
      db,
      'SELECT id, reference, period_start, period_end, net_paise, status, paid_at, provider_reference FROM settlement_batches WHERE seller_id = ? ORDER BY created_at DESC',
      id,
    );
    res.json({
      entries: entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amountPaise: entry.amount_paise,
        status: entry.status,
        reference: entry.reference,
        note: entry.note,
        availableAt: entry.available_at,
        createdAt: entry.created_at,
        orderNumber: entry.order_number,
      })),
      totals: totals ?? { pending: 0, eligible: 0, settled: 0, reversed: 0 },
      commissions: commissions.map((row) => ({
        sellerOrderId: row.seller_order_id,
        basisPaise: row.basis_paise,
        rateBp: row.rate_bp,
        amountPaise: row.amount_paise,
        createdAt: row.created_at,
      })),
      settlements: settlements.map((row) => ({
        id: row.id,
        reference: row.reference,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        netPaise: row.net_paise,
        status: row.status,
        paidAt: row.paid_at,
        providerReference: row.provider_reference,
      })),
      pagination: { page, pageSize, total: totalEntries, totalPages: Math.ceil(totalEntries / pageSize) },
      commissionNote: COMMISSION_BASIS_NOTE,
    });
  });

  router.get('/profile', (req, res) => {
    const id = sellerId(req);
    const seller = queryOne<SellerRow>(db, 'SELECT * FROM seller_profiles WHERE id = ?', id);
    if (!seller) throw notFound('Seller profile not found.');
    res.json({
      profile: {
        id: seller.id,
        businessName: seller.business_name,
        slug: seller.slug,
        tagline: seller.tagline,
        story: seller.story,
        logoUrl: seller.logo_url,
        coverUrl: seller.cover_url,
        region: seller.region,
        village: seller.village,
        sellerCategory: seller.seller_category,
        operatingAddress: seller.operating_address
          ? parseJson<Record<string, unknown>>(seller.operating_address, {})
          : null,
        storeStatus: seller.store_status,
        status: seller.status,
      },
    });
  });

  router.post('/profile/image/:kind', imageUpload().single('image'), (req, res) => {
    const id = sellerId(req);
    const kind = String(req.params.kind);
    if (kind !== 'logo' && kind !== 'cover') throw badRequest('Choose logo or cover.');
    if (!req.file) throw badRequest('Choose an image.');
    if (!hasValidFileSignature(req.file.path, 'image')) {
      fs.unlinkSync(req.file.path);
      throw badRequest('That file does not look like a valid JPEG, PNG, or WebP image.');
    }
    const column = kind === 'logo' ? 'logo_url' : 'cover_url';
    const previous = queryOne<{ logo_url: string | null; cover_url: string | null }>(
      db,
      'SELECT logo_url, cover_url FROM seller_profiles WHERE id = ?',
      id,
    );
    if (!previous) {
      fs.unlinkSync(req.file.path);
      throw notFound('Seller profile not found.');
    }
    const url = `/uploads/${path.basename(req.file.filename)}`;
    execute(
      db,
      `UPDATE seller_profiles SET ${column} = ?, updated_at = ? WHERE id = ?`,
      url,
      new Date().toISOString(),
      id,
    );
    const oldUrl = kind === 'logo' ? previous.logo_url : previous.cover_url;
    if (oldUrl?.startsWith('/uploads/')) {
      const oldPath = path.join(env.uploadDir, path.basename(oldUrl));
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // The old file may already have been removed.
      }
    }
    audit(db, req.user!, `seller.profile_${kind}_updated`, 'seller', id, oldUrl ? { url: oldUrl } : null, { url });
    res.status(201).json({ ok: true, url });
  });

  router.delete('/profile/image/:kind', (req, res) => {
    const id = sellerId(req);
    const kind = String(req.params.kind);
    if (kind !== 'logo' && kind !== 'cover') throw badRequest('Choose logo or cover.');
    const column = kind === 'logo' ? 'logo_url' : 'cover_url';
    const previous = queryOne<{ logo_url: string | null; cover_url: string | null }>(
      db,
      'SELECT logo_url, cover_url FROM seller_profiles WHERE id = ?',
      id,
    );
    if (!previous) throw notFound('Seller profile not found.');
    const oldUrl = kind === 'logo' ? previous.logo_url : previous.cover_url;
    execute(db, `UPDATE seller_profiles SET ${column} = NULL, updated_at = ? WHERE id = ?`, new Date().toISOString(), id);
    if (oldUrl?.startsWith('/uploads/')) {
      try {
        fs.unlinkSync(path.join(env.uploadDir, path.basename(oldUrl)));
      } catch {
        // The old file may already have been removed.
      }
    }
    audit(db, req.user!, `seller.profile_${kind}_removed`, 'seller', id, { url: oldUrl }, null);
    res.json({ ok: true });
  });

  router.patch('/profile', (req, res) => {
    const id = sellerId(req);
    const input = parse(
      z.object({
        businessName: z.string().trim().min(2).max(120),
        tagline: z.string().trim().max(160).optional(),
        story: z.string().trim().max(3000).optional(),
        region: z.string().trim().max(80).optional(),
        village: z.string().trim().max(120).optional(),
        operatingAddress: z
          .object({
            line1: z.string().trim().min(4).max(200),
            line2: z.string().trim().max(200).optional(),
            city: z.string().trim().min(2).max(80),
            state: z.string().trim().min(2).max(80),
            pincode: z.string().trim().regex(/^\d{6}$/),
          })
          .optional(),
      }),
      req.body,
    );
    const existing = queryOne<{ business_name: string; operating_address: string | null }>(
      db,
      'SELECT business_name, operating_address FROM seller_profiles WHERE id = ?',
      id,
    );
    if (!existing) throw notFound('Seller profile not found.');
    execute(
      db,
      `UPDATE seller_profiles SET business_name = ?, tagline = ?, story = ?, region = ?, village = ?,
              operating_address = COALESCE(?, operating_address), updated_at = ? WHERE id = ?`,
      input.businessName,
      emptyToNull(input.tagline),
      emptyToNull(input.story),
      emptyToNull(input.region),
      emptyToNull(input.village),
      input.operatingAddress ? JSON.stringify(input.operatingAddress) : null,
      new Date().toISOString(),
      id,
    );
    audit(db, req.user!, 'seller.profile_updated', 'seller', id, { businessName: existing.business_name }, {
      businessName: input.businessName,
    });
    res.json({ ok: true });
  });

  return router;
}
