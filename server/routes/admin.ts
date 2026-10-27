import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryAll, queryOne, tx, type Db } from '../db.js';
import { requireAdmin } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound, parse } from '../lib/http.js';
import { newId, uniqueSlug } from '../lib/ids.js';
import { escapeHtml, notify, notificationQueueSummary } from '../lib/email.js';
import { getOrderView, decideRefund, createRefundForReturn, generateSettlement, markSettlementPaid, markManualRefundCompleted, sellerOrderAction, refreshOrderStatus } from '../lib/orders.js';
import { isInsidePrivateDocs, imageUpload, hasValidFileSignature } from '../lib/uploads.js';
import { getSiteContent, setSiteContent } from '../lib/site.js';
import {
  assertProductNotInAnotherCampaign,
  campaignStats,
  discountPercentFor,
  effectiveCampaignStatus,
  getCampaignById,
  mapCampaign,
  validateCampaignWindow,
  validatePromoPrice,
  type CampaignRow,
} from '../lib/campaigns.js';
import { POLICY_KEYS } from '../../shared/content.js';
import { assertProductionConfig } from '../env.js';
import { paymentProviderStatus } from '../lib/payments.js';
import { firstComplianceError, validateProductCompliance, complianceGroupFor } from '../lib/productCompliance.js';
import {
  applySellerDecision,
  checkDocumentRequirements,
  DOCUMENT_LABELS,
  latestApplication,
  onboardingChecklist,
  parseJson,
  sellerNotification,
  type DocumentType,
} from '../lib/sellerOnboarding.js';

function pageParams(query: Record<string, unknown>): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(query.pageSize ?? '25'), 10) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function sellerUser(db: Db, sellerId: string): { email: string; user_id: string; business_name: string } | undefined {
  return queryOne<{ email: string; user_id: string; business_name: string }>(
    db,
    `SELECT u.email, u.id AS user_id, sp.business_name
       FROM seller_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`,
    sellerId,
  );
}

