import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

const uploadDir = path.join(os.tmpdir(), `pahadi-roots-test-uploads-${process.pid}`);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      UPLOAD_DIR: uploadDir,
      APP_URL: 'http://localhost:5173',
      SEED_ON_START: 'false',
      ALLOW_DEV_PAYMENTS: 'true',
      ALLOW_DEV_AUTH_HELPERS: 'true',
      RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
      FLAT_SHIPPING_PAISE: '7900',
      FREE_SHIPPING_THRESHOLD_PAISE: '149900',
      DEFAULT_COMMISSION_BP: '1500',
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
    restoreMocks: true,
  },
});
