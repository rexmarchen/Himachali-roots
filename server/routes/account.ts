import { Router } from 'express';
import { z } from 'zod';
import { execute, queryAll, queryOne, tx, type Db } from '../db.js';
import { env } from '../env.js';
import { hasUsablePassword, hashPassword, requireAuth, sessionToken, sha256, verifyPassword } from '../lib/auth.js';
import { badRequest, conflict, notFound, parse, unauthorized } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { getOrderView, requestCancellation, requestReturn, validateAddress } from '../lib/orders.js';
import { notify, escapeHtml } from '../lib/email.js';
import { audit } from '../lib/audit.js';

const addressBody = z.object({
  label: z.string().trim().min(1).max(30).optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(15),
  line1: z.string().trim().min(4).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.'),
  isDefault: z.boolean().optional(),
});

export function accountRouter(db: Db): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const profile = queryOne<{
      full_name: string;
      phone: string | null;
      marketing_consent: number;
      deletion_requested_at: string | null;
    }>(db, 'SELECT full_name, phone, marketing_consent, deletion_requested_at FROM profiles WHERE id = ?', req.user!.id);
    const counts = queryOne<{ orders: number; wishlist: number; addresses: number; returns: number }>(
      db,
      `SELECT
        (SELECT COUNT(*) FROM orders WHERE user_id = ?) AS orders,
        (SELECT COUNT(*) FROM wishlist_items WHERE user_id = ?) AS wishlist,
        (SELECT COUNT(*) FROM addresses WHERE user_id = ?) AS addresses,
        (SELECT COUNT(*) FROM return_requests WHERE user_id = ?) AS returns`,
      req.user!.id,
      req.user!.id,
      req.user!.id,
      req.user!.id,
    );
    res.json({
      profile: {
        fullName: profile?.full_name ?? '',
        email: req.user!.email,
        phone: profile?.phone ?? null,
        marketingConsent: profile?.marketing_consent === 1,
        emailVerified: req.user!.emailVerified,
        deletionRequestedAt: profile?.deletion_requested_at ?? null,
        roles: req.user!.roles,
      },
      counts: counts ?? { orders: 0, wishlist: 0, addresses: 0, returns: 0 },
    });
  });

  router.patch('/', (req, res) => {
    const input = parse(
      z.object({
        fullName: z.string().trim().min(2).max(120),
        phone: z.union([z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.'), z.literal('')]).optional(),
        marketingConsent: z.boolean(),
      }),
      req.body,
    );
    execute(
      db,
      'UPDATE profiles SET full_name = ?, phone = ?, marketing_consent = ?, updated_at = ? WHERE id = ?',
      input.fullName,
      input.phone || null,
      input.marketingConsent ? 1 : 0,
      new Date().toISOString(),
      req.user!.id,
    );
    const email = req.user!.email;
    if (input.marketingConsent) {
      execute(
        db,
        `INSERT INTO newsletter_subscribers (id, email, consent_at, source) VALUES (?, ?, ?, 'account')
         ON CONFLICT(email) DO UPDATE SET consent_at = excluded.consent_at, unsubscribed_at = NULL`,
        newId('nws_'),
        email,
        new Date().toISOString(),
      );
    } else {
      execute(
        db,
        'UPDATE newsletter_subscribers SET unsubscribed_at = ? WHERE email = ? AND unsubscribed_at IS NULL',
        new Date().toISOString(),
        email,
      );
    }
    res.json({ ok: true });
  });

  router.post('/password', (req, res) => {
    const input = parse(
      z.object({
        currentPassword: z.string().max(200).optional().default(''),
        newPassword: z
          .string()
          .min(10, 'Use at least 10 characters.')
          .max(200, 'That password is too long.')
          .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), 'Include at least one letter and one number.'),
      }),
      req.body,
    );
    const user = queryOne<{ password_hash: string }>(db, 'SELECT password_hash FROM users WHERE id = ?', req.user!.id);
    if (!user) throw unauthorized();
    const hasPassword = hasUsablePassword(user.password_hash);
    if (hasPassword && !verifyPassword(input.currentPassword, user.password_hash)) {
      throw unauthorized('Your current password is not correct.');
    }
    if (!hasPassword && input.currentPassword) {
      throw badRequest('This account has no password yet. Leave the current password blank to set one.');
    }
    const token = sessionToken(req);
    tx(db, () => {
      execute(
        db,
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        hashPassword(input.newPassword),
        new Date().toISOString(),
        req.user!.id,
      );
      if (token) {
        execute(db, 'DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', req.user!.id, sha256(token));
      }
    });
    res.json({ ok: true, message: 'Password updated.' });
  });

  router.post('/deletion-request', async (req, res) => {
    const input = parse(z.object({ reason: z.string().trim().max(1000).optional() }), req.body);
    const now = new Date().toISOString();
    execute(db, 'UPDATE profiles SET deletion_requested_at = COALESCE(deletion_requested_at, ?) WHERE id = ?', now, req.user!.id);
    audit(db, req.user!, 'account.deletion_requested', 'user', req.user!.id, null, { reason: input.reason ?? null });
    await notify(db, {
      email: env.email.supportEmail,
      type: 'account_deletion_request',
      subject: `Account deletion request — ${req.user!.email}`,
      body: `<p>The customer requested account deletion.</p><p><strong>Account:</strong> ${escapeHtml(req.user!.email)}<br/><strong>Reason:</strong> ${escapeHtml(input.reason ?? 'Not provided')}</p>`,
      dedupeKey: `deletion:${req.user!.id}`,
    });
    res.json({
      ok: true,
      message:
        'Your request has been recorded. We will review it against record-retention obligations and contact you before deleting anything.',
    });
  });

  router.get('/addresses', (req, res) => {
    const rows = queryAll<{
      id: string;
      label: string;
      full_name: string;
      phone: string;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      pincode: string;
      is_default: number;
    }>(db, 'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', req.user!.id);
    res.json({
      addresses: rows.map((row) => ({
        id: row.id,
        label: row.label,
        fullName: row.full_name,
        phone: row.phone,
        line1: row.line1,
        line2: row.line2,
        city: row.city,
        state: row.state,
        pincode: row.pincode,
        isDefault: row.is_default === 1,
      })),
    });
  });

  router.post('/addresses', (req, res) => {
    const input = parse(addressBody, req.body);
    validateAddress({ ...input, line2: input.line2 });
    const count = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM addresses WHERE user_id = ?', req.user!.id);
    const isDefault = input.isDefault || (count?.count ?? 0) === 0;
    const id = newId('adr_');
    tx(db, () => {
      if (isDefault) execute(db, 'UPDATE addresses SET is_default = 0 WHERE user_id = ?', req.user!.id);
      execute(
        db,
        `INSERT INTO addresses (id, user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        req.user!.id,
        input.label || 'Home',
        input.fullName,
        input.phone,
        input.line1,
        input.line2 || null,
        input.city,
        input.state,
        input.pincode,
        isDefault ? 1 : 0,
      );
    });
    res.status(201).json({ id });
  });

  router.patch('/addresses/:id', (req, res) => {
    const input = parse(addressBody, req.body);
    validateAddress({ ...input, line2: input.line2 });
    const existing = queryOne<{ id: string }>(db, 'SELECT id FROM addresses WHERE id = ? AND user_id = ?', req.params.id, req.user!.id);
    if (!existing) throw notFound('Address not found.');
    tx(db, () => {
      if (input.isDefault) execute(db, 'UPDATE addresses SET is_default = 0 WHERE user_id = ?', req.user!.id);
      execute(
        db,
        `UPDATE addresses SET label = ?, full_name = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?, pincode = ?,
                is_default = CASE WHEN ? = 1 THEN 1 ELSE is_default END
          WHERE id = ? AND user_id = ?`,
        input.label || 'Home',
        input.fullName,
        input.phone,
        input.line1,
        input.line2 || null,
        input.city,
        input.state,
        input.pincode,
        input.isDefault ? 1 : 0,
        req.params.id,
        req.user!.id,
      );
    });
    res.json({ ok: true });
  });

  router.delete('/addresses/:id', (req, res) => {
    execute(db, 'DELETE FROM addresses WHERE id = ? AND user_id = ?', req.params.id, req.user!.id);
    const remaining = queryOne<{ id: string }>(
      db,
      'SELECT id FROM addresses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      req.user!.id,
    );
    if (remaining) execute(db, 'UPDATE addresses SET is_default = 1 WHERE id = ?', remaining.id);
    res.json({ ok: true });
  });

  router.post('/addresses/:id/default', (req, res) => {
    tx(db, () => {
      execute(db, 'UPDATE addresses SET is_default = 0 WHERE user_id = ?', req.user!.id);
      const result = execute(
        db,
        'UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?',
        req.params.id,
        req.user!.id,
      );
      if (Number(result.changes) === 0) throw notFound('Address not found.');
    });
    res.json({ ok: true });
  });

  router.get('/orders', (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = 10;
    const total = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM orders WHERE user_id = ?', req.user!.id)?.count ?? 0;
    const rows = queryAll<{
      id: string;
      order_number: string;
      status: string;
      total_paise: number;
      placed_at: string;
      paid_at: string | null;
      item_count: number;
      image_url: string | null;
      title: string;
      seller_count: number;
      shipment_status: string | null;
    }>(
      db,
      `SELECT o.id, o.order_number, o.status, o.total_paise, o.placed_at, o.paid_at,
              (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count,
              (SELECT name FROM order_items WHERE order_id = o.id LIMIT 1) AS title,
              (SELECT image_url FROM order_items WHERE order_id = o.id LIMIT 1) AS image_url,
              (SELECT COUNT(*) FROM seller_orders WHERE order_id = o.id) AS seller_count,
              (SELECT s.status FROM shipments s JOIN seller_orders so ON so.id = s.seller_order_id
                WHERE so.order_id = o.id ORDER BY s.shipped_at DESC LIMIT 1) AS shipment_status
         FROM orders o WHERE o.user_id = ? ORDER BY o.placed_at DESC LIMIT ? OFFSET ?`,
      req.user!.id,
      pageSize,
      (page - 1) * pageSize,
    );
    res.json({
      items: rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        totalPaise: row.total_paise,
        placedAt: row.placed_at,
        paidAt: row.paid_at,
        itemCount: row.item_count ?? 0,
        title: row.title ?? '',
        imageUrl: row.image_url,
        sellerCount: row.seller_count,
        shipmentStatus: row.shipment_status,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  });

  router.get('/orders/:orderNumber', (req, res) => {
    const order = queryOne<{ id: string; user_id: string }>(
      db,
      'SELECT id, user_id FROM orders WHERE order_number = ?',
      req.params.orderNumber,
    );
    if (!order || order.user_id !== req.user!.id) throw notFound('Order not found.');
    res.json({ order: getOrderView(db, order.id) });
  });

  router.post('/orders/:orderNumber/cancel', async (req, res) => {
    const input = parse(
      z.object({ sellerOrderId: z.string().min(3).max(80), reason: z.string().trim().min(10, 'Tell us briefly why.').max(1000) }),
      req.body,
    );
    const order = queryOne<{ id: string; user_id: string; email: string; order_number: string }>(
      db,
      'SELECT id, user_id, email, order_number FROM orders WHERE order_number = ?',
      req.params.orderNumber,
    );
    if (!order || order.user_id !== req.user!.id) throw notFound('Order not found.');
    const result = requestCancellation(db, {
      orderId: order.id,
      sellerOrderId: input.sellerOrderId,
      userId: req.user!.id,
      actor: req.user!,
      reason: input.reason,
    });
    await notify(db, {
      userId: order.user_id,
      email: order.email,
      type: result.status === 'completed' ? 'order_cancelled' : 'cancellation_requested',
      subject:
        result.status === 'completed'
          ? `Order ${order.order_number} cancelled`
          : `Cancellation requested for order ${order.order_number}`,
      body: `<p>${
        result.status === 'completed'
          ? 'Your cancellation request was processed. A refund request has been recorded for review; no money has moved yet.'
          : 'Your cancellation request has been received by our support team and is being reviewed.'
      }</p><p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>`,
      dedupeKey: `cust-cancel:${order.id}:${input.sellerOrderId}`,
    });
    res.json(result);
  });

  router.post('/orders/:orderNumber/returns', async (req, res) => {
    const input = parse(
      z.object({
        sellerOrderId: z.string().min(3).max(80),
        reason: z.string().trim().min(3).max(200),
        description: z.string().trim().max(2000).optional(),
        items: z
          .array(
            z.object({
              orderItemId: z.string().min(3).max(80),
              quantity: z.number().int().min(1).max(99),
            }),
          )
          .min(1)
          .max(50)
          .optional(),
      }),
      req.body,
    );
    const order = queryOne<{ id: string; user_id: string; email: string; order_number: string }>(
      db,
      'SELECT id, user_id, email, order_number FROM orders WHERE order_number = ?',
      req.params.orderNumber,
    );
    if (!order || order.user_id !== req.user!.id) throw notFound('Order not found.');
    const result = requestReturn(db, {
      orderId: order.id,
      sellerOrderId: input.sellerOrderId,
      userId: req.user!.id,
      reason: input.reason,
      description: input.description,
      items: input.items,
    });

    await notify(db, {
      userId: order.user_id,
      email: order.email,
      type: 'return_requested',
      subject: `Return request received for ${order.order_number}`,
      body: `<p>We have received your return request for <strong>₹${(result.amountPaise / 100).toLocaleString('en-IN')}</strong>. Our team will review it within the published returns policy.</p><p>Approval records a refund request only; no money has moved at this stage.</p><p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>`,
      dedupeKey: `return-requested:${result.id}`,
    });

    const seller = queryOne<{ email: string; user_id: string; business_name: string }>(
      db,
      `SELECT u.email, u.id AS user_id, sp.business_name
         FROM seller_orders so
         JOIN seller_profiles sp ON sp.id = so.seller_id
         JOIN users u ON u.id = sp.user_id
        WHERE so.id = ?`,
      input.sellerOrderId,
    );
    if (seller) {
      await notify(db, {
        userId: seller.user_id,
        email: seller.email,
        type: 'seller_return_requested',
        subject: `Return request for ${order.order_number}`,
        body: `<p>A customer requested a return for part of this shipment.</p><p><strong>Reason:</strong> ${escapeHtml(input.reason)}</p><p>Review the request in your seller dashboard and wait for the marketplace team's decision.</p>`,
        dedupeKey: `seller-return-requested:${result.id}`,
      });
    }

    await notify(db, {
      email: env.email.adminNotificationEmail,
      type: 'admin_return_requested',
      subject: `Return review needed — ${order.order_number}`,
      body: `<p>A return request was submitted for <strong>₹${(result.amountPaise / 100).toLocaleString('en-IN')}</strong>.</p><p><strong>Order:</strong> ${escapeHtml(order.order_number)}<br/><strong>Reason:</strong> ${escapeHtml(input.reason)}</p>`,
      dedupeKey: `admin-return-requested:${result.id}`,
    });

    res.status(201).json({
      id: result.id,
      amountPaise: result.amountPaise,
      message: 'Return request submitted for review. No refund has been issued yet.',
    });
  });

  router.get('/requests', (req, res) => {
    const returns = queryAll<{
      id: string;
      order_number: string;
      seller_name: string;
      reason: string;
      status: string;
      created_at: string;
    }>(
      db,
      `SELECT r.id, o.order_number, sp.business_name AS seller_name, r.reason, r.status, r.created_at
         FROM return_requests r JOIN orders o ON o.id = r.order_id
         LEFT JOIN seller_orders so ON so.id = r.seller_order_id
         LEFT JOIN seller_profiles sp ON sp.id = so.seller_id
        WHERE r.user_id = ? ORDER BY r.created_at DESC`,
      req.user!.id,
    );
    const cancellations = queryAll<{
      id: string;
      order_number: string;
      reason: string;
      status: string;
      created_at: string;
      resolution_note: string | null;
    }>(
      db,
      `SELECT c.id, o.order_number, c.reason, c.status, c.created_at, c.resolution_note
         FROM cancellation_requests c JOIN orders o ON o.id = c.order_id
        WHERE c.user_id = ? ORDER BY c.created_at DESC`,
      req.user!.id,
    );
    res.json({
      returns: returns.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        sellerName: row.seller_name,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
      })),
      cancellations: cancellations.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        reason: row.reason,
        status: row.status,
        resolutionNote: row.resolution_note,
        createdAt: row.created_at,
      })),
    });
  });

  router.get('/wishlist', (req, res) => {
    const rows = queryAll<{
      product_id: string;
      slug: string;
      name: string;
      price_paise: number;
      image_url: string | null;
      image_alt: string | null;
      seller_name: string;
      stock: number;
      product_status: string;
    }>(
      db,
      `SELECT w.product_id, p.slug, p.name, p.price_paise, p.status AS product_status,
              s.business_name AS seller_name, i.quantity - i.reserved_quantity AS stock,
              (SELECT url FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url,
              (SELECT alt FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_alt
         FROM wishlist_items w
         JOIN products p ON p.id = w.product_id
         JOIN seller_profiles s ON s.id = p.seller_id
         JOIN inventory i ON i.product_id = p.id
        WHERE w.user_id = ? ORDER BY w.created_at DESC`,
      req.user!.id,
    );
    res.json({
      items: rows.map((row) => ({
        productId: row.product_id,
        slug: row.slug,
        name: row.name,
        pricePaise: row.price_paise,
        imageUrl: row.image_url,
        imageAlt: row.image_alt,
        sellerName: row.seller_name,
        stock: row.stock,
        available: row.product_status === 'approved' && row.stock > 0,
      })),
    });
  });

  router.post('/wishlist/:productId', (req, res) => {
    const product = queryOne<{ id: string }>(
      db,
      `SELECT p.id FROM products p JOIN seller_profiles s ON s.id = p.seller_id
        WHERE p.id = ? AND p.status = 'approved' AND s.status = 'approved' AND s.store_status = 'active'`,
      req.params.productId,
    );
    if (!product) throw notFound('Product not found.');
    execute(
      db,
      'INSERT OR IGNORE INTO wishlist_items (id, user_id, product_id) VALUES (?, ?, ?)',
      newId('wsh_'),
      req.user!.id,
      product.id,
    );
    res.status(201).json({ ok: true });
  });

  router.delete('/wishlist/:productId', (req, res) => {
    execute(db, 'DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?', req.user!.id, req.params.productId);
    res.json({ ok: true });
  });

  router.post('/reviews', async (req, res) => {
    const input = parse(
      z.object({
        orderItemId: z.string().min(3).max(80),
        rating: z.number().int().min(1).max(5),
        title: z.string().trim().max(120).optional(),
        body: z.string().trim().min(20, 'Write at least 20 characters.').max(2000),
      }),
      req.body,
    );
    const item = queryOne<{
      id: string;
      product_id: string;
      status: string;
      user_id: string;
      order_number: string;
      product_slug: string;
      seller_user: string;
    }>(
      db,
      `SELECT oi.id, oi.product_id, oi.status, o.user_id, o.order_number, p.slug AS product_slug,
              sp.user_id AS seller_user
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         JOIN seller_profiles sp ON sp.id = oi.seller_id
        WHERE oi.id = ?`,
      input.orderItemId,
    );
    if (!item || item.user_id !== req.user!.id) throw notFound('Order item not found.');
    if (item.status !== 'delivered') throw conflict('Reviews open after delivery.');
    const existing = queryOne<{ id: string }>(db, 'SELECT id FROM reviews WHERE order_item_id = ?', item.id);
    if (existing) throw conflict('You have already reviewed this item.');
    const id = newId('rev_');
    execute(
      db,
      `INSERT INTO reviews (id, product_id, user_id, order_item_id, rating, title, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      item.product_id,
      req.user!.id,
      item.id,
      input.rating,
      input.title || null,
      input.body,
    );
    await notify(db, {
      email: env.email.supportEmail,
      type: 'review_submitted',
      subject: `New ${input.rating}-star review`,
      body: `<p>A verified purchase review was published for ${escapeHtml(item.product_slug)}.</p><p>It can be removed from the admin review queue if it breaches the review policy.</p>`,
      dedupeKey: `review:${id}`,
    });
    res.status(201).json({ id, message: 'Thank you — your review is published with a verified-purchase marker.' });
  });

  router.get('/notifications', (req, res) => {
    const rows = queryAll<{
      id: string;
      type: string;
      subject: string;
      status: string;
      created_at: string;
      sent_at: string | null;
    }>(
      db,
      'SELECT id, type, subject, status, created_at, sent_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      req.user!.id,
    );
    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        type: row.type,
        subject: row.subject,
        status: row.status,
        createdAt: row.created_at,
        sentAt: row.sent_at,
      })),
    });
  });

  return router;
}