export function adminRouter(db: Db): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get('/overview', (_req, res) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const metrics = queryOne<{
      gmv: number;
      orders: number;
      commission: number;
      refunds: number;
      pending_sellers: number;
      pending_products: number;
      open_refunds: number;
      open_returns: number;
      open_support: number;
      unfulfilled: number;
      active_products: number;
      active_sellers: number;
      customers: number;
      real_orders: number;
      demo_orders: number;
      total_orders: number;
      published_products: number;
      draft_products: number;
      rejected_products: number;
      paused_products: number;
      archived_products: number;
      low_stock_products: number;
      out_of_stock_products: number;
    }>(
      db,
      `SELECT
        (SELECT COALESCE(SUM(total_paise),0) FROM orders WHERE paid_at IS NOT NULL AND is_demo = 0 AND created_at >= ?) AS gmv,
        (SELECT COUNT(*) FROM orders WHERE paid_at IS NOT NULL AND is_demo = 0 AND created_at >= ?) AS orders,
        (SELECT COALESCE(SUM(so.commission_paise),0) FROM seller_orders so JOIN orders o ON o.id = so.order_id
          WHERE o.paid_at IS NOT NULL AND o.is_demo = 0 AND o.created_at >= ? AND so.status != 'cancelled') AS commission,
        (SELECT COALESCE(SUM(amount_paise),0) FROM refunds WHERE status = 'completed') AS refunds,
        (SELECT COUNT(*) FROM seller_profiles WHERE status IN ('submitted','under_review','more_info_required')) AS pending_sellers,
        (SELECT COUNT(*) FROM products WHERE status = 'pending') AS pending_products,
        (SELECT COUNT(*) FROM refunds WHERE status IN ('requested','approved','processing')) AS open_refunds,
        (SELECT COUNT(*) FROM return_requests WHERE status = 'requested') AS open_returns,
        (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') AS open_support,
        (SELECT COUNT(*) FROM seller_orders WHERE status IN ('pending','confirmed','packed')) AS unfulfilled,
        (SELECT COUNT(*) FROM products WHERE status = 'approved') AS active_products,
        (SELECT COUNT(*) FROM seller_profiles WHERE status = 'approved') AS active_sellers,
        (SELECT COUNT(*) FROM user_roles WHERE role = 'customer') AS customers,
        (SELECT COUNT(*) FROM orders WHERE is_demo = 0) AS real_orders,
        (SELECT COUNT(*) FROM orders WHERE is_demo = 1) AS demo_orders,
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM products WHERE status = 'approved') AS published_products,
        (SELECT COUNT(*) FROM products WHERE status = 'draft') AS draft_products,
        (SELECT COUNT(*) FROM products WHERE status = 'rejected') AS rejected_products,
        (SELECT COUNT(*) FROM products WHERE status = 'paused') AS paused_products,
        (SELECT COUNT(*) FROM products WHERE status = 'archived') AS archived_products,
        (SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id
          WHERE p.status = 'approved' AND i.quantity - i.reserved_quantity > 0
            AND i.quantity - i.reserved_quantity <= i.low_stock_threshold) AS low_stock_products,
        (SELECT COUNT(*) FROM inventory i JOIN products p ON p.id = i.product_id
          WHERE p.status = 'approved' AND i.quantity - i.reserved_quantity <= 0) AS out_of_stock_products`,
      since,
      since,
      since,
    );
    const recentOrders = queryAll<{
      order_number: string;
      status: string;
      total_paise: number;
      placed_at: string;
      email: string;
      seller_count: number;
      is_demo: number;
    }>(
      db,
      `SELECT order_number, status, total_paise, placed_at, email, is_demo,
              (SELECT COUNT(*) FROM seller_orders so WHERE so.order_id = orders.id) AS seller_count
         FROM orders ORDER BY placed_at DESC LIMIT 8`,
    );
    const pendingSellers = queryAll<{ id: string; business_name: string; region: string | null; created_at: string; status: string }>(
      db,
      "SELECT id, business_name, region, created_at, status FROM seller_profiles WHERE status IN ('submitted','under_review','more_info_required') ORDER BY created_at LIMIT 5",
    );
    const audits = queryAll<{ action: string; entity_type: string; entity_id: string; actor_email: string | null; created_at: string }>(
      db,
      'SELECT action, entity_type, entity_id, actor_email, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 8',
    );
    const lowStock = queryAll<{ name: string; seller_name: string; available: number }>(
      db,
      `SELECT p.name, s.business_name AS seller_name, i.quantity - i.reserved_quantity AS available
         FROM products p JOIN inventory i ON i.product_id = p.id
         JOIN seller_profiles s ON s.id = p.seller_id
        WHERE p.status = 'approved' AND i.quantity - i.reserved_quantity <= i.low_stock_threshold
        ORDER BY available LIMIT 6`,
    );
    const payments = paymentProviderStatus();
    res.json({
      metrics: metrics ?? {},
      recentOrders: recentOrders.map((row) => ({
        orderNumber: row.order_number,
        status: row.status,
        totalPaise: row.total_paise,
        placedAt: row.placed_at,
        email: row.email,
        sellerCount: row.seller_count,
        isDemo: Boolean(row.is_demo),
      })),
      pendingSellers,
      audits,
      lowStock,
      integrations: {
        payments,
        shipping: env.shiprocket.configured ? 'configured' : 'manual-only',
        email: env.email.configured ? 'configured' : 'unconfigured',
      },
      notifications: notificationQueueSummary(db),
    });
  });

  /* ------------------------------ Sellers ------------------------------ */

  router.get('/sellers', (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const queue = typeof req.query.queue === 'string' ? req.query.queue : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const region = typeof req.query.region === 'string' ? req.query.region.trim() : '';
    const sellerCategory = typeof req.query.sellerCategory === 'string' ? req.query.sellerCategory.trim() : '';
    const sellerType = typeof req.query.sellerType === 'string' ? req.query.sellerType.trim() : '';
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (queue === 'review') {
      conditions.push("COALESCE(la.status, sp.status) IN ('submitted','under_review','changes_requested','more_info_required')");
    } else if (status) {
      conditions.push('COALESCE(la.status, sp.status) = ?');
      params.push(status);
    }
    if (q) {
      conditions.push(`(sp.business_name LIKE ? OR sp.slug LIKE ? OR u.email LIKE ? OR la.id LIKE ? OR sp.region LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    if (region) {
      conditions.push('sp.region = ?');
      params.push(region);
    }
    if (sellerCategory) {
      conditions.push('COALESCE(la.seller_category, sp.seller_category) = ?');
      params.push(sellerCategory);
    }
    if (sellerType) {
      conditions.push('COALESCE(la.seller_type, sp.seller_type) = ?');
      params.push(sellerType);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const from = `FROM seller_profiles sp JOIN users u ON u.id = sp.user_id
         LEFT JOIN seller_applications la ON la.id = (
           SELECT id FROM seller_applications a WHERE a.seller_id = sp.id ORDER BY a.created_at DESC LIMIT 1
         )`;
    const totalRow = queryOne<{ total: number }>(db, `SELECT COUNT(*) AS total ${from} ${where}`, ...params);
    const total = totalRow?.total ?? 0;
    const rows = queryAll<{
      id: string;
      business_name: string;
      slug: string;
      status: string;
      store_status: string;
      payout_status: string;
      seller_category: string | null;
      seller_type: string;
      region: string | null;
      created_at: string;
      approved_at: string | null;
      email: string;
      product_count: number;
      paid_orders: number;
      gmv: number;
      application_id: string | null;
      application_status: string | null;
      application_revision: number | null;
      application_current_step: number | null;
      submitted_at: string | null;
    }>(
      db,
      `SELECT sp.id, sp.business_name, sp.slug, sp.status, sp.store_status, sp.payout_status,
              sp.seller_category, sp.seller_type, sp.region, sp.created_at, sp.approved_at,
              u.email, la.id AS application_id, la.status AS application_status, la.revision AS application_revision,
              la.current_step AS application_current_step, la.submitted_at,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = sp.id AND p.status = 'approved') AS product_count,
              (SELECT COUNT(*) FROM seller_orders so JOIN orders o ON o.id = so.order_id
                WHERE so.seller_id = sp.id AND o.paid_at IS NOT NULL) AS paid_orders,
              (SELECT COALESCE(SUM(so.total_paise),0) FROM seller_orders so JOIN orders o ON o.id = so.order_id
                WHERE so.seller_id = sp.id AND o.paid_at IS NOT NULL AND so.status != 'cancelled') AS gmv
         ${from}
        ${where}
        ORDER BY CASE COALESCE(la.status, sp.status)
                   WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 WHEN 'changes_requested' THEN 2
                   ELSE 3 END, sp.created_at DESC
        LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    const filterRows = queryAll<{ field: string; value: string }>(
      db,
      `SELECT 'region' AS field, region AS value FROM seller_profiles WHERE region IS NOT NULL AND region != ''
       UNION SELECT 'seller_category', seller_category FROM seller_profiles WHERE seller_category IS NOT NULL
       UNION SELECT 'seller_type', seller_type FROM seller_profiles WHERE seller_type IS NOT NULL
       ORDER BY field, value`,
    );
    const filters: Record<string, string[]> = { region: [], seller_category: [], seller_type: [] };
    for (const row of filterRows) filters[row.field]?.push(row.value);
    res.json({
      sellers: rows,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      filters,
    });
  });

  router.get('/sellers/:id', (req, res) => {
    const seller = queryOne<Record<string, unknown> & { id: string; user_id: string; business_name: string; status: string }>(
      db,
      'SELECT * FROM seller_profiles WHERE id = ?',
      req.params.id,
    );
    if (!seller) throw notFound('Seller not found.');
    const user = queryOne<{ email: string; created_at: string; email_verified: number }>(
      db,
      'SELECT email, created_at, email_verified FROM users WHERE id = ?',
      seller.user_id,
    );
    const application = latestApplication(db, seller.id);
    const documents = queryAll<{
      id: string;
      doc_type: string;
      doc_label: string | null;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      status: string;
      review_note: string | null;
      uploaded_at: string;
    }>(
      db,
      `SELECT id, doc_type, doc_label, original_name, mime_type, size_bytes, status, review_note, uploaded_at
         FROM seller_documents WHERE seller_id = ? ORDER BY uploaded_at DESC`,
      seller.id,
    );
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
         FROM seller_application_events WHERE seller_id = ? ORDER BY created_at DESC LIMIT 100`,
      seller.id,
    );
    const auditTrail = queryAll<{
      id: string;
      action: string;
      actor_email: string | null;
      before_json: string | null;
      after_json: string | null;
      created_at: string;
    }>(
      db,
      `SELECT id, action, actor_email, before_json, after_json, created_at
         FROM audit_logs WHERE entity_type = 'seller' AND entity_id = ? ORDER BY created_at DESC LIMIT 50`,
      seller.id,
    );
    const requirements = checkDocumentRequirements(
      db,
      seller.id,
      (application?.seller_category ?? seller.seller_category) as Parameters<typeof checkDocumentRequirements>[2],
      application?.seller_type ?? String(seller.seller_type),
    );
    const metrics = queryOne<{
      active_products: number;
      pending_products: number;
      paid_orders: number;
      delivered_orders: number;
      gross: number;
      commission: number;
      eligible: number;
      settled: number;
    }>(
      db,
      `SELECT
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'approved') AS active_products,
        (SELECT COUNT(*) FROM products WHERE seller_id = ? AND status = 'pending') AS pending_products,
        (SELECT COUNT(*) FROM seller_orders so JOIN orders o ON o.id = so.order_id
          WHERE so.seller_id = ? AND o.paid_at IS NOT NULL) AS paid_orders,
        (SELECT COUNT(*) FROM seller_orders WHERE seller_id = ? AND status = 'delivered') AS delivered_orders,
        (SELECT COALESCE(SUM(so.subtotal_paise - so.discount_paise),0) FROM seller_orders so
          JOIN orders o ON o.id = so.order_id WHERE so.seller_id = ? AND o.paid_at IS NOT NULL AND so.status != 'cancelled') AS gross,
        (SELECT COALESCE(SUM(so.commission_paise),0) FROM seller_orders so
          JOIN orders o ON o.id = so.order_id WHERE so.seller_id = ? AND o.paid_at IS NOT NULL AND so.status != 'cancelled') AS commission,
        (SELECT COALESCE(SUM(amount_paise),0) FROM seller_ledger_entries WHERE seller_id = ? AND status = 'eligible') AS eligible,
        (SELECT COALESCE(SUM(amount_paise),0) FROM seller_ledger_entries WHERE seller_id = ? AND status = 'settled') AS settled`,
      seller.id,
      seller.id,
      seller.id,
      seller.id,
      seller.id,
      seller.id,
      seller.id,
      seller.id,
    );
    const recentOrders = queryAll<{ reference: string; status: string; total_paise: number; created_at: string; order_number: string }>(
      db,
      `SELECT so.reference, so.status, so.total_paise, so.created_at, o.order_number
         FROM seller_orders so JOIN orders o ON o.id = so.order_id
        WHERE so.seller_id = ? ORDER BY so.created_at DESC LIMIT 8`,
      seller.id,
    );
    res.json({
      seller: {
        ...seller,
        operatingAddress: seller.operating_address ? JSON.parse(String(seller.operating_address)) : null,
        email: user?.email,
        emailVerified: user?.email_verified === 1,
        accountCreatedAt: user?.created_at,
      },
      application: application
        ? {
            ...application,
            categories: parseJson<string[]>(application.categories, []),
            address: parseJson<Record<string, unknown>>(application.address, {}),
            data: parseJson<Record<string, unknown>>(application.data_json, {}),
            verification: parseJson<Record<string, unknown> | null>(application.verification_json, null),
            shipping: parseJson<Record<string, unknown> | null>(application.shipping_json, null),
            payout: parseJson<Record<string, unknown> | null>(application.payout_json, null),
            agreement: parseJson<Record<string, unknown> | null>(application.agreement_json, null),
          }
        : null,
      documents: documents.map((doc) => ({
        ...doc,
        docLabel: doc.doc_label ?? DOCUMENT_LABELS[doc.doc_type as DocumentType],
      })),
      events,
      auditTrail,
      requirements,
      documentLabels: DOCUMENT_LABELS,
      checklist: onboardingChecklist(db, seller.id, application, user?.email_verified === 1),
      metrics: metrics ?? {},
      recentOrders,
      commissionRules: queryOne<{ rate_bp: number }>(
        db,
        "SELECT rate_bp FROM commission_rules WHERE scope = 'seller' AND seller_id = ? AND is_active = 1 ORDER BY effective_from DESC LIMIT 1",
        seller.id,
      ),
    });
  });

  router.get('/seller-documents/:id/file', (req, res) => {
    const doc = queryOne<{ seller_id: string; file_path: string; mime_type: string; original_name: string; doc_type: string }>(
      db,
      'SELECT seller_id, file_path, mime_type, original_name, doc_type FROM seller_documents WHERE id = ?',
      req.params.id,
    );
    if (!doc || !isInsidePrivateDocs(doc.file_path) || !fs.existsSync(doc.file_path)) throw notFound('Document not found.');
    // Opening identity evidence is itself a sensitive action. Record who opened
    // which document without copying the file contents into the log.
    audit(db, req.user!, 'seller.document_opened', 'seller_document', req.params.id, null, {
      sellerId: doc.seller_id,
      docType: doc.doc_type,
    });
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(doc.file_path).pipe(res);
  });

  router.post('/sellers/:id/decision', async (req, res) => {
    const input = parse(
      z.object({
        decision: z.enum([
          'start_review',
          'approve',
          'reject',
          'request_changes',
          'request_info',
          'suspend',
          'reinstate',
          'request_reverification',
        ]),
        reason: z.string().trim().max(1000).optional(),
        idempotencyKey: z.string().trim().max(120).optional(),
      }),
      req.body,
    );
    const seller = queryOne<{ id: string; status: string; business_name: string; user_id: string }>(
      db,
      'SELECT id, status, business_name, user_id FROM seller_profiles WHERE id = ?',
      req.params.id,
    );
    if (!seller) throw notFound('Seller not found.');
    const decision = input.decision === 'request_info' ? 'request_changes' : input.decision;
    const result = applySellerDecision(db, req.user!, seller.id, decision, input.reason?.trim() || null);

    const account = sellerUser(db, seller.id);
    if (account) {
      const subjects: Record<string, string> = {
        approve: 'Your PAHADI ROOTS maker account is approved',
        reject: 'Update on your PAHADI ROOTS maker application',
        request_changes: 'Changes requested on your maker application',
        start_review: 'Your maker application is under review',
        suspend: 'Your seller account has been suspended',
        reinstate: 'Your seller account has been reinstated',
        request_reverification: 'Re-verification requested for your seller account',
      };
      await notify(db, {
        userId: account.user_id,
        email: account.email,
        type: `seller_${decision}`,
        subject: subjects[decision],
        body: `<p>Hello ${escapeHtml(account.business_name)},</p><p>Your seller application status is now <strong>${result.nextStatus.replaceAll('_', ' ')}</strong>.</p>
          ${input.reason ? `<p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>` : ''}
          <p>Sign in to the seller portal to view the details and any required changes.</p>`,
        dedupeKey: `seller-decision:${seller.id}:${result.applicationId}:${result.nextStatus}:${input.idempotencyKey ?? Date.now()}`,
      });
    }
    res.json({
      ok: true,
      status: result.nextStatus,
      previousStatus: result.previousStatus,
      applicationId: result.applicationId,
    });
  });

  router.post('/seller-documents/:id/status', (req, res) => {
    const input = parse(
      z.object({
        status: z.enum(['accepted', 'rejected']),
        note: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const doc = queryOne<{ id: string; seller_id: string; status: string; doc_type: string }>(
      db,
      'SELECT id, seller_id, status, doc_type FROM seller_documents WHERE id = ?',
      req.params.id,
    );
    if (!doc) throw notFound('Document not found.');
    execute(
      db,
      'UPDATE seller_documents SET status = ?, review_note = ? WHERE id = ?',
      input.status,
      input.note ?? null,
      doc.id,
    );
    const seller = queryOne<{ user_id: string }>(db, 'SELECT user_id FROM seller_profiles WHERE id = ?', doc.seller_id);
    sellerNotification(db, {
      sellerId: doc.seller_id,
      userId: seller?.user_id ?? null,
      type: `document_${input.status}`,
      title: input.status === 'accepted' ? 'Verification document accepted' : 'Verification document needs attention',
      body:
        input.status === 'accepted'
          ? `${DOCUMENT_LABELS[doc.doc_type as DocumentType] ?? doc.doc_type} was accepted.`
          : `${DOCUMENT_LABELS[doc.doc_type as DocumentType] ?? doc.doc_type} was rejected.${input.note ? ` Reason: ${input.note}` : ''}`,
      actionUrl: '/seller/application',
      dedupeKey: `doc-review:${doc.id}:${input.status}:${Date.now()}`,
    });
    audit(db, req.user!, 'seller.document_reviewed', 'seller_document', doc.id, { status: doc.status }, {
      status: input.status,
      note: input.note ?? null,
    });
    res.json({ ok: true });
  });

  /* ------------------------------ Products ----------------------------- */

  router.get('/products', (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const lowStock = req.query.lowStock === 'true';
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (status) {
      conditions.push('p.status = ?');
      params.push(status);
    }
    if (lowStock) {
      conditions.push('(i.quantity - i.reserved_quantity) <= i.low_stock_threshold');
      if (!status) conditions.push("p.status = 'approved'");
    }
    if (q) {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR s.business_name LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = queryOne<{ count: number }>(
      db,
      `SELECT COUNT(*) AS count FROM products p JOIN seller_profiles s ON s.id = p.seller_id
        JOIN inventory i ON i.product_id = p.id ${where}`,
      ...params,
    )?.count ?? 0;
    const rows = queryAll<{
      id: string;
      name: string;
      slug: string;
      status: string;
      price_paise: number;
      sku: string;
      created_at: string;
      submitted_at: string | null;
      rejection_reason: string | null;
      moderation_note: string | null;
      changes_requested_at: string | null;
      seller_name: string;
      seller_id: string;
      image_url: string | null;
      stock: number;
      reserved: number;
      low_stock_threshold: number;
      is_demo: number;
      origin_verified: number;
    }>(
      db,
      `SELECT p.id, p.name, p.slug, p.status, p.price_paise, p.sku, p.created_at, p.submitted_at, p.rejection_reason,
              p.moderation_note, p.changes_requested_at, p.origin_verified, p.is_demo, s.business_name AS seller_name, s.id AS seller_id,
              i.quantity AS stock,
              i.reserved_quantity AS reserved,
              i.low_stock_threshold,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url
         FROM products p JOIN seller_profiles s ON s.id = p.seller_id
         JOIN inventory i ON i.product_id = p.id
        ${where} ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.updated_at DESC
        LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    res.json({ products: rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  router.get('/products/:id', (req, res) => {
    const product = queryOne<Record<string, unknown> & { id: string }>(
      db,
      `SELECT p.*, s.business_name AS seller_name, s.id AS seller_id, s.status AS seller_status,
              c.name AS category_name, i.quantity AS stock, i.reserved_quantity AS reserved, i.low_stock_threshold
         FROM products p JOIN seller_profiles s ON s.id = p.seller_id
         JOIN inventory i ON i.product_id = p.id
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?`,
      req.params.id,
    );
    if (!product) throw notFound('Product not found.');
    const images = queryAll<{ id: string; url: string; alt: string; credit: string | null }>(
      db,
      'SELECT id, url, alt, credit FROM product_images WHERE product_id = ? ORDER BY sort_order',
      product.id,
    );
    res.json({
      product: {
        ...product,
        attributes: product.attributes ? JSON.parse(String(product.attributes)) : null,
        images,
      },
    });
  });

  router.post('/products/:id/decision', async (req, res) => {
    const input = parse(
      z.object({
        decision: z.enum(['approve', 'reject', 'request_edit', 'request_changes']),
        reason: z.string().trim().max(1000).optional(),
        originVerified: z.boolean().optional(),
        taxRateBp: z.number().int().min(0).max(5000).optional(),
      }),
      req.body,
    );
    const product = queryOne<{
      id: string;
      name: string;
      status: string;
      seller_id: string;
      description: string;
      images: number;
      materials: string | null;
      dimensions: string | null;
      care_instructions: string | null;
      weight_g: number | null;
      compliance_json: string | null;
      category_slug: string | null;
      category_name: string | null;
    }>(
      db,
      `SELECT p.id, p.name, p.status, p.seller_id, p.description, p.materials, p.dimensions,
              p.care_instructions, p.weight_g, p.compliance_json,
              c.slug AS category_slug, c.name AS category_name,
              (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS images
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?`,
      req.params.id,
    );
    if (!product) throw notFound('Product not found.');
    if (product.status !== 'pending') throw conflict('Only a listing in review can be moderated.');
    if (input.decision === 'approve') {
      if (product.images === 0) throw conflict('This listing has no photograph and cannot be approved.');
      if (product.description.trim().length < 80) throw conflict('This listing does not have a sufficient description.');
      const application = latestApplication(db, product.seller_id);
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
    }
    if (input.decision !== 'approve' && (!input.reason || input.reason.trim().length < 10)) {
      throw badRequest('Give the seller a clear reason (at least 10 characters).', { reason: 'A reason is required.' });
    }
    const isChanges = input.decision === 'request_edit' || input.decision === 'request_changes';
    const nextStatus = input.decision === 'approve' ? 'approved' : isChanges ? 'pending' : 'rejected';
    const now = new Date().toISOString();
    tx(db, () => {
      execute(
        db,
        `UPDATE products SET status = ?, rejection_reason = ?, moderation_note = ?, changes_requested_at = ?,
                approved_at = CASE WHEN ? = 'approved' THEN ? ELSE approved_at END,
                published_at = CASE WHEN ? = 'approved' THEN ? ELSE published_at END,
                origin_verified = COALESCE(?, origin_verified),
                tax_rate_bp = COALESCE(?, tax_rate_bp), updated_at = ?
          WHERE id = ?`,
        nextStatus,
        input.decision === 'approve' ? null : input.reason ?? null,
        input.decision === 'approve' ? null : isChanges ? input.reason ?? null : null,
        isChanges ? now : null,
        nextStatus,
        now,
        nextStatus,
        now,
        input.originVerified === undefined ? null : input.originVerified ? 1 : 0,
        input.taxRateBp === undefined ? null : input.taxRateBp,
        now,
        product.id,
      );
      audit(db, req.user!, `product.${input.decision}`, 'product', product.id, { status: product.status }, {
        status: nextStatus,
        workflowStatus: isChanges ? 'changes_requested' : nextStatus,
        reason: input.reason ?? null,
        originVerified: input.originVerified ?? null,
        taxRateBp: input.taxRateBp ?? null,
      });
      sellerNotification(db, {
        sellerId: product.seller_id,
        userId: sellerUser(db, product.seller_id)?.user_id ?? null,
        type: `product_${input.decision}`,
        title:
          input.decision === 'approve'
            ? 'Listing published'
            : isChanges
              ? 'Changes requested on a listing'
              : 'Listing rejected',
        body: `${product.name}: ${input.decision === 'approve' ? 'your listing is now live.' : input.reason ?? 'See the seller portal for the reviewer note.'}`,
        actionUrl: `/seller/products/${product.id}/edit`,
        dedupeKey: `product-decision:${product.id}:${nextStatus}:${now}`,
      });
    });
    const account = sellerUser(db, product.seller_id);
    if (account) {
      await notify(db, {
        userId: account.user_id,
        email: account.email,
        type: `product_${input.decision}`,
        subject:
          input.decision === 'approve'
            ? `Listing approved: ${product.name}`
            : isChanges
              ? `Changes requested: ${product.name}`
              : `Listing rejected: ${product.name}`,
        body: `<p>${
          input.decision === 'approve'
            ? 'Your product is now live on PAHADI ROOTS.'
            : isChanges
              ? 'We need changes before this listing can go live.'
              : 'We could not approve this listing.'
        }</p>
          ${input.reason ? `<p><strong>Reviewer note:</strong> ${escapeHtml(input.reason)}</p>` : ''}
          <p>Open the seller portal to view or edit the listing.</p>`,
        dedupeKey: `product-decision-email:${product.id}:${nextStatus}:${now}`,
      });
    }
    res.json({ ok: true, status: nextStatus, workflowStatus: isChanges ? 'changes_requested' : nextStatus });
  });

  router.post('/products/:id/feature', (req, res) => {
    const input = parse(z.object({ featured: z.boolean() }), req.body);
    const product = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM products WHERE id = ?', req.params.id);
    if (!product) throw notFound('Product not found.');
    if (input.featured && product.status !== 'approved') throw conflict('Only an approved listing can be featured.');
    execute(db, 'UPDATE products SET is_featured = ? WHERE id = ?', input.featured ? 1 : 0, product.id);
    audit(db, req.user!, 'product.featured_changed', 'product', product.id, null, { featured: input.featured });
    res.json({ ok: true });
  });

  router.post('/products', (req, res) => {
    const input = parse(
      z.object({
        name: z.string().trim().min(2, 'Enter a product name.').max(160),
        slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lower-case alphanumeric with dashes.').optional(),
        categoryId: z.string().min(2).optional(),
        sellerId: z.string().optional(),
        shortDescription: z.string().trim().max(300).default(''),
        description: z.string().trim().min(10, 'Write at least 10 characters for the description.').max(8000),
        pricePaise: z.number().int().min(0, 'Price cannot be negative.').max(10_000_000),
        compareAtPricePaise: z.number().int().min(0).max(10_000_000).nullable().optional(),
        sku: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/, 'SKU contains invalid characters.').optional(),
        stock: z.number().int().min(0, 'Stock cannot be negative.').max(100_000).default(0),
        lowStockThreshold: z.number().int().min(0).max(1000).default(3),
        unit: z.string().trim().min(1).max(30).default('piece'),
        weightG: z.number().int().min(0).max(500_000).nullable().optional(),
        originPlace: z.string().trim().max(120).optional(),
        materials: z.string().trim().max(500).optional(),
        careInstructions: z.string().trim().max(500).optional(),
        foodInfo: z.string().trim().max(1000).optional(),
        status: z.enum(['draft', 'pending', 'approved', 'paused', 'archived']).default('draft'),
        isDemo: z.boolean().default(true),
        imageUrl: z.string().trim().max(500).optional(),
        imageAlt: z.string().trim().max(200).optional(),
      }),
      req.body,
    );

    if (input.compareAtPricePaise && input.compareAtPricePaise < input.pricePaise) {
      throw badRequest('Compare-at price must be greater than or equal to the selling price.', {
        compareAtPricePaise: 'Must be at least the selling price.',
      });
    }

    let category = input.categoryId
      ? queryOne<{ id: string; slug: string; name: string }>(
          db,
          'SELECT id, slug, name FROM categories WHERE id = ? AND is_active = 1',
          input.categoryId,
        )
      : queryOne<{ id: string; slug: string; name: string }>(
          db,
          'SELECT id, slug, name FROM categories WHERE is_active = 1 ORDER BY sort_order LIMIT 1',
        );
    if (!category) {
      category = queryOne<{ id: string; slug: string; name: string }>(
        db,
        'SELECT id, slug, name FROM categories ORDER BY sort_order LIMIT 1',
      );
    }
    if (!category) {
      throw badRequest('Choose a valid, active category.', { categoryId: 'Invalid category.' });
    }

    // Publishing directly from the create form would bypass the category
    // publication checks. Regulated categories must be created as a draft and
    // approved through moderation with their evidence attached.
    if (input.status === 'approved' && complianceGroupFor(category.slug, category.name) !== 'general') {
      throw badRequest(
        'Create this listing as a draft. Category-specific compliance information must be reviewed before publication.',
        { status: 'Use draft status for this category.' },
      );
    }

    let seller = input.sellerId
      ? queryOne<{ id: string; business_name: string }>(
          db,
          "SELECT id, business_name FROM seller_profiles WHERE id = ? AND status = 'approved'",
          input.sellerId,
        )
      : queryOne<{ id: string; business_name: string }>(
          db,
          "SELECT id, business_name FROM seller_profiles WHERE status = 'approved' ORDER BY created_at LIMIT 1",
        );

    if (!seller) {
      seller = queryOne<{ id: string; business_name: string }>(
        db,
        'SELECT id, business_name FROM seller_profiles ORDER BY created_at LIMIT 1',
      );
    }

    if (!seller) {
      throw conflict('No seller profile exists. Seed sellers or create a seller first before creating products.');
    }

    const sku = input.sku ?? `DEMO-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    if (queryOne(db, 'SELECT 1 FROM products WHERE seller_id = ? AND sku = ?', seller.id, sku)) {
      throw badRequest('That SKU is already in use for this seller.', { sku: 'SKU must be unique.' });
    }

    let slug = input.slug;
    if (slug) {
      if (queryOne(db, 'SELECT 1 FROM products WHERE slug = ?', slug)) {
        throw badRequest('A product with that slug already exists.', { slug: 'Duplicate slug.' });
      }
    } else {
      slug = uniqueSlug(input.name, (candidate) => Boolean(queryOne(db, 'SELECT 1 FROM products WHERE slug = ?', candidate)));
    }

    const productId = newId('prd_');
    const now = new Date().toISOString();
    const isApproved = input.status === 'approved';

    tx(db, () => {
      execute(
        db,
        `INSERT INTO products (
           id, seller_id, category_id, name, slug, short_description, description,
           price_paise, compare_at_price_paise, sku, unit, weight_g, materials,
           care_instructions, food_info, origin_place, origin_verified, status,
           is_demo, published_at, approved_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
        productId,
        seller.id,
        category.id,
        input.name,
        slug,
        input.shortDescription,
        input.description,
        input.pricePaise,
        input.compareAtPricePaise ?? null,
        sku,
        input.unit,
        input.weightG ?? null,
        input.materials ?? null,
        input.careInstructions ?? null,
        input.foodInfo ?? null,
        input.originPlace ?? null,
        input.status,
        input.isDemo ? 1 : 0,
        isApproved ? now : null,
        isApproved ? now : null,
        now,
        now,
      );

      execute(
        db,
        'INSERT INTO inventory (product_id, quantity, reserved_quantity, low_stock_threshold) VALUES (?, ?, 0, ?)',
        productId,
        input.stock,
        input.lowStockThreshold,
      );

      if (input.stock > 0) {
        execute(
          db,
          `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note)
           VALUES (?, ?, ?, 'restock', 'initial_admin_setup', 'Initial stock created by administrator')`,
          newId('mov_'),
          productId,
          input.stock,
        );
      }

      if (input.imageUrl) {
        execute(
          db,
          'INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES (?, ?, ?, ?, 0)',
          newId('img_'),
          productId,
          input.imageUrl,
          input.imageAlt || `${input.name} photo`,
        );
      }

      audit(db, req.user!, 'product.created_by_admin', 'product', productId, null, {
        name: input.name,
        slug,
        status: input.status,
        sellerId: seller.id,
        stock: input.stock,
        isDemo: input.isDemo,
      });
    });

    res.status(201).json({
      ok: true,
      id: productId,
      slug,
      status: input.status,
      name: input.name,
      message: isApproved ? 'Product created and published.' : 'Product draft created.',
    });
  });

  router.patch('/products/:id', (req, res) => {
    const input = parse(
      z.object({
        name: z.string().trim().min(2).max(160).optional(),
        slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
        categoryId: z.string().min(2).optional(),
        shortDescription: z.string().trim().max(300).optional(),
        description: z.string().trim().min(10).max(8000).optional(),
        pricePaise: z.number().int().min(0, 'Price cannot be negative.').max(10_000_000).optional(),
        compareAtPricePaise: z.number().int().min(0).max(10_000_000).nullable().optional(),
        sku: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9._-]+$/).optional(),
        unit: z.string().trim().min(1).max(30).optional(),
        weightG: z.number().int().min(0).max(500_000).nullable().optional(),
        originPlace: z.string().trim().max(120).nullable().optional(),
        materials: z.string().trim().max(500).nullable().optional(),
        careInstructions: z.string().trim().max(500).nullable().optional(),
        foodInfo: z.string().trim().max(1000).nullable().optional(),
        status: z.enum(['draft', 'pending', 'approved', 'paused', 'archived']).optional(),
        isDemo: z.boolean().optional(),
        originVerified: z.boolean().optional(),
      }),
      req.body,
    );

    const product = queryOne<{ id: string; seller_id: string; price_paise: number; compare_at_price_paise: number | null; slug: string; sku: string; status: string }>(
      db,
      'SELECT id, seller_id, price_paise, compare_at_price_paise, slug, sku, status FROM products WHERE id = ?',
      req.params.id,
    );
    if (!product) throw notFound('Product not found.');

    const newPrice = input.pricePaise !== undefined ? input.pricePaise : product.price_paise;
    const newCompareAt = input.compareAtPricePaise !== undefined ? input.compareAtPricePaise : product.compare_at_price_paise;
    if (newCompareAt !== null && newCompareAt !== undefined && newCompareAt < newPrice) {
      throw badRequest('Compare-at price must be greater than or equal to selling price.', {
        compareAtPricePaise: 'Must be at least the selling price.',
      });
    }

    if (input.slug && input.slug !== product.slug) {
      if (queryOne(db, 'SELECT 1 FROM products WHERE slug = ? AND id != ?', input.slug, product.id)) {
        throw badRequest('A product with that slug already exists.', { slug: 'Duplicate slug.' });
      }
    }

    if (input.sku && input.sku !== product.sku) {
      if (queryOne(db, 'SELECT 1 FROM products WHERE seller_id = ? AND sku = ? AND id != ?', product.seller_id, input.sku, product.id)) {
        throw badRequest('That SKU is already in use for this seller.', { sku: 'SKU must be unique.' });
      }
    }

    if (input.categoryId) {
      const category = queryOne<{ id: string }>(db, 'SELECT id FROM categories WHERE id = ? AND is_active = 1', input.categoryId);
      if (!category) throw badRequest('Invalid category.', { categoryId: 'Invalid category.' });
    }

    const now = new Date().toISOString();
    const nextStatus = input.status ?? product.status;

    tx(db, () => {
      execute(
        db,
        `UPDATE products SET
           name = COALESCE(?, name),
           slug = COALESCE(?, slug),
           category_id = COALESCE(?, category_id),
           short_description = COALESCE(?, short_description),
           description = COALESCE(?, description),
           price_paise = COALESCE(?, price_paise),
           compare_at_price_paise = CASE WHEN ? IS NOT NULL THEN ? ELSE compare_at_price_paise END,
           sku = COALESCE(?, sku),
           unit = COALESCE(?, unit),
           weight_g = CASE WHEN ? IS NOT NULL THEN ? ELSE weight_g END,
           origin_place = CASE WHEN ? IS NOT NULL THEN ? ELSE origin_place END,
           materials = CASE WHEN ? IS NOT NULL THEN ? ELSE materials END,
           care_instructions = CASE WHEN ? IS NOT NULL THEN ? ELSE care_instructions END,
           food_info = CASE WHEN ? IS NOT NULL THEN ? ELSE food_info END,
           status = COALESCE(?, status),
           is_demo = CASE WHEN ? IS NOT NULL THEN ? ELSE is_demo END,
           origin_verified = CASE WHEN ? IS NOT NULL THEN ? ELSE origin_verified END,
           published_at = CASE WHEN ? = 'approved' THEN COALESCE(published_at, ?) ELSE published_at END,
           updated_at = ?
         WHERE id = ?`,
        input.name ?? null,
        input.slug ?? null,
        input.categoryId ?? null,
        input.shortDescription ?? null,
        input.description ?? null,
        input.pricePaise ?? null,
        input.compareAtPricePaise !== undefined ? 1 : null,
        input.compareAtPricePaise ?? null,
        input.sku ?? null,
        input.unit ?? null,
        input.weightG !== undefined ? 1 : null,
        input.weightG ?? null,
        input.originPlace !== undefined ? 1 : null,
        input.originPlace ?? null,
        input.materials !== undefined ? 1 : null,
        input.materials ?? null,
        input.careInstructions !== undefined ? 1 : null,
        input.careInstructions ?? null,
        input.foodInfo !== undefined ? 1 : null,
        input.foodInfo ?? null,
        input.status ?? null,
        input.isDemo !== undefined ? 1 : null,
        input.isDemo ? 1 : 0,
        input.originVerified !== undefined ? 1 : null,
        input.originVerified ? 1 : 0,
        nextStatus,
        now,
        now,
        product.id,
      );

      audit(db, req.user!, 'product.updated_by_admin', 'product', product.id, { status: product.status }, { ...input });
    });

    res.json({ ok: true, status: nextStatus, message: 'Product updated successfully.' });
  });

  router.post('/products/:id/publish', (req, res) => {
    const product = queryOne<{
      id: string;
      status: string;
      seller_id: string;
      materials: string | null;
      dimensions: string | null;
      care_instructions: string | null;
      weight_g: number | null;
      compliance_json: string | null;
      category_slug: string | null;
      category_name: string | null;
    }>(
      db,
      `SELECT p.id, p.status, p.seller_id, p.materials, p.dimensions, p.care_instructions, p.weight_g,
              p.compliance_json, c.slug AS category_slug, c.name AS category_name
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?`,
      req.params.id,
    );
    if (!product) throw notFound('Product not found.');
    const application = latestApplication(db, product.seller_id);
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
      "UPDATE products SET status = 'approved', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?",
      now,
      now,
      product.id,
    );
    audit(db, req.user!, 'product.published_by_admin', 'product', product.id, { status: product.status }, { status: 'approved' });
    res.json({ ok: true, status: 'approved', message: 'Product published to customer storefront.' });
  });

  router.post('/products/:id/unpublish', (req, res) => {
    const product = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM products WHERE id = ?', req.params.id);
    if (!product) throw notFound('Product not found.');
    const now = new Date().toISOString();
    execute(db, "UPDATE products SET status = 'paused', updated_at = ? WHERE id = ?", now, product.id);
    audit(db, req.user!, 'product.unpublished_by_admin', 'product', product.id, { status: product.status }, { status: 'paused' });
    res.json({ ok: true, status: 'paused', message: 'Product unpublished and hidden from public storefront.' });
  });

  router.post('/products/:id/archive', (req, res) => {
    const product = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM products WHERE id = ?', req.params.id);
    if (!product) throw notFound('Product not found.');
    const now = new Date().toISOString();
    execute(db, "UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?", now, product.id);
    audit(db, req.user!, 'product.archived_by_admin', 'product', product.id, { status: product.status }, { status: 'archived' });
    res.json({ ok: true, status: 'archived', message: 'Product archived. Historical orders remain intact.' });
  });

  router.post('/products/:id/stock', (req, res) => {
    const input = parse(
      z.object({
        quantity: z.number().int(),
        mode: z.enum(['set', 'adjust']).default('set'),
        lowStockThreshold: z.number().int().min(0).max(1000).optional(),
        reason: z.string().trim().max(100).optional(),
        note: z.string().trim().max(300).optional(),
      }),
      req.body,
    );

    const inv = queryOne<{ product_id: string; quantity: number; reserved_quantity: number; low_stock_threshold: number }>(
      db,
      'SELECT product_id, quantity, reserved_quantity, low_stock_threshold FROM inventory WHERE product_id = ?',
      req.params.id,
    );
    if (!inv) throw notFound('Inventory record for product not found.');

    const newQty = input.mode === 'adjust' ? inv.quantity + input.quantity : input.quantity;
    if (newQty < 0) {
      throw badRequest('Stock quantity cannot be negative.', { quantity: 'Cannot be negative.' });
    }
    if (newQty < inv.reserved_quantity) {
      throw badRequest(
        `Stock cannot be set lower than the reserved quantity (${inv.reserved_quantity}). Wait for pending orders to complete or cancel them first.`,
        { quantity: 'Cannot be lower than reserved.' },
      );
    }

    const change = newQty - inv.quantity;
    const now = new Date().toISOString();

    tx(db, () => {
      execute(db, 'UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?', newQty, now, inv.product_id);
      if (input.lowStockThreshold !== undefined) {
        execute(db, 'UPDATE inventory SET low_stock_threshold = ? WHERE product_id = ?', input.lowStockThreshold, inv.product_id);
      }
      if (change !== 0) {
        execute(
          db,
          `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          newId('mov_'),
          inv.product_id,
          change,
          change > 0 ? 'restock' : 'adjustment',
          input.reason ?? 'admin_stock_update',
          input.note ?? (change > 0 ? 'Stock added by admin' : 'Stock reduced by admin'),
          req.user!.email,
        );
      }
      audit(db, req.user!, 'product.stock_updated', 'product', inv.product_id, { quantity: inv.quantity, lowStockThreshold: inv.low_stock_threshold }, { quantity: newQty, change, lowStockThreshold: input.lowStockThreshold ?? inv.low_stock_threshold });
    });

    res.json({
      ok: true,
      stock: newQty,
      reserved: inv.reserved_quantity,
      available: newQty - inv.reserved_quantity,
      lowStockThreshold: input.lowStockThreshold ?? inv.low_stock_threshold,
      message: `Stock updated to ${newQty}.`,
    });
  });

  router.post('/products/:id/images', imageUpload().single('image'), (req, res) => {
    const productId = String(req.params.id);
    const product = queryOne<{ id: string; name: string }>(
      db,
      'SELECT id, name FROM products WHERE id = ?',
      productId,
    );
    if (!product) throw notFound('Product not found.');
    if (!req.file) throw badRequest('Choose an image file.');
    if (!hasValidFileSignature(req.file.path, 'image')) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw badRequest('That file does not look like a valid JPEG, PNG, or WebP image.');
    }

    const count = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?', product.id)?.count ?? 0;
    if (count >= 8) throw conflict('A product can have at most 8 images.');

    const alt = String(req.body.alt ?? '').trim() || `${product.name} photograph`;
    const url = `/uploads/${path.basename(req.file.filename)}`;
    const imageId = newId('img_');

    execute(
      db,
      'INSERT INTO product_images (id, product_id, url, alt, credit, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      imageId,
      product.id,
      url,
      alt.slice(0, 200),
      String(req.body.credit ?? '').trim().slice(0, 200) || null,
      count,
    );

    audit(db, req.user!, 'product.image_added_by_admin', 'product', product.id, null, { imageId, url });
    res.status(201).json({ id: imageId, url, alt, message: 'Image uploaded successfully.' });
  });

  router.delete('/products/:id/images/:imageId', (req, res) => {
    const image = queryOne<{ id: string; url: string; product_id: string }>(
      db,
      'SELECT id, url, product_id FROM product_images WHERE id = ? AND product_id = ?',
      String(req.params.imageId),
      String(req.params.id),
    );
    if (!image) throw notFound('Image not found.');

    execute(db, 'DELETE FROM product_images WHERE id = ?', image.id);
    const filename = path.basename(image.url);
    const filePath = path.join(env.uploadDir, filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }

    audit(db, req.user!, 'product.image_deleted_by_admin', 'product', image.product_id, { imageId: image.id }, null);
    res.json({ ok: true, message: 'Image removed.' });
  });

  /* ------------------------------- Orders ------------------------------ */

  router.get('/orders', (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const isDemo = typeof req.query.isDemo === 'string' && req.query.isDemo ? req.query.isDemo : undefined;
    const fulfilment = req.query.fulfilment === 'open';
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (q) {
      conditions.push('(o.order_number LIKE ? OR o.email LIKE ? OR json_extract(o.shipping_address, \'$.fullName\') LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }
    if (isDemo === 'true') {
      conditions.push('o.is_demo = 1');
    } else if (isDemo === 'false') {
      conditions.push('o.is_demo = 0');
    }
    if (fulfilment) {
      conditions.push(
        "EXISTS (SELECT 1 FROM seller_orders so WHERE so.order_id = o.id AND so.status IN ('pending','confirmed','packed'))",
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = queryOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM orders o ${where}`, ...params)?.count ?? 0;
    const rows = queryAll<{
      order_number: string;
      email: string;
      status: string;
      total_paise: number;
      placed_at: string;
      paid_at: string | null;
      shipping_address: string;
      seller_orders: string;
      refund_count: number;
      is_demo: number;
    }>(
      db,
      `SELECT o.order_number, o.email, o.status, o.total_paise, o.placed_at, o.paid_at, o.shipping_address, o.is_demo,
              (SELECT GROUP_CONCAT(so.status) FROM seller_orders so WHERE so.order_id = o.id) AS seller_orders,
              (SELECT COUNT(*) FROM refunds r WHERE r.order_id = o.id) AS refund_count
         FROM orders o ${where} ORDER BY o.placed_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    res.json({
      orders: rows.map((row) => {
        const address = JSON.parse(row.shipping_address) as { fullName: string; city: string; state: string };
        return {
          orderNumber: row.order_number,
          email: row.email,
          status: row.status,
          totalPaise: row.total_paise,
          placedAt: row.placed_at,
          paidAt: row.paid_at,
          customerName: address.fullName,
          destination: `${address.city}, ${address.state}`,
          sellerStatuses: row.seller_orders ? row.seller_orders.split(',') : [],
          refundCount: row.refund_count,
          isDemo: Boolean(row.is_demo),
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  router.get('/orders/:orderNumber', (req, res) => {
    const order = queryOne<{ id: string }>(db, 'SELECT id FROM orders WHERE order_number = ?', req.params.orderNumber);
    if (!order) throw notFound('Order not found.');
    const view = getOrderView(db, order.id, { includeFinancials: true });
    const payments = queryAll<{
      id: string;
      provider: string;
      status: string;
      amount_paise: number;
      provider_order_id: string | null;
      provider_payment_id: string | null;
      method: string | null;
      verified_at: string | null;
      created_at: string;
    }>(
      db,
      'SELECT id, provider, status, amount_paise, provider_order_id, provider_payment_id, method, verified_at, created_at FROM payments WHERE order_id = ? ORDER BY created_at',
      order.id,
    );
    const refunds = queryAll<Record<string, unknown>>(db, 'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC', order.id);
    const returns = queryAll<Record<string, unknown>>(
      db,
      'SELECT * FROM return_requests WHERE order_id = ? ORDER BY created_at DESC',
      order.id,
    );
    const cancellations = queryAll<Record<string, unknown>>(
      db,
      'SELECT * FROM cancellation_requests WHERE order_id = ? ORDER BY created_at DESC',
      order.id,
    );
    const events = queryAll<Record<string, unknown>>(
      db,
      'SELECT id, provider, provider_event_id, type, summary, processed_at FROM payment_events WHERE order_id = ? ORDER BY processed_at DESC',
      order.id,
    );
    res.json({ order: view, payments, refunds, returns, cancellations, events });
  });

  router.post('/orders/:orderNumber/seller-orders/:sellerOrderId/action', (req, res) => {
    const input = parse(
      z.object({
        action: z.enum(['confirm', 'pack', 'ship', 'deliver', 'cancel']),
        carrier: z.string().trim().max(80).optional(),
        trackingNumber: z.string().trim().max(120).optional(),
        note: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const sellerOrder = queryOne<{ id: string; order_id: string }>(
      db,
      'SELECT so.id, so.order_id FROM seller_orders so JOIN orders o ON o.id = so.order_id WHERE so.id = ? AND o.order_number = ?',
      req.params.sellerOrderId,
      req.params.orderNumber,
    );
    if (!sellerOrder) throw notFound('Seller order not found.');
    sellerOrderAction(db, {
      sellerOrderId: sellerOrder.id,
      actor: req.user!,
      action: input.action,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      note: input.note,
    });
    res.json({ ok: true });
  });

  router.post('/orders/:orderNumber/status', (req, res) => {
    const input = parse(
      z.object({
        action: z.enum(['confirm', 'pack', 'ship', 'deliver', 'cancel']),
        carrier: z.string().trim().max(80).optional(),
        trackingNumber: z.string().trim().max(120).optional(),
        note: z.string().trim().max(500).optional(),
      }),
      req.body,
    );

    const order = queryOne<{ id: string; status: string; is_demo: number }>(
      db,
      'SELECT id, status, is_demo FROM orders WHERE order_number = ?',
      req.params.orderNumber,
    );
    if (!order) throw notFound('Order not found.');

    const sellerOrders = queryAll<{ id: string; status: string }>(
      db,
      'SELECT id, status FROM seller_orders WHERE order_id = ?',
      order.id,
    );
    if (sellerOrders.length === 0) throw badRequest('No seller sub-orders found for this order.');

    for (const so of sellerOrders) {
      if (input.action === 'cancel' && so.status === 'cancelled') continue;
      sellerOrderAction(db, {
        sellerOrderId: so.id,
        actor: req.user!,
        action: input.action,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        note: input.note,
      });
    }

    const newStatus = refreshOrderStatus(db, order.id);
    audit(db, req.user!, 'order.status_updated', 'order', order.id, { action: input.action, status: newStatus });
    res.json({ ok: true, status: newStatus });
  });

  /* ------------------------------ Payments ----------------------------- */

  router.get('/payments', (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const where = status ? 'WHERE p.status = ?' : '';
    const total = queryOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM payments p ${where}`, ...(status ? [status] : []))?.count ?? 0;
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT p.id, p.provider, p.status, p.amount_paise, p.provider_order_id, p.provider_payment_id, p.method,
              p.verified_at, p.failure_reason, p.created_at, o.order_number, o.status AS order_status
         FROM payments p JOIN orders o ON o.id = p.order_id ${where}
        ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      ...(status ? [status] : []),
      pageSize,
      offset,
    );
    res.json({ payments: rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  });

  /* ------------------------------- Refunds ----------------------------- */

  router.get('/refunds', (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT r.*, o.order_number, o.email, sp.business_name AS seller_name,
              p.provider, p.provider_payment_id
         FROM refunds r JOIN orders o ON o.id = r.order_id
         LEFT JOIN seller_orders so ON so.id = r.seller_order_id
         LEFT JOIN seller_profiles sp ON sp.id = so.seller_id
         LEFT JOIN payments p ON p.id = r.payment_id
        ${status ? 'WHERE r.status = ?' : ''}
        ORDER BY CASE r.status WHEN 'requested' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END, r.created_at DESC`,
      ...(status ? [status] : []),
    );
    res.json({ refunds: rows });
  });

  router.post('/refunds/:id/decide', async (req, res) => {
    const input = parse(
      z.object({
        decision: z.enum(['approve', 'reject']),
        method: z.enum(['razorpay', 'manual']).optional(),
        manualReference: z.string().trim().max(120).optional(),
        note: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const refund = queryOne<{ id: string; order_id: string; amount_paise: number; status: string; requested_by: string }>(
      db,
      'SELECT id, order_id, amount_paise, status, requested_by FROM refunds WHERE id = ?',
      req.params.id,
    );
    if (!refund) throw notFound('Refund not found.');
    const result = await decideRefund(db, {
      refundId: refund.id,
      actor: req.user!,
      decision: input.decision,
      method: input.method,
      manualReference: input.manualReference,
      note: input.note,
    });
    const order = queryOne<{ email: string; user_id: string; order_number: string }>(
      db,
      'SELECT email, user_id, order_number FROM orders WHERE id = ?',
      refund.order_id,
    );
    if (order) {
      await notify(db, {
        userId: order.user_id,
        email: order.email,
        type: input.decision === 'reject' ? 'refund_rejected' : 'refund_approved',
        subject:
          input.decision === 'reject'
            ? `Refund request update for ${order.order_number}`
            : `Refund approved for ${order.order_number}`,
        body: `<p>${input.decision === 'reject' ? 'After review, this refund request was not approved.' : 'Your refund has been approved.'}</p>
          <p><strong>Amount:</strong> ₹${(refund.amount_paise / 100).toLocaleString('en-IN')}</p>
          ${input.note ? `<p><strong>Note:</strong> ${input.note.replaceAll('<', '&lt;')}</p>` : ''}
          <p>${result.status === 'processing' ? 'The payment provider is processing it; the status will update when confirmed.' : result.status === 'approved' ? 'The refund has been approved and recorded. A bank/UPI transfer still has to be completed and confirmed.' : 'The final status is shown in your account.'}</p>`,
        dedupeKey: `refund-decision:${refund.id}:${input.decision}`,
      });
    }
    res.json(result);
  });

  router.post('/refunds/:id/complete-manual', async (req, res) => {
    const input = parse(
      z.object({
        manualReference: z.string().trim().min(4).max(120),
        note: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const refund = queryOne<{ id: string; order_id: string; amount_paise: number; status: string }>(
      db,
      'SELECT id, order_id, amount_paise, status FROM refunds WHERE id = ?',
      req.params.id,
    );
    if (!refund) throw notFound('Refund not found.');
    const result = markManualRefundCompleted(db, {
      refundId: refund.id,
      actor: req.user!,
      manualReference: input.manualReference,
      note: input.note,
    });
    const order = queryOne<{ email: string; user_id: string; order_number: string }>(
      db,
      'SELECT email, user_id, order_number FROM orders WHERE id = ?',
      refund.order_id,
    );
    if (order) {
      await notify(db, {
        userId: order.user_id,
        email: order.email,
        type: 'refund_completed',
        subject: `Refund recorded for ${order.order_number}`,
        body: `<p>Your refund of <strong>₹${(refund.amount_paise / 100).toLocaleString('en-IN')}</strong> has been recorded as completed against the verified bank/UPI reference.</p><p><strong>Reference:</strong> ${escapeHtml(input.manualReference)}</p>`,
        dedupeKey: `refund-complete:${refund.id}`,
      });
    }
    res.json({ ...result, message: 'Manual refund recorded as completed with the verified transfer reference.' });
  });

  /* -------------------------- Returns / cancels ------------------------ */

  router.get('/returns', (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT r.*, o.order_number, sp.business_name AS seller_name, sp.id AS seller_id,
              (SELECT name FROM order_items WHERE seller_order_id = r.seller_order_id LIMIT 1) AS item_name
         FROM return_requests r JOIN orders o ON o.id = r.order_id
         JOIN seller_orders so ON so.id = r.seller_order_id
         JOIN seller_profiles sp ON sp.id = so.seller_id
        ${status ? 'WHERE r.status = ?' : ''}
        ORDER BY CASE r.status WHEN 'requested' THEN 0 ELSE 1 END, r.created_at DESC`,
      ...(status ? [status] : []),
    );
    res.json({ returns: rows });
  });

  router.post('/returns/:id/decision', async (req, res) => {
    const input = parse(
      z.object({
        decision: z.enum(['approve', 'reject']),
        note: z.string().trim().min(3).max(500),
        amountPaise: z.number().int().min(1).optional(),
      }),
      req.body,
    );
    const ret = queryOne<{ id: string; status: string; order_id: string; user_id: string }>(
      db,
      'SELECT id, status, order_id, user_id FROM return_requests WHERE id = ?',
      req.params.id,
    );
    if (!ret) throw notFound('Return request not found.');
    if (ret.status !== 'requested') throw conflict('This return has already been reviewed.');
    let refundId: string | null = null;
    if (input.decision === 'approve') {
      if (input.amountPaise) {
        const so = queryOne<{ total_paise: number }>(
          db,
          'SELECT so.total_paise FROM seller_orders so JOIN return_requests r ON r.seller_order_id = so.id WHERE r.id = ?',
          ret.id,
        );
        if (!so || input.amountPaise > so.total_paise) throw badRequest('Refund cannot exceed the seller order total.');
      }
      refundId = createRefundForReturn(db, {
        returnId: ret.id,
        actor: req.user!,
        amountPaise: input.amountPaise,
        note: input.note,
      });
    } else {
      execute(
        db,
        "UPDATE return_requests SET status = 'rejected', decided_by = ?, decided_at = ?, resolution_note = ? WHERE id = ?",
        req.user!.id,
        new Date().toISOString(),
        input.note,
        ret.id,
      );
      audit(db, req.user!, 'return.rejected', 'return_request', ret.id, { status: 'requested' }, { status: 'rejected' });
    }
    const order = queryOne<{ email: string; user_id: string; order_number: string }>(
      db,
      'SELECT email, user_id, order_number FROM orders WHERE id = ?',
      ret.order_id,
    );
    if (order) {
      await notify(db, {
        userId: order.user_id,
        email: order.email,
        type: input.decision === 'approve' ? 'return_approved' : 'return_rejected',
        subject: `Return request ${input.decision === 'approve' ? 'approved' : 'declined'} — ${order.order_number}`,
        body: `<p>${input.decision === 'approve' ? 'Your return has been approved and a refund request has been recorded for review.' : 'After review, we could not approve this return.'}</p><p><strong>Note:</strong> ${input.note.replaceAll('<', '&lt;')}</p>`,
        dedupeKey: `return-decision:${ret.id}:${input.decision}`,
      });
    }
    res.json({ ok: true, refundId });
  });

  router.get('/cancellations', (_req, res) => {
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT c.*, o.order_number, o.email, sp.business_name AS seller_name
         FROM cancellation_requests c JOIN orders o ON o.id = c.order_id
         LEFT JOIN seller_orders so ON so.id = c.seller_order_id
         LEFT JOIN seller_profiles sp ON sp.id = so.seller_id
        ORDER BY CASE c.status WHEN 'requested' THEN 0 ELSE 1 END, c.created_at DESC`,
    );
    res.json({ cancellations: rows });
  });

  router.post('/cancellations/:id/decision', async (req, res) => {
    const input = parse(
      z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().min(3).max(500) }),
      req.body,
    );
    const request = queryOne<{
      id: string;
      order_id: string;
      seller_order_id: string;
      user_id: string;
      status: string;
      reason: string;
    }>(db, 'SELECT * FROM cancellation_requests WHERE id = ?', req.params.id);
    if (!request) throw notFound('Cancellation request not found.');
    if (request.status !== 'requested') throw conflict('This request has already been decided.');
    if (input.decision === 'approve') {
      const sellerOrder = queryOne<{ status: string }>(
        db,
        'SELECT status FROM seller_orders WHERE id = ?',
        request.seller_order_id,
      );
      if (sellerOrder && ['shipped', 'delivered'].includes(sellerOrder.status)) {
        throw conflict(
          'This shipment has already been dispatched. Reject the cancellation and use the returns workflow instead.',
        );
      }
      sellerOrderAction(db, {
        sellerOrderId: request.seller_order_id,
        actor: req.user!,
        action: 'cancel',
        note: `Cancellation approved: ${input.note}`,
      });
    }
    execute(
      db,
      'UPDATE cancellation_requests SET status = ?, resolution_note = ?, decided_by = ?, decided_at = ? WHERE id = ?',
      input.decision === 'approve' ? 'completed' : 'rejected',
      input.note,
      req.user!.id,
      new Date().toISOString(),
      request.id,
    );
    audit(db, req.user!, `cancellation.${input.decision}`, 'cancellation_request', request.id, { status: request.status }, {
      status: input.decision === 'approve' ? 'completed' : 'rejected',
    });
    const order = queryOne<{ email: string; user_id: string; order_number: string }>(
      db,
      'SELECT email, user_id, order_number FROM orders WHERE id = ?',
      request.order_id,
    );
    if (order) {
      await notify(db, {
        userId: order.user_id,
        email: order.email,
        type: input.decision === 'approve' ? 'cancellation_approved' : 'cancellation_rejected',
        subject: `Cancellation request ${input.decision === 'approve' ? 'approved' : 'declined'} — ${order.order_number}`,
        body: `<p>${
          input.decision === 'approve'
            ? 'Your cancellation request was approved and a refund request has been recorded for review (no money has moved yet).'
            : 'After review, your cancellation request could not be approved.'
        }</p>${input.note ? `<p><strong>Note:</strong> ${escapeHtml(input.note)}</p>` : ''}`,
        dedupeKey: `cancellation-decision:${request.id}:${input.decision}`,
      });
    }
    res.json({ ok: true });
  });

  /* ----------------------------- Categories ---------------------------- */

  const categorySlug = z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.');

  function categoryRows() {
    return queryAll<Record<string, unknown>>(
      db,
      `SELECT c.*,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'approved') AS active_product_count,
              (SELECT COUNT(*) FROM categories child WHERE child.parent_id = c.id) AS child_count
         FROM categories c
        ORDER BY c.sort_order, c.name`,
    );
  }

  function assertCategoryParent(parentId: string | null | undefined, categoryId?: string): void {
    if (!parentId) return;
    if (categoryId && parentId === categoryId) throw badRequest('A category cannot be its own parent.');
    let cursor: string | null = parentId;
    for (let depth = 0; cursor && depth < 20; depth += 1) {
      const parent: { id: string; parent_id: string | null } | undefined = queryOne(
        db,
        'SELECT id, parent_id FROM categories WHERE id = ?',
        cursor,
      );
      if (!parent) throw badRequest('Choose a valid parent category.');
      if (categoryId && parent.parent_id === categoryId) throw badRequest('That parent would create a loop.');
      cursor = parent.parent_id;
    }
    if (cursor) throw badRequest('That category hierarchy is too deep.');
  }

  router.get('/categories', (_req, res) => {
    res.json({ categories: categoryRows() });
  });

  router.post('/categories', (req, res) => {
    const input = parse(
      z.object({
        name: z.string().trim().min(2, 'Enter a category name.').max(80),
        slug: categorySlug,
        description: z.string().trim().max(500).optional().default(''),
        imageUrl: z
          .string()
          .trim()
          .max(500)
          .optional()
          .default('')
          .refine((value) => !value || value.startsWith('/') || /^https:\/\//i.test(value), 'Use an https:// URL or a site-relative path.'),
        parentId: z.string().trim().max(80).nullable().optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional().default(0),
        isActive: z.boolean().optional().default(true),
      }),
      req.body,
    );
    if (queryOne(db, 'SELECT 1 FROM categories WHERE slug = ? COLLATE NOCASE', input.slug)) {
      throw conflict('A category with that slug already exists.', 'slug_in_use');
    }
    assertCategoryParent(input.parentId);
    const parentId = input.parentId || null;
    const id = newId('cat_');
    execute(
      db,
      `INSERT INTO categories (id, name, slug, parent_id, description, image_url, sort_order, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.slug,
      parentId,
      input.description || null,
      input.imageUrl || null,
      input.sortOrder,
      input.isActive ? 1 : 0,
      new Date().toISOString(),
    );
    audit(db, req.user!, 'category.created', 'category', id, null, {
      name: input.name,
      slug: input.slug,
      parentId,
    });
    res.status(201).json({ category: categoryRows().find((row) => row.id === id) });
  });

  router.patch('/categories/:id', (req, res) => {
    const current = queryOne<{
      id: string;
      name: string;
      slug: string;
      parent_id: string | null;
      description: string | null;
      image_url: string | null;
      sort_order: number;
      is_active: number;
    }>(db, 'SELECT * FROM categories WHERE id = ?', req.params.id);
    if (!current) throw notFound('Category not found.');
    const input = parse(
      z.object({
        name: z.string().trim().min(2).max(80).optional(),
        slug: categorySlug.optional(),
        description: z.string().trim().max(500).optional(),
        imageUrl: z
          .string()
          .trim()
          .max(500)
          .optional()
          .refine((value) => !value || value.startsWith('/') || /^https:\/\//i.test(value), 'Use an https:// URL or a site-relative path.'),
        parentId: z.string().trim().max(80).nullable().optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    if (input.slug && input.slug !== current.slug && queryOne(db, 'SELECT 1 FROM categories WHERE slug = ? COLLATE NOCASE AND id != ?', input.slug, current.id)) {
      throw conflict('A category with that slug already exists.', 'slug_in_use');
    }
    const nextParent = input.parentId === undefined ? current.parent_id : input.parentId || null;
    assertCategoryParent(nextParent, current.id);
    if (input.isActive === false && current.is_active === 1) {
      const activeProducts = queryOne<{ count: number }>(
        db,
        "SELECT COUNT(*) AS count FROM products WHERE category_id = ? AND status != 'archived'",
        current.id,
      );
      if ((activeProducts?.count ?? 0) > 0) {
        throw conflict('Move or archive this category’s products before deactivating it.', 'category_in_use');
      }
    }
    execute(
      db,
      `UPDATE categories SET name = ?, slug = ?, parent_id = ?, description = ?, image_url = ?,
              sort_order = ?, is_active = ? WHERE id = ?`,
      input.name ?? current.name,
      input.slug ?? current.slug,
      nextParent,
      input.description === undefined ? current.description : input.description || null,
      input.imageUrl === undefined ? current.image_url : input.imageUrl || null,
      input.sortOrder ?? current.sort_order,
      input.isActive === undefined ? current.is_active : input.isActive ? 1 : 0,
      current.id,
    );
    audit(db, req.user!, 'category.updated', 'category', current.id, {
      name: current.name,
      slug: current.slug,
      parent_id: current.parent_id,
      is_active: current.is_active,
    }, {
      name: input.name ?? current.name,
      slug: input.slug ?? current.slug,
      parent_id: nextParent,
      is_active: input.isActive === undefined ? current.is_active : input.isActive,
    });
    res.json({ category: categoryRows().find((row) => row.id === current.id) });
  });

  /* ----------------------------- Commissions --------------------------- */

  router.get('/commissions', (_req, res) => {
    const rules = queryAll<Record<string, unknown>>(
      db,
      `SELECT cr.*, c.name AS category_name, sp.business_name AS seller_name, u.email AS created_by_email
         FROM commission_rules cr
         LEFT JOIN categories c ON c.id = cr.category_id
         LEFT JOIN seller_profiles sp ON sp.id = cr.seller_id
         LEFT JOIN users u ON u.id = cr.created_by
        ORDER BY cr.is_active DESC, cr.effective_from DESC`,
    );
    const entries = queryAll<Record<string, unknown>>(
      db,
      `SELECT ce.id, ce.basis_paise, ce.rate_bp, ce.amount_paise, ce.created_at, so.reference,
              sp.business_name AS seller_name, o.order_number
         FROM commission_entries ce
         JOIN seller_orders so ON so.id = ce.seller_order_id
         JOIN seller_profiles sp ON sp.id = ce.seller_id
         JOIN orders o ON o.id = so.order_id
        ORDER BY ce.created_at DESC LIMIT 50`,
    );
    const summary = queryOne<{ booked: number; reversed: number; count: number }>(
      db,
      `SELECT COALESCE(SUM(amount_paise),0) AS booked,
              (SELECT COALESCE(SUM(-amount_paise),0) FROM seller_ledger_entries WHERE type = 'adjustment' AND reference LIKE 'refund:%:commission') AS reversed,
              COUNT(*) AS count
         FROM commission_entries`,
    );
    res.json({ rules, entries, summary, defaultRateBp: env.defaultCommissionBp });
  });

  router.post('/commissions', (req, res) => {
    const input = parse(
      z.object({
        scope: z.enum(['global', 'category', 'seller']),
        categoryId: z.string().optional(),
        sellerId: z.string().optional(),
        rateBp: z.number().int().min(0).max(5000),
        effectiveFrom: z.string().datetime().optional(),
      }),
      req.body,
    );
    if (input.scope === 'category') {
      if (!input.categoryId) throw badRequest('Choose a category.', { categoryId: 'Required.' });
      if (!queryOne(db, 'SELECT 1 FROM categories WHERE id = ?', input.categoryId)) throw badRequest('Category not found.');
    }
    if (input.scope === 'seller') {
      if (!input.sellerId) throw badRequest('Choose a seller.', { sellerId: 'Required.' });
      if (!queryOne(db, 'SELECT 1 FROM seller_profiles WHERE id = ?', input.sellerId)) throw badRequest('Seller not found.');
    }
    const effectiveFrom = input.effectiveFrom ?? new Date().toISOString();
    const id = newId('cmr_');
    tx(db, () => {
      execute(
        db,
        `UPDATE commission_rules SET is_active = 0
          WHERE is_active = 1 AND scope = ? AND COALESCE(category_id,'') = ? AND COALESCE(seller_id,'') = ?`,
        input.scope,
        input.categoryId ?? '',
        input.sellerId ?? '',
      );
      execute(
        db,
        `INSERT INTO commission_rules (id, scope, category_id, seller_id, rate_bp, is_active, effective_from, created_by)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        id,
        input.scope,
        input.scope === 'category' ? input.categoryId ?? null : null,
        input.scope === 'seller' ? input.sellerId ?? null : null,
        input.rateBp,
        effectiveFrom,
        req.user!.id,
      );
      audit(db, req.user!, 'commission_rule.created', 'commission_rule', id, null, {
        scope: input.scope,
        categoryId: input.categoryId ?? null,
        sellerId: input.sellerId ?? null,
        rateBp: input.rateBp,
        effectiveFrom,
      });
    });
    res.status(201).json({ id, rateBp: input.rateBp });
  });

  /* ----------------------------- Settlements --------------------------- */

  router.get('/settlements', async (_req, res) => {
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT sb.*, sp.business_name AS seller_name, sp.user_id AS seller_user_id,
              (SELECT COUNT(*) FROM settlement_items si WHERE si.batch_id = sb.id) AS entry_count
         FROM settlement_batches sb JOIN seller_profiles sp ON sp.id = sb.seller_id
        ORDER BY sb.created_at DESC`,
    );
    res.json({ settlements: rows });
  });

  router.get('/settlements/:id', (req, res) => {
    const batch = queryOne<Record<string, unknown> & { seller_id: string; status: string }>(
      db,
      `SELECT sb.*, sp.business_name AS seller_name FROM settlement_batches sb
        JOIN seller_profiles sp ON sp.id = sb.seller_id WHERE sb.id = ?`,
      req.params.id,
    );
    if (!batch) throw notFound('Settlement not found.');
    const items = queryAll<Record<string, unknown>>(
      db,
      `SELECT si.id, l.type, l.amount_paise, l.status AS ledger_status, l.reference, l.note, l.created_at,
              o.order_number
         FROM settlement_items si JOIN seller_ledger_entries l ON l.id = si.ledger_entry_id
         LEFT JOIN orders o ON o.id = l.order_id
        WHERE si.batch_id = ? ORDER BY l.created_at`,
      String(batch.id),
    );
    res.json({ settlement: batch, items });
  });

  router.post('/settlements', (req, res) => {
    const input = parse(
      z.object({
        sellerId: z.string().min(3),
        periodStart: z.string().datetime(),
        periodEnd: z.string().datetime(),
      }),
      req.body,
    );
    if (input.periodStart >= input.periodEnd) throw badRequest('The period start must be before the end.');
    const result = generateSettlement(db, req.user!, input.sellerId, input.periodStart, input.periodEnd);
    res.status(201).json(result);
  });

  router.post('/settlements/:id/pay', async (req, res) => {
    const input = parse(
      z.object({
        providerReference: z.string().trim().min(4).max(120),
        note: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const batch = queryOne<{ id: string; seller_id: string; net_paise: number; reference: string; status: string }>(
      db,
      'SELECT id, seller_id, net_paise, reference, status FROM settlement_batches WHERE id = ?',
      req.params.id,
    );
    if (!batch) throw notFound('Settlement not found.');
    markSettlementPaid(db, req.user!, batch.id, input.providerReference, input.note);
    const account = sellerUser(db, batch.seller_id);
    if (account) {
      await notify(db, {
        userId: account.user_id,
        email: account.email,
        type: 'settlement_paid',
        subject: `Settlement paid — ${batch.reference}`,
        body: `<p>Your settlement has been recorded as paid.</p>
          <p><strong>Amount:</strong> ₹${(batch.net_paise / 100).toLocaleString('en-IN')}<br/>
          <strong>Bank/UPI reference:</strong> ${input.providerReference.replaceAll('<', '&lt;')}</p>`,
        dedupeKey: `settlement-paid:${batch.id}`,
      });
    }
    res.json({ ok: true });
  });

  router.post('/sellers/:id/adjustments', (req, res) => {
    const input = parse(
      z.object({
        amountPaise: z.number().int().min(-10_000_000).max(10_000_000).refine((value) => value !== 0),
        note: z.string().trim().min(5).max(500),
      }),
      req.body,
    );
    const seller = queryOne<{ id: string }>(db, 'SELECT id FROM seller_profiles WHERE id = ?', req.params.id);
    if (!seller) throw notFound('Seller not found.');
    const id = newId('led_');
    try {
      execute(
        db,
        `INSERT INTO seller_ledger_entries (id, seller_id, type, amount_paise, status, reference, note, available_at, created_at)
         VALUES (?, ?, 'adjustment', ?, 'eligible', ?, ?, ?, ?)`,
        id,
        seller.id,
        input.amountPaise,
        `adjustment:${id}`,
        input.note,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    } catch {
      throw conflict('Could not record the adjustment.');
    }
    audit(db, req.user!, 'ledger.adjustment', 'seller', seller.id, null, {
      amountPaise: input.amountPaise,
      note: input.note,
    });
    res.status(201).json({ id });
  });

  /* ------------------------------ Customers ---------------------------- */

  router.get('/customers', (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const where = q ? 'WHERE u.email LIKE ? OR p.full_name LIKE ?' : '';
    const params = q ? [`%${q}%`, `%${q}%`] : [];
    const total = queryOne<{ count: number }>(
      db,
      `SELECT COUNT(*) AS count FROM users u LEFT JOIN profiles p ON p.id = u.id ${where}`,
      ...params,
    )?.count ?? 0;
    const rows = queryAll<{
      id: string;
      email: string;
      full_name: string | null;
      email_verified: number;
      is_disabled: number;
      created_at: string;
      order_count: number;
      paid_total: number;
      roles: string;
    }>(
      db,
      `SELECT u.id, u.email, p.full_name, u.email_verified, u.is_disabled, u.created_at,
              (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(total_paise),0) FROM orders WHERE user_id = u.id AND paid_at IS NOT NULL) AS paid_total,
              (SELECT GROUP_CONCAT(role) FROM user_roles WHERE user_id = u.id) AS roles
         FROM users u LEFT JOIN profiles p ON p.id = u.id ${where}
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    res.json({
      customers: rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        emailVerified: row.email_verified === 1,
        disabled: row.is_disabled === 1,
        createdAt: row.created_at,
        orderCount: row.order_count,
        paidTotalPaise: row.paid_total,
        roles: row.roles ? row.roles.split(',') : [],
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  /* ------------------------------- Reviews ----------------------------- */

  router.get('/reviews', (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT r.*, p.name AS product_name, p.slug AS product_slug, u.email,
              pr.full_name AS author_name, oi.order_id
         FROM reviews r
         JOIN products p ON p.id = r.product_id
         JOIN users u ON u.id = r.user_id
         LEFT JOIN profiles pr ON pr.id = u.id
         LEFT JOIN order_items oi ON oi.id = r.order_item_id
        ${status ? 'WHERE r.status = ?' : ''}
        ORDER BY CASE r.status WHEN 'published' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`,
      ...(status ? [status] : []),
    );
    res.json({ reviews: rows });
  });

  router.post('/reviews/:id/moderate', (req, res) => {
    const input = parse(z.object({ action: z.enum(['publish', 'reject']), reason: z.string().trim().max(300).optional() }), req.body);
    const review = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM reviews WHERE id = ?', req.params.id);
    if (!review) throw notFound('Review not found.');
    execute(db, 'UPDATE reviews SET status = ? WHERE id = ?', input.action === 'publish' ? 'published' : 'rejected', review.id);
    audit(db, req.user!, `review.${input.action}`, 'review', review.id, { status: review.status }, {
      status: input.action === 'publish' ? 'published' : 'rejected',
      reason: input.reason ?? null,
    });
    res.json({ ok: true });
  });

  /* ------------------------------- Content ----------------------------- */

  router.get('/content', (_req, res) => {
    res.json({ content: getSiteContent(db) });
  });

  router.put('/content', (req, res) => {
    const input = parse(
      z.object({
        key: z.enum(['announcement', 'homepage', 'about', 'sourcing', 'faq', 'credits', 'policies']),
        value: z.unknown(),
      }),
      req.body,
    );
    const serialized = JSON.stringify(input.value);
    if (serialized.length > 120_000) throw badRequest('Content is too large.');
    if (input.key === 'announcement') {
      parse(
        z.object({
          active: z.boolean(),
          text: z.string().trim().min(3).max(180),
          href: z.string().trim().max(200).optional(),
        }),
        input.value,
      );
    }
    if (input.key === 'homepage') {
      const homepage = parse(
        z.object({
          hero: z.object({
            eyebrow: z.string().max(80),
            title: z.string().max(140),
            body: z.string().max(600),
            image: z.string().max(300),
            imageAlt: z.string().max(240),
            imageCredit: z.string().max(240),
            ctaLabel: z.string().max(60),
            ctaHref: z.string().max(200),
          }),
          editorial: z.object({
            title: z.string().max(140),
            body: z.string().max(2000),
            signature: z.string().max(160),
            image: z.string().max(300),
            imageAlt: z.string().max(240),
            imageCredit: z.string().max(240),
          }),
          gifting: z.object({
            title: z.string().max(160),
            body: z.string().max(800),
            categorySlug: z.string().max(80),
          }),
          makerIntro: z.string().max(600),
        }),
        input.value,
      );
      if (input.key === 'homepage') {
        const before = getSiteContent(db).homepage;
        setSiteContent(db, 'homepage', homepage, req.user!.id);
        audit(db, req.user!, 'content.updated', 'site_content', 'homepage', before, homepage);
        res.json({ ok: true });
        return;
      }
    }
    if (input.key === 'policies') {
      const policies = input.value as Record<string, unknown>;
      for (const key of POLICY_KEYS) {
        if (!policies[key]) continue;
        parse(
          z.object({
            title: z.string().max(120),
            status: z.enum(['draft', 'published']),
            lastUpdated: z.string().max(80),
            summary: z.string().max(1200),
            sections: z.array(z.object({ heading: z.string().max(160), body: z.string().max(6000) })).min(1),
          }),
          policies[key],
        );
      }
    }
    const before = queryOne<{ value_json: string }>(db, 'SELECT value_json FROM site_content WHERE key = ?', input.key);
    setSiteContent(db, input.key, input.value, req.user!.id);
    audit(
      db,
      req.user!,
      'content.updated',
      'site_content',
      input.key,
      before ? JSON.parse(before.value_json) : null,
      input.value,
    );
    res.json({ ok: true });
  });

  /* -------------------------------- Coupons ---------------------------- */

  router.get('/coupons', (_req, res) => {
    const coupons = queryAll<Record<string, unknown>>(db, 'SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ coupons });
  });

  router.post('/coupons', (req, res) => {
    const input = parse(
      z.object({
        code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes, or underscores.'),
        description: z.string().trim().max(200).optional(),
        type: z.enum(['percent', 'fixed']),
        value: z.number().int().min(1).max(1_000_000),
        minOrderPaise: z.number().int().min(0).optional(),
        maxDiscountPaise: z.number().int().min(1).optional(),
        usageLimit: z.number().int().min(1).optional(),
        perUserLimit: z.number().int().min(1).max(10).optional(),
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
      }),
      req.body,
    );
    if (input.type === 'percent' && input.value > 90) throw badRequest('Percentage discount cannot exceed 90%.');
    if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt) throw badRequest('The coupon end must be after its start.');
    if (queryOne(db, 'SELECT 1 FROM coupons WHERE code = ? COLLATE NOCASE', input.code)) {
      throw conflict('A coupon with that code already exists.');
    }
    const id = newId('cpn_');
    execute(
      db,
      `INSERT INTO coupons (id, code, description, type, value, min_order_paise, max_discount_paise, usage_limit,
                            per_user_limit, starts_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.code.toUpperCase(),
      input.description ?? null,
      input.type,
      input.value,
      input.minOrderPaise ?? 0,
      input.maxDiscountPaise ?? null,
      input.usageLimit ?? null,
      input.perUserLimit ?? 1,
      input.startsAt ?? null,
      input.endsAt ?? null,
    );
    audit(db, req.user!, 'coupon.created', 'coupon', id, null, { code: input.code, type: input.type, value: input.value });
    res.status(201).json({ id });
  });

  router.patch('/coupons/:id', (req, res) => {
    const input = parse(z.object({ isActive: z.boolean() }), req.body);
    const coupon = queryOne<{ id: string; is_active: number }>(db, 'SELECT id, is_active FROM coupons WHERE id = ?', req.params.id);
    if (!coupon) throw notFound('Coupon not found.');
    execute(db, 'UPDATE coupons SET is_active = ? WHERE id = ?', input.isActive ? 1 : 0, coupon.id);
    audit(db, req.user!, 'coupon.status_changed', 'coupon', coupon.id, { isActive: coupon.is_active === 1 }, { isActive: input.isActive });
    res.json({ ok: true });
  });

  /* ------------------------------- Campaigns --------------------------- */

  const campaignAdminView = (row: CampaignRow) => {
    const stats = campaignStats(db, row.id);
    return {
      ...mapCampaign(row, stats.productCount, stats.maxDiscountPercent),
      storedStatus: row.status,
      isLive: effectiveCampaignStatus(row) === 'active',
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const assertPosterUrl = (url: string | null) => {
    if (!url) return;
    if (!/^(https?:\/\/|\/(?:images|uploads)\/)/.test(url) || /\s/.test(url)) {
      throw badRequest('Use an https image URL or an uploaded /images or /uploads path.', {
        posterUrl: 'Use a valid image URL.',
      });
    }
  };

  const assertCampaignUsableForPricing = (
    campaign: Pick<CampaignRow, 'id' | 'status' | 'starts_at' | 'ends_at' | 'max_discount_bp'>,
  ) => {
    validateCampaignWindow(campaign.starts_at, campaign.ends_at);
    const status = effectiveCampaignStatus(campaign);
    const rows = queryAll<{ product_id: string; promo_price_paise: number; price_paise: number; name: string }>(
      db,
      `SELECT cp.product_id, cp.promo_price_paise, p.price_paise, p.name
         FROM campaign_products cp JOIN products p ON p.id = cp.product_id
        WHERE cp.campaign_id = ?`,
      campaign.id,
    );
    for (const row of rows) {
      // A promotional price is never stored outside the campaign's own cap,
      // whichever editorial state the campaign is in.
      validatePromoPrice(row.price_paise, row.promo_price_paise, campaign.max_discount_bp);
      // Scheduled campaigns go live without further review, so they must not
      // share a product with another live or scheduled campaign.
      if (status === 'active' || status === 'scheduled') {
        assertProductNotInAnotherCampaign(db, campaign.id, row.product_id);
      }
    }
  };

  router.get('/campaigns', (_req, res) => {
    const rows = queryAll<CampaignRow>(db, 'SELECT * FROM campaigns ORDER BY created_at DESC');
    res.json({ campaigns: rows.map(campaignAdminView) });
  });

  router.post('/campaigns', (req, res) => {
    const input = parse(
      z.object({
        name: z.string().trim().min(3).max(120),
        slug: z
          .string()
          .trim()
          .max(80)
          .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and dashes.')
          .optional(),
        description: z.string().trim().max(4000).optional(),
        posterUrl: z.string().trim().max(600).nullish(),
        posterAlt: z.string().trim().max(300).nullish(),
        status: z.enum(['draft', 'active', 'archived']).optional(),
        startsAt: z.string().datetime().nullish(),
        endsAt: z.string().datetime().nullish(),
        maxDiscountBp: z.number().int().min(0).max(10000).optional(),
      }),
      req.body,
    );
    validateCampaignWindow(input.startsAt ?? null, input.endsAt ?? null);
    assertPosterUrl(input.posterUrl?.trim() || null);
    const slug =
      input.slug ||
      uniqueSlug(input.name, (candidate) => Boolean(queryOne(db, 'SELECT 1 FROM campaigns WHERE slug = ?', candidate)));
    if (queryOne(db, 'SELECT 1 FROM campaigns WHERE slug = ?', slug)) {
      throw conflict('That campaign URL is already in use.');
    }
    const id = newId('cmp_');
    execute(
      db,
      `INSERT INTO campaigns (id, name, slug, description, poster_url, poster_alt, status, starts_at, ends_at,
                              max_discount_bp, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      slug,
      input.description ?? '',
      input.posterUrl?.trim() || null,
      input.posterAlt?.trim() || null,
      input.status ?? 'draft',
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.maxDiscountBp ?? 3000,
      req.user!.id,
    );
    const row = getCampaignById(db, id)!;
    audit(db, req.user!, 'campaign.created', 'campaign', id, null, campaignAdminView(row));
    res.status(201).json({ campaign: campaignAdminView(row) });
  });

  router.patch('/campaigns/:id', (req, res) => {
    const input = parse(
      z.object({
        name: z.string().trim().min(3).max(120).optional(),
        slug: z
          .string()
          .trim()
          .max(80)
          .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and dashes.')
          .optional(),
        description: z.string().trim().max(4000).optional(),
        posterUrl: z.string().trim().max(600).nullable().optional(),
        posterAlt: z.string().trim().max(300).nullable().optional(),
        status: z.enum(['draft', 'active', 'archived']).optional(),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        maxDiscountBp: z.number().int().min(0).max(10000).optional(),
      }),
      req.body,
    );
    const existing = getCampaignById(db, String(req.params.id));
    if (!existing) throw notFound('Campaign not found.');

    const next = {
      name: input.name ?? existing.name,
      slug: input.slug ?? existing.slug,
      description: input.description ?? existing.description,
      poster_url: input.posterUrl === undefined ? existing.poster_url : input.posterUrl,
      poster_alt: input.posterAlt === undefined ? existing.poster_alt : input.posterAlt,
      status: input.status ?? existing.status,
      starts_at: input.startsAt === undefined ? existing.starts_at : input.startsAt,
      ends_at: input.endsAt === undefined ? existing.ends_at : input.endsAt,
      max_discount_bp: input.maxDiscountBp ?? existing.max_discount_bp,
    };

    if (next.slug !== existing.slug && queryOne(db, 'SELECT 1 FROM campaigns WHERE slug = ? AND id != ?', next.slug, existing.id)) {
      throw conflict('That campaign URL is already in use.');
    }
    validateCampaignWindow(next.starts_at, next.ends_at);
    assertPosterUrl(next.poster_url);
    // Validate before writing. An activation or cap reduction that conflicts
    // with another live campaign (or with an existing price) must leave the
    // stored campaign exactly as it was.
    assertCampaignUsableForPricing({ ...existing, ...next });
    execute(
      db,
      `UPDATE campaigns SET name = ?, slug = ?, description = ?, poster_url = ?, poster_alt = ?, status = ?,
                            starts_at = ?, ends_at = ?, max_discount_bp = ?, updated_at = ?
        WHERE id = ?`,
      next.name,
      next.slug,
      next.description,
      next.poster_url,
      next.poster_alt,
      next.status,
      next.starts_at,
      next.ends_at,
      next.max_discount_bp,
      new Date().toISOString(),
      existing.id,
    );
    const row = getCampaignById(db, existing.id)!;
    audit(db, req.user!, 'campaign.updated', 'campaign', existing.id, campaignAdminView(existing), campaignAdminView(row));
    res.json({ campaign: campaignAdminView(row) });
  });

  router.delete('/campaigns/:id', (req, res) => {
    const campaign = getCampaignById(db, String(req.params.id));
    if (!campaign) throw notFound('Campaign not found.');
    if (campaign.status !== 'draft') {
      throw conflict('Only draft campaigns can be deleted. Archive it instead to keep the record.');
    }
    execute(db, 'DELETE FROM campaigns WHERE id = ?', campaign.id);
    audit(db, req.user!, 'campaign.deleted', 'campaign', campaign.id, campaignAdminView(campaign), null);
    res.json({ ok: true });
  });

  router.post('/campaigns/:id/poster', imageUpload().single('image'), (req, res) => {
    const campaign = getCampaignById(db, String(req.params.id));
    if (!campaign) throw notFound('Campaign not found.');
    if (!req.file) throw badRequest('Choose an image file.');
    if (!hasValidFileSignature(req.file.path, 'image')) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw badRequest('That file does not look like a valid JPEG, PNG, or WebP image.');
    }
    const url = `/uploads/${path.basename(req.file.filename)}`;
    execute(
      db,
      'UPDATE campaigns SET poster_url = ?, updated_at = ? WHERE id = ?',
      url,
      new Date().toISOString(),
      campaign.id,
    );
    audit(db, req.user!, 'campaign.poster_updated', 'campaign', campaign.id, { posterUrl: campaign.poster_url }, { posterUrl: url });
    res.status(201).json({ posterUrl: url });
  });

  router.get('/campaigns/:id/products', (req, res) => {
    const campaign = getCampaignById(db, String(req.params.id));
    if (!campaign) throw notFound('Campaign not found.');
    const products = queryAll<{
      product_id: string;
      slug: string;
      name: string;
      image_url: string | null;
      price_paise: number;
      promo_price_paise: number;
      stock: number;
      product_status: string;
      seller_name: string;
    }>(
      db,
      `SELECT cp.product_id, p.slug, p.name, p.price_paise, cp.promo_price_paise, p.status AS product_status,
              i.quantity - i.reserved_quantity AS stock, s.business_name AS seller_name,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url
         FROM campaign_products cp
         JOIN products p ON p.id = cp.product_id
         JOIN seller_profiles s ON s.id = p.seller_id
         JOIN inventory i ON i.product_id = p.id
        WHERE cp.campaign_id = ?
        ORDER BY p.name`,
      campaign.id,
    );
    const priced = products.map((product) => ({
      productId: product.product_id,
      slug: product.slug,
      name: product.name,
      imageUrl: product.image_url,
      basePricePaise: product.price_paise,
      promoPricePaise: product.promo_price_paise,
      discountPercent: discountPercentFor(product.price_paise, product.promo_price_paise),
      stock: product.stock,
      status: product.product_status,
      sellerName: product.seller_name,
      isValid:
        product.promo_price_paise < product.price_paise &&
        (product.price_paise - product.promo_price_paise) * 10000 <= campaign.max_discount_bp * product.price_paise,
    }));
    res.json({ campaign: campaignAdminView(campaign), products: priced });
  });

  router.get('/campaigns/:id/candidates', (req, res) => {
    const campaign = getCampaignById(db, String(req.params.id));
    if (!campaign) throw notFound('Campaign not found.');
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const like = `%${q}%`;
    const rows = queryAll<{
      id: string;
      slug: string;
      name: string;
      price_paise: number;
      stock: number;
      seller_name: string;
      category_name: string;
      image_url: string | null;
    }>(
      db,
      `SELECT p.id, p.slug, p.name, p.price_paise, i.quantity - i.reserved_quantity AS stock,
              s.business_name AS seller_name, c.name AS category_name,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url
         FROM products p
         JOIN seller_profiles s ON s.id = p.seller_id
         JOIN categories c ON c.id = p.category_id
         JOIN inventory i ON i.product_id = p.id
        WHERE p.status = 'approved'
          ${q ? 'AND (p.name LIKE ? OR p.sku LIKE ? OR s.business_name LIKE ?)' : ''}
          AND p.id NOT IN (SELECT product_id FROM campaign_products WHERE campaign_id = ?)
        ORDER BY p.name
        LIMIT 20`,
      ...(q ? [like, like, like] : []),
      campaign.id,
    );
    res.json({
      candidates: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        basePricePaise: row.price_paise,
        stock: row.stock,
        sellerName: row.seller_name,
        categoryName: row.category_name,
        imageUrl: row.image_url,
        maxPromoPricePaise: Math.ceil((row.price_paise * (10000 - campaign.max_discount_bp)) / 10000),
      })),
    });
  });

  router.post('/campaigns/:id/products', (req, res) => {
    const input = parse(
      z.object({ productId: z.string().min(1), promoPricePaise: z.number().int().positive() }),
      req.body,
    );
    const campaign = getCampaignById(db, String(req.params.id));
    if (!campaign) throw notFound('Campaign not found.');
    const product = queryOne<{ id: string; name: string; price_paise: number; status: string; seller_status: string }>(
      db,
      `SELECT p.id, p.name, p.price_paise, p.status, s.status AS seller_status
         FROM products p JOIN seller_profiles s ON s.id = p.seller_id
        WHERE p.id = ?`,
      input.productId,
    );
    if (!product) throw notFound('Product not found.');
    if (product.status !== 'approved' || product.seller_status !== 'approved') {
      throw badRequest('Only products that are currently public can join a campaign.');
    }
    if (queryOne(db, 'SELECT 1 FROM campaign_products WHERE campaign_id = ? AND product_id = ?', campaign.id, product.id)) {
      throw conflict('That product is already in this campaign.');
    }
    const discountBp = validatePromoPrice(product.price_paise, input.promoPricePaise, campaign.max_discount_bp);
    // A scheduled campaign will become live without further review, so it must
    // not be promised the same product as another live or scheduled campaign.
    const campaignStatus = effectiveCampaignStatus(campaign);
    if (campaignStatus === 'active' || campaignStatus === 'scheduled') {
      assertProductNotInAnotherCampaign(db, campaign.id, product.id);
    }
    execute(
      db,
      'INSERT INTO campaign_products (campaign_id, product_id, promo_price_paise) VALUES (?, ?, ?)',
      campaign.id,
      product.id,
      input.promoPricePaise,
    );
    audit(
      db,
      req.user!,
      'campaign.product_added',
      'campaign',
      campaign.id,
      null,
      { productId: product.id, name: product.name, promoPricePaise: input.promoPricePaise, discountBp },
    );
    res.status(201).json({ ok: true });
  });

  router.patch('/campaigns/:id/products/:productId', (req, res) => {
    const input = parse(z.object({ promoPricePaise: z.number().int().positive() }), req.body);
    const campaign = getCampaignById(db, String(req.params.id));
    if (!campaign) throw notFound('Campaign not found.');
    const product = queryOne<{ id: string; name: string; price_paise: number }>(
      db,
      `SELECT cp.product_id AS id, p.name, p.price_paise
         FROM campaign_products cp JOIN products p ON p.id = cp.product_id
        WHERE cp.campaign_id = ? AND cp.product_id = ?`,
      campaign.id,
      String(req.params.productId),
    );
    if (!product) throw notFound('That product is not part of this campaign.');
    const discountBp = validatePromoPrice(product.price_paise, input.promoPricePaise, campaign.max_discount_bp);
    const before = queryOne<{ promo_price_paise: number }>(
      db,
      'SELECT promo_price_paise FROM campaign_products WHERE campaign_id = ? AND product_id = ?',
      campaign.id,
      product.id,
    );
    execute(
      db,
      'UPDATE campaign_products SET promo_price_paise = ? WHERE campaign_id = ? AND product_id = ?',
      input.promoPricePaise,
      campaign.id,
      product.id,
    );
    audit(
      db,
      req.user!,
      'campaign.product_price_changed',
      'campaign',
      campaign.id,
      { productId: product.id, promoPricePaise: before?.promo_price_paise },
      { productId: product.id, name: product.name, promoPricePaise: input.promoPricePaise, discountBp },
    );
    res.json({ ok: true });
  });

  router.delete('/campaigns/:id/products/:productId', (req, res) => {
    const campaign = getCampaignById(db, String(req.params.id));
    if (!campaign) throw notFound('Campaign not found.');
    const result = execute(
      db,
      'DELETE FROM campaign_products WHERE campaign_id = ? AND product_id = ?',
      campaign.id,
      String(req.params.productId),
    );
    if (result.changes === 0) throw notFound('That product is not part of this campaign.');
    audit(db, req.user!, 'campaign.product_removed', 'campaign', campaign.id, null, {
      productId: req.params.productId,
    });
    res.json({ ok: true });
  });

  /* -------------------------------- Support ---------------------------- */

  router.get('/support', (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM support_tickets ${status ? 'WHERE status = ?' : ''} ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`,
      ...(status ? [status] : []),
    );
    res.json({ tickets: rows });
  });

  router.patch('/support/:id', (req, res) => {
    const input = parse(z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']) }), req.body);
    const ticket = queryOne<{ id: string; status: string }>(db, 'SELECT id, status FROM support_tickets WHERE id = ?', req.params.id);
    if (!ticket) throw notFound('Ticket not found.');
    execute(db, 'UPDATE support_tickets SET status = ? WHERE id = ?', input.status, ticket.id);
    audit(db, req.user!, 'support.status_changed', 'support_ticket', ticket.id, { status: ticket.status }, { status: input.status });
    res.json({ ok: true });
  });

  /* --------------------------------- Audit ----------------------------- */

  router.get('/audit', (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (entityType) {
      conditions.push('entity_type = ?');
      params.push(entityType);
    }
    if (q) {
      conditions.push('(action LIKE ? OR actor_email LIKE ? OR entity_id LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = queryOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM audit_logs ${where}`, ...params)?.count ?? 0;
    const rows = queryAll<Record<string, unknown>>(
      db,
      `SELECT id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at
         FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    res.json({
      logs: rows.map((row) => ({
        ...row,
        before: row.before_json ? JSON.parse(String(row.before_json)) : null,
        after: row.after_json ? JSON.parse(String(row.after_json)) : null,
        before_json: undefined,
        after_json: undefined,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  /* -------------------------------- Settings --------------------------- */

  router.get('/settings', (_req, res) => {
    const policies = getSiteContent(db).policies;
    const counts = queryOne<Record<string, number>>(
      db,
      `SELECT
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM orders) AS orders,
        (SELECT COUNT(*) FROM seller_profiles) AS sellers,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM audit_logs) AS audit_logs,
        (SELECT COUNT(*) FROM notifications WHERE status = 'failed') AS failed_emails`,
    );
    res.json({
      integrations: {
        payments: paymentProviderStatus(),
        razorpay: {
          keyIdConfigured: Boolean(env.razorpay.keyId),
          keySecretConfigured: Boolean(env.razorpay.keySecret),
          webhookSecretConfigured: Boolean(env.razorpay.webhookSecret),
        },
        email: {
          configured: env.email.configured,
          provider: env.email.provider,
          from: env.email.from,
          supportEmail: env.email.supportEmail,
          adminNotificationEmail: env.email.adminNotificationEmail,
        },
        shipping: { provider: 'manual', shiprocketConfigured: env.shiprocket.configured },
        monitoring: { sentryConfigured: Boolean(env.sentryDsn) },
      },
      configIssues: assertProductionConfig(),
      environment: env.nodeEnv,
      policies: Object.fromEntries(Object.entries(policies).map(([key, policy]) => [key, policy.status])),
      counts: counts ?? {},
      notifications: notificationQueueSummary(db),
      settlementNote:
        'Settlements are recorded with a manual bank/UPI reference. Automated marketplace payouts require separate provider approval and are not enabled.',
    });
  });

  return router;
}
