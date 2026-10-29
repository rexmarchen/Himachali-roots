import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { execute, queryOne, type Db } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { addToCart, CART_COOKIE, ensureCart, getCartView, removeCartItem, setCartCookie, updateCartItem } from '../lib/cart.js';
import { badRequest, conflict, notFound, parse, unauthorized } from '../lib/http.js';
import { createOrder, getOrderView, initializeOrderPayment, markOrderPaid, notifyOrderPaid } from '../lib/orders.js';
import { evaluateCoupon } from '../lib/pricing.js';
import { createRazorpayOrder, verifyCheckoutSignature, verifyWebhookSignature } from '../lib/payments.js';
import { notify } from '../lib/email.js';

const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(15),
  line1: z.string().trim().min(4).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code.'),
});

function cartTokenFrom(req: { cookies?: unknown }): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[CART_COOKIE] ?? null;
}

export function shopRouter(db: Db): Router {
  const router = Router();

  router.get('/cart', (req, res) => {
    const { cart, token } = ensureCart(db, req.user?.id ?? null, cartTokenFrom(req));
    setCartCookie(res, token);
    res.json({ cart: getCartView(db, cart.id) });
  });

  router.post('/cart/items', (req, res) => {
    const input = parse(
      z.object({ productId: z.string().min(3).max(80), quantity: z.number().int().min(1).max(99) }),
      req.body,
    );
    const { cart, token } = ensureCart(db, req.user?.id ?? null, cartTokenFrom(req));
    setCartCookie(res, token);
    addToCart(db, cart.id, input.productId, input.quantity);
    res.status(201).json({ cart: getCartView(db, cart.id) });
  });

  router.patch('/cart/items/:productId', (req, res) => {
    const input = parse(z.object({ quantity: z.number().int().min(0).max(99) }), req.body);
    const { cart, token } = ensureCart(db, req.user?.id ?? null, cartTokenFrom(req));
    setCartCookie(res, token);
    updateCartItem(db, cart.id, req.params.productId, input.quantity);
    res.json({ cart: getCartView(db, cart.id) });
  });

  router.delete('/cart/items/:productId', (req, res) => {
    const { cart, token } = ensureCart(db, req.user?.id ?? null, cartTokenFrom(req));
    setCartCookie(res, token);
    removeCartItem(db, cart.id, req.params.productId);
    res.json({ cart: getCartView(db, cart.id) });
  });

  router.post('/coupons/validate', requireAuth, (req, res) => {
    const input = parse(z.object({ code: z.string().trim().min(2).max(40) }), req.body);
    const { cart } = ensureCart(db, req.user!.id, cartTokenFrom(req));
    const view = getCartView(db, cart.id);
    if (view.lines.length === 0) throw badRequest('Your bag is empty.');
    const result = evaluateCoupon(db, input.code, req.user!.id, view.subtotalPaise);
    res.json({
      code: result.coupon.code,
      description: result.coupon.description,
      discountPaise: result.discountPaise,
      subtotalPaise: view.subtotalPaise,
    });
  });

  router.post('/checkout', requireAuth, async (req, res) => {
    const input = parse(
      z.object({
        address: addressSchema,
        couponCode: z.string().trim().max(40).optional(),
        customerNote: z.string().trim().max(500).optional(),
        idempotencyKey: z.string().trim().min(16, 'Missing checkout key. Refresh and try again.').max(100),
      }),
      req.body,
    );
    const { cart } = ensureCart(db, req.user!.id, cartTokenFrom(req));
    const created = createOrder(db, {
      userId: req.user!.id,
      email: req.user!.email,
      cartId: cart.id,
      address: input.address,
      couponCode: input.couponCode || undefined,
      customerNote: input.customerNote,
      idempotencyKey: input.idempotencyKey,
      isDemo: env.simulatedCheckoutEnabled || env.allowDevPayments,
    });

    let payment;
    try {
      payment = await initializeOrderPayment(db, created.orderId, req.user!.id);
    } catch (error) {
      payment = {
        provider: 'unconfigured' as const,
        amountPaise: created.totalPaise,
        orderNumber: created.orderNumber,
        devPaymentsEnabled: env.allowDevPayments || env.simulatedCheckoutEnabled,
        message:
          error instanceof Error
            ? `Order saved, but payment could not be started: ${error.message}`
            : 'Order saved, but payment could not be started.',
      };
    }

    const order = getOrderView(db, created.orderId);
    res.status(201).json({ order, payment });
  });

  router.get('/orders/:orderNumber', requireAuth, (req, res) => {
    const order = queryOne<{ id: string; user_id: string }>(
      db,
      'SELECT id, user_id FROM orders WHERE order_number = ?',
      String(req.params.orderNumber),
    );
    if (!order) throw notFound('Order not found.');
    if (order.user_id !== req.user!.id && !req.user!.roles.includes('admin')) {
      throw notFound('Order not found.');
    }
    res.json({ order: getOrderView(db, order.id) });
  });

  router.post('/orders/:orderNumber/payment', requireAuth, async (req, res) => {
    const order = queryOne<{ id: string; user_id: string }>(
      db,
      'SELECT id, user_id FROM orders WHERE order_number = ?',
      String(req.params.orderNumber),
    );
    if (!order) throw notFound('Order not found.');
    if (order.user_id !== req.user!.id) throw notFound('Order not found.');
    const payment = await initializeOrderPayment(db, order.id, req.user!.id);
    res.json({ payment, order: getOrderView(db, order.id) });
  });

  router.post('/payments/verify', requireAuth, async (req, res) => {
    const input = parse(
      z.object({
        razorpayOrderId: z.string().min(4).max(100),
        razorpayPaymentId: z.string().min(4).max(100),
        razorpaySignature: z.string().min(10).max(256),
      }),
      req.body,
    );
    if (!verifyCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
      throw badRequest('Payment signature verification failed. No payment was recorded.');
    }
    const payment = queryOne<{ order_id: string; amount_paise: number; status: string }>(
      db,
      'SELECT order_id, amount_paise, status FROM payments WHERE provider_order_id = ?',
      input.razorpayOrderId,
    );
    if (!payment) throw notFound('Payment record not found for this order.');
    const order = queryOne<{ user_id: string; status: string }>(db, 'SELECT user_id, status FROM orders WHERE id = ?', payment.order_id);
    if (!order) throw notFound('Order not found.');
    if (order.user_id !== req.user!.id) throw unauthorized('This payment does not belong to your account.');
    if (payment.status === 'paid') {
      res.json({ order: getOrderView(db, payment.order_id), alreadyProcessed: true });
      return;
    }

    markOrderPaid(db, {
      orderId: payment.order_id,
      provider: 'razorpay',
      providerEventId: `checkout:${input.razorpayPaymentId}`,
      providerPaymentId: input.razorpayPaymentId,
      providerOrderId: input.razorpayOrderId,
      amountPaise: payment.amount_paise,
      method: 'checkout',
      summary: { source: 'checkout_verification' },
    });
    await notifyOrderPaid(db, payment.order_id);
    res.json({ order: getOrderView(db, payment.order_id), alreadyProcessed: false });
  });

  /**
   * Standard Razorpay Order Creation endpoint
   * POST /api/create-order
   * Body: { amount (paise), currency?, receipt?, notes? }
   */
  router.post('/create-order', async (req, res) => {
    if (!env.razorpay.configured) {
      return res.status(503).json({ error: 'Razorpay keys are not configured.' });
    }
    const amount = Number(req.body?.amount);
    if (!amount || isNaN(amount) || amount < 100) {
      return res.status(400).json({ error: 'Amount must be at least 100 paise.' });
    }
    const currency = typeof req.body?.currency === 'string' ? req.body.currency : 'INR';
    const receipt = typeof req.body?.receipt === 'string' ? req.body.receipt : `rcpt_${Date.now()}`;
    const notes = typeof req.body?.notes === 'object' && req.body.notes ? req.body.notes : {};

    try {
      const order = await createRazorpayOrder(Math.round(amount), receipt, notes, currency);
      return res.status(200).json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status === 401 ? 401 : 500;
      const message = (err as { message?: string })?.message || 'Failed to create Razorpay order.';
      return res.status(status).json({ error: message });
    }
  });

  /**
   * Standard Razorpay Signature Verification endpoint
   * POST /api/verify-payment
   * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   */
  router.post('/verify-payment', async (req, res) => {
    const order_id = (req.body?.order_id ?? req.body?.razorpay_order_id ?? req.body?.razorpayOrderId) as string | undefined;
    const payment_id = (req.body?.payment_id ?? req.body?.razorpay_payment_id ?? req.body?.razorpayPaymentId) as string | undefined;
    const signature = (req.body?.signature ?? req.body?.razorpay_signature ?? req.body?.razorpaySignature) as string | undefined;

    if (!order_id || !payment_id || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification fields (order_id, payment_id, signature).',
      });
    }

    if (!verifyCheckoutSignature(order_id, payment_id, signature)) {
      return res.status(400).json({
        success: false,
        error: 'Payment signature verification failed. Signature mismatch.',
      });
    }

    const payment = queryOne<{ order_id: string; amount_paise: number; status: string }>(
      db,
      'SELECT order_id, amount_paise, status FROM payments WHERE provider_order_id = ?',
      order_id,
    );
    if (payment && payment.status !== 'paid') {
      markOrderPaid(db, {
        orderId: payment.order_id,
        provider: 'razorpay',
        providerEventId: `checkout:${payment_id}`,
        providerPaymentId: payment_id,
        providerOrderId: order_id,
        amountPaise: payment.amount_paise,
        method: 'checkout',
        summary: { source: 'standard_checkout_verification' },
      });
      await notifyOrderPaid(db, payment.order_id).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      order_id,
      payment_id,
    });
  });

  // Development-only simulation. Explicitly gated; never available in production.
  router.post('/dev/orders/:orderNumber/pay', requireAuth, async (req, res) => {
    if (env.isProduction || (!env.allowDevPayments && !env.simulatedCheckoutEnabled)) {
      throw badRequest(
        'Simulated demo checkout is disabled. Configure live Razorpay keys or enable SIMULATED_CHECKOUT_ENABLED in a non-production environment.',
      );
    }
    const order = queryOne<{ id: string; user_id: string; status: string; total_paise: number }>(
      db,
      'SELECT id, user_id, status, total_paise FROM orders WHERE order_number = ?',
      String(req.params.orderNumber),
    );
    if (!order) throw notFound('Order not found.');
    if (order.user_id !== req.user!.id) throw notFound('Order not found.');
    if (order.status === 'expired') throw conflict('This reservation expired. Place the order again.');
    if (order.status !== 'pending_payment') throw conflict('This order is not awaiting payment.');
    markOrderPaid(db, {
      orderId: order.id,
      provider: 'dev-simulation',
      providerEventId: `dev:${order.id}`,
      providerPaymentId: `devpay_${order.id.slice(-12)}`,
      amountPaise: order.total_paise,
      method: 'development-simulation',
      summary: { note: 'Simulated payment — no money moved. DEMO ORDER.' },
    });
    await notifyOrderPaid(db, order.id);
    res.json({
      ok: true,
      order: getOrderView(db, order.id),
      developmentSimulation: true,
      isDemo: true,
      demoLabel: 'DEMO ORDER — NOT A REAL PURCHASE',
      warning: 'This order was processed through simulated checkout. No money moved and this is not a real sale.',
    });
  });

  // Razorpay webhook: signature-verified, idempotent, records raw provider events.
  router.post('/webhooks/razorpay', async (req, res) => {
    if (!env.razorpay.webhookSecret) {
      res.status(503).json({ error: 'Webhook secret not configured.' });
      return;
    }
    const signature = req.get('x-razorpay-signature');
    const raw = (req as typeof req & { rawBody?: Buffer }).rawBody;
    if (!raw || !verifyWebhookSignature(raw, signature)) {
      res.status(400).json({ error: 'Invalid webhook signature.' });
      return;
    }
    const body = req.body as {
      event?: string;
      payload?: Record<string, { entity?: Record<string, unknown> }>;
      created_at?: number;
    };
    const eventType = body.event ?? 'unknown';
    const providerEventId =
      req.get('x-razorpay-event-id') ?? `body:${Buffer.from(raw).toString('base64').slice(0, 80)}`;

    try {
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const entity = (body.payload?.payment?.entity ?? {}) as {
          id?: string;
          order_id?: string;
          amount?: number;
          method?: string;
          status?: string;
        };
        if (entity.order_id && entity.id) {
          const payment = queryOne<{ order_id: string; amount_paise: number }>(
            db,
            'SELECT order_id, amount_paise FROM payments WHERE provider_order_id = ?',
            entity.order_id,
          );
          if (payment) {
            const amount = Number(entity.amount ?? 0);
            if (amount !== payment.amount_paise) {
              execute(
                db,
                `INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, order_id, type, summary)
                 VALUES (?, 'razorpay', ?, ?, ?, ?)`,
                `pev_${providerEventId}`.slice(0, 80),
                providerEventId,
                payment.order_id,
                'payment.amount_mismatch',
                JSON.stringify({ expected: payment.amount_paise, received: amount }),
              );
            } else {
              markOrderPaid(db, {
                orderId: payment.order_id,
                provider: 'razorpay',
                providerEventId: `rzp:${providerEventId}`,
                providerPaymentId: entity.id,
                providerOrderId: entity.order_id,
                amountPaise: amount,
                method: entity.method,
                summary: { event: eventType },
              });
              await notifyOrderPaid(db, payment.order_id);
            }
          }
        }
      } else if (eventType === 'payment.failed') {
        const entity = (body.payload?.payment?.entity ?? {}) as {
          id?: string;
          order_id?: string;
          error_description?: string;
        };
        const payment = entity.order_id
          ? queryOne<{ id: string; order_id: string; status: string }>(
              db,
              'SELECT id, order_id, status FROM payments WHERE provider_order_id = ?',
              entity.order_id,
            )
          : undefined;
        if (payment && payment.status !== 'paid') {
          execute(
            db,
            "UPDATE payments SET status = 'failed', failure_reason = ?, provider_payment_id = ? WHERE id = ?",
            (entity.error_description ?? 'Provider reported failed payment').slice(0, 300),
            entity.id ?? null,
            payment.id,
          );
          execute(
            db,
            `INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, order_id, type, summary)
             VALUES (?, 'razorpay', ?, ?, 'payment.failed', ?)`,
            `pev_${providerEventId}`.slice(0, 80),
            providerEventId,
            payment.order_id,
            JSON.stringify({ paymentId: entity.id }),
          );
        }
      } else if (eventType === 'refund.processed' || eventType === 'refund.created') {
        const entity = (body.payload?.refund?.entity ?? {}) as {
          id?: string;
          payment_id?: string;
          amount?: number;
          status?: string;
        };
        if (entity.id) {
          const { finalizeRefund } = await import('../lib/orders.js');
          const refund = queryOne<{ id: string; order_id: string; status: string }>(
            db,
            'SELECT id, order_id, status FROM refunds WHERE provider_refund_id = ?',
            entity.id,
          );
          if (refund && entity.status === 'processed') {
            finalizeRefund(db, refund.id, entity.id, entity.status);
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
                subject: `Refund completed for ${order.order_number}`,
                body: `<p>Your refund has been confirmed by the payment provider.</p><p><strong>Reference:</strong> ${entity.id}</p>`,
                dedupeKey: `refund-complete:${refund.id}`,
              });
            }
          } else if (!refund) {
            // Provider-initiated refund not initiated here: record for reconciliation.
            execute(
              db,
              `INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, order_id, type, summary)
               VALUES (?, 'razorpay', ?, NULL, 'refund.unmatched', ?)`,
              `pev_${providerEventId}`.slice(0, 80),
              providerEventId,
              JSON.stringify({ refundId: entity.id, paymentId: entity.payment_id, amount: entity.amount }),
            );
          }
        }
      } else {
        execute(
          db,
          `INSERT OR IGNORE INTO payment_events (id, provider, provider_event_id, order_id, type, summary)
           VALUES (?, 'razorpay', ?, NULL, ?, NULL)`,
          `pev_${providerEventId}`.slice(0, 80),
          providerEventId,
          `ignored:${eventType}`.slice(0, 80),
        );
      }
      res.json({ received: true });
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'razorpay_webhook_failed',
          event: eventType,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      res.status(500).json({ error: 'Webhook processing failed; provider should retry.' });
    }
  });

  return router;
}
