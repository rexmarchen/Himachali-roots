import { env, assertProductionConfig } from './env.js';
import { initDb, getDb, queryOne } from './db.js';
import { createApp } from './app.js';
import { releaseExpiredOrders } from './lib/orders.js';

async function main(): Promise<void> {
  const db = initDb(env.databasePath);

  if (env.isProduction) {
    const issues = assertProductionConfig();
    for (const issue of issues) console.warn(JSON.stringify({ level: 'warn', msg: 'production_config', issue }));
    if (env.allowDevPayments || env.allowDevAuthHelpers) {
      console.error('Refusing to start: development helpers are enabled in production.');
      process.exit(1);
    }
  }

  const hasProducts = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM products');
  if (process.env.SEED_ON_START === 'true' && (hasProducts?.count ?? 0) === 0) {
    const { seed } = await import('./seed.js');
    await seed(db, { reset: false });
  }

  try {
    const released = releaseExpiredOrders(db);
    if (released) console.log(JSON.stringify({ level: 'info', msg: 'expired_reservations_released', count: released }));
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'expiry_sweep_failed', error: String(error) }));
  }

  const sweep = setInterval(() => {
    try {
      const count = releaseExpiredOrders(db);
      if (count) console.log(JSON.stringify({ level: 'info', msg: 'expired_reservations_released', count }));
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', msg: 'expiry_sweep_failed', error: String(error) }));
    }
  }, 60_000);
  sweep.unref();

  const app = createApp(db);
  const server = app.listen(env.port, () => {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'pahadi_roots_api_started',
        port: env.port,
        env: env.nodeEnv,
        payments: env.razorpay.configured ? 'configured' : 'unconfigured',
        devPayments: env.allowDevPayments,
        email: env.smtp.configured ? 'configured' : 'unconfigured',
      }),
    );
  });

  const shutdown = (signal: string) => {
    console.log(JSON.stringify({ level: 'info', msg: 'shutting_down', signal }));
    server.close(() => {
      try {
        getDb().close();
      } catch {
        // already closed
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({ level: 'error', msg: 'unhandled_rejection', error: String(reason) }));
});

main().catch((error) => {
  console.error(JSON.stringify({ level: 'error', msg: 'startup_failed', error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
