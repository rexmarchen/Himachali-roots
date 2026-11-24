import type { Db } from '../db.js';
import { queryOne } from '../db.js';
import { EventBus } from '../core/outbox/index.js';
import { appLogger } from '../core/telemetry/logger.js';
import { notify, escapeHtml } from '../lib/email.js';
import { notifyOrderPaid } from '../lib/orders.js';

/**
 * Register durable outbox EventBus handlers for the process.
 * Clearing prior registrations makes the setup idempotent.
 */
export function registerOutboxSubscribers(db: Db): EventBus {
  const eventBus = EventBus.getInstance();
  eventBus.clear();

  eventBus.subscribe('order.placed', async (event) => {
    appLogger.info(`[Outbox] Dispatching order.placed event: ${event.aggregateId}`);
  });

  eventBus.subscribe('order.paid', async (event) => {
    appLogger.info(`[Outbox] Handling order.paid event: ${event.aggregateId}`);
    const payload = event.payload as { orderId?: string; email?: string; orderNumber?: string; totalPaise?: number };
    const orderId = payload.orderId ?? event.aggregateId;
    if (orderId) {
      // notifyOrderPaid uses deterministic dedupeKeys (`order-paid:${orderId}` and
      // `seller-new-order:${sellerOrderId}`), so it acts as an idempotent fallback
      // if synchronous payment notification succeeded or failed earlier.
      await notifyOrderPaid(db, orderId);
      return;
    }
    if (payload.email && payload.orderNumber && payload.totalPaise) {
      await notify(db, {
        type: 'payment_confirmed',
        email: payload.email,
        subject: `Payment received for ${payload.orderNumber}`,
        body: `<p>Your order <strong>${escapeHtml(payload.orderNumber)}</strong> for ₹${(payload.totalPaise / 100).toLocaleString('en-IN')} has been confirmed.</p>`,
        dedupeKey: `outbox:${event.id}`,
      });
    }
  });

  eventBus.subscribe('seller.approved', async (event) => {
    appLogger.info(`[Outbox] Handling seller.approved event: ${event.aggregateId}`);
    const payload = event.payload as { email?: string; shopName?: string };
    if (payload.email) {
      await notify(db, {
        type: 'seller_approved',
        email: payload.email,
        subject: `Welcome to Dear Hills Maker Community — ${payload.shopName ?? 'Store'}`,
        body: `<p>Congratulations, your maker application for ${escapeHtml(payload.shopName ?? 'your store')} has been approved!</p>`,
        dedupeKey: `outbox:${event.id}`,
      });
    }
  });

  eventBus.subscribe('order.cancelled', async (event) => {
    appLogger.info(`[Outbox] Handling order.cancelled event: ${event.aggregateId}`);
    const payload = event.payload as { email?: string; orderNumber?: string; reason?: string };
    let email = payload.email;
    let orderNumber = payload.orderNumber;
    if ((!email || !orderNumber) && event.aggregateId) {
      const order = queryOne<{ email: string; order_number: string }>(
        db,
        'SELECT email, order_number FROM orders WHERE id = ?',
        event.aggregateId,
      );
      email = email ?? order?.email;
      orderNumber = orderNumber ?? order?.order_number;
    }
    if (email && orderNumber) {
      await notify(db, {
        type: 'order_cancelled',
        email,
        subject: `Order #${orderNumber} Cancelled — Dear Hills`,
        body: `<p>Your order #${escapeHtml(orderNumber)} has been cancelled. ${payload.reason ? `Reason: ${escapeHtml(payload.reason)}` : ''}</p>`,
        dedupeKey: `outbox:${event.id}`,
      });
    }
  });

  eventBus.subscribe('refund.completed', async (event) => {
    appLogger.info(`[Outbox] Handling refund.completed event: ${event.aggregateId}`);
    const payload = event.payload as { email?: string; orderNumber?: string; amountPaise?: number; reference?: string };
    if (payload.email && payload.orderNumber && payload.amountPaise) {
      await notify(db, {
        type: 'refund_completed',
        email: payload.email,
        subject: `Refund processed for Order #${payload.orderNumber} — Dear Hills`,
        body: `<p>Your refund of ₹${(payload.amountPaise / 100).toFixed(2)} for order #${escapeHtml(payload.orderNumber)} has been processed. Reference: ${escapeHtml(payload.reference ?? 'N/A')}.</p>`,
        dedupeKey: `outbox:${event.id}`,
      });
    }
  });

  return eventBus;
}
