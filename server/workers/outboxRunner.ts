import { env } from '../env.js';
import { initDb, closeDb } from '../db.js';
import { OutboxWorker } from '../core/outbox/index.js';
import { appLogger } from '../core/telemetry/logger.js';
import { registerOutboxSubscribers } from './subscribers.js';

/**
 * Standalone Worker Process for Transactional Outbox Event Processing.
 * Can be run alongside the API server or as an independent daemon:
 * `node dist-server/server/workers/outboxRunner.js`
 */
async function main() {
  appLogger.info('Starting Dear Hills Transactional Outbox Worker...');

  const db = initDb(env.databasePath);
  registerOutboxSubscribers(db);

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
