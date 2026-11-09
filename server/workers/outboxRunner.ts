import { env } from '../env.js';
import { initDb, closeDb } from '../db.js';
import { OutboxWorker, EventBus } from '../core/outbox/index.js';
import { appLogger } from '../core/telemetry/logger.js';
import { notify } from '../lib/email.js';

/**
 * Standalone Worker Process for Transactional Outbox Event Processing.
 * Can be run alongside the API server or as an independent daemon:
 * `node dist-server/server/workers/outboxRunner.js`
 */
async function main() {
  appLogger.info('Starting Dear Hills Transactional Outbox Worker...');

  const db = initDb(env.databasePath);
  const eventBus = EventBus.getInstance();

  // Register Event Subscribers
  eventBus.subscribe('order.placed', async (event) => {
    appLogger.info(`[Outbox] Dispatching order.placed event: ${event.aggregateId}`);
  });

  eventBus.subscribe('order.paid', async (event) => {
    appLogger.info(`[Outbox] Handling order.paid event: ${event.aggregateId}`);
    const payload = event.payload as { email?: string; orderNumber?: string; totalPaise?: number };
    if (payload.email && payload.orderNumber && payload.totalPaise) {
      await notify(db, {
        type: 'order_confirmed',
        email: payload.email,
        subject: `Order #${payload.orderNumber} Confirmed — Dear Hills`,
        body: `Your order #${payload.orderNumber} for ₹${(payload.totalPaise / 100).toFixed(2)} has been confirmed.`,
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
        body: `Congratulations, your maker application for ${payload.shopName ?? 'your store'} has been approved!`,
      });
    }
  });

  eventBus.subscribe('order.cancelled', async (event) => {
    appLogger.info(`[Outbox] Handling order.cancelled event: ${event.aggregateId}`);
    const payload = event.payload as { email?: string; orderNumber?: string; reason?: string };
    if (payload.email && payload.orderNumber) {
      await notify(db, {
        type: 'order_cancelled',
        email: payload.email,
        subject: `Order #${payload.orderNumber} Cancelled — Dear Hills`,
        body: `Your order #${payload.orderNumber} has been cancelled. ${payload.reason ? `Reason: ${payload.reason}` : ''}`,
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
        body: `Your refund of ₹${(payload.amountPaise / 100).toFixed(2)} for order #${payload.orderNumber} has been processed. Reference: ${payload.reference ?? 'N/A'}.`,
      });
    }
  });

  const worker = new OutboxWorker(db, 2000, 25);
  worker.start();
  appLogger.info('Outbox Worker started. Listening for durable domain events.');

  // Graceful shutdown handling
  const shutdown = () => {
    appLogger.info('Shutting down Outbox Worker...');
    worker.stop();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Fatal outbox worker failure:', err);
    process.exit(1);
  });
}
